'use strict';

/**
 * Content creation belongs to the working menu.
 *
 * The product is called Content Factory and the place where its content was
 * shaped sat three levels down a settings dialog. `docs/design/content-factory-
 * interface-specification.md` §3 splits the shell by question: the working
 * mode answers "what should I make now", the administrative group answers "how
 * is this workspace configured". Brand voice and sources answer the first and
 * were filed under the second.
 *
 * This guard holds the move in place: the route exists and mounts the screen,
 * the menu offers it, the old place points at the new one, and the screen
 * reuses the container rather than growing a second copy of it.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');


const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render, screen, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const FILES = {
  route: 'apps/frontend/src/app/(app)/(site)/content/page.tsx',
  screen:
    'apps/frontend/src/components/content-intelligence/content-section.screen.tsx',
  menu: 'apps/frontend/src/components/layout/top.menu.tsx',
  settings: 'apps/frontend/src/components/layout/settings.component.tsx',
  settingsRoute: 'apps/frontend/src/app/(app)/(site)/settings/page.tsx',
  container:
    'apps/frontend/src/components/content-intelligence/content-intelligence.settings.tsx',
  view: 'apps/frontend/src/components/content-intelligence/content-intelligence.view.tsx',
  scene:
    'apps/frontend/src/components/content-intelligence/content-section.review-scene.tsx',
  reviewRoute:
    'apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx',
};

const source = (key) => fs.readFileSync(path.join(root, FILES[key]), 'utf8');

test('the route, the screen and the menu entry all exist', () => {
  for (const file of Object.values(FILES)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
});

if (!Object.values(FILES).every((file) => fs.existsSync(path.join(root, file))))
  return;

const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const menu = loadTypeScriptModule(FILES.menu);
const contentScreen = loadTypeScriptModule(FILES.screen);
const placeholder = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/content-materials.placeholder.tsx'
);

// The screen reads the language through `useInterfaceLanguage` since 97dq.76,
// which in a browser follows i18next rather than the request variable — so
// both are set to the language the case is about.
const withLanguage = (language, element) => {
  if (i18n && i18n.language !== language) void i18n.changeLanguage(language);
  return React.createElement(
    variables.VariableContextComponent,
    { language },
    element
  );
};

let i18n;
const menuFor = async (language) => {
  let captured;
  const Probe = () => {
    captured = menu.useMenuItem();
    return null;
  };
  // In the browser useT follows i18next, not the server variable context.
  await React.act(async () => {
    await i18n.changeLanguage(language);
    render(withLanguage(language, React.createElement(Probe)));
  });
  return captured;
};

afterEach(cleanup);

// `useT` suspends until i18next has its bundles. Next preloads them on the
// server; nothing here has asked for them yet, so a render would fail on the
// suspension rather than on anything about the menu.
beforeAll(async () => {
  i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized) {
    await new Promise((resolve) => i18n.on('initialized', resolve));
  }
  await i18n.loadLanguages(['en', 'ru']);
});

describe('content lives in the working menu', () => {
  test('the working menu offers Content and points at its own route', async () => {
    const { workMenu } = await menuFor('en');
    const paths = workMenu.map((item) => item.path);

    expect(paths).toContain('/content');
    // Right after the calendar. The mockup puts it there and the reason is not
    // decoration: it is the section the calendar sends people to. Стоящий
    // выше «С чего начать» (07.09.2026) — временная строка, она пропадает,
    // когда все пять шагов пройдены, поэтому проверяется соседство с
    // календарём, а не место в списке.
    expect(paths.indexOf('/content')).toBe(paths.indexOf('/launches') - 1);
    expect(workMenu[paths.indexOf('/content')].name).toBe('Content');
  });

  test('the entry is in the working menu, not the administrative one', async () => {
    const { adminMenu, secondaryMenu } = await menuFor('en');

    expect(adminMenu.map((item) => item.path)).not.toContain('/content');
    expect(secondaryMenu.map((item) => item.path)).not.toContain('/content');
  });

  test('the menu names the section with its shared translated key', async () => {
    // The menu ships in sixteen locales. An inline ru/en ternary here would
    // leave fourteen of them reading English.
    expect((await menuFor('ru')).workMenu.find((item) => item.path === '/content').name).toBe('Контент');
    expect(source('menu')).toContain("t('content_section', 'Content')");
    // `content_pieces` is the inner table's label and must not be renamed
    // globally just to change the top-level menu.
    expect(source('menu')).not.toContain("t('content_pieces', 'Pieces')");
    expect(source('menu')).not.toContain("t('content', 'Content')");
  });

  test('the route mounts the screen and nothing else', () => {
    expect(source('route')).toContain('ContentSectionScreen');
    expect(source('route')).not.toMatch(/useFetch|useSWR|fetch\(/);
  });
});

describe('the Content screen', () => {
  // `content-factory-next-odb8` cut the section to three questions
  // (`docs/product/content-section-map.md` §3): who writes, what is written
  // next, and where a fact came from. «Источники» left the strip outright;
  // «Происхождение» kept its key but became the facts witness, relabelled
  // «Откуда факты» to say so. «Бриф» still sits between the aвatars and the
  // material, in the order the work happens in. `content-factory-next-odb8.3`
  // added a fifth tab, «Откуда идеи» — subscriptions and the leads they bring
  // back — right after «Аватары» and ahead of «Бриф», since a lead is a
  // reason to open the brief rather than something that lives inside it.
  // `content-factory-next-odb8.4` built «Что уже написали», the archive, but
  // it is not a sixth tab: §9.4 of the map, decided 02.09.2026, folds it into
  // «Материалы» as a view switch inside that one tab instead — see the
  // `MaterialsViewSwitch` tests below for that surface.
  // `content-factory-next-tu3k.9` (06.09.2026) moved that tab to the front
  // and renamed it «Заготовки»: the list of pieces is where the work starts.
  // The key stayed `materials`, so every address and every `initialTab`
  // survived the rename.
  // `content-factory-next-m2eg` (07.09.2026) relabelled «Бриф» to «Новая
  // заготовка» for the same reason and by the same rule: behind it stands the
  // one-thought intake, which makes a piece — the eight-field form it was
  // named after is not what opens there. The key stayed `brief`.
  test.each([
    ['en', ['Pieces', 'New piece', 'Ideas', 'Facts']],
    [
      'ru',
      ['Заготовки', 'Новая заготовка', 'Откуда идеи', 'Откуда факты'],
    ],
  ])('shows five tabs in %s, in the order the design fixed', (locale, labels) => {
    render(
      withLanguage(
        locale,
        React.createElement(contentScreen.ContentSectionScreen, {
          initialTab: 'materials',
        })
      )
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(labels);
  });

  test('leaves the single top heading to the upper shell', () => {
    render(
      withLanguage(
        'en',
        React.createElement(contentScreen.ContentSectionScreen, {
          initialTab: 'materials',
        })
      )
    );

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    // The container's own header carries a second `h1` and a second set of
    // jump links, which is why the screen turns it off.
    expect(source('screen')).toContain('showHeader={false}');
  });

  test('the Brief tab opens on the intake alone, with no manual brief behind a switch', () => {
    render(
      withLanguage(
        'ru',
        React.createElement(contentScreen.ContentSectionScreen, {
          initialTab: 'brief',
        })
      )
    );

    /*
      Владелец 22.09.2026 (`content-factory-next-97dq.36`): «предлагаю
      полностью убрать режим вручную. Мы им всё равно не пользуемся». До этого
      вкладка открывалась входом одной мыслью, а форма из восьми полей стояла
      вторым видом «Вручную» за переключателем «По мысли · Вручную»
      (`content-factory-next-tu3k.4`). Теперь вход — единственное, что здесь
      есть: ни переключателя, ни ручной формы, ни её контейнера в исходнике.
    */
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('[data-content-panel="intake"]')).not.toBeNull();
    expect(within(panel).queryByRole('radiogroup', { name: 'Как начать' })).toBeNull();
    expect(panel.textContent).not.toContain('Вручную');
    expect(panel.querySelector('[data-voice-brief-form="true"]')).toBeNull();
    expect(source('screen')).toContain('IntakeContainer');
    expect(source('screen')).not.toContain('VoiceBriefContainer');
    expect(source('screen')).not.toContain('BriefViewSwitch');
  });

  test('the Material tab mounts the library rather than a placeholder', () => {
    render(
      withLanguage(
        'en',
        React.createElement(contentScreen.ContentSectionScreen, {
          initialTab: 'materials',
        })
      )
    );

    // `content-factory-next-07h.7` filled the tab. The panel now belongs to
    // the container, which asks the server for the pieces; with no server
    // behind it in this suite, what it renders is its own failure state, and
    // that is the point — the tab is wired, not drawn.
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).not.toMatch(/being built|Раздел готовится/);
    // Витрина «На что опираются» убрана (§11.5): первый вид вкладки — таблица
    // заготовок, второй — архив.
    expect(source('screen')).toContain('PiecesContainer');
  });

  test.each(['materials', 'archive'])('opens the single pieces table for %s', (initialTab) => {
    render(withLanguage('ru', React.createElement(contentScreen.ContentSectionScreen, { initialTab })));
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('[data-content-panel="pieces"]')).not.toBeNull();
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
    expect(panel.textContent).not.toContain('Что уже написали');
  });

  test('content-factory-next-fn33.60 — the address follows the tab, so a reload lands where the screen already is', () => {
    dom.window.history.replaceState(null, '', '/content?tab=materials');
    render(
      withLanguage(
        'ru',
        React.createElement(contentScreen.ContentSectionScreen, {
          initialTab: 'materials',
        })
      )
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Новая заготовка' }));
    expect(dom.window.location.search).toBe('?tab=brief');

    fireEvent.click(screen.getByRole('tab', { name: 'Откуда идеи' }));
    expect(dom.window.location.search).toBe('?tab=leads');
  });

  test('the empty library still says what a piece is, without claiming a failure', () => {
    render(
      withLanguage(
        'en',
        React.createElement(placeholder.ContentMaterialsPlaceholder, {
          locale: 'en',
        })
      )
    );

    // A workspace with no pieces sees this, and it must not read as a fault.
    expect(screen.getByText(/No pieces yet/)).toBeTruthy();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  test('reuses the container instead of copying its wiring', () => {
    const screenSource = source('screen');

    expect(screenSource).toContain('ContentIntelligenceSettings');
    expect(screenSource).toContain('visibleSections={[tab]}');
    // The requests, the optimistic state and the error handling stay in one
    // place. A second copy is how two hosts start disagreeing about what a
    // failed save looks like.
    expect(screenSource).not.toMatch(/useSWR|useFetch/);
  });

  test('the container and the view accept the two props the screen needs', () => {
    expect(source('container')).toMatch(/visibleSections\?:/);
    expect(source('container')).toMatch(/showHeader\?:/);
    expect(source('view')).toMatch(/showHeader\?: boolean/);
  });
});

describe('the old place points at the new one', () => {
  test('the settings menu no longer offers «Знания о контенте» (97dq.51)', () => {
    // The signpost tab stood for months after the surface moved; on the
    // eleventh walk (23.09.2026) the owner asked for it to leave the menu.
    const settings = source('settings');
    expect(settings).not.toContain("tab: 'content_intelligence'");
    expect(settings).not.toContain("'content_intelligence',");
    expect(settings).not.toContain('data-content-intelligence-moved');
  });

  test('the old address redirects to /content instead of a dead tab', () => {
    const route = source('settingsRoute');
    expect(route).toContain("from 'next/navigation'");
    expect(route).toMatch(
      /tab === 'content_intelligence'\) \{\s+redirect\('\/content'\);/
    );
  });

  test('settings no longer loads the content-intelligence container', () => {
    // Leaving it mounted in both places is how the two copies drift; removing
    // the tab outright loses the people who learned where it was.
    expect(source('settings')).not.toContain(
      'content-intelligence/content-intelligence.settings'
    );
  });
});

describe('the Content frame is reviewable without a network', () => {
  const reviewRoute = loadTypeScriptModule(FILES.reviewRoute);
  const { renderToStaticMarkup } = require('react-dom/server');
  const states = [
    'loading',
    'empty',
    'default',
    'selected',
    'success',
    'error',
    'restricted',
    'disabled',
    'long-content',
  ];

  test.each(states)('the review scene executes the %s state', async (state) => {
    const output = await reviewRoute.default({
      params: Promise.resolve({ scene: 'content-section' }),
      searchParams: Promise.resolve({
        state,
        theme: 'dark',
        locale: 'ru',
        viewport: '390',
      }),
    });
    const markup = renderToStaticMarkup(output);

    expect(markup).toContain('data-production-surface="content/section"');
    expect(markup).toContain('data-interface-review-state="' + state + '"');
    expect(markup).not.toContain('<h1');
    expect(markup).toMatch(/Ваш голос:|От мысли к заготовке:/);
  });

  test('the scene shows the frame, never the container behind it', () => {
    // Opening the real sections here would review them a second time and
    // would need requests this route refuses on purpose.
    expect(source('scene')).not.toContain('ContentIntelligenceSettings');
    expect(source('scene')).not.toMatch(/useSWR|useFetch|fetch\(/);
  });

  test('the current tab is marked by more than colour', () => {
    // `DESIGN.md`: colour is never the only carrier of meaning. The mark is an
    // underline the other tabs do not carry — the same strip analytics uses,
    // so the two sections are navigated the same way.
    // The strip lives in `ui/section-tabs` since 97dq.76, shared with
    // analytics, the piece page and the channel page.
    expect(source('screen')).toContain('sectionTabClass(tab === value)');
    const strip = require('node:fs').readFileSync(
      require('node:path').join(
        __dirname,
        '..',
        'apps/frontend/src/components/ui/section-tabs.tsx'
      ),
      'utf8'
    );
    expect(strip).toContain('border-b-2');
    expect(strip).toContain('border-cf-accent');
    expect(strip).toContain('border-transparent');
  });

  test('the section runs the full width the shell gives it', () => {
    // A 1120px column put a gutter down both sides of a section whose
    // neighbours — the calendar, analytics — run edge to edge.
    expect(source('screen')).not.toContain('max-w-[1120px]');
    expect(source('screen')).toContain('flex-1');
    // Measure is still bounded where measure matters: prose keeps its own.
    expect(source('screen')).toContain('max-w-[72ch]');
  });
});

 test('NavConveyor keeps its order, step numbers and separate destinations', async () => {
   const { workMenu, secondaryMenu, adminMenu } = await menuFor('ru');
   expect(workMenu.map((item) => item.path)).toEqual(['/onboarding', '/content?tab=avatars', '/channels', '/content', '/launches', '/analytics']);
   expect(workMenu.map((item) => item.step)).toEqual([0, 1, 2, 3, 4, 5]);
   // 2q28.26: «Агент» and «Плагины» are upstream surfaces the sidebar no
   // longer offers; `hidden-upstream-surfaces.ts` is the one list.
   expect(secondaryMenu.map((item) => item.path)).toEqual(['/media', '/help']);
   expect(adminMenu.map((item) => item.path)).toEqual(['/settings']);
 });

 test('a hidden menu entry keeps its page title', async () => {
   const { all } = await menuFor('ru');
   expect(all.map((item) => item.path)).toEqual(
     expect.arrayContaining(['/agents', '/plugs', '/analytics'])
   );
 });
 test('a sidebar navigation updates the already mounted content screen', () => {
   const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
   const { ContentSectionScreen } = loadWithMocks(FILES.screen, {
     '@contentfactory/react/helpers/variable.context': {useVariables: () => ({language: 'ru'})},
     '@contentfactory/react/translation/use-interface-language': {useInterfaceLanguage: () => 'ru'},
     '../brand-voice/voice-tab': {VoiceTab: () => React.createElement('div', null, 'voice content')},
     './pieces/pieces.container': {PiecesContainer: () => React.createElement('div', null, 'pieces content')},
   });
   const draw = (initialTab) => React.createElement(ContentSectionScreen, { initialTab });
   const view = render(draw('materials'));
   expect(screen.getAllByRole('tab')).toHaveLength(4);
   view.rerender(draw('avatars'));
   expect(screen.queryAllByRole('tab')).toHaveLength(0);
   expect(screen.queryByRole('heading', {level: 1})).toBeNull();
   expect(screen.getByText(contentScreen.contentSectionCopy.ru.avatarDescription)).toBeTruthy();
   view.rerender(draw('materials'));
   expect(screen.getAllByRole('tab')).toHaveLength(4);
   expect(screen.queryByRole('heading', {level: 1})).toBeNull();
 });
