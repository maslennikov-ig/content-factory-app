/**
 * Takes translation files that came back from outside and merges them into the
 * locale catalogue, refusing anything that would break a string.
 *
 * Nothing is trusted on arrival: a value that lost a placeholder, translated
 * the product name, came back empty, or answers a key nobody asked for is
 * reported and skipped. An existing translation is never overwritten, so a
 * human correction survives a later merge.
 *
 * Usage:
 *   node scripts/i18n/merge-translations.cjs FILE [FILE...]
 *
 * The locale is read from the file name: `ru.json`, `ka_ge.02.json`.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  translatableKeys,
  localeNames,
  readLocale,
  writeLocale,
  isFilled,
} = require('./collect-ui-keys.cjs');

const placeholders = (text) => (text.match(/\{\{?[^{}]+\}?\}/g) || []).sort();

const sameSet = (left, right) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const localeFromFileName = (file) => {
  const base = path.basename(file).replace(/\.json$/, '');
  const known = localeNames();
  // `ka_ge.02` and `ka_ge` both belong to `ka_ge`; the longest match wins so a
  // locale whose name contains an underscore is not cut in half.
  return known
    .filter((locale) => base === locale || base.startsWith(`${locale}.`))
    .sort((a, b) => b.length - a.length)[0];
};

const run = () => {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error('Give at least one file to merge.');

  const { translatable } = translatableKeys();
  const english = readLocale('en');
  const perLocale = new Map();
  const problems = [];

  for (const file of files) {
    const locale = localeFromFileName(file);
    if (!locale) {
      problems.push(`${file}: не удалось определить язык по имени файла`);
      continue;
    }
    let incoming;
    try {
      incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      problems.push(`${file}: не разбирается как JSON — ${error.message}`);
      continue;
    }
    if (!perLocale.has(locale)) perLocale.set(locale, readLocale(locale));
    const data = perLocale.get(locale);
    let accepted = 0;

    for (const [key, value] of Object.entries(incoming)) {
      if (!translatable.has(key)) {
        problems.push(`${locale}:${key}: интерфейс такого ключа не рендерит`);
        continue;
      }
      if (typeof value !== 'string' || !value.trim()) {
        problems.push(`${locale}:${key}: пустое значение`);
        continue;
      }
      if (isFilled(data[key])) continue;
      const source = english[key];
      if (!isFilled(source)) {
        problems.push(`${locale}:${key}: нет английского исходника`);
        continue;
      }
      if (!sameSet(placeholders(source), placeholders(value))) {
        problems.push(`${locale}:${key}: потеряна подстановка`);
        continue;
      }
      if (
        source.includes('Content Factory') &&
        !value.includes('Content Factory')
      ) {
        problems.push(`${locale}:${key}: имя продукта переведено`);
        continue;
      }
      data[key] = value;
      accepted += 1;
    }
    console.log(`${path.basename(file)} → ${locale}: принято ${accepted}`);
  }

  for (const [locale, data] of perLocale) writeLocale(locale, data);

  if (problems.length) {
    console.log(`\nотклонено: ${problems.length}`);
    for (const line of problems.slice(0, 60)) console.log('   ·', line);
    if (problems.length > 60) console.log(`   … и ещё ${problems.length - 60}`);
  }
};

if (require.main === module) run();

module.exports = { placeholders, sameSet, localeFromFileName };
