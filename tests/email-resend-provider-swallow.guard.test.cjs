const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `ResendProvider.sendEmail` (libraries/nestjs-libraries/src/emails/
 * resend.provider.ts) used to `catch` every send failure, `console.log` it,
 * and resolve with `{ sent: false }` — a value nothing downstream ever
 * inspected. Worse, the Resend SDK does not throw on an API-level failure at
 * all: it resolves with `{ data: null, error }`, which the old code printed
 * on `email.service.ts:148` and otherwise ignored. A revoked key, an
 * expired key, a rate limit, a rejected domain — every one of those looked
 * exactly like a delivered email, both to `EmailService.sendEmailSync`'s
 * retry loop (which only reacts to a thrown exception) and to whatever
 * called it (a Temporal activity, whose task history would show "succeeded").
 *
 * content-factory-next-7jxo's fix: `error` (still resolved, never thrown, by
 * the SDK) now becomes a thrown `EmailSendError`, classified retryable or
 * not from Resend's own documented error code. A missing `RESEND_API_KEY`
 * throws too, instead of silently substituting a fake key (`re_132`) that
 * made a misconfigured install behave exactly like a configured one.
 */

function loadResendProvider(resendModuleMock) {
  return loadTypeScriptModule(
    'libraries/nestjs-libraries/src/emails/resend.provider.ts',
    {
      resend: resendModuleMock,
    },
    {
      sources: {
        '@contentfactory/nestjs-libraries/emails/email.interface':
          'libraries/nestjs-libraries/src/emails/email.interface.ts',
      },
    }
  );
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

test('a Resend API error (resolved, never thrown, by the SDK) becomes a thrown failure, not a silent "sent"', async () => {
  await withEnv({ RESEND_API_KEY: 'a-real-looking-key' }, async () => {
    let sendCalls = 0;
    const { ResendProvider } = loadResendProvider({
      Resend: class {
        constructor(apiKey) {
          this.apiKey = apiKey;
        }
        emails = {
          send: async () => {
            sendCalls++;
            return {
              data: null,
              error: {
                name: 'invalid_api_Key',
                message: 'API key is invalid',
              },
            };
          },
        };
      },
    });

    const provider = new ResendProvider();
    let caught;
    let result;
    try {
      result = await provider.sendEmail(
        'reader@example.test',
        'subject',
        '<p>body</p>',
        'Content Factory',
        'noreply@example.test'
      );
    } catch (err) {
      caught = err;
    }

    expect(sendCalls).toBe(1);
    expect(result).toBeUndefined();
    expect(caught).toBeDefined();
    expect(caught.message).toEqual(expect.stringContaining('invalid_api_Key'));
    // Not `{ sent: false }`, not swallowed — a real thrown failure.
    expect(caught).not.toEqual({ sent: false });
  });
});

test('a missing RESEND_API_KEY throws instead of silently substituting a fake key', async () => {
  await withEnv({ RESEND_API_KEY: undefined }, async () => {
    let constructed = false;
    const { ResendProvider } = loadResendProvider({
      Resend: class {
        constructor(apiKey) {
          constructed = true;
          this.apiKey = apiKey;
        }
      },
    });

    // Importing the module must never fail — `EmailService` imports every
    // provider unconditionally, whichever one is actually configured.
    const provider = new ResendProvider();

    await expect(
      provider.sendEmail(
        'reader@example.test',
        'subject',
        '<p>body</p>',
        'Content Factory',
        'noreply@example.test'
      )
    ).rejects.toThrow(/RESEND_API_KEY/);

    // No fallback key ("re_132") was ever handed to the SDK: no client was
    // even built.
    expect(constructed).toBe(false);
  });
});

test('a transient Resend error (rate limit) is marked retryable; a structural one (bad "from" address) is not', async () => {
  await withEnv({ RESEND_API_KEY: 'a-real-looking-key' }, async () => {
    const { ResendProvider } = loadResendProvider({
      Resend: class {
        constructor() {}
      },
    });

    async function sendWithError(errorName) {
      const provider = new ResendProvider();
      provider.getClient = () => ({
        emails: {
          send: async () => ({
            data: null,
            error: { name: errorName, message: 'boom' },
          }),
        },
      });
      try {
        await provider.sendEmail('a@b.test', 's', '<p/>', 'n', 'f@b.test');
      } catch (err) {
        return err;
      }
      throw new Error('expected sendEmail to throw');
    }

    const rateLimited = await sendWithError('rate_limit_exceeded');
    const badFromAddress = await sendWithError('invalid_from_address');

    expect(rateLimited.name).toBe('EmailSendError');
    expect(rateLimited.retryable).toBe(true);

    expect(badFromAddress.name).toBe('EmailSendError');
    expect(badFromAddress.retryable).toBe(false);
  });
});
