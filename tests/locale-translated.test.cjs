const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const localesDir = path.join(
  repositoryRoot,
  'libraries/react-shared-libraries/src/translation/locales'
);
const allowlistPath = path.join(
  repositoryRoot,
  'tests/locale-untranslated-allowlist.json'
);

/**
 * Untranslated strings that look translated.
 *
 * `tests/locale-key-set.test.cjs` proves every locale carries every key. It
 * cannot prove any of them were translated, and English copied into a locale
 * file is worse than a missing key: a gap falls back to English and is
 * invisible, but a filled-in English value is indistinguishable from a finished
 * translation to anyone who cannot read the language. Twenty keys reached
 * ka_ge that way.
 *
 * What a machine can tell without reading the language is the alphabet. A
 * locale written in its own script says so in every sentence, so a value with
 * no character of that script has not been written in that language. That is a
 * fact about the bytes, not a judgement about the words.
 *
 * It cannot catch:
 *   - a Latin-script locale (de, es, fr, it, pt, tr, vi) left in English —
 *     there is no alphabet to look for, and `Email` is a legitimate Spanish
 *     translation of `Email`;
 *   - a wrong, stale or machine-mangled translation that is nonetheless
 *     written in the right script;
 *   - an English sentence with one word of the local script dropped into it.
 *
 * The exceptions are enumerated rather than guessed, because no rule separates
 * `MCP` — the same in every language — from `Basic`, which is not. Both are
 * Latin text in a Georgian file. `untranslatable` holds the values that carry
 * no translatable words in any language; `untranslated` is the exact English
 * still sitting in each locale, and it is a debt, checked in both directions so
 * it can only shrink.
 */
const SCRIPTS = {
  ar: /[؀-ۿݐ-ݿ]/,
  bn: /[ঀ-৿]/,
  he: /[֐-׿]/,
  ja: /[぀-ヿ一-鿿]/,
  ka_ge: /[Ⴀ-ჿⴀ-⴯]/,
  ko: /[가-힯ᄀ-ᇿ]/,
  ru: /[Ѐ-ӿ]/,
  zh: /[一-鿿]/,
};

const readLocale = (locale) =>
  JSON.parse(
    fs.readFileSync(path.join(localesDir, locale, 'translation.json'), 'utf8')
  );

const scriptless = (locale) => {
  const script = SCRIPTS[locale];
  return Object.entries(readLocale(locale))
    .filter(([, value]) => typeof value === 'string' && !script.test(value))
    .map(([key]) => key);
};

describe('locale translation completeness', () => {
  test('writes every non-Latin locale in its own script, minus an exact ledger', () => {
    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
    const english = readLocale('en');
    const invalid = [];
    const added = {};
    const stale = {};

    if (allowlist.version !== 1) invalid.push('allowlist version must be 1');

    const untranslatable = allowlist.untranslatable ?? {};
    for (const [key, reason] of Object.entries(untranslatable)) {
      if (!(key in english)) {
        invalid.push(`${key}: exempted key is not in the English translation`);
      }
      if (typeof reason !== 'string' || !reason.trim()) {
        invalid.push(`${key}: exemption must say why the value cannot change`);
      }
    }

    const declaredLocales = Object.keys(allowlist.untranslated ?? {}).sort();
    if (declaredLocales.join('\n') !== Object.keys(SCRIPTS).sort().join('\n')) {
      invalid.push(
        `ledger must cover exactly the non-Latin locales, received ${declaredLocales.join(', ')}`
      );
    }

    // An exemption granted to a key that every locale has since translated is a
    // permission nobody reviewed. It has to be spent somewhere to stay.
    const usedExemptions = new Set();
    for (const locale of Object.keys(SCRIPTS)) {
      for (const key of scriptless(locale)) {
        if (key in untranslatable) usedExemptions.add(key);
      }
    }
    const unusedExemptions = Object.keys(untranslatable)
      .filter((key) => !usedExemptions.has(key))
      .sort();

    for (const locale of Object.keys(SCRIPTS).sort()) {
      const ledger = new Set(allowlist.untranslated?.[locale] ?? []);
      const actual = new Set(
        scriptless(locale).filter((key) => !(key in untranslatable))
      );

      const newlyEnglish = [...actual].filter((key) => !ledger.has(key)).sort();
      const nowTranslated = [...ledger].filter((key) => !actual.has(key)).sort();
      if (newlyEnglish.length) added[locale] = newlyEnglish;
      if (nowTranslated.length) stale[locale] = nowTranslated;

      const declared = allowlist.untranslatedTotals?.[locale];
      if (declared !== ledger.size) {
        invalid.push(
          `${locale}: declared ${declared} untranslated key(s), ledger lists ${ledger.size}`
        );
      }
    }

    expect({ invalid, unusedExemptions, added, stale }).toEqual({
      invalid: [],
      unusedExemptions: [],
      added: {},
      stale: {},
    });
  });
});
