const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `EmailService.sendEmailSync` (libraries/nestjs-libraries/src/services/
 * email.service.ts) used to have four exit paths that each did a
 * `console.log` and returned normally, with no way to tell them apart from
 * outside: a malformed "to" address (no "@"), a missing
 * EMAIL_FROM_ADDRESS/EMAIL_FROM_NAME, an unrecognised EMAIL_PROVIDER
 * (silently downgraded to `EmptyProvider`), and — after all three retries —
 * a provider that kept failing. Every one of them looked exactly like "the
 * email was sent".
 *
 * content-factory-next-7jxo's fix draws one line: "email is off" (no real
 * provider configured — `EmptyProvider`) stays quiet, because nothing was
 * ever going to be sent. Everything else — a real provider configured but
 * fed garbage, or a real provider that failed outright — now throws instead
 * of returning, so a caller (in production, `EmailActivityV2.sendEmailV2`,
 * a Temporal activity) actually finds out.
 */

const sentByProvider = [];
const RealProvider = class {
  name = 'real';
  validateEnvKeys = [];
  async sendEmail(to, subject, html, fromName, fromAddress, replyTo) {
    sentByProvider.push({ to, subject, html, fromName, fromAddress, replyTo });
  }
};

const FailingProvider = class {
  name = 'failing';
  validateEnvKeys = [];
  failures = 0;
  async sendEmail() {
    this.failures++;
    throw new Error('boom: provider is down');
  }
};

const NonRetryableFailingProvider = class {
  name = 'failing-nonretryable';
  validateEnvKeys = [];
  attempts = 0;
  constructor(EmailSendError) {
    this.EmailSendError = EmailSendError;
  }
  async sendEmail() {
    this.attempts++;
    throw new this.EmailSendError('rejected: bad domain', false);
  }
};

// Loaded once and reused so that both the mock handed to `email.service.ts`
// and the class this file constructs errors with are the exact same
// `EmailSendError` — otherwise `email.service.ts`'s own `instanceof
// EmailSendError` check would silently see a different class.
const emailInterfaceModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/emails/email.interface.ts'
);
const { EmailSendError } = emailInterfaceModule;

function loadRealEmailService() {
  const { EmailService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/services/email.service.ts',
    {
      '@nestjs/common': { Injectable: () => (target) => target },
      '@contentfactory/nestjs-libraries/emails/email.interface': emailInterfaceModule,
      '@contentfactory/nestjs-libraries/emails/resend.provider': {
        ResendProvider: class {
          name = 'resend';
          validateEnvKeys = ['RESEND_API_KEY'];
        },
      },
      '@contentfactory/nestjs-libraries/emails/empty.provider': {
        EmptyProvider: class {
          name = 'no provider';
          validateEnvKeys = [];
          async sendEmail() {
            return 'no-op';
          }
        },
      },
      '@contentfactory/nestjs-libraries/emails/node.mailer.provider': {
        NodeMailerProvider: class {},
      },
      '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
      '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
        'libraries/nestjs-libraries/src/locale/backend-strings.ts'
      ),
      // The shell `sendEmailSync` wraps every email in lives here; the loader
      // only resolves an import a test names, so it is loaded for real.
      '@contentfactory/nestjs-libraries/emails/email.template': loadTypeScriptModule(
        'libraries/nestjs-libraries/src/emails/email.template.ts'
      ),
    }
  );
  return EmailService;
}

function withEnv(vars, run) {
  const previous = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
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

beforeEach(() => {
  sentByProvider.length = 0;
});

test('email is deliberately off: a malformed "to" with no real provider stays quiet', async () => {
  await withEnv(
    { EMAIL_PROVIDER: '', EMAIL_FROM_ADDRESS: '', EMAIL_FROM_NAME: '' },
    async () => {
      const EmailService = loadRealEmailService();
      const service = new EmailService({});

      await expect(
        service.sendEmailSync('not-an-email', 'subject', '<p/>')
      ).resolves.toBeUndefined();
    }
  );
});

test('email is broken: a malformed "to" with a real provider configured throws instead of silently returning', async () => {
  await withEnv(
    {
      EMAIL_PROVIDER: 'resend',
      EMAIL_FROM_ADDRESS: 'noreply@example.test',
      EMAIL_FROM_NAME: 'Content Factory',
    },
    async () => {
      const EmailService = loadRealEmailService();
      const service = new EmailService({});
      service.emailService = new RealProvider();

      await expect(
        service.sendEmailSync('not-an-email', 'subject', '<p/>')
      ).rejects.toThrow(/not a valid email address/);
      expect(sentByProvider).toHaveLength(0);
    }
  );
});

test('email is broken: missing EMAIL_FROM_* with a real provider configured throws instead of silently returning', async () => {
  await withEnv(
    {
      EMAIL_PROVIDER: 'resend',
      EMAIL_FROM_ADDRESS: undefined,
      EMAIL_FROM_NAME: undefined,
    },
    async () => {
      const EmailService = loadRealEmailService();
      const service = new EmailService({});
      service.emailService = new RealProvider();

      await expect(
        service.sendEmailSync('reader@example.test', 'subject', '<p/>')
      ).rejects.toThrow(/EMAIL_FROM_ADDRESS/);
    }
  );
});

test('a provider that keeps failing is retried up to 3 times, then the failure is thrown, not swallowed', async () => {
  await withEnv(
    {
      EMAIL_PROVIDER: '',
      EMAIL_FROM_ADDRESS: 'noreply@example.test',
      EMAIL_FROM_NAME: 'Content Factory',
    },
    async () => {
      const EmailService = loadRealEmailService();
      const service = new EmailService({});
      const failing = new FailingProvider();
      service.emailService = failing;

      await expect(
        service.sendEmailSync('reader@example.test', 'subject', '<p/>')
      ).rejects.toThrow(/boom: provider is down/);
      expect(failing.failures).toBe(3);
    }
  );
});

test('a non-retryable provider failure (bad domain) is not retried three times and is thrown immediately', async () => {
  await withEnv(
    {
      EMAIL_PROVIDER: '',
      EMAIL_FROM_ADDRESS: 'noreply@example.test',
      EMAIL_FROM_NAME: 'Content Factory',
    },
    async () => {
      const EmailService = loadRealEmailService();
      const service = new EmailService({});
      const failing = new NonRetryableFailingProvider(EmailSendError);
      service.emailService = failing;

      await expect(
        service.sendEmailSync('reader@example.test', 'subject', '<p/>')
      ).rejects.toThrow(/rejected: bad domain/);
      expect(failing.attempts).toBe(1);
    }
  );
});
