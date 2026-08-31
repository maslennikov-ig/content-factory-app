/**
 * Every translation key the frontend actually renders, with the English text
 * the call carries as its default.
 *
 * A regular expression cannot tell `t('key', 'text')` from a `t(` that happens
 * to appear inside a string, and it loses a default written across two lines.
 * The TypeScript parser is already a dependency of the test suite, so the call
 * sites are read from the syntax tree instead.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND = path.join(REPOSITORY_ROOT, 'apps/frontend/src');
const LOCALES = path.join(
  REPOSITORY_ROOT,
  'libraries/react-shared-libraries/src/translation/locales'
);

const sourceFiles = (directory) => {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(absolute));
    else if (/\.tsx?$/.test(entry.name)) found.push(absolute);
  }
  return found;
};

/** `t('key')` and `t('key', 'English default')`, however the callee is named. */
const isTranslationCall = (node) =>
  ts.isCallExpression(node) &&
  ((ts.isIdentifier(node.expression) && node.expression.text === 't') ||
    (ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 't')) &&
  node.arguments.length > 0 &&
  ts.isStringLiteralLike(node.arguments[0]) &&
  /^[a-z0-9_]+$/.test(node.arguments[0].text);

/**
 * A default written as a template literal with a substitution — for example
 * `` `Select the ${providerDisplayName} page` `` — builds its English text at
 * runtime from a JavaScript value. Copying that text into a locale file would
 * freeze one provider's name into every language, so such a key is recorded
 * and excluded rather than translated. Giving it a real translation means
 * first rewriting the call site to use i18next interpolation.
 */
const isInterpolatedDefault = (node) =>
  node !== undefined && ts.isTemplateExpression(node);

/**
 * @returns {Map<string, { fallback: string | null, interpolated: boolean, files: Set<string> }>}
 */
const collectUiKeys = () => {
  const keys = new Map();
  for (const file of sourceFiles(FRONTEND)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const visit = (node) => {
      if (isTranslationCall(node)) {
        const key = node.arguments[0].text;
        const second = node.arguments[1];
        const fallback =
          second && ts.isStringLiteralLike(second) ? second.text : null;
        const entry = keys.get(key) || {
          fallback: null,
          interpolated: false,
          files: new Set(),
        };
        // The first non-empty default wins; a later call site may omit it.
        if (!entry.fallback && fallback) entry.fallback = fallback;
        if (isInterpolatedDefault(second)) entry.interpolated = true;
        entry.files.add(path.relative(REPOSITORY_ROOT, file));
        keys.set(key, entry);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return keys;
};

const localeNames = () =>
  fs
    .readdirSync(LOCALES)
    .filter((name) =>
      fs.existsSync(path.join(LOCALES, name, 'translation.json'))
    )
    .sort();

const localePath = (locale) =>
  path.join(LOCALES, locale, 'translation.json');

const readLocale = (locale) =>
  JSON.parse(fs.readFileSync(localePath(locale), 'utf8'));

const writeLocale = (locale, data) =>
  fs.writeFileSync(
    localePath(locale),
    `${JSON.stringify(data, null, 2)}\n`,
    'utf8'
  );

const isFilled = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * The keys a locale file is expected to carry: everything the interface
 * renders, minus the ones whose English text is assembled at runtime.
 */
const translatableKeys = () => {
  const keys = collectUiKeys();
  const translatable = new Map();
  const interpolated = [];
  for (const [key, entry] of keys) {
    if (entry.interpolated && !entry.fallback) interpolated.push(key);
    else translatable.set(key, entry);
  }
  return { translatable, interpolated: interpolated.sort() };
};

module.exports = {
  REPOSITORY_ROOT,
  LOCALES,
  collectUiKeys,
  translatableKeys,
  localeNames,
  localePath,
  readLocale,
  writeLocale,
  isFilled,
};

if (require.main === module) {
  const { translatable, interpolated } = translatableKeys();
  const withoutFallback = [...translatable].filter(
    ([, entry]) => !entry.fallback
  );
  console.log('ключей, которые рендерит интерфейс:', translatable.size);
  console.log('из них без запасного текста в коде:', withoutFallback.length);
  console.log('исключены как собираемые на лету:', interpolated.length);
  for (const key of interpolated) console.log('   ·', key);
  for (const locale of localeNames()) {
    const data = readLocale(locale);
    const missing = [...translatable.keys()].filter(
      (key) => !isFilled(data[key])
    );
    console.log(`  ${locale.padEnd(6)} не хватает ${missing.length}`);
  }
}
