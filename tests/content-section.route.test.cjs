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
const { cleanup, render, screen, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const FILES = {
  route: 'apps/frontend/src/app/(app)/(site)/content/page.tsx',
  screen:
    'apps/frontend/src/components/content-intelligence/content-section.screen.tsx',
  menu: 'apps/frontend/src/components/layout/top.menu.tsx',
  settings: 'apps/frontend/src/components/layout/settings.component.tsx',
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

const withLanguage = (language, element) =>
  React.createElement(
    variables.VariableContextComponent,
    { language },
    element
  );

const menuFor = (language) => {
  let captured;
  const Probe = () => {
    captured = menu.useMenuItem();
    return null;
  };
  render(withLanguage(language, React.createElement(Probe)));
  return captured;
};

afterEach(cleanup);

// `useT` suspends until i18next has its bundles. Next preloads them on the
// server; nothing here has asked for them yet, so a render would fail on the
// suspension rather than on anything about the menu.
beforeAll(async () => {
  const i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized) {
    await new Promise((resolve) => i18n.on('initialized', resolve));
  }
  await i18n.loadLanguages(['en', 'ru']);
});

describe('content lives in the working menu', () => {
  test('the working menu offers Content and points at its own route', () => {
    const { workMenu } = menuFor('en');
    const paths = workMenu.map((item) => item.path);

    expect(paths).toContain('/content');
    // Second, right after the calendar. The mockup puts it there and the
    // reason is not decoration: it is the section the calendar sends people to.
    expect(paths.indexOf('/content')).toBe(1);
    expect(workMenu[1].name).toBe('Content');
  });

  test('the entry is in the working menu, not the administrative one', () => {
    const { adminMenu, secondaryMenu } = menuFor('en');

    expect(adminMenu.map((item) => item.path)).not.toContain('/content');
    expect(secondaryMenu.map((item) => item.path)).not.toContain('/content');
  });

  test('the menu label is a translated key, not an inline pair', () => {
    // The menu ships in sixteen locales. An inline ru/en ternary here would
    // leave fourteen of them reading English.
    expect(source('menu')).toContain("t('content_section', 'Content')");
    // `content` was taken: it means the body of a signature, and reusing it
    // would put "Содержание" in the Russian menu.
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
  // `content-factory-next-odb8.4` added a sixth, «Что уже написали», last:
  // the archive answers what was written and what it stood on, which only
  // makes sense once the strip has already answered who writes and what
  // comes next.
  test.each([
    ['en', ['Avatars', 'Ideas', 'Brief', 'Material', 'Facts', 'Archive']],
    [
      'ru',
      [
        'Аватары',
        'Откуда идеи',
        'Бриф',
        'Материалы',
        'Откуда факты',
        'Что уже написали',
      ],
    ],
  ])('shows six tabs in %s, in the order the design fixed', (locale, labels) => {
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

  test('names the surface once, so the page has a single top heading', () => {
    render(
      withLanguage(
        'en',
        React.createElement(contentScreen.ContentSectionScreen, {
          initialTab: 'materials',
        })
      )
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // The container's own header carries a second `h1` and a second set of
    // jump links, which is why the screen turns it off.
    expect(source('screen')).toContain('showHeader={false}');
  });

  test('the Brief tab mounts the live gate rather than the review fixture', () => {
    render(
      withLanguage(
        'ru',
        React.createElement(contentScreen.ContentSectionScreen, {
          initialTab: 'brief',
        })
      )
    );

    // `content-factory-next-07h.4` built the screen, the gate and the radar and
    // scoped the tab as routes only, so until this entry existed the brief was
    // rendered by nothing but `/interface-review`. With no server behind it
    // here, what the panel renders is its own failure state — which is the
    // point: the tab is wired, not drawn.
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('[data-voice-surface="brief"]')).not.toBeNull();
    expect(panel.querySelector('[data-voice-brief-form="true"]')).not.toBeNull();
    expect(source('screen')).toContain('VoiceBriefContainer');
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
    expect(source('screen')).toContain('VoiceMaterialsContainer');
  });

  test('the Archive tab mounts the archive container rather than staying dead code', () => {
    // `content-factory-next-odb8.4` built the backend and `ContentArchiveContainer`
    // but never mounted the container anywhere reachable — the archive existed
    // only in the file that declared it. This guard renders the panel a person
    // actually opens and looks for the container's own root markup, not just
    // for the tab's label in the strip: a tab that says «Что уже написали» but
    // opens an empty panel would still pass a label-only check.
    render(
      withLanguage(
        'ru',
        React.createElement(contentScreen.ContentSectionScreen, {
          initialTab: 'archive',
        })
      )
    );

    const panel = screen.getByRole('tabpanel');
    const archiveSection = panel.querySelector(
      '[data-content-intelligence-section="archive"]'
    );
    expect(archiveSection).not.toBeNull();
    // The container's own heading, not just the tab strip's label — the two
    // read the same text (`t.title` in the container, `t.archive` in the
    // tab), so scoping to the section is what tells them apart.
    expect(within(archiveSection).getByText('Что уже написали')).toBeTruthy();
    expect(source('screen')).toContain('ContentArchiveContainer');
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
    expect(screen.getByText(/No material yet/)).toBeTruthy();
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
  test('the settings tab links to the route instead of mounting the surface', () => {
    const settings = source('settings');

    expect(settings).toContain('href="/content"');
    expect(settings).toContain('data-content-intelligence-moved="true"');
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
    expect(markup).toContain('Контент');
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
    expect(source('screen')).toContain('border-b-2');
    expect(source('screen')).toContain('border-cf-accent');
    expect(source('screen')).toContain('border-transparent');
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
