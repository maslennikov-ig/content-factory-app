const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'apps/frontend/src');

/** Runs one self-contained frontend module outside the browser. */
function loadTypeScriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (request) =>
      require(
        request.startsWith('.')
          ? path.resolve(path.dirname(filename), request)
          : request
      ),
    loaded,
    loaded.exports
  );
  return loaded.exports;
}

const sourceFiles = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      sourceFiles.push(absolute);
  }
};
visit(frontend);

/**
 * The file list is collected once, but another suite in the same run writes a
 * short-lived fixture into this tree and deletes it again, so a path can be
 * gone by the time it is read. A vanished file is never a localization
 * failure; treating it as unreadable made the release gate flicker.
 */
const readSource = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
};

describe('shipped UI localization guard', () => {
  test('toasts never start with a string literal', () => {
    const failures = [];
    for (const file of sourceFiles) {
      const source = readSource(file);
      if (/toaster\.show\(\s*['"`]/m.test(source)) {
        failures.push(path.relative(root, file));
      }
    }
    expect(failures).toEqual([]);
  });

  test('opened modal titles never use a nonempty string literal', () => {
    const failures = [];
    for (const file of sourceFiles) {
      const source = readSource(file);
      for (const match of source.matchAll(
        /\.(?:openModal|open)\(\s*\{[\s\S]{0,500}?title:\s*(['"`])([^'"`]*)\1/g
      )) {
        if (match[2].trim()) failures.push(path.relative(root, file));
      }
    }
    expect([...new Set(failures)]).toEqual([]);
  });

  test('names and flags every language the picker offers', () => {
    // `ka_ge` is not a BCP-47 tag, and `Intl.DisplayNames(['ka_ge'])` throws a
    // RangeError rather than degrading, so the Georgian row showed the raw
    // code and a missing flag. `bn` had a flag, just the wrong country's.
    const { getCountryCodeForFlag, getLanguageName } = loadTypeScriptModule(
      'apps/frontend/src/components/layout/language.presentation.ts'
    );
    const config = fs.readFileSync(
      path.join(
        root,
        'libraries/react-shared-libraries/src/translation/i18n.config.ts'
      ),
      'utf8'
    );
    const shipped = [
      ...new Set(
        [...config.matchAll(/^\s*'([a-z_]+)',?$/gm)].map((match) => match[1])
      ),
    ];

    expect(shipped).toContain('ka_ge');
    expect(getCountryCodeForFlag('ka_ge')).toBe('GE');
    expect(getLanguageName('ka_ge')).toBe('ქართული');
    expect(getCountryCodeForFlag('bn')).toBe('BD');
    expect(getCountryCodeForFlag('en')).toBe('GB');

    for (const language of shipped) {
      // Two letters, or the flag component renders nothing at all.
      expect(getCountryCodeForFlag(language)).toMatch(/^[A-Z]{2}$/);
      // Its own name in its own script, never the bare code.
      expect(getLanguageName(language)).not.toBe(language);
    }
  });

  test('English and Russian bundles expose the same keys', () => {
    const load = (language) =>
      JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            `libraries/react-shared-libraries/src/translation/locales/${language}/translation.json`
          )
        )
      );
    expect(Object.keys(load('ru')).sort()).toEqual(
      Object.keys(load('en')).sort()
    );
  });
});
