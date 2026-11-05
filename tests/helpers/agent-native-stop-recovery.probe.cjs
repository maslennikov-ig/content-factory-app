'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  fixture,
  identity,
  org,
  user,
  resourceId,
  human,
  Response,
  until,
} = require('./agent-native-stale-suspension.probe.cjs');
const text = [
  { type: 'text-start', id: 'recovered' },
  {
    type: 'text-delta',
    id: 'recovered',
    delta: 'Ordinary native work recovered.',
  },
  { type: 'text-end', id: 'recovered' },
];
function gateway(f) {
  f.mastra.addGateway({
    id: 'native-stop-free',
    name: 'Controlled cold model',
    handlesModel: (id) => id.startsWith('mock-provider/'),
    fetchProviders: async () => ({
      'mock-provider': {
        name: 'Controlled',
        gateway: 'native-stop-free',
        apiKeyEnvVar: [],
        models: [f.model.modelId],
      },
    }),
    buildUrl: () => undefined,
    getApiKey: async () => 'synthetic',
    resolveLanguageModel: () => f.model,
  });
}

process.env.NODE_ENV = 'test';
delete process.env.REDIS_URL;
let externalRequests = 0;
global.fetch = async () => {
  externalRequests++;
  throw new Error('External request forbidden in Stop/recovery probe.');
};

async function capture(mode) {
  const f = await fixture({
    script: async (_args, number) => {
      if (mode === 'running' || (mode === 'approved-child' && number > 1))
        await new Promise(() => {});
      if (mode === 'approved-child')
        return [
          {
            type: 'tool-call',
            toolCallId: 'approved-native-child',
            toolName: 'subagent',
            input: JSON.stringify({
              agentType: 'writing',
              task: 'Controlled approved child must never replay after Stop.',
              modelId: 'openai/gpt-6.1-sol',
              forked: false,
              prompt: null,
              _background: null,
            }),
          },
        ];
      return [
        {
          type: 'tool-call',
          toolCallId: 'saved-native-question',
          toolName: 'ask_user',
          input: JSON.stringify({
            question: 'Which saved fact?',
            options: [{ label: 'Known' }, { label: 'Unknown' }],
          }),
        },
      ];
    },
  });
  gateway(f);
  const threadId = 'native-stop-recovery-' + mode;
  await f.memory.createThread({
    threadId,
    resourceId,
    title: 'Exact native Stop checkpoint',
  });
  if (mode === 'http-stopping') {
    const workflows = await f.storage.getStore('workflows');
    // Capture the durable gate before its HTTP owner can emit FINISH, just
    // like the real PostgreSQL cold-owner probe. Do not invent a running marker.
    for (const method of ['persistWorkflowSnapshot', 'updateWorkflowState']) {
      const write = workflows[method].bind(workflows);
      workflows[method] = async input => {
        const result = await write(input);
        if (input.workflowName === 'durable-agentic-loop' &&
            (input.snapshot?.status ?? input.opts?.status) === 'suspended') await new Promise(() => {});
        return result;
      };
    }
  }
  void f.handler
    .chat(
      org,
      user,
      {
        threadId,
        messages: [human('original-human', 'Read the saved material.')],
      },
      new Response()
    )
    .catch(() => {});
  if (mode === 'approved-child') {
    await until(
      async () =>
        (await f.handler.getThread(org, user, threadId)).pending.length === 1,
      'genuine child approval'
    );
    const pending = (await f.handler.getThread(org, user, threadId)).pending[0];
    void f.handler
      .chat(
        org,
        user,
        {
          threadId,
          messages: [
            {
              id: 'actual-approved-child',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-subagent',
                  toolCallId: pending.toolCallId,
                  state: 'approval-responded',
                  approval: {
                    id: pending.runId + '::' + pending.toolCallId,
                    approved: true,
                  },
                },
              ],
            },
          ],
        },
        new Response()
      )
      .catch(() => {});
  }
  const workflows = await f.storage.getStore('workflows');
  let thread, rows;
  await until(async () => {
    thread = await f.memory.getThreadById({ threadId });
    const runId = thread.metadata?.assistantNativeRun?.runId;
    if (!runId) return false;
    rows = await Promise.all(
      ['durable-agentic-loop', 'durable-agentic-execution'].map(
        (workflowName) => workflows.getWorkflowRunById({ workflowName, runId })
      )
    );
    return (
      f.modelCalls.length === (mode === 'approved-child' ? 2 : 1) &&
      rows.every(
        (row) =>
          row?.snapshot?.status ===
          (mode === 'suspended' || mode === 'http-stopping' ? 'suspended' : 'running')
      )
    );
  }, 'real root and nested native checkpoints');
  fs.writeFileSync(
    process.argv[4],
    JSON.stringify({ thread, rows, ...(mode==='http-stopping'?{messages:(await f.memory.recall({threadId,resourceId})).messages}:{}), externalRequests })
  );
  // Only this test child exits. Its actual running snapshots are restored in
  // a fresh service; no original Session or model drive survives the process.
  process.exit(0);
}

