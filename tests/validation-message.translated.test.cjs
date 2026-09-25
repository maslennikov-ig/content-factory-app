const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * Saving a post showed the server's English validation sentences inside an
 * otherwise Russian toast: the settings DTO's first class-validator message
 * (`settingsError`) and the provider's `checkValidity` answer (`errors`). The
 * sentence is recognised where it is read. This test reads every sentence the
 * sources can produce today, so a new English message fails here until
 * `validation-message.text.ts` knows it.
 */
const root = path.join(__dirname, '..');
const { translateValidationMessage, translateResolver } = loadTypeScriptModule(
  'apps/frontend/src/components/new-launch/validation-message.text.ts'
);

/** Records the key instead of translating: recognised = a `validation_` key came back. */
const recordingT = (key) => key;
const recognised = (message) =>
  /^validation_/.test(translateValidationMessage(message, recordingT));

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const listTs = (dir) =>
  fs
    .readdirSync(path.join(root, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(dir, f));

/** The body of `checkValidity(...) { ... }`, found by brace counting. */
const checkValidityBody = (source) => {
  const start = source.search(/async checkValidity\(/);
  if (start === -1) return '';
  const open = source.indexOf('{', source.indexOf('Promise<', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
};

const literal = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\x60((?:[^\x60\\$]|\\.)*)\x60`;

const providerMessages = listTs('libraries/nestjs-libraries/src/integrations/social').flatMap(
  (file) => {
    const body = checkValidityBody(read(file));
    return [...body.matchAll(new RegExp(String.raw`return\s+(?:${literal})`, 'g'))].map(
      (m) => [file, m[1] ?? m[2] ?? m[3]]
    );
  }
);

const dtoMessages = listTs('libraries/nestjs-libraries/src/dtos/posts/providers-settings').flatMap(
  (file) =>
    [...read(file).matchAll(new RegExp(String.raw`message:\s*(?:${literal})`, 'g'))].map(
      (m) => [file, m[1] ?? m[2] ?? m[3]]
    )
);

describe('post validation messages speak the interface language', () => {
  test('the sources still produce messages to check', () => {
    expect(providerMessages.length).toBeGreaterThan(30);
    expect(dtoMessages.length).toBeGreaterThan(5);
  });

  test.each(providerMessages)('checkValidity in %s: %s', (_file, message) => {
    expect(recognised(message)).toBe(true);
  });

  test.each(dtoMessages)('settings DTO %s: %s', (_file, message) => {
    expect(recognised(message)).toBe(true);
  });

  test.each([
    'Invalid media',
    'The maximum allowed is 500 characters in total for all tags.',
    'title should not be null or undefined',
    'title must be a string',
    'type must be one of the following values: public, private, unlisted',
    'title must be longer than or equal to 2 characters',
    'title must be shorter than or equal to 100 characters',
    'url must be a URL address',
    'post_as_images_carousel must be a boolean value',
    'tags must be an array',
    'tags must contain at least 1 elements',
    'tags must contain no more than 4 elements',
    'volume must not be less than 0',
    'volume must not be greater than 100',
    'categories must be a number conforming to the specified constraints',
    'each value in categories must be a number conforming to the specified constraints',
    'nested property audio must be either object or array',
    'each value in nested property tags must be either object or array',
  ])('server-produced: %s', (message) => {
    expect(recognised(message)).toBe(true);
  });

  test('the property name and numbers are carried over, and "/" is not escaped', () => {
    const calls = [];
    const t = (key, fallback, values) => {
      calls.push({ key, values });
      return fallback;
    };
    translateValidationMessage('title must be longer than or equal to 2 characters', t);
    expect(calls[0].values).toMatchObject({
      property: 'title',
      min: '2',
      interpolation: { escapeValue: false },
    });
  });

  test('an unknown sentence is shown unchanged', () => {
    expect(translateValidationMessage('Something else', recordingT)).toBe('Something else');
  });

  test('the settings form resolver translates field messages and keeps refs', async () => {
    const ref = { focus() {} };
    const resolver = translateResolver(
      async () => ({
        values: {},
        errors: {
          board: { type: 'isDefined', message: 'Board is required', ref, types: { isDefined: 'Board is required' } },
          subreddit: [{ value: { url: { message: 'Invalid URL', ref } } }],
        },
      }),
      recordingT
    );
    const { errors } = await resolver({}, undefined, {});
    expect(errors.board.message).toBe('validation_board_required');
    expect(errors.board.types.isDefined).toBe('validation_board_required');
    expect(errors.board.ref).toBe(ref);
    expect(errors.subreddit[0].value.url.message).toBe('validation_invalid_url');
  });
});
