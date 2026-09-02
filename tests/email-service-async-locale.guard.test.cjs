const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `EmailService.sendEmail` (libraries/nestjs-libraries/src/services/
 * email.service.ts) never calls the provider itself. It signals a running
 * Temporal `sendEmailWorkflow*` singleton, which later calls a proxied
 * `EmailActivity*.sendEmail*`, which calls `sendEmailSync`, which is what
 * `email-service-footer-locale.test.cjs` actually exercises. That test
 * calls `sendEmailSync` directly and so cannot see a break anywhere in the
 * signal → workflow → activity leg — which is exactly where
 * content-factory-next-7q9d's contract fix needed a second look: it moved
 * `language` support to `sendEmailWorkflowV2` / `EmailActivityV2`, but the
 * first pass left `EmailService.sendEmail` pointed at the OLD workflow type
 * and the OLD singleton id (`sendEmailWorkflow` / `send_email`) — code that
 * type-checks and runs, and quietly drops `language` on every email sent
 * through the queue, which is every transactional email this product sends
 * (see auth.service.ts, notification.service.ts, users.service.ts,
 * billing.controller.ts — none of them call `sendEmailSync` directly).
 *
 * This test drives that whole leg with a small in-memory stand-in for a
 * Temporal server — no network, no real SDK. It starts from
 * `EmailService.sendEmail`, resolves the workflow type name string against
 * real workflow files, runs the real workflow function's real signal
 * handler and real queue loop, and ends at the same stubbed mail provider
 * `email-service-footer-locale.test.cjs` uses. If `EmailService.sendEmail`
 * names the wrong workflow type or the wrong singleton id, this fails —
 * either because that workflow type doesn't carry `language` at all (falls
 * back to English) or, for the singleton-id half, because the signal never
 * reaches an execution that's listening (an unrelated stand-in queue, or
 * none at all).
 */

// ---- a tiny stand-in for a running Temporal server ------------------------
//
// Each `workflowId` gets its own isolated execution: its own signal
// handlers, its own closure state. That mirrors the real risk here — a
// signal aimed at the wrong `workflowId` lands on a DIFFERENT running
// execution (or none), not on the one under test.

// The real `sendEmailWorkflow*` body is `while (true) { await condition(...); ... }`
// — it never returns. Left to poll forever with a real `setImmediate`, each
// execution would keep Node's event loop alive past the end of the test file.
// `liveRuntimes` lets a single `afterEach` stop every execution's polling once
// a test is done with it, the way a real Temporal worker would be torn down.
const liveRuntimes = [];

function makeFakeWorkflowRuntime() {
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
            if (disposed) return; // intentionally never settles: the execution is gone
            if (predicate()) return resolve();
            setImmediate(check);
          };
          check();
        }),
      sleep: () => Promise.resolve(),
      proxyActivities: () => activityImplementations,
      continueAsNew: async (args) => args,
    },
    deliverSignal(name, payload) {
      const handler = signalHandlers.get(name);
      if (!handler) {
        throw new Error(
          `fake Temporal server: no handler registered for signal "${name}" ` +
            'on this workflow execution'
        );
      }
      handler(payload);
    },
    dispose() {
      disposed = true;
    },
  };
  liveRuntimes.push(runtime);
  return runtime;
}

afterEach(() => {
  for (const runtime of liveRuntimes.splice(0)) {
    runtime.dispose();
  }
});

// Filled in per-test once the real activities exist.
let activityImplementations;

function makeFakeTemporalServer(workflowFilesByTypeName) {
  const executionsByWorkflowId = new Map();
  const started = [];

  function loadWorkflow(typeName, runtimeModule) {
    const file = workflowFilesByTypeName[typeName];
    if (!file) {
      throw new Error(
        `fake Temporal server: no workflow file registered for type "${typeName}"`
      );
    }
    const loaded = loadTypeScriptModule(
      file,
      {
        '@temporalio/workflow': runtimeModule,
        '@contentfactory/orchestrator/activities/email.activity': {
          EmailActivity: class {},
        },
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
    );
    const fn = loaded[typeName];
    if (typeof fn !== 'function') {
      throw new Error(
        `fake Temporal server: "${file}" does not export a "${typeName}" function`
      );
    }
    return fn;
  }

  return {
    startedWorkflowIds: () => started.slice(),
    getRawClient: () => ({
      workflow: {
        signalWithStart: (typeName, opts) => {
          started.push({ typeName, workflowId: opts.workflowId });
          let execution = executionsByWorkflowId.get(opts.workflowId);
          if (!execution) {
            const runtime = makeFakeWorkflowRuntime();
            const fn = loadWorkflow(typeName, runtime.module);
            execution = runtime;
            executionsByWorkflowId.set(opts.workflowId, execution);
            fn(...opts.args); // fire-and-forget: the workflow body is `while (true)`
          }
          execution.deliverSignal(opts.signal, opts.signalArgs[0]);
          return Promise.resolve({ workflowId: opts.workflowId });
        },
      },
    }),
  };
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

function withEnv(vars, run) {
  const previous = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    process.env[key] = vars[key];
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const key of Object.keys(vars)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    });
}