async function main(mode) {
  if (mode.startsWith('warm-')) return warmStop(mode);
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cf-native-stop-recovery-')
  );
  let saved;
  try {
    const capturePath = path.join(directory, 'checkpoints.json');
    const captureMode =
      mode.startsWith('http-owner-') ? 'http-stopping' : mode === 'suspended' || mode === 'live-suspended-owner'
        ? 'suspended'
        : mode === 'recovery-stopped'
        ? 'approved-child'
        : 'running';
    execFileSync(
      process.execPath,
      [__filename, '--capture', captureMode, capturePath],
      { encoding: 'utf8', timeout: 15_000 }
    );
    saved = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(saved.externalRequests, 0);
  const f = await fixture({
    script: async () => {
      if (mode === 'recovery-allowed') return text;
      throw new Error('Stopped native work must not invoke a model.');
    },
  });
  gateway(f);
  try {
    const workflows = await f.storage.getStore('workflows');
    await f.memory.createThread({
      threadId: saved.thread.id,
      resourceId: saved.thread.resourceId,
      title: saved.thread.title,
      metadata: saved.thread.metadata,
    });
    for (const row of saved.rows)
      await workflows.persistWorkflowSnapshot({
        workflowName: row.workflowName,
        runId: row.runId,
        resourceId: row.resourceId,
        snapshot: row.snapshot,
      });
    const runId = saved.thread.metadata.assistantNativeRun.runId;
    const binding = {
      runId,
      threadId: saved.thread.id,
      resourceId,
      requestId: saved.thread.metadata.assistantNativeRun.logicalRequestId,
    };
    if(mode.startsWith('http-owner-')){
      assert.equal(saved.thread.metadata.assistantExecution.state,'running');
      await f.memory.saveMessages({messages:saved.messages.map(message=>({...message,createdAt:new Date(message.createdAt)}))});
      const claim=await workflows.claimRunOwnership({runId,ownerId:'captured-http-owner',leaseMs:mode==='http-owner-expiry'?1000:10000});
      assert.equal(claim.acquired,true);
      const finalize=f.service.finalizeNativeStop.bind(f.service);
      if(mode==='http-owner-timeout')f.service.finalizeNativeStop=(input,options)=>{assert.equal(options?.waitForOwnerMs,35000);return finalize(input,{waitForOwnerMs:20});};
      let timer,replace;
      if(mode==='http-owner-changed'){
        const read=workflows.getRunOwnership.bind(workflows);
        workflows.getRunOwnership=async input=>{const owner=await read(input);if(input.runId===runId && !timer)timer=setTimeout(()=>{replace=workflows.claimRunOwnership({runId,ownerId:'successor-http-owner',leaseMs:10000,force:true,expectedGeneration:claim.record.generation});},20);return owner;};
      }
      try{
        if(mode==='http-owner-expiry'){
          const receipt=await f.handler.stopThread(org,user,saved.thread.id);
          assert.equal(receipt.stopped,true);assert.equal(receipt.requestId,binding.requestId);
        }else if(mode==='http-owner-timeout')await assert.rejects(()=>f.handler.stopThread(org,user,saved.thread.id),error=>error.getStatus?.()===503 && /waiting for its current owner/.test(error.message));
        else await assert.rejects(()=>f.handler.stopThread(org,user,saved.thread.id),/Native Stop native owner changed/);
        if(replace)assert.equal((await replace).acquired,true);
        const owner=await workflows.getRunOwnership({runId}),thread=await f.memory.getThreadById({threadId:saved.thread.id});
        assert.equal(thread.metadata.assistantExecution.stopRequested,true);
        assert.equal(thread.metadata.assistantExecution.state,mode==='http-owner-expiry'?'settled':'stopping');
        if(mode==='http-owner-expiry'){assert.equal(owner.live,false);assert.equal(owner.ownerId,claim.record.ownerId);assert.equal(owner.generation,claim.record.generation);}
        else{assert.equal(owner.live,true);assert.equal(owner.ownerId,mode==='http-owner-changed'?'successor-http-owner':claim.record.ownerId);}
        const rows=await Promise.all(saved.rows.map(row=>workflows.getWorkflowRunById({workflowName:row.workflowName,runId})));
        assert.ok(rows.every(row=>row.snapshot.status===(mode==='http-owner-expiry'?'canceled':'suspended')));
        assert.equal(f.modelCalls.length,0);assert.equal(externalRequests,0);
        return {mode,settled:mode==='http-owner-expiry',protected:mode!=='http-owner-expiry',modelCalls:0,externalRequests};
      }finally{if(timer)clearTimeout(timer);if(replace)await replace;}
    }
    if (mode.startsWith('recovery-')) {
      if (mode !== 'recovery-allowed') {
        const marker = {
          ...saved.thread.metadata.assistantExecution,
          state: 'settled',
          outcome: 'interrupted',
        };
        delete marker.stopRequested; // Exact observed old Stop shape.
        await f.memory.updateThread({
          id: saved.thread.id,
          metadata: {
            assistantNativeRun: {
              ...saved.thread.metadata.assistantNativeRun,
              state: 'stopped',
            },
            assistantExecution: marker,
          },
        });
        if (mode === 'recovery-successor')
          await f.memory.updateThread({
            id: saved.thread.id,
            metadata: {
              assistantNativeRun: {
                runId: 'different-current-run',
                logicalRequestId: 'different-current-request',
                state: 'running',
              },
              assistantExecution: {
                requestId: 'different-current-request',
                state: 'running',
              },
            },
          });
        const before = JSON.stringify(
          (await f.memory.getThreadById({ threadId: saved.thread.id })).metadata
        );
        const first = await f.agent.recoverActiveRuns({ runId });
        assert.equal(
          first.recovered[0]?.error?.name,
          'NativeRecoveryRefusedError',
          'Stopped or unverified work must be refused before the SDK recovery driver executes.'
        );
        const fleet = await f.mastra.recoverAllDurableAgents();
        assert.equal(
          fleet.failed,
          1,
          'Fleet must report refused recovery, not successful cancellation.'
        );
        const later = await f.agent.recoverActiveRuns({ runId });
        assert.equal(
          later.recovered[0].error.name,
          'NativeRecoveryRefusedError'
        );
        assert.equal(
          later.recovered[0].error.reason,
          mode === 'recovery-successor' ? 'unverified' : 'stopped'
        );
        const forced = await f.service.recoverDurableRuns({
          ...binding,
          force: true,
        });
        assert.equal(forced.failed, 1);
        assert.equal(
          forced.recovered[0].error.name,
          'NativeRecoveryRefusedError'
        );
        assert.equal(
          JSON.stringify(
            (await f.memory.getThreadById({ threadId: saved.thread.id }))
              .metadata
          ),
          before
        );
        assert.equal(f.modelCalls.length, 0);
        return {
          mode,
          blocked: true,
          fleet: true,
          laterDispatch: true,
          force: true,
          metadataUnchanged: true,
          modelCalls: 0,
          externalRequests,
        };
      }
      const recovered = await f.agent.recoverActiveRuns({ runId });
      assert.equal(recovered.succeeded, 1);
      assert.equal(
        f.modelCalls.length,
        1,
        'A genuine non-stopped orphan still executes controlled native recovery.'
      );
      return { mode, recovered: true, modelCalls: 1, externalRequests };
    }
    if (mode === 'live-terminal-owner') {
      await f.service.cancelModelAvailability(runId, saved.thread.id);
      assert.equal(
        (
          await workflows.claimRunOwnership({
            runId,
            ownerId: 'retained-terminal-owner',
            leaseMs: 30_000,
          })
        ).acquired,
        true
      );
      const before = await Promise.all(
        saved.rows.map((row) =>
          workflows.getWorkflowRunById({
            workflowName: row.workflowName,
            runId,
          })
        )
      );
      assert.ok(before.every((row) => row.snapshot.status === 'canceled'));
      await assert.rejects(
        () => f.service.finalizeNativeStop(binding),
        /active or changed native owner/
      );
      const after = await Promise.all(
        saved.rows.map((row) =>
          workflows.getWorkflowRunById({
            workflowName: row.workflowName,
            runId,
          })
        )
      );
      assert.deepEqual(
        after,
        before,
        'Terminal history is preserved; a live owner still prevents acknowledgement.'
      );
      return {
        mode,
        protected: true,
        modelCalls: f.modelCalls.length,
        externalRequests,
      };
    }
    if (mode === 'live-owner' || mode === 'live-suspended-owner') {
      assert.equal(
        (
          await workflows.claimRunOwnership({
            runId,
            ownerId: 'live-other-driver',
            leaseMs: 30_000,
          })
        ).acquired,
        true
      );
      await assert.rejects(
        () => f.service.cancelModelAvailability(runId, saved.thread.id),
        /active or changed native owner/
      );
      const rows = await Promise.all(
        saved.rows.map((row) =>
          workflows.getWorkflowRunById({
            workflowName: row.workflowName,
            runId,
          })
        )
      );
      const expectedState = mode === 'live-owner' ? 'running' : 'suspended';
      assert.equal(rows[0].snapshot.status, expectedState);
      assert.equal(rows[1].snapshot.status, expectedState);
      assert.equal(await f.service.settleStoppedNativeRun(binding), false);
      assert.equal(f.modelCalls.length, 0);
      return { mode, protected: true, modelCalls: 0, externalRequests };
    }
    if (mode === 'storage-failure') {
      const update = workflows.updateWorkflowState.bind(workflows);
      workflows.updateWorkflowState = async (input) => {
        if (
          input.workflowName === 'durable-agentic-execution' &&
          input.opts.status === 'canceled'
        )
          throw new Error(
            'Controlled nested cancellation persistence failure.'
          );
        return update(input);
      };
      await assert.rejects(
        () => f.service.cancelModelAvailability(runId, saved.thread.id),
        /cancellation was not persisted/
      );
      assert.equal(
        (
          await workflows.getWorkflowRunById({
            workflowName: 'durable-agentic-loop',
            runId,
          })
        ).snapshot.status,
        'canceled'
      );
      assert.equal(
        (
          await workflows.getWorkflowRunById({
            workflowName: 'durable-agentic-execution',
            runId,
          })
        ).snapshot.status,
        'running'
      );
      assert.equal(await f.service.settleStoppedNativeRun(binding), false);
      workflows.updateWorkflowState = update;
    }
    await f.service.cancelModelAvailability(runId, saved.thread.id);
    const rows = await Promise.all(
      saved.rows.map((row) =>
        workflows.getWorkflowRunById({ workflowName: row.workflowName, runId })
      )
    );
    assert.equal(
      rows[0].snapshot.status,
      'canceled',
      'The actual running/suspended root must be durably canceled.'
    );
    assert.equal(
      rows[1].snapshot.status,
      'canceled',
      'Run.cancel does not cascade: verify the actual nested checkpoint too.'
    );
    assert.equal(f.modelCalls.length, 0);
    return {
      mode,
      root: rows[0].snapshot.status,
      nested: rows[1].snapshot.status,
      ...(mode === 'storage-failure' ? { partialRetryVerified: true } : {}),
      modelCalls: f.modelCalls.length,
      externalRequests,
    };
  } finally {
    await f.close();
  }
}

