'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createRuntime,
  IDENTITY,
} = require('./mastra-service-native-integration.probe.cjs');

const THREAD = 'service-recovery-thread';
const LOGICAL = 'service-recovery-logical';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = (value) => process.send?.(value);

async function child(config) {
  let runtime;
  runtime = await createRuntime({
    ...config,
    onAttempt: async (attempt) => {
      report({ event: 'model', attempt });
      if (config.pauseProviderMs) await delay(config.pauseProviderMs);
    },
  });
  const { service, memory, agent, contextModule, executionModule } = runtime;
  if (config.holdSuspensionPersistence && config.role === 'initial') {
    const workflows = await runtime.storage.getStore('workflows');
    for (const method of ['persistWorkflowSnapshot', 'updateWorkflowState']) {
      const original = workflows[method].bind(workflows);
      workflows[method] = async (input) => {
        const result = await original(input);
        if (
          input.workflowName === 'durable-agentic-loop' &&
          (input.snapshot?.status ?? input.opts?.status) === 'suspended'
        ) {
          report({ event: 'cold-suspended-checkpoint', runId: input.runId });
          await new Promise(() => {});
        }
        return result;
      };
    }
  }
  if (config.watchWait) {
    const nativeWait = service.modelAvailability.wait.bind(
      service.modelAvailability
    );
    service.modelAvailability.wait = (position) => {
      report({ event: 'wait-signal', present: !!position.abortSignal });
      position.abortSignal?.addEventListener(
        'abort',
        () => report({ event: 'wait-abort-signal' }),
        { once: true }
      );
      return nativeWait(position);
    };
  }
  if (config.role === 'initial' || config.role === 'gap') {
    await memory.createThread({
      threadId: THREAD,
      resourceId: 'org-service:user-service',
      title: 'Service recovery probe',
      metadata: {
        assistantExecution: { requestId: LOGICAL, state: 'running' },
        ...(config.fixtureSelectedContext
          ? {
              assistantWorkspace: {
                version: 'assistant-workspace/v1',
                workContext: {
                  version: 'assistant-work-context/v1',
                  kind: 'piece',
                  id: 'original-piece',
                },
                artifacts: [],
                activeArtifact: null,
              },
            }
          : {}),
      },
    });
    const requestContext = contextModule.buildConductorContext({
      identity: IDENTITY,
      threadId: THREAD,
      requestId: LOGICAL,
      trackExecution: true,
    });
    const session = config.queuedInput
      ? undefined
      : await service.sessionFor(IDENTITY, THREAD, {
          bindThread: true,
          requestContext,
        });
    if (config.role === 'gap') {
      // Keep the real native sleep/workflow/hook, shortening only its test deadline.
      const nativeWait = service.modelAvailability.wait.bind(
        service.modelAvailability
      );
      service.modelAvailability.wait = (position) =>
        nativeWait({ ...position, delayMs: 60 });
      const nativeStream = agent.stream.bind(agent);
      agent.stream = async (messages, options) => {
        const pointer = (await memory.getThreadById({ threadId: THREAD }))
          ?.metadata?.assistantNativeRun;
        report({ event: 'stream', runId: options?.runId, pointer });
        if (
          pointer?.continuationPending === true &&
          pointer.runId === options?.runId
        ) {
          report({ event: 'gap', pointer });
          // Simulates death after native accepted queue and old abort flushed,
          // before the successor can create its first native checkpoint.
          return new Promise(() => {});
        }
        return nativeStream(messages, options);
      };
      const nativeAbort = agent.abortThreadStream.bind(agent);
      agent.abortThreadStream = (options) => {
        const result = nativeAbort(options);
        report({ event: 'native-abort', result });
        setTimeout(
          async () =>
            report({
              event: 'after-abort',
              pointer: (await memory.getThreadById({ threadId: THREAD }))
                ?.metadata?.assistantNativeRun,
              active: await agent.listActiveRuns(),
            }),
          200
        );
        return result;
      };
    }
    const execution = new executionModule.ConductorExecution({
      requestId: LOGICAL,
      native: true,
    });
    if (config.queuedInput) {
      const accepted = await service.queueNativeInput({
        identity: IDENTITY,
        threadId: THREAD,
        requestId: LOGICAL,
        signal: {
          id: 'service-probe-queued-user-message',
          contents: 'Keep the selected material and save the result.',
          author: { id: IDENTITY.userId },
          createdAt: new Date().toISOString(),
        },
      });
      report({ event: 'accepted', accepted });
    } else
      void execution
        .run(async () => {
          const accepted = await session.sendSignal(
            {
              id: 'service-probe-user-message',
              type: 'user',
              contents: 'Сохрани результат инструмента и закончи задачу.',
              author: { id: IDENTITY.userId },
            },
            { requestContext, requireDelivery: true }
          ).accepted;
          report({ event: 'accepted', accepted });
        })
        .then(() => report({ event: 'initial-finished' }))
        .catch((error) =>
          report({ event: 'initial-error', error: error.message })
        );
  } else {
    const start = Date.now();
    delete process.env.NODE_ENV;
    await service.onApplicationBootstrap();
    report({ event: 'bootstrapped', elapsedMs: Date.now() - start });
  }
  process.on('message', async (message) => {
    if (message !== 'close') return;
    await runtime.close();
    process.exit(0);
  });
  report({ event: 'ready' });
}