// ---- real production code, wired to the stand-in and to a capturing stub --

const sentByProvider = [];
const EmptyProvider = class {
  name = 'empty';
  validateEnvKeys = [];
  async sendEmail(to, subject, html, fromName, fromAddress, replyTo) {
    sentByProvider.push({ to, subject, html, fromName, fromAddress, replyTo });
  }
};

const FakeEmailSendError = class EmailSendError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
};

function loadRealEmailService() {
  return loadTypeScriptModule(
    'libraries/nestjs-libraries/src/services/email.service.ts',
    {
      '@nestjs/common': { Injectable: () => (target) => target },
      '@contentfactory/nestjs-libraries/emails/email.interface': {
        EmailSendError: FakeEmailSendError,
      },
      '@contentfactory/nestjs-libraries/emails/resend.provider': {
        ResendProvider: class {},
      },
      '@contentfactory/nestjs-libraries/emails/empty.provider': { EmptyProvider },
      '@contentfactory/nestjs-libraries/emails/node.mailer.provider': {
        NodeMailerProvider: class {},
      },
      '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
      '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
        'libraries/nestjs-libraries/src/locale/backend-strings.ts'
      ),
    }
  ).EmailService;
}

function noOpDecorator() {
  return (target) => target;
}

function loadRealActivities(emailServiceInstance) {
  const EmailActivity = loadTypeScriptModule(
    'apps/orchestrator/src/activities/email.activity.ts',
    {
      '@nestjs/common': { Injectable: noOpDecorator },
      'nestjs-temporal-core': {
        Activity: noOpDecorator,
        ActivityMethod: noOpDecorator,
      },
      '@contentfactory/nestjs-libraries/services/email.service': {
        EmailService: class {},
      },
      '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
        { OrganizationService: class {} },
    }
  ).EmailActivity;
  const EmailActivityV2 = loadTypeScriptModule(
    'apps/orchestrator/src/activities/email.activity.v2.ts',
    {
      '@nestjs/common': { Injectable: noOpDecorator },
      'nestjs-temporal-core': {
        Activity: noOpDecorator,
        ActivityMethod: noOpDecorator,
      },
      '@contentfactory/nestjs-libraries/services/email.service': {
        EmailService: class {},
      },
      '@contentfactory/nestjs-libraries/emails/email.interface': {
        EmailSendError: FakeEmailSendError,
      },
    }
  ).EmailActivityV2;

  return {
    sendEmail: (...args) =>
      new EmailActivity(emailServiceInstance, {}).sendEmail(...args),
    sendEmailV2: (...args) =>
      new EmailActivityV2(emailServiceInstance).sendEmailV2(...args),
  };
}

beforeEach(() => {
  sentByProvider.length = 0;
});

test('a Russian-language email sent through EmailService.sendEmail reaches the footer in Russian, over the real signal → workflow → activity leg', async () => {
  await withEnv(
    {
      EMAIL_FROM_ADDRESS: 'noreply@example.test',
      EMAIL_FROM_NAME: 'Content Factory',
      FRONTEND_URL: 'https://app.example.test',
      EMAIL_PROVIDER: '',
    },
    async () => {
      const EmailService = loadRealEmailService();
      const emailService = new EmailService({});
      activityImplementations = loadRealActivities(emailService);

      const fakeServer = makeFakeTemporalServer({
        sendEmailWorkflow: 'apps/orchestrator/src/workflows/send.email.workflow.ts',
        sendEmailWorkflowV2:
          'apps/orchestrator/src/workflows/send.email.workflow.v2.ts',
      });
      emailService._temporalService = {
        client: { getRawClient: () => fakeServer.getRawClient() },
      };

      await emailService.sendEmail(
        'reader@example.test',
        'Активируйте аккаунт',
        '<p>тело письма</p>',
        'top',
        undefined,
        'ru'
      );

      await waitFor(() => sentByProvider.length > 0, 'the stub provider to receive a send');

      expect(sentByProvider[0].html).toContain(
        'Изменить настройки уведомлений можно в'
      );
      expect(sentByProvider[0].html).not.toContain(
        'You can change your notification preferences'
      );

      // The singleton id matters as much as the workflow type: a signal aimed
      // at the wrong id lands on a different (here: nonexistent) execution.
      expect(fakeServer.startedWorkflowIds()).toEqual([
        { typeName: 'sendEmailWorkflowV2', workflowId: 'send_email_v2' },
      ]);
    }
  );
});
