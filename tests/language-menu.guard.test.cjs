const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

const PRESENTATION =
  'apps/frontend/src/components/layout/language.presentation.ts';
const SHARED_MENU = 'apps/frontend/src/components/ui/language-menu.tsx';
const AUTH_SWITCH = 'apps/frontend/src/components/auth/language.switch.tsx';
const PUBLIC_SWITCH = 'apps/frontend/src/components/public-saas/public-language.tsx';
const MODAL = 'apps/frontend/src/components/layout/language.component.tsx';
const CONFIG = 'libraries/react-shared-libraries/src/translation/i18n.config.ts';

/**
 * The language picker, in two promises this repository has already broken once.
 *
 * `content-factory-next-fn33.116` — every language names itself. The list used
 * to ask `Intl.DisplayNames`, which answers from whatever locale data the
 * runtime carries and falls back silently when it has none: `Georgian` on the
 * server, `грузинский` in a Russian browser, sitting between `日本語` and
 * `Deutsch`. The reader who most needs to find their language is the one who
 * cannot. So the names are written out, and this checks the list stays whole:
 * a language added to `i18n.config` with no name here is the same defect
 * returning.
 *
 * `content-factory-next-fn33.97` — one control, not two. The picker was built
 * twice, for `/auth` and for the marketing shell, differing only in the band it
 * sat on. This checks the cookie-and-reload is written in exactly one place, so
 * the third caller extends it instead of copying it a third time.
 */

/** The shipped locale ids, read from the config rather than restated. */
const shippedLanguages = () => {
  const source = read(CONFIG);
  const block = source.match(/export const languages = \[([\s\S]*?)\];/);
  if (!block) throw new Error(`cannot find the language list in ${CONFIG}`);
  return block[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .map((entry) => (entry === 'fallbackLng' ? 'en' : entry))
    .map((entry) => entry.split(/[-_]/)[0]);
};

/** The written-out names, read out of the presentation module. */
const nativeNames = () => {
  const source = read(PRESENTATION);
  const block = source.match(
    /const NATIVE_LANGUAGE_NAMES: Record<string, string> = \{([\s\S]*?)\n\};/
  );
  if (!block) return null;
  return Object.fromEntries(
    [...block[1].matchAll(/(\w+):\s*'([^']+)'/g)].map((match) => [
      match[1],
      match[2],
    ])
  );
};

describe('every language names itself', () => {
  test('writes out a name for every shipped language', () => {
    const names = nativeNames();
    expect(names).not.toBeNull();
    const missing = shippedLanguages().filter((code) => !names[code]);
    expect(missing).toEqual([]);
  });

  test('does not let Intl decide what a language is called', () => {
    const names = nativeNames() ?? {};
    // A name Intl produced would be in the runtime's default locale, not the
    // language's own script. These are the ones a Latin-script fallback would
    // silently replace, so they are the ones worth stating.
    expect(names.ka).toBe('ქართული');
    expect(names.ru).toBe('Русский');
    expect(names.he).toBe('עברית');
    expect(names.ja).toBe('日本語');
    expect(names.ko).toBe('한국어');
    expect(names.ar).toBe('العربية');
    expect(names.bn).toBe('বাংলা');
    expect(names.zh).toBe('中文');
  });

  test('gives the picker and the modal the same source for a name', () => {
    for (const file of [SHARED_MENU, MODAL]) {
      expect(read(file)).toMatch(/language\.presentation/);
      expect(read(file)).toMatch(/getLanguageLabel/);
    }
    // The modal used the prose form while the picker used the label form, so
    // the same language was written two ways on two screens.
    expect(read(MODAL)).not.toMatch(/getLanguageName\(/);
  });
});

describe('one language control, not two', () => {
  test('writes the cookie-and-reload in exactly one component', () => {
    const owners = [SHARED_MENU, AUTH_SWITCH, PUBLIC_SWITCH].filter((file) =>
      /setCookie\(cookieName/.test(read(file))
    );
    expect(owners).toEqual([SHARED_MENU]);
  });

  test('leaves each caller with nothing but its band and its word', () => {
    for (const file of [AUTH_SWITCH, PUBLIC_SWITCH]) {
      const source = read(file);
      expect(source).toMatch(/LanguageMenu/);
      expect(source).toMatch(/tone="(surface|navigation)"/);
      expect(source).not.toMatch(/MenuList/);
    }
  });

  test('keeps a hover plate that can be seen on the band it is drawn on', () => {
    const source = read(SHARED_MENU);
    // In the light theme `navigation-active` is the surface colour and
    // `surface-subtle` is the navigation colour: each plate is invisible on the
    // other band, which is why the tone is a parameter rather than a default.
    expect(source).toMatch(
      /surface:\s*\n?\s*'[^']*hover:bg-cf-surface-subtle[^']*'/
    );
    expect(source).toMatch(
      /navigation:\s*\n?\s*'[^']*hover:bg-cf-navigation-active[^']*'/
    );
  });
});

/**
 * `content-factory-next-fn33.119`: the label form was applied to every name,
 * including the ones written out above.
 *
 * Georgian has no title case. Mtavruli is a case of the whole word, never of a
 * first letter, so `ქართული` raised to `Ქართული` does not read as a capital —
 * it reads as a typo, in the one list whose whole purpose is that each language
 * is written the way that language writes it. The written-out names are already
 * labels; the rule they were put through belongs to the `Intl` fallback alone,
 * where a language the product does not ship arrives in prose form.
 */
describe('the label form leaves a written-out name alone', () => {
  const ts = require('typescript');
  const compiled = ts.transpileModule(read(PRESENTATION), {
    fileName: PRESENTATION,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(
    loaded.exports,
    require,
    loaded
  );
  const { getLanguageLabel } = loaded.exports;

  test('Georgian keeps its own first letter', () => {
    expect(getLanguageLabel('ka')).toBe('ქართული');
    expect(getLanguageLabel('ka_ge')).toBe('ქართული');
  });

  test('every shipped name comes out exactly as it is written', () => {
    for (const [code, name] of Object.entries(nativeNames() ?? {})) {
      expect(getLanguageLabel(code)).toBe(name);
    }
  });

  test('a language only Intl knows still arrives as a label', () => {
    // Finnish is not shipped, so it comes from Intl in prose form (`suomi`),
    // which is what the label form is still here for.
    const finnish = getLanguageLabel('fi');
    expect(finnish.charAt(0)).toBe(finnish.charAt(0).toLocaleUpperCase('fi'));
  });
});
