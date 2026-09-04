/**
 * Refusals a person can read.
 *
 * The live walkthrough on 04.09.2026 found four screens printing a developer's
 * text at the reader:
 *
 * - `content-factory-next-fn33.38`: the registration form put
 *   `{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}`
 *   under the email field;
 * - `content-factory-next-fn33.43`: the sign-in form answered «Invalid user
 *   name or password» on a page that was otherwise entirely in Russian;
 * - `content-factory-next-fn33.72`: the invitation form answered «role must be
 *   one of the following values: USER, EDITOR, ADMIN» — the enum out of the
 *   code, beside a list naming those same roles in the reader's language;
 * - `content-factory-next-fn33.73`: the profile answered «fullname must be
 *   longer than or equal to 3 characters».
 *
 * All four are answered by one helper, so this exercises the helper and then
 * checks that each of the four screens actually asks it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

/**
 * A translator that answers with the key rather than the English fallback, so
 * a test cannot pass on a sentence that was never given a key — and one that
 * interpolates, because two of these sentences carry numbers.
 */
const recordingT = () => (key, _fallback, values) => {
  if (!values) return key;
  const named = Object.entries(values)
    .map((entry) => entry[0] + '=' + entry[1])
    .join(',');
  return key + '(' + named + ')';
};

const helper = loadTypeScriptModule(
  'apps/frontend/src/components/auth/form.errors.ts',
  {
    react: { useCallback: (fn) => fn },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: recordingT,
    },
  }
);

const { parseRequestFailure, useFieldErrorMessage, useRequestErrorMessage } =
  helper;

const response = ({ status, body }) => ({
  status,
  text: async () => body,
});

describe('a refused request, read once', () => {
  test('keeps the status and the raw body, and never invents fields', async () => {
    const failure = await parseRequestFailure(
      response({ status: 400, body: 'Invalid user name or password' })
    );

    expect(failure.status).toBe(400);
    expect(failure.raw).toBe('Invalid user name or password');
    expect(failure.fields).toEqual({});
  });

  test('splits a validation answer by the property each message names', async () => {
    const failure = await parseRequestFailure(
      response({
        status: 400,
        body: JSON.stringify({
          statusCode: 400,
          error: 'Bad Request',
          message: [
            'fullname must be longer than or equal to 3 characters',
            'fullname must be a string',
            'role must be one of the following values: USER, EDITOR, ADMIN',
          ],
        }),
      })
    );

    // One instruction per field: class-validator lists every broken
    // constraint, and a person needs the first one, not all of them.
    expect(failure.fields).toEqual({
      fullname: 'fullname must be longer than or equal to 3 characters',
      role: 'role must be one of the following values: USER, EDITOR, ADMIN',
    });
  });

  test('unwraps the sentence Nest wraps in JSON', async () => {
    const failure = await parseRequestFailure(
      response({
        status: 429,
        body: JSON.stringify({
          statusCode: 429,
          message: 'ThrottlerException: Too Many Requests',
        }),
      })
    );

    expect(failure.raw).toBe('ThrottlerException: Too Many Requests');
  });
});

describe('one field, one sentence', () => {
  const fieldMessage = useFieldErrorMessage();

  test('names the role field without spelling out the enum', () => {
    // `content-factory-next-fn33.72`
    expect(
      fieldMessage(
        'role',
        'role must be one of the following values: USER, EDITOR, ADMIN'
      )
    ).toBe('validation_role_required');
  });

  test('carries the length out of the message rather than a second copy of it', () => {
    // `content-factory-next-fn33.73`
    expect(
      fieldMessage(
        'fullname',
        'fullname must be longer than or equal to 3 characters'
      )
    ).toBe('validation_name_too_short(min=3)');
  });

  test('leaves a sentence the product wrote alone', () => {
    // `password_reset_link_expired` is already translated where it is set.
    expect(
      fieldMessage('password', 'Your password reset link has expired.')
    ).toBe('Your password reset link has expired.');
  });

  test('says nothing when the field is fine', () => {
    expect(fieldMessage('email', undefined)).toBeUndefined();
  });

  test('answers an unknown property without echoing the code', () => {
    const message = fieldMessage(
      'someInternalField',
      'someInternalField must be a positive number'
    );
    expect(message).toBe('validation_value_refused');
    expect(message).not.toContain('someInternalField');
  });
});

describe('one request, one sentence', () => {
  const requestMessage = useRequestErrorMessage();
  const failureOf = async (status, body) =>
    requestMessage(await parseRequestFailure(response({ status, body })));

  test('a throttled registration is a wait, not a stack trace', async () => {
    // `content-factory-next-fn33.38`
    const message = await failureOf(
      429,
      JSON.stringify({
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      })
    );
    expect(message).toBe('error_too_many_attempts');
    expect(message).not.toContain('statusCode');
    expect(message).not.toContain('Throttler');
  });

  test('a wrong password is a translated line, not the server’s English', async () => {
    // `content-factory-next-fn33.43`
    expect(await failureOf(400, 'Invalid user name or password')).toBe(
      'error_invalid_credentials'
    );
  });

  test('an address already registered says so', async () => {
    expect(await failureOf(400, 'Email already exists')).toBe(
      'error_email_already_registered'
    );
  });

  test('a refusal nobody anticipated is still a sentence', async () => {
    const message = await failureOf(400, 'Some entirely new server sentence');
    expect(message).toBe('error_request_refused');
    expect(message).not.toContain('Some entirely new server sentence');
  });

  test('a service that did not answer is not a validation problem', async () => {
    expect(await failureOf(502, '<html>Bad Gateway</html>')).toBe(
      'error_service_unavailable'
    );
  });
});

describe('the screens that were printing raw answers', () => {
  test('registration shows a translated line and logs the raw one', () => {
    const source = read('apps/frontend/src/components/auth/register.tsx');
    expect(source).toContain('parseRequestFailure(response)');
    expect(source).toContain('requestErrorMessage(failure)');
    // The defect itself: the body went under the email field as it arrived.
    expect(source).not.toContain('message: await response.text()');
  });

  test('sign-in translates the refusal', () => {
    const source = read('apps/frontend/src/components/auth/login.tsx');
    expect(source).toContain('requestErrorMessage(failure)');
    expect(source).not.toContain('message: errorMessage');
  });

  test('the invitation form asks about the role field', () => {
    const source = read(
      'apps/frontend/src/components/settings/teams.component.tsx'
    );
    expect(source).toContain('useFieldErrorMessage');
    expect(source).toMatch(/fieldErrorMessage\(\s*'role'/);
  });

  test('the profile asks about the name field', () => {
    const source = read(
      'apps/frontend/src/components/layout/settings.component.tsx'
    );
    expect(source).toContain('useFieldErrorMessage');
    expect(source).toMatch(/fieldErrorMessage\(\s*'fullname'/);
  });
});

describe('the sentences exist in both human languages', () => {
  const catalog = (locale) =>
    JSON.parse(
      read(
        `libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`
      )
    );

  test.each(['en', 'ru'])('%s carries every new key', (locale) => {
    const strings = catalog(locale);
    for (const key of [
      'error_too_many_attempts',
      'error_invalid_credentials',
      'error_email_already_registered',
      'error_request_refused',
      'error_service_unavailable',
      'error_network',
      'validation_role_required',
      'validation_name_too_short',
      'validation_value_refused',
      'validation_email_invalid',
      'validation_required',
      'validation_passwords_differ',
    ]) {
      expect(typeof strings[key]).toBe('string');
      expect(strings[key].length).toBeGreaterThan(0);
    }
    expect(strings.validation_name_too_short).toContain('{{min}}');
  });
});
