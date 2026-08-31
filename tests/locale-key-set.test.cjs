const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const localesDir = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);
const readLocale = (locale) =>
  JSON.parse(
    fs.readFileSync(path.join(localesDir, locale, 'translation.json'), 'utf8')
  );

const shippedLocales = () =>
  fs
    .readdirSync(localesDir)
    .filter((locale) =>
      fs.existsSync(path.join(localesDir, locale, 'translation.json'))
    )
    .sort();

// These two lists used to be written out by hand here, in snake_case, next to
// the same lists held in camelCase by `public-copy.ts` and as literals in the
// components. Adding a key and forgetting this file kept the suite green while
// production rendered the raw key string, because `t(key)` is called with no
// default and i18next falls back to the key itself. Both lists are derived
// from the code that uses them now, so forgetting is no longer possible.

// `usePublicCopy` owns the camelCase-to-snake_case transform. Driving it with a
// recording translator asks the component for the exact keys it will ask for at
// runtime, rather than re-deriving them.
const publicCopyKeys = () => {
  const asked = [];
  const { usePublicCopy, PUBLIC_COPY_KEYS } = loadTypeScriptModule(
    'apps/frontend/src/components/public-saas/public-copy.ts',
    {
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (key) => {
          asked.push(key);
          return key;
        },
      },
    }
  );
  const copy = usePublicCopy();
  for (const key of PUBLIC_COPY_KEYS) copy(key);
  return asked;
};

const TRANSLATION_SOURCE_ROOTS = [
  'apps/frontend/src',
  'apps/sdk',
  'libraries/react-shared-libraries/src',
];

// `t('key')` with no second argument renders the key itself when the locale is
// short. `t('key', 'Default')` degrades to readable English, so it is not the
// same hazard and is left out.
const NO_DEFAULT_TRANSLATION_CALL = /\bt\(\s*(['"])([a-z0-9_]+)\1\s*\)/g;

const sourceFiles = (relativeRoot) => {
  const absolute = path.join(root, relativeRoot);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (/\.tsx?$/.test(entry.name)) files.push(child);
    }
  };
  visit(absolute);
  return files;
};

const fallbackFreeKeys = () => {
  const used = new Map();
  for (const relativeRoot of TRANSLATION_SOURCE_ROOTS) {
    for (const file of sourceFiles(relativeRoot)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const [, , key] of source.matchAll(NO_DEFAULT_TRANSLATION_CALL)) {
        if (!used.has(key)) used.set(key, []);
        used.get(key).push(path.relative(root, file).split(path.sep).join('/'));
      }
    }
  }
  return used;
};

describe('locale key set and FAQ safety', () => {
  // Checking ka_ge alone left the other fourteen free to drift: a key added to
  // English and forgotten everywhere else would fall back silently, and nothing
  // would say which locale had gone short. All sixteen agree today, so every one
  // of them can be held to the English key set with no grandfathering at all.
  test('every shipped locale has exactly the English translation key set', () => {
    const en = new Set(Object.keys(readLocale('en')));
    const drift = {};

    for (const locale of shippedLocales()) {
      if (locale === 'en') continue;
      const keys = new Set(Object.keys(readLocale(locale)));
      const missing = [...en].filter((key) => !keys.has(key)).sort();
      const extra = [...keys].filter((key) => !en.has(key)).sort();
      if (missing.length || extra.length) drift[locale] = { missing, extra };
    }

    expect(drift).toEqual({});
  });

  test('every key the interface asks for without a fallback is translated everywhere', () => {
    const usedIn = fallbackFreeKeys();
    for (const key of publicCopyKeys()) {
      if (!usedIn.has(key))
        usedIn.set(key, [
          'apps/frontend/src/components/public-saas/public-copy.ts',
        ]);
    }

    // The derivation reaching into an empty list would make this test pass
    // without checking anything, so it has to find what is known to be there.
    expect([...usedIn.keys()]).toEqual(
      expect.arrayContaining([
        'public_saas_sign_in',
        'public_saas_home_title',
        'ai_usage_included',
      ])
    );

    const missing = {};
    for (const locale of shippedLocales()) {
      const messages = readLocale(locale);
      for (const [key, files] of usedIn) {
        if (typeof messages[key] === 'string' && messages[key].trim()) continue;
        (missing[locale] ??= []).push(`${key} (used by ${files[0]})`);
      }
    }

    expect(missing).toEqual({});
  });

  test('FAQ availability copy states the AGPL open-source product boundary', () => {
    for (const locale of fs.readdirSync(localesDir)) {
      const file = path.join(localesDir, locale, 'translation.json');
      if (!fs.existsSync(file)) continue;
      const value = readLocale(locale).faq_we_are_proudly_open_source;
      expect(typeof value).toBe('string');
      expect(value).not.toMatch(/gitroomhq\/postiz-app/i);
      if (locale !== 'en') {
        expect(value).not.toMatch(
          /the upstream repository|upstream foundation/i
        );
      }
      expect(value).not.toMatch(
        /private|closed[- ]source|закрыт|приватн|частн|privat|privado|privé|privato|privada|私有|非公開|비공개|კერძო/i
      );
      expect(value).toMatch(
        /AGPL[- ]?3\.0|open[- ]source|opensource|ღია კოდის|открыт.*код|código abierto|code source ouvert|open source|オープンソース|오픈소스|开源/i
      );
    }
  });

  test('FAQ component does not embed the upstream repository URL', () => {
    const source = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/billing/faq.component.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/gitroomhq\/postiz-app/);
  });
});
