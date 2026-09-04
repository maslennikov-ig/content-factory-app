const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const TABS = 'apps/frontend/src/components/content-intelligence/content-section.tabs.ts';
const SCREEN = 'apps/frontend/src/components/content-intelligence/content-section.screen.tsx';
const PAGE = 'apps/frontend/src/app/(app)/(site)/content/page.tsx';

/**
 * The crash `8a8837f6` fixed: `CONTENT_TABS` lived in a `'use client'`
 * module, the route is a server component, and a value imported across that
 * boundary is a client reference, not the array — `.includes` «is not a
 * function» and `/content?tab=brief` fell over with `tsc` and Jest green.
 *
 * Neither `tsc` nor a unit test can see the proxy, so this guard holds the
 * two facts that keep it from coming back: the tab module is plain, and the
 * page reads the tabs from it, not from the screen.
 */
describe('the tab list is readable on both sides of the client boundary', () => {
  test('the tab module carries no client directive', () => {
    expect(read(TABS)).not.toMatch(/^\s*['"]use client['"]/m);
  });

  test('the screen is a client module', () => {
    expect(read(SCREEN)).toMatch(/^\s*['"]use client['"]/m);
  });

  test('the section page resolves the tab from the tab module', () => {
    const page = read(PAGE);
    expect(page).toMatch(/resolveContentTab[\s\S]*from ['"][^'"]*content-section\.tabs['"]/);
    expect(page).not.toMatch(/\{[^}]*(CONTENT_TABS|resolveContentTab)[^}]*\}\s*from ['"][^'"]*content-section\.screen['"]/);
  });
});

describe('resolveContentTab', () => {
  const { resolveContentTab, CONTENT_TABS } = loadTypeScriptModule(TABS);

  test.each(CONTENT_TABS.map((tab) => [tab]))('%s opens itself', (tab) => {
    expect(resolveContentTab(tab)).toBe(tab);
  });

  test('archive is still an address, not a tab', () => {
    expect(resolveContentTab('archive')).toBe('archive');
    expect(CONTENT_TABS).not.toContain('archive');
  });

  test('an unknown, missing or repeated value opens the section by default', () => {
    expect(resolveContentTab('voice')).toBeUndefined();
    expect(resolveContentTab(undefined)).toBeUndefined();
    expect(resolveContentTab(42)).toBeUndefined();
    expect(resolveContentTab(['brief', 'leads'])).toBe('brief');
  });
});

/**
 * content-factory-next-fn33.55, .56, .61: three sentences in one wave, each
 * sending a person to a tab that is not on the strip — «Происхождение» and
 * «Что пишем», both renamed or removed by the owner's decision (карта
 * раздела, §3, §4), and «добавьте источник» pointing at a tab that no
 * longer exists at all.
 *
 * The strip is the list of names a person can actually see. Copy in this
 * section may name a tab only by one of those names; a name that left the
 * strip is a dead end no `tsc` and no render test can catch, because it is
 * a correct string pointing nowhere.
 */
describe('the section never sends a person to a tab that is not on the strip', () => {
  const COPY_FILES = [
    'apps/frontend/src/components/content-intelligence/content-facts.showcase.tsx',
    'apps/frontend/src/components/content-intelligence/content-facts.container.tsx',
    'apps/frontend/src/components/content-intelligence/content-leads.tab.tsx',
    'apps/frontend/src/components/content-intelligence/content-archive.container.tsx',
    'apps/frontend/src/components/brand-voice/voice-copy.ts',
  ];

  /** Names that were on the strip once and are not any more. */
  const GONE = ['Происхождение', 'Что пишем', 'Что уже написали»'];

  test.each(COPY_FILES)('%s names no tab that left the strip', (file) => {
    const text = read(file)
      // A comment may name the old tab to explain why it left.
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    for (const name of GONE) {
      expect(text).not.toContain(`вкладке «${name}`);
      expect(text).not.toContain(`вкладку «${name}`);
      expect(text).not.toContain(`вкладки «${name}`);
    }
  });

  /**
   * `content-factory-next-fn33.107`: the walkthrough is copy about this
   * section written outside it, and it drifted furthest — it invited people
   * to «Кто пишет» and «Что пишем», neither of which is a tab, and its button
   * led to `?tab=voice`, which is not an address the section knows. So the
   * same rule reaches it: a name it uses has to be a name on the strip, and a
   * link it offers has to be a tab that exists.
   */
  describe('the walkthrough sends people to tabs that exist', () => {
    const ONBOARDING_COPY =
      'apps/frontend/src/components/onboarding/onboarding.copy.ts';
    const ONBOARDING_ADAPTER =
      'apps/frontend/src/components/onboarding/onboarding.adapter.ts';
    const { CONTENT_TABS } = loadTypeScriptModule(TABS);
    const sectionCopy = loadTypeScriptModule(
      'apps/frontend/src/components/content-intelligence/content-section.copy.ts'
    );
    const labels =
      sectionCopy.contentSectionCopy ?? Object.values(sectionCopy)[0];

    test('every tab it names in quotes is a tab on the strip', () => {
      const text = read(ONBOARDING_COPY)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
      const onStrip = new Set([
        ...CONTENT_TABS.map((tab) => labels.ru[tab]),
        ...CONTENT_TABS.map((tab) => labels.en[tab]),
      ]);
      // Only the places it offers to open: «Открыть «X»» and `Open "X"`.
      // «Помощь → С чего начать» is a route through the settings menu, not a
      // tab of this section, and «собрать черновик» is a button.
      const named = [
        ...[...text.matchAll(/Открыть\s+«([^»]+)»/gu)].map((match) => match[1]),
        ...[...text.matchAll(/Open\s+"([^"]+)"/gu)].map((match) => match[1]),
      ];
      expect(named.length).toBeGreaterThan(0);
      for (const name of named) {
        expect([...onStrip]).toContain(name);
      }
    });

    test('every link it offers into the section names a tab that exists', () => {
      const addresses = [
        ...read(ONBOARDING_ADAPTER).matchAll(/\/content\?tab=([a-z_]+)/g),
      ].map((match) => match[1]);
      expect(addresses.length).toBeGreaterThan(0);
      for (const tab of addresses) {
        expect(CONTENT_TABS).toContain(tab);
      }
    });
  });

  test('the sentence that used to say «добавьте источник» names a place that exists', () => {
    const copy = loadTypeScriptModule(
      'apps/frontend/src/components/brand-voice/voice-copy.ts'
    );
    const body = copy.voiceCopy
      ? copy.voiceCopy.ru.radarEmptyBody
      : Object.values(copy)[0].ru.radarEmptyBody;
    expect(body).not.toMatch(/Добавьте источник/u);
    expect(body).toContain('Откуда идеи');
  });
});
