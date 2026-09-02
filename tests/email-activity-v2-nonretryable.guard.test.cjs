const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { ApplicationFailure } = require('@temporalio/common');

/**
 * `EmailActivityV2.sendEmailV2` (apps/orchestrator/src/activities/
 * email.activity.v2.ts) used to hand back whatever `EmailService.
 * sendEmailSync` returned — which used to always be a normal resolved
 * value, even after a send failed (content-factory-next-7jxo's other fix).
 * Now that `sendEmailSync` throws, this activity has to decide what
 * Temporal does with that throw: a bad recipient address or a rejected
 * domain will fail again unchanged, so retrying is pointless — that has to
 * become a non-retryable `ApplicationFailure`, or Temporal's default
 * (unbounded, backed-off) retry policy hammers the same doomed send
 * forever. A transient failure (network blip, provider 5xx) should still
 * go through Temporal's ordinary retry handling.
 */

function loadActivity(sendEmailSyncImpl) {
  return loadTypeScriptModule(
    'apps/orchestrator/src/activities/email.activity.v2.ts',
    {
      '@nestjs/common': { Injectable: () => (target) => target },
      'nestjs-temporal-core': {
        Activity: () => (target) => target,
        ActivityMethod: () => () => {},
      },
      '@contentfactory/nestjs-libraries/services/email.service': {
        EmailService: class {},
      },
      '@contentfactory/nestjs-libraries/emails/email.interface': {
        EmailSendError: EmailSendErrorClass,
      },
    }
  ).EmailActivityV2;
}

class EmailSendErrorClass extends Error {
  constructor(message, retryable) {
    super(message);
    this.name = 'EmailSendError';
    this.retryable = retryable;
  }
}

test('a non-retryable EmailSendError becomes a non-retryable ApplicationFailure', async () => {
  const EmailActivityV2 = loadActivity();
  const emailServiceStub = {
    sendEmailSync: async () => {
      throw new EmailSendErrorClass('rejected: bad domain', false);
    },
  };
  const activity = new EmailActivityV2(emailServiceStub);

  let caught;
  try {
    await activity.sendEmailV2('reader@example.test', 'subject', '<p/>');
  } catch (err) {
    caught = err;
  }

  expect(caught).toBeInstanceOf(ApplicationFailure);
  expect(caught.nonRetryable).toBe(true);
  expect(caught.message).toEqual(expect.stringContaining('bad domain'));
});

test('a retryable EmailSendError is not converted to non-retryable, and passes through unchanged', async () => {
  const EmailActivityV2 = loadActivity();
  const original = new EmailSendErrorClass('rate limited, try later', true);
  const emailServiceStub = {
    sendEmailSync: async () => {
      throw original;
    },
  };
  const activity = new EmailActivityV2(emailServiceStub);

  let caught;
  try {
    await activity.sendEmailV2('reader@example.test', 'subject', '<p/>');
  } catch (err) {
    caught = err;
  }

  expect(caught).toBe(original);
  expect(caught).not.toBeInstanceOf(ApplicationFailure);
});

test('a plain, unclassified Error also passes through unchanged (Temporal applies its own default retry policy)', async () => {
  const EmailActivityV2 = loadActivity();
  const original = new Error('ECONNRESET');
  const emailServiceStub = {
    sendEmailSync: async () => {
      throw original;
    },
  };
  const activity = new EmailActivityV2(emailServiceStub);

  let caught;
  try {
    await activity.sendEmailV2('reader@example.test', 'subject', '<p/>');
  } catch (err) {
    caught = err;
  }

  expect(caught).toBe(original);
});
