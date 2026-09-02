const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `sendEmailWorkflowV2` (apps/orchestrator/src/workflows/
 * send.email.workflow.v2.ts) removes an email from its queue
 * (`queue.shift()`) before calling the activity that actually sends it, so
 * once that call fails there is no second attempt — the email is gone
 * either way. Before content-factory-next-7jxo, what happened next was
 * `catch (err) { console.log(err); }`: a plain `console.log` from inside
 * the Temporal workflow sandbox, which a replay-aware Worker is not
 * guaranteed to surface anywhere an operator would see it. The fix replaces
 * it with `log.error` from `@temporalio/workflow` — the workflow-safe
 * logger that is actually funnelled through the Worker's log sink — and
 * includes which email was lost.
 *
 * This test does not touch a real Temporal server. It runs the real
 * `sendEmailWorkflowV2` function against a small stand-in for the
 * `@temporalio/workflow` runtime, the same technique
 * `email-service-async-locale.guard.test.cjs` uses.
 */

// The real workflow body is `while (true) { await condition(...); ... }` —
// it never returns. Left to poll forever with a real `setImmediate`, it
// would keep Node's event loop alive past the end of this test file.
// `liveRuntimes` lets `afterEach` stop every execution's polling once a
// test is done with it, the way a real Temporal worker would tear it down.
const liveRuntimes = [];

afterEach(() => {
  for (const runtime of liveRuntimes.splice(0)) {
    runtime.dispose();
  }
});

function makeFakeWorkflowRuntime(activityImpl) {
  const signalHandlers = new Map();
  let disposed = false;
  const runtime = {
    module: {
      defineSignal: (name) => ({ name }),
      setHandler: (signalDef, handler) => {
        signalHandlers.set(signalDef.name, handler);
      },
      condition: (predicate) =>
        new Promise((resolve) => {
          const check = () => {
            if (disposed) return; // intentionally never settles
            if (predicate()) return resolve();
            setImmediate(check);
          };
          check();
        }),
      sleep: () => Promise.resolve(),
      proxyActivities: () => activityImpl,
      continueAsNew: async (args) => args,
      log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    },
    deliverSignal(name, payload) {
      signalHandlers.get(name)(payload);
    },
    dispose() {
      disposed = true;
    },
  };
  liveRuntimes.push(runtime);
  return runtime;
}

function loadWorkflow(runtimeModule) {
  return loadTypeScriptModule(
    'apps/orchestrator/src/workflows/send.email.workflow.v2.ts',
    {
      '@temporalio/workflow': runtimeModule,
      '@contentfactory/orchestrator/activities/email.activity.v2': {
        EmailActivityV2: class {},
      },
    },
    {
      sources: {
        '@contentfactory/orchestrator/signals/send.email.signal':
          'apps/orchestrator/src/signals/send.email.signal.ts',
      },
    }
  ).sendEmailWorkflowV2;
}

async function waitFor(predicate, description) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for: ${description}`);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('an email whose send fails is logged through the workflow-safe logger, identifiably, instead of vanishing', async () => {
  const sendEmailV2 = jest.fn(async () => {
    throw new Error('provider is down');
  });
  const runtime = makeFakeWorkflowRuntime({ sendEmailV2 });
  const sendEmailWorkflowV2 = loadWorkflow(runtime.module);

  // `while (true)`: fire-and-forget, exactly like the real Worker running it.
  sendEmailWorkflowV2({ queue: [] });

  runtime.deliverSignal('sendEmail', {
    to: 'reader@example.test',
    subject: 'a subject only this test would recognise',
    html: '<p/>',
    addTo: 'bottom',
  });

  await waitFor(
    () => runtime.module.log.error.mock.calls.length > 0,
    'log.error to be called after the activity fails'
  );

  const [message, attrs] = runtime.module.log.error.mock.calls[0];
  expect(message).toEqual(expect.stringContaining('sendEmailWorkflowV2'));
  expect(attrs).toMatchObject({
    to: 'reader@example.test',
    subject: 'a subject only this test would recognise',
  });
  expect(attrs.error).toEqual(expect.stringContaining('provider is down'));

  // The loop kept going afterwards instead of getting stuck: a second email
  // still reaches the activity.
  sendEmailV2.mockClear();
  sendEmailV2.mockResolvedValueOnce(undefined);
  runtime.deliverSignal('sendEmail', {
    to: 'second@example.test',
    subject: 'second',
    html: '<p/>',
    addTo: 'bottom',
  });
  await waitFor(
    () => sendEmailV2.mock.calls.length > 0,
    'the queue to keep processing after a failure'
  );
});
