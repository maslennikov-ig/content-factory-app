const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const calendarPath = path.join(
  repositoryRoot,
  'apps/frontend/src/components/launches/calendar.tsx'
);
const source = fs.readFileSync(calendarPath, 'utf8');

function loadExportedFunction(name) {
  const ast = ts.createSourceFile(
    calendarPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const declaration = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name
  );
  if (!declaration) throw new Error(`missing ${name}`);
  const compiled = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function('exports', 'module', compiled)(loaded.exports, loaded);
  return loaded.exports[name];
}

describe('calendar error and accessibility boundary', () => {
  test('gives the translated +N remainder an image role and accessible name', () => {
    const remainder = source.match(
      /\{integrations\.length > 4 && \([\s\S]*?\n\s*\)\}/
    )?.[0];
    expect(remainder).toContain('role="img"');
    expect(remainder).toContain('aria-label={t(');
  });

  test('shows a safe normalized publishing message instead of serialized JSON', () => {
    const calendarErrorMessage = loadExportedFunction('calendarErrorMessage');
    const t = (_key, fallback) => fallback;
    const message = (value) => calendarErrorMessage(value, t);
    const generic = 'An error occurred while publishing this post';

    expect(
      message('{"message":"Unknown Error","code":"PROVIDER_TIMEOUT","status":504}')
    ).toBe('Unknown Error');
    expect(message('{"cause":{"token":"secret"}}')).toBe(generic);
    expect(message('Unknown Error')).toBe('Unknown Error');
    expect(message('Publishing failed')).toBe('Publishing failed');
    expect(message('Provider temporarily unavailable: token=secret')).toBe(
      generic
    );
  });

  test('keeps a benign provider message and suppresses a payload-shaped one', () => {
    const calendarErrorMessage = loadExportedFunction('calendarErrorMessage');
    const t = (_key, fallback) => fallback;
    const message = (value) => calendarErrorMessage(value, t);
    const generic = 'An error occurred while publishing this post';

    // Rows written before the ledger was minimized hold the provider's text.
    // A short human sentence is the whole point of the tooltip.
    for (const benign of [
      'Rate limit exceeded',
      'Token expired, reconnect the channel',
      'Media too large',
      'Учётная запись отключена',
    ]) {
      expect(message(benign)).toBe(benign);
    }

    // Anything payload-, URL- or credential-shaped stays hidden.
    for (const unsafe of [
      '{"cause":{"token":"secret"}}',
      '["Bearer abc"]',
      'Authorization: Bearer sk-live-1234567890',
      'failed to POST https://graph.facebook.com/v19.0/me?access_token=abc',
      'request failed with token=abc',
      `provider said: ${'x'.repeat(200)}`,
    ]) {
      expect(message(unsafe)).toBe(generic);
    }
  });

  test('routes every tooltip string through the translator', () => {
    const calendarErrorMessage = loadExportedFunction('calendarErrorMessage');
    const asked = [];
    const t = (key, fallback) => {
      asked.push(key);
      return `translated:${fallback}`;
    };

    expect(calendarErrorMessage('Unknown Error', t)).toBe(
      'translated:Unknown Error'
    );
    expect(calendarErrorMessage('Publishing failed', t)).toBe(
      'translated:Publishing failed'
    );
    expect(calendarErrorMessage('{"cause":{"token":"secret"}}', t)).toBe(
      'translated:An error occurred while publishing this post'
    );

    // A raw provider message has no key to translate: it is stored text.
    expect(calendarErrorMessage('Rate limit exceeded', t)).toBe(
      'Rate limit exceeded'
    );

    const locales = path.join(
      repositoryRoot,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    for (const key of new Set(asked)) {
      for (const locale of fs.readdirSync(locales)) {
        const file = path.join(locales, locale, 'translation.json');
        if (!fs.existsSync(file)) continue;
        const value = JSON.parse(fs.readFileSync(file, 'utf8'))[key];
        expect(typeof value === 'string' && value.length).toBeTruthy();
      }
    }
  });

  test('the tooltip call site passes the translator', () => {
    expect(source).toContain('calendarErrorMessage(post.error, t)');
  });
});
