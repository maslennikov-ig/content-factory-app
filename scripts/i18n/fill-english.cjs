/**
 * Copies each missing English entry from the default the call site already
 * carries. Nothing is invented and nothing existing is overwritten: the text
 * written here is the exact text the interface renders today when the key is
 * absent, so this changes the catalogue, not the product.
 */
const {
  translatableKeys,
  readLocale,
  writeLocale,
  isFilled,
} = require('./collect-ui-keys.cjs');

const run = () => {
  const { translatable } = translatableKeys();
  const english = readLocale('en');
  const added = [];
  const unresolved = [];

  for (const [key, entry] of [...translatable].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (isFilled(english[key])) continue;
    if (!entry.fallback) {
      unresolved.push(key);
      continue;
    }
    english[key] = entry.fallback;
    added.push(key);
  }

  writeLocale('en', english);
  console.log('добавлено английских записей:', added.length);
  if (unresolved.length) {
    console.log('без источника текста, нужен человек:', unresolved.length);
    for (const key of unresolved) console.log('   ·', key);
  }
};

if (require.main === module) run();

module.exports = { run };
