const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadContentLanguage() {
  const filename = path.resolve(
    __dirname,
    '../libraries/nestjs-libraries/src/dtos/content.language.ts'
  );
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(
    loaded.exports,
    require,
    loaded
  );
  return loaded.exports;
}

describe('autopost channel language default', () => {
  const { defaultContentLanguageForIntegrations } = loadContentLanguage();

  test('a Russian channel seeds a new autopost with Russian', () => {
    const actual = defaultContentLanguageForIntegrations(
      [{ id: 'telegram', contentLanguage: 'ru' }],
      'en'
    );

    expect(actual).toBe('ru');
  });

  test('mixed channel languages preserve the explicit current choice', () => {
    const actual = defaultContentLanguageForIntegrations(
      [
        { id: 'telegram-ru', contentLanguage: 'ru' },
        { id: 'telegram-en', contentLanguage: 'en' },
      ],
      'ru'
    );

    expect(actual).toBe('ru');
  });
});
