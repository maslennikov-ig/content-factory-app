const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `EmailService.sendEmailSync` (libraries/nestjs-libraries/src/services/
 * email.service.ts) wraps every transactional email in one HTML shell before
 * handing it to the provider. That shell's footer signature line used to be
 * hardcoded English (`email.service.ts:119` before this task); it now reads
 * `language` off the call and looks the line up in the backend catalog,
 * falling back to English when the caller passes nothing. The wrapper's
 * layout is untouched by this task (see `content-factory-next-4zef`) — only
 * this one line's language is what these tests check.
 */
const sentByProvider = [];
const EmptyProvider = class {
  name = 'empty';
  validateEnvKeys = [];
  async sendEmail(to, subject, html, fromName, fromAddress, replyTo) {
    sentByProvider.push({ to, subject, html, fromName, fromAddress, replyTo });
  }
};

const { EmailService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/services/email.service.ts',
  {
    '@nestjs/common': { Injectable: () => (target) => target },
    '@contentfactory/nestjs-libraries/emails/email.interface': {
      EmailSendError: class EmailSendError extends Error {
        constructor(message, retryable) {
          super(message);
          this.retryable = retryable;
        }
      },
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
);

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

beforeEach(() => {
  sentByProvider.length = 0;
});

test('the footer signature is Russian for a Russian language, not the English default', async () => {
  await withEnv(
    {
      EMAIL_FROM_ADDRESS: 'noreply@example.test',
      EMAIL_FROM_NAME: 'Content Factory',
      FRONTEND_URL: 'https://app.example.test',
      EMAIL_PROVIDER: '',
    },
    async () => {
      const service = new EmailService({});
      await service.sendEmailSync(
        'reader@example.test',
        'Активируйте аккаунт',
        '<p>тело письма</p>',
        undefined,
        'ru'
      );

      expect(sentByProvider).toHaveLength(1);
      const html = sentByProvider[0].html;
      expect(html).toContain('Изменить настройки уведомлений можно в');
      expect(html).toContain('https://app.example.test/settings');
      expect(html).not.toContain(
        'You can change your notification preferences'
      );
    }
  );
});

test('an absent language defaults the footer to English', async () => {
  await withEnv(
    {
      EMAIL_FROM_ADDRESS: 'noreply@example.test',
      EMAIL_FROM_NAME: 'Content Factory',
      FRONTEND_URL: 'https://app.example.test',
      EMAIL_PROVIDER: '',
    },
    async () => {
      const service = new EmailService({});
      await service.sendEmailSync(
        'reader@example.test',
        'Activate your account',
        '<p>body</p>'
      );

      expect(sentByProvider[0].html).toContain(
        'You can change your notification preferences in your'
      );
    }
  );
});