async function warmStop(mode) {
  const f = await fixture();
  let abortObserved = false,
    ownerDrained = false,
    finalizeCalls = 0,
    parent;
  f.model.doStream = async (args) => {
    f.modelCalls.push(JSON.stringify(args.prompt));
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'partial' });
          controller.enqueue({
            type: 'text-delta',
            id: 'partial',
            delta: 'Retained actual warm partial. '.repeat(20),
          });
          args.abortSignal.addEventListener(
            'abort',
            () => {
              abortObserved = true;
              controller.error(
                Object.assign(new Error('Controlled warm model aborted.'), {
                  name: 'AbortError',
                })
              );
            },
            { once: true }
          );
        },
      }),
    };
  };
  const originalFinalize = f.service.finalizeNativeStop.bind(f.service);
  f.service.finalizeNativeStop = async (input) => {
    finalizeCalls++;
    return originalFinalize(input);
  };
  const threadId = 'native-stop-' + mode;
  try {
    await f.memory.createThread({
      threadId,
      resourceId,
      title: 'Actual warm HTTP Stop',
    });
    const response = new Response();
    parent = f.handler.chat(
      org,
      user,
      {
        threadId,
        messages: [human('warm-human', 'Stream the controlled partial.')],
      },
      response
    );
    parent.catch(() => {});
    await until(
      () => response.parts().some((part) => part.type === 'text-delta'),
      'actual warm HTTP partial'
    );
    const owner = await f.threads.activeTurnFor(identity, threadId);
    assert.ok(owner, 'This control needs a real active HTTP owner.');
    void owner.settled.then(() => {
      ownerDrained = true;
    });
    const fail = mode === 'warm-store-error';
    if (fail)
      f.service.cancelModelAvailability = async () => {
        throw new Error('Controlled Stop preparation persistence failure.');
      };
    if (fail)
      await assert.rejects(
        () => f.handler.stopThread(org, user, threadId),
        /Controlled Stop preparation persistence failure/
      );
    else {
      const stopped = await f.handler.stopThread(org, user, threadId);
      assert.equal(stopped.stopped, true);
    }
    await parent;
    assert.equal(abortObserved, true);
    assert.equal(
      ownerDrained,
      true,
      'Stop must drain its captured owner even when preparation failed.'
    );
    assert.equal(finalizeCalls, fail ? 0 : 1);
    const after = await f.handler.getThread(org, user, threadId);
    assert.ok(after.messages.some((message) => message.role === 'assistant'));
    if (!fail) assert.equal(after.execution.outcome, 'interrupted');
    return {
      mode,
      abortObserved,
      ownerDrained,
      stopRejected: fail,
      modelCalls: f.modelCalls.length,
      externalRequests,
    };
  } finally {
    await f.close();
    await parent?.catch(() => {});
  }
}

(process.argv[2] === '--capture'
  ? capture(process.argv[3])
  : main(process.argv[2])
)
  .then((report) => {
    if (report) console.log(JSON.stringify(report));
  })
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });
