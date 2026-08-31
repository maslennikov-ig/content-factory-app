/**
 * Writes the still-missing interface strings out as files a person can hand to
 * a chat model, one file per chunk, and prints what is left per language.
 *
 * The translator script does the same work through the API; this exists for the
 * case where the owner wants to run the translation themselves and paste the
 * result back. Both paths land in the same place, and `merge-translations.cjs`
 * validates whatever comes back before it touches a locale file.
 *
 * Usage:
 *   node scripts/i18n/export-missing.cjs [--out DIR] [--chunk 200]
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  translatableKeys,
  localeNames,
  readLocale,
  isFilled,
} = require('./collect-ui-keys.cjs');

const LANGUAGE_NAMES = {
  ar: 'Arabic',
  bn: 'Bengali',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  he: 'Hebrew',
  it: 'Italian',
  ja: 'Japanese',
  ka_ge: 'Georgian',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  tr: 'Turkish',
  vi: 'Vietnamese',
  zh: 'Simplified Chinese',
};

const parseArguments = (argv) => {
  const options = { out: 'i18n-handover', chunk: 200 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') options.out = argv[++index];
    else if (argv[index] === '--chunk') options.chunk = Number(argv[++index]);
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  return options;
};

const run = () => {
  const options = parseArguments(process.argv.slice(2));
  const { translatable } = translatableKeys();
  const english = readLocale('en');
  fs.mkdirSync(options.out, { recursive: true });

  let files = 0;
  let strings = 0;
  for (const locale of localeNames()) {
    if (locale === 'en') continue;
    const data = readLocale(locale);
    const missing = [...translatable.keys()]
      .filter((key) => isFilled(english[key]) && !isFilled(data[key]))
      .sort();
    if (!missing.length) {
      console.log(`${locale.padEnd(6)} заполнен`);
      continue;
    }
    const chunks = Math.ceil(missing.length / options.chunk);
    for (let index = 0; index < chunks; index += 1) {
      const slice = missing.slice(
        index * options.chunk,
        (index + 1) * options.chunk
      );
      const name =
        chunks === 1
          ? `${locale}.json`
          : `${locale}.${String(index + 1).padStart(2, '0')}.json`;
      fs.writeFileSync(
        path.join(options.out, name),
        `${JSON.stringify(
          Object.fromEntries(slice.map((key) => [key, english[key]])),
          null,
          2
        )}\n`,
        'utf8'
      );
      files += 1;
    }
    strings += missing.length;
    console.log(
      `${locale.padEnd(6)} ${String(missing.length).padStart(4)} строк` +
        ` (${LANGUAGE_NAMES[locale] || locale}) → ${chunks} файл(ов)`
    );
  }
  console.log(`\nвсего строк: ${strings}, файлов: ${files}, каталог: ${options.out}`);
};

if (require.main === module) run();

module.exports = { run, LANGUAGE_NAMES };