function launch(config) {
  const worker = fork(__filename, ['--child', JSON.stringify(config)], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  worker.output = '';
  worker.events = [];
  worker.stdout.on('data', (chunk) => {
    worker.output += chunk;
  });
  worker.stderr.on('data', (chunk) => {
    worker.output += chunk;
  });
  worker.on('message', (message) => {
    worker.events.push(message);
  });
  return worker;
}

async function event(worker, name, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = worker.events.find((entry) => entry.event === name);
    if (found) return found;
    if (worker.exitCode !== null || worker.signalCode !== null)
      throw new Error(`Child exited before ${name}: ${worker.output}`);
    await delay(25);
  }
  throw new Error(
    `Timed out waiting for ${name}: ${JSON.stringify(worker.events)} ${
      worker.output
    }`
  );
}

async function kill(worker) {
  if (worker.exitCode !== null || worker.signalCode !== null) return;
  worker.kill('SIGKILL');
  await once(worker, 'exit');
}

async function close(worker) {
  if (worker.exitCode !== null || worker.signalCode !== null) return;
  worker.send('close');
  await Promise.race([
    once(worker, 'exit'),
    delay(4000).then(() => kill(worker)),
  ]);
}

async function waitFor(read, predicate, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await delay(50);
  }
  throw new Error(
    `Predicate timeout: ${JSON.stringify(value, (key, entry) =>
      key === 'snapshot' ? { status: entry?.status } : entry
    ).slice(0, 2000)}`
  );
}

async function scenario(kind) {
  const coldMode =
    kind === 'cold-stop-store-failure'
      ? 'approval'
      : kind.slice('cold-stop-'.length);
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cf-service-recovery-')
  );
  const config = {
    schemaName: `cf_service_native_${Date.now()}_${process.pid}_${kind}`,
    controlPath: path.join(directory, 'control.json'),
    auditPath: path.join(directory, 'audit.jsonl'),
    ...(kind === 'force-suspended' ? { fixtureMode: 'approval' } : {}),
    ...(kind.startsWith('cold-stop-')
      ? { fixtureMode: coldMode, holdSuspensionPersistence: true }
      : {}),
    ...(kind.startsWith('queued-gap')
      ? { queuedInput: true, fixtureSelectedContext: true }
      : {}),
  };
  fs.writeFileSync(
    config.controlPath,
    JSON.stringify({
      mode: kind.startsWith('cold-stop-')
        ? coldMode
        : kind === 'queued-service'
        ? 'tool'
        : kind === 'wait-stop'
        ? 'outage'
        : ['lease', 'force-error', 'force-suspended'].includes(kind)
        ? 'hang'
        : 'outage-after-tool',
      active: true,
    })
  );
  fs.writeFileSync(config.auditPath, '');
  const runtime = await createRuntime(config);
  const workers = [];
  const readThread = () => runtime.memory.getThreadById({ threadId: THREAD });
  const audit = () =>
    fs
      .readFileSync(config.auditPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);
  try {
    if (kind === 'queued-context' || kind === 'queued-observe-only') {
      const selected = {
        version: 'assistant-work-context/v1',
        kind: 'piece',
        id: 'selected-piece',
      };
      await runtime.memory.createThread({
        threadId: THREAD,
        resourceId: 'org-service:user-service',
        title: 'Queued selected context',
        metadata: {
          assistantWorkspace: {
            version: 'assistant-workspace/v1',
            workContext: selected,
            artifacts: [],
            activeArtifact: null,
          },
        },
      });
      let refreshed = false;
      runtime.service.resolveWorkContext = async (
        identity,
        context,
        options
      ) => {
        assert.equal(identity.role, 'EDITOR');
        assert.deepEqual(context, selected);
        assert.equal(options.refresh, true);
        refreshed = true;
        return {
          context,
          data: { title: 'fresh-selected-piece' },
          truncated: false,
        };
      };
      const native = await runtime.service.queuedInputRuntime({
        identity: IDENTITY,
        threadId: THREAD,
        resourceId: 'org-service:user-service',
        requestId: 'queued-selected-context',
        childRunId: 'queued-context-child',
        signal: {
          id: 'selected-context-message',
          contents: 'Continue selected material.',
          createdAt: new Date().toISOString(),
          author: { id: IDENTITY.userId },
        },
      });
      assert.equal(refreshed, true);
      const restored = JSON.parse(native.requestContext.get('cf.workContext'));
      assert.deepEqual(restored.context, selected);
      assert.equal(restored.data.title, 'fresh-selected-piece');
      assert.equal(runtime.attempts.length, 0);
      if (kind === 'queued-observe-only') {
        await assert.rejects(
          native.run(async () => {
            throw new runtime.queuedInputModule.NativeQueuedInputObserveOnlyError();
          }),
          { code: 'NATIVE_QUEUE_OBSERVE_ONLY' }
        );
        assert.equal(runtime.admissions.length, 1);
        assert.equal(runtime.admissions[0].voided, true);
        assert.deepEqual(runtime.admissions[0].finishes, []);
        assert.notEqual(
          (await readThread()).metadata.assistantExecution.state,
          'settled'
        );
        return {
          kind,
          observerAdmissionVoided: true,
          lifecycleUnsettled: true,
          providerCalls: 0,
        };
      }
      return {
        kind,
        freshMembership: true,
        selectedContextRefreshed: true,
        providerCalls: 0,
      };
    }
    if (kind === 'queued-service' || kind === 'queued-availability') {
      if (kind === 'queued-availability') {
        const nativeWait = runtime.service.modelAvailability.wait.bind(
          runtime.service.modelAvailability
        );
        runtime.service.modelAvailability.wait = async (position) => {
          const result = await nativeWait({ ...position, delayMs: 60 });
          fs.writeFileSync(
            config.controlPath,
            JSON.stringify({ mode: 'success', active: true })
          );
          return result;
        };
      }
      await runtime.memory.createThread({
        threadId: THREAD,
        resourceId: 'org-service:user-service',
        title: 'Queued service admission',
      });
      const input = {
        identity: IDENTITY,
        threadId: THREAD,
        requestId: 'trusted-queued-service-task',
        signal: {
          id: 'service-queued-message',
          contents: 'Save the fixture result.',
          author: { id: IDENTITY.userId },
          createdAt: new Date().toISOString(),
        },
      };
      const accepted = await runtime.service.queueNativeInput(input);
      const workflow = runtime.mastra.getWorkflowById(
        'content-factory-queued-input-v1'
      );
      await waitFor(
        () => workflow.getWorkflowRunById(accepted.workflowRunId),
        (value) => value?.status === 'success'
      );
      const duplicate = await runtime.service.queueNativeInput({
        ...input,
        requestId: 'discarded-new-request-id',
      });
      assert.equal(duplicate.duplicate, true);
      assert.equal(duplicate.requestId, input.requestId);
      assert.equal(audit().filter((entry) => entry.type === 'tool').length, 1);
      assert.equal(runtime.admissions.length, 1);
      assert.deepEqual(runtime.admissions[0].finishes, [true]);
      const thread = await readThread();
      if (kind === 'queued-availability') {
        assert.notEqual(
          thread.metadata.assistantNativeRun.runId,
          accepted.childRunId
        );
        assert.equal(
          thread.metadata.assistantNativeRun.lineageRunIds.includes(
            accepted.childRunId
          ),
          true
        );
        assert.equal(
          runtime.attempts.slice(1).every((attempt) => attempt.hasToolResult),
          true
        );
      } else
        assert.equal(
          thread.metadata.assistantNativeRun.runId,
          accepted.childRunId
        );
      assert.equal(thread.metadata.assistantExecution.outcome, 'completed');
      return {
        kind,
        durableAcceptance: true,
        duplicateAccepted: true,
        providerCalls: audit().filter((entry) => entry.type === 'model').length,
        toolCalls: 1,
        admissions: 1,
        admissionFinishes: 1,
        outcome: 'completed',
      };
    }
    if (kind.startsWith('cold-stop-')) {
      const initial = launch({ ...config, role: 'initial' });
      workers.push(initial);
      const pending = await waitFor(
        () => runtime.agent.listSuspendedRuns({ threadId: THREAD }),
        (value) => value.runs.length === 1
      );
      const runId = pending.runs[0].runId;
      await event(initial, 'cold-suspended-checkpoint');
      await kill(initial);
      assert.equal(
        runtime.agent.runRegistry.get(runId),
        undefined,
        'The stopping backend must have no local run driver.'
      );
      const workflows = await runtime.storage.getStore('workflows');
      const killedOwner = await workflows.getRunOwnership({ runId });
      assert.equal(
        killedOwner?.live,
        true,
        'Stop must cancel the killed host before its native lease expires.'
      );
      const before = audit().filter((entry) => entry.type === 'model').length;
      if (kind === 'cold-stop-store-failure') {
        const update = workflows.updateWorkflowState.bind(workflows);
        workflows.updateWorkflowState = async (input) => {
          if (
            input.workflowName === 'durable-agentic-loop' &&
            input.runId === runId &&
            input.opts.status === 'canceled'
          )
            throw new Error('Injected canceled-state persistence failure.');
          return update(input);
        };
        await assert.rejects(
          runtime.service.cancelModelAvailability(runId, THREAD),
          /Native Stop cancellation was not persisted/
        );
        workflows.updateWorkflowState = update;
        assert.equal(
          (await runtime.agent.listSuspendedRuns({ threadId: THREAD })).runs
            .length,
          1
        );
        assert.notEqual(
          (await readThread()).metadata.assistantExecution.state,
          'settled'
        );
        assert.equal(
          audit().filter((entry) => entry.type === 'model').length,
          before
        );
        return {
          kind,
          cancellationAcknowledged: false,
          persistedGates: 1,
          additionalModelCalls: 0,
        };
      }
      await runtime.service.cancelModelAvailability(runId, THREAD);
      const after = await runtime.agent.listSuspendedRuns({ threadId: THREAD });
      assert.equal(
        after.runs.length,
        0,
        'Stop must remove the persisted native gate, not only its UI projection.'
      );
      const thread = await readThread();
      assert.equal(thread.metadata.assistantExecution.state, 'settled');
      assert.equal(thread.metadata.assistantExecution.outcome, 'interrupted');
      assert.equal(thread.metadata.assistantExecution.stopRequested, true);
      const stoppedOwner = await workflows.getRunOwnership({ runId });
      assert.equal(stoppedOwner.ownerId, killedOwner.ownerId);
      assert.equal(stoppedOwner.generation, killedOwner.generation);
      assert.equal(
        (
          await (
            await runtime.storage.getStore('workflows')
          ).getWorkflowRunById({ workflowName: 'durable-agentic-loop', runId })
        ).snapshot.status,
        'canceled'
      );
      const boot = launch({ ...config, role: 'bootstrap' });
      workers.push(boot);
      await event(boot, 'bootstrapped');
      await delay(250);
      assert.equal(
        audit().filter((entry) => entry.type === 'model').length,
        before
      );
      assert.equal(audit().filter((entry) => entry.type === 'tool').length, 0);
      return {
        kind,
        coldNativeStop: true,
        canceledBeforeLeaseExpiry: true,
        persistedGates: 0,
        additionalModelCalls: 0,
        toolCalls: 0,
        outcome: 'interrupted',
      };
    }
    if (kind === 'wait-stop') {
      const initial = launch({ ...config, role: 'initial', watchWait: true });
      workers.push(initial);
      const thread = await waitFor(
        readThread,
        (value) => value?.metadata?.assistantNativeRun?.state === 'waiting'
      );
      const runId = thread.metadata.assistantNativeRun.runId;
      assert.equal(audit().filter((entry) => entry.type === 'model').length, 3);
      const stopAt = Date.now();
      await runtime.service.cancelModelAvailability(runId, THREAD);
      runtime.agent.abortRunStream(runId);
      await delay(500);
      console.log(
        JSON.stringify({
          waitStopEvents: initial.events,
          waitStates: await runtime.service.modelAvailability.states(runId),
        })
      );
      const workflows = await runtime.storage.getStore('workflows');
      await waitFor(
        () =>
          workflows.getWorkflowRunById({
            workflowName: 'durable-agentic-loop',
            runId,
          }),
        (value) => value === null,
        5000
      );
      assert.equal(audit().filter((entry) => entry.type === 'model').length, 3);
      const states = await runtime.service.modelAvailability.states(runId);
      assert.equal(states.at(-1).status, 'canceled');
      return {
        kind,
        crossProcessStop: true,
        stopMs: Date.now() - stopAt,
        modelCalls: 3,
        waitStatus: 'canceled',
      };
    }
    if (['lease', 'force-error', 'force-suspended'].includes(kind)) {
      const initial = launch({ ...config, role: 'initial' });
      workers.push(initial);
      await event(initial, 'model');
      const before = await readThread();
      assert.equal(typeof before.metadata.assistantNativeRun.runId, 'string');
      fs.writeFileSync(
        config.controlPath,
        JSON.stringify({
          mode:
            kind === 'lease'
              ? 'success'
              : kind === 'force-suspended'
              ? 'approval'
              : 'permanent-error',
          active: true,
        })
      );
      if (kind === 'force-error' || kind === 'force-suspended') {
        await kill(initial);
        const result = await runtime.service.recoverDurableRuns({
          force: true,
          threadId: THREAD,
        });
        const thread = await readThread();
        console.log(
          JSON.stringify({ forceResult: result, forceThread: thread.metadata })
        );
        assert.equal(result.succeeded, 0);
        assert.equal(result.failed, kind === 'force-error' ? 1 : 0);
        if (kind === 'force-error')
          assert.equal(thread.metadata.assistantExecution.outcome, 'failed');
        else {
          assert.equal(thread.metadata.assistantNativeRun.state, 'waiting');
          assert.notEqual(thread.metadata.assistantExecution.state, 'settled');
          assert.equal(
            (await runtime.agent.listSuspendedRuns({ threadId: THREAD })).runs
              .length,
            1
          );
        }
        return {
          kind,
          result: { succeeded: result.succeeded, failed: result.failed },
          outcome: thread.metadata.assistantExecution.outcome,
        };
      }
      const boot = launch({ ...config, role: 'bootstrap' });
      workers.push(boot);
      const booted = await event(boot, 'bootstrapped');
      assert.ok(
        booted.elapsedMs < 3000,
        'HTTP bootstrap must not await the provider workflow.'
      );
      await delay(500);
      assert.equal(
        audit().filter((entry) => entry.type === 'model').length,
        1,
        'Bootstrap must not steal the live driver.'
      );
      await kill(initial);
      await event(boot, 'model', 50000);
      const thread = await waitFor(
        readThread,
        (value) => value?.metadata?.assistantExecution?.state === 'settled'
      );
      const calls = audit().filter((entry) => entry.type === 'model');
      assert.equal(calls.length, 2);
      assert.equal(thread.metadata.assistantExecution.outcome, 'completed');
      assert.equal(
        thread.metadata.assistantNativeRun.runId,
        before.metadata.assistantNativeRun.runId
      );
      return {
        kind,
        bootMs: booted.elapsedMs,
        liveOwnerPreserved: true,
        killedPid: initial.pid,
        recoveredPid: boot.pid,
        sameNativeRun: true,
        modelCalls: calls.length,
        outcome: thread.metadata.assistantExecution.outcome,
      };
    }

    const initial = launch({ ...config, role: 'gap' });
    workers.push(initial);
    const gap = await event(initial, 'gap', 25000);
    const workflows = await runtime.storage.getStore('workflows');
    // Native settlement deletes its snapshot before releasing run ownership.
    // Kill only after both complete so this models a gap without a live driver.
    const predecessor = await waitFor(
      async () => ({
        snapshot: await workflows.getWorkflowRunById({
          workflowName: 'durable-agentic-loop',
          runId: gap.pointer.previousRunId,
        }),
        owner: await workflows.getRunOwnership({
          runId: gap.pointer.previousRunId,
        }),
      }),
      (value) => value.snapshot === null && !value.owner?.live,
      5000
    );
    await kill(initial);
    const prior = await workflows.getWorkflowRunById({
      workflowName: 'durable-agentic-loop',
      runId: gap.pointer.previousRunId,
    });
    const next = await workflows.getWorkflowRunById({
      workflowName: 'durable-agentic-loop',
      runId: gap.pointer.runId,
    });
    assert.equal(
      prior,
      null,
      'The old native segment must have settled before queue execution.'
    );
    assert.equal(
      next,
      null,
      'The killed successor must not yet have a checkpoint.'
    );
    assert.equal(audit().filter((entry) => entry.type === 'tool').length, 1);
    if (config.queuedInput) {
      assert.equal(
        typeof gap.pointer.continuationQueuedInputChildRunId,
        'string'
      );
      assert.equal(gap.pointer.continuationWorkContext.id, 'original-piece');
      await runtime.memory.updateThread({
        id: THREAD,
        metadata: {
          assistantWorkspace: {
            version: 'assistant-workspace/v1',
            workContext: {
              version: 'assistant-work-context/v1',
              kind: 'piece',
              id: 'different-selected-piece',
            },
            artifacts: [],
            activeArtifact: null,
          },
        },
      });
      if (kind === 'queued-gap-stop') {
        const ids = runtime.queuedInputModule.nativeQueuedInputIds({
          identity: IDENTITY,
          threadId: THREAD,
          signal: { id: 'service-probe-queued-user-message' },
        });
        assert.equal(
          ids.childRunId,
          gap.pointer.continuationQueuedInputChildRunId
        );
        await runtime.queuedInputModule.stopNativeQueuedInput({
          host: runtime.mastra,
          workflow: runtime.mastra.getWorkflowById(
            'content-factory-queued-input-v1'
          ),
          threadId: THREAD,
          ...ids,
          agent: runtime.agent,
        });
        assert.notEqual(
          (await readThread()).metadata.assistantExecution.stopRequested,
          true,
          'Only the immutable queued-child stop witness guards this synthetic recovery.'
        );
      }
    }
    if (kind === 'revoked')
      fs.writeFileSync(
        config.controlPath,
        JSON.stringify({ mode: 'success', active: false })
      );
    else
      fs.writeFileSync(
        config.controlPath,
        JSON.stringify({ mode: 'success', active: true })
      );
    if (kind === 'stop' || kind === 'stop-gap-final') {
      await runtime.service.cancelModelAvailability(gap.pointer.runId, THREAD);
      if (kind === 'stop-gap-final') {
        const stopped = await readThread();
        assert.equal(
          stopped.metadata.assistantExecution.state,
          'settled',
          'An accepted handoff without a native driver must settle at Stop itself.'
        );
        assert.equal(
          stopped.metadata.assistantExecution.outcome,
          'interrupted'
        );
        assert.equal(
          stopped.metadata.assistantNativeRun.continuationPending,
          false
        );
      }
      // A delayed queue receipt may race with Stop; the independent durable
      // stopRequested marker must still prevent a later bootstrap wake.
      if (kind === 'stop')
        await runtime.memory.updateThread({
          id: THREAD,
          metadata: {
            assistantNativeRun: {
              ...gap.pointer,
              state: 'queued',
              continuationPending: true,
            },
          },
        });
    }
    const beforeCount = audit().filter(
      (entry) => entry.type === 'model'
    ).length;
    const boots = [
      launch({ ...config, role: 'bootstrap', pauseProviderMs: 200 }),
    ];
    if (kind === 'gap')
      boots.push(
        launch({ ...config, role: 'bootstrap', pauseProviderMs: 200 })
      );
    workers.push(...boots);
    await Promise.all(boots.map((worker) => event(worker, 'bootstrapped')));
    if (kind === 'gap' || kind === 'queued-gap') {
      const thread = await waitFor(
        readThread,
        (value) => value?.metadata?.assistantExecution?.state === 'settled'
      );
      const after = audit();
      const resumed = after
        .filter((entry) => entry.type === 'model')
        .slice(beforeCount);
      assert.equal(
        resumed.length,
        1,
        'Two fresh bootstraps must create only one fixed native execution.'
      );
      assert.equal(
        resumed[0].hasToolResult,
        true,
        'The public native Memory history must retain the committed tool result.'
      );
      assert.equal(
        after.filter((entry) => entry.type === 'tool').length,
        1,
        'Recovery must not replay the saved tool.'
      );
      assert.equal(thread.metadata.assistantNativeRun.runId, gap.pointer.runId);
      assert.equal(thread.metadata.assistantExecution.outcome, 'completed');
      if (config.queuedInput)
        assert.equal(
          audit()
            .filter((entry) => entry.type === 'context')
            .every((entry) => entry.selectedId === 'original-piece'),
          true,
          'Recovery must refresh the original task target despite a changed selected workspace object.'
        );
      return {
        kind,
        actualQueueCheckpointGap: true,
        successorRunId: gap.pointer.runId,
        predecessorRunId: gap.pointer.previousRunId,
        twoFreshProcesses: boots.map((worker) => worker.pid),
        resumedCalls: resumed.length,
        toolCalls: 1,
        savedToolResult: true,
        outcome: 'completed',
        ...(config.queuedInput
          ? { originalSelectedContextPreserved: true }
          : {}),
      };
    }
    if (kind === 'queued-gap-stop')
      await waitFor(
        readThread,
        (value) => value?.metadata?.assistantExecution?.state === 'settled'
      );
    await delay(250);
    const thread = await readThread();
    assert.equal(
      audit().filter((entry) => entry.type === 'model').length,
      beforeCount
    );
    if (kind === 'stop-gap-final')
      assert.equal(audit().filter((entry) => entry.type === 'tool').length, 1);
    if (kind === 'revoked')
      assert.equal(thread.metadata.assistantNativeRun.state, 'blocked');
    if (kind === 'stop' || kind === 'stop-gap-final')
      assert.equal(thread.metadata.assistantExecution.stopRequested, true);
    if (kind === 'queued-gap-stop') {
      assert.equal(thread.metadata.assistantExecution.outcome, 'interrupted');
      assert.equal(
        await workflows.getWorkflowRunById({
          workflowName: 'durable-agentic-loop',
          runId: gap.pointer.runId,
        }),
        null,
        'A stopped queued continuation must not create a native successor checkpoint.'
      );
    }
    return {
      kind,
      actualQueueCheckpointGap: true,
      additionalModelCalls: 0,
      state: thread.metadata.assistantNativeRun.state,
      stopRequested: thread.metadata.assistantExecution.stopRequested === true,
      ...(kind === 'stop-gap-final'
        ? {
            settledAtStop: true,
            predecessorOwnerLive: predecessor.owner?.live === true,
            additionalToolCalls: 0,
            outcome: thread.metadata.assistantExecution.outcome,
          }
        : {}),
      ...(kind === 'queued-gap-stop'
        ? { originalQueuedChildStopRespected: true }
        : {}),
    };
  } finally {
    await Promise.allSettled(workers.map(close));
    await runtime.close({ drop: true });
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--child') {
  child(JSON.parse(process.argv[3])).catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  const kinds = process.argv[2]
    ? [process.argv[2]]
    : [
        'lease',
        'gap',
        'revoked',
        'stop',
        'wait-stop',
        'force-error',
        'force-suspended',
        'queued-service',
        'queued-availability',
      ];
  (async () => {
    const results = [];
    for (const kind of kinds) results.push(await scenario(kind));
    console.log(JSON.stringify({ results }));
  })()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
