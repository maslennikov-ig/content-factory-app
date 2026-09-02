'use strict';

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

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
const { cleanup, fireEvent, render, screen } = require('@testing-library/react');
const viewFile =
  'apps/frontend/src/components/content-intelligence/content-intelligence.view.tsx';
const adapterFile =
  'apps/frontend/src/components/content-intelligence/content-intelligence.settings.tsx';
const adapterContractFile =
  'apps/frontend/src/components/content-intelligence/content-intelligence.adapter.ts';
const sceneFile =
  'apps/frontend/src/components/content-intelligence/content-intelligence.review-scenes.tsx';
const routeFile =
  'apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx';

test('publishes the production content-intelligence surface and local review route', () => {
  for (const file of [
    viewFile,
    adapterFile,
    adapterContractFile,
    sceneFile,
    routeFile,
  ]) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
});

if (
  ![viewFile, adapterFile, adapterContractFile, sceneFile, routeFile].every((file) =>
    fs.existsSync(path.join(root, file))
  )
)
  return;

const view = loadTypeScriptModule(viewFile);
const adapter = loadTypeScriptModule(adapterContractFile);
const scenes = loadTypeScriptModule(sceneFile);
const route = loadTypeScriptModule(routeFile);

const reviewStates = [
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

/**
 * The applied-voice strip is reviewed here rather than beside the surfaces it
 * lives in, because it is shared: the generator shows it before generation and
 * the editor shows it on the result, and a second copy of it would be the
 * defect this task exists to remove. `36r.13` replaced its body with the
 * four-state ribbon and its review scene with the ribbon's, for the same
 * reason: two scenes for one component is two places to disagree.
 *
 * Its strings come from i18next, unlike its neighbours on this route, which
 * carry a two-language `copy` map. That is the right call for a component
 * whose siblings ship in sixteen locales — and it is also the thing most
 * likely to fail quietly here, because this route never hydrates, so the
 * language has to arrive server-side. A scene that lost that would render
 * English under a `locale=ru` flag and look fine.
 */
describe('applied voice strip review scene', () => {
  // `useT` suspends until i18next has its bundles. Next preloads them on the
  // server, so the route works; here nothing has asked for them yet, and the
  // render would fail on suspension rather than on anything about the scene.
  beforeAll(async () => {
    const i18n = loadTypeScriptModule(
      'libraries/react-shared-libraries/src/translation/i18next.ts'
    ).default;
    if (!i18n.isInitialized) {
      await new Promise((resolve) => i18n.on('initialized', resolve));
    }
    await i18n.loadLanguages(['en', 'ru']);
  });

  const open = async (state, locale = 'en') => {
    const output = await route.default({
      params: Promise.resolve({ scene: 'voice-ribbon' }),
      searchParams: Promise.resolve({
        state,
        theme: 'light',
        locale,
        viewport: '1024',
      }),
    });
    return renderToStaticMarkup(output);
  };

  test.each(reviewStates)('executes the %s state', async (state) => {
    const markup = await open(state);

    expect(markup).toContain('data-voice-surface="ribbon"');
    expect(markup).toContain('data-interface-review-data="synthetic"');
    // The strip always says something. An empty one would read as "no voice
    // was applied" when what happened is that the component broke.
    expect(markup).toMatch(/Applied avatar/);
  });

  test('lands on one of its own four states, never on a review state', async () => {
    // The strip has four product states, not the review's nine. Its scene owns
    // the mapping; what must hold is that it never renders something outside
    // its own vocabulary.
    for (const state of reviewStates) {
      const markup = await open(state);
      expect(markup).toMatch(
        /data-voice-ribbon-state="(?:fresh|stale-context|voice-moved|no-profile)"/
      );
    }
  });

  test('shows the profile and the version, not one of the two', async () => {
    const markup = await open('default');

    // One expand away is not "visible before generation": a workspace with
    // three profiles needs to know which of them wrote this.
    expect(markup).toContain('voice-0071');
    expect(markup).toContain('v3');
  });

  test('says nothing was applied rather than guessing, when there is nothing', async () => {
    const markup = await open('empty');

    expect(markup).toContain('data-voice-ribbon-state="no-profile"');
    expect(markup).toContain('Neutral');
    // Working without a profile is a working mode, and the strip borrows
    // nothing from a failure to say so.
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toContain('bg-cf-danger');
  });

  test('renders Russian when the review asks for Russian', async () => {
    // This file gives the whole suite a JSDOM, and `useT` takes a different
    // branch when a window exists. The review route has no browser — it renders
    // server-side and never hydrates — so the branch that decides its language
    // is the variable context, and the window has to be out of the way.
    const withWindow = Object.getOwnPropertyDescriptor(global, 'window');
    delete global.window;
    let markup;
    try {
      markup = await open('default', 'ru');
    } finally {
      Object.defineProperty(global, 'window', withWindow);
    }

    expect(markup).toContain('data-interface-review-locale="ru"');
    expect(markup).toContain('Применённый аватар');
    expect(markup).not.toContain('Applied voice');
  });
});

describe('content intelligence review contract', () => {
  test.each(
    ['sources', 'provenance'].flatMap((scene) =>
      reviewStates.map((state) => [scene, state])
    )
  )(
    '/interface-review/content-intelligence/%s executes the %s state',
    async (scene, state) => {
      const output = await route.default({
        params: Promise.resolve({ scene }),
        searchParams: Promise.resolve({
          state,
          theme: 'light',
          locale: 'en',
          viewport: '1024',
        }),
      });
      const markup = renderToStaticMarkup(output);

      expect(markup).toContain(`data-content-intelligence-section="${scene}"`);
      expect(markup).toContain(`data-section-state="${state}"`);
      if (state === 'loading') expect(markup).toContain('aria-busy="true"');
      if (state === 'error') expect(markup).toContain('role="alert"');
      if (state === 'success') expect(markup).toContain('role="status"');
      if (state === 'restricted') expect(markup).toContain('aria-disabled="true"');
      if (state === 'long-content') expect(markup).toContain('data-long-content="true"');
    }
  );

  test.each([
    ['sources', 'error', 'role="alert"'],
    ['sources', 'selected', 'data-content-intelligence-section="sources"'],
    [
      'provenance',
      'restricted',
      'data-content-intelligence-section="provenance"',
    ],
  ])(
    '/interface-review/content-intelligence/%s renders query-owned state',
    async (scene, state, marker) => {
      const output = await route.default({
        params: Promise.resolve({ scene }),
        searchParams: Promise.resolve({
          state,
          theme: 'dark',
          locale: 'ru',
          viewport: '390',
        }),
      });
      const markup = renderToStaticMarkup(output);

      expect(markup).toContain(marker);
      expect(markup).toContain(`data-interface-review-state="${state}"`);
      expect(markup).toContain('data-interface-review-theme="dark"');
      expect(markup).toContain('data-interface-review-locale="ru"');
      expect(markup).toContain('data-interface-review-viewport="390"');
      expect(markup).toContain('data-interface-review-data="synthetic"');
      expect(markup).toContain('data-interface-review-persistence="disabled"');
    }
  );

  test('declares the full required matrix for every scene and deeply freezes fixtures', () => {
    for (const scene of Object.values(scenes.contentIntelligenceScenes)) {
      expect([...scene.states].sort()).toEqual([...reviewStates].sort());
      expect(Object.isFrozen(scene.fixture)).toBe(true);
      expect(Object.isFrozen(scene.fixture.sources)).toBe(true);
    }
  });

  test('keeps review fixtures local, synthetic and free of network-capable imports', () => {
    const source = fs.readFileSync(path.join(root, sceneFile), 'utf8');
    const serialized = JSON.stringify(
      Object.values(scenes.contentIntelligenceScenes).map(
        (scene) => scene.fixture
      )
    );

    expect(source).not.toMatch(/useFetch|useSWR|fetch\(/);
    expect(serialized).toContain('synthetic.invalid');
    expect(serialized).not.toMatch(
      /api[_ -]?key|bearer|jwt|token|client[_ -]?secret/i
    );
  });
});

describe('executable production adapter contracts', () => {
  test('builds the exact create DTO and keeps rights as a separate request', () => {
    const url = new FormData();
    url.set('kind', 'RSS');
    url.set('displayName', ' Release notes ');
    url.set('canonicalUrl', ' https://example.test/feed ');
    url.set('rightsConfirmed', 'true');

    expect(adapter.buildSourceCreatePayload(url)).toEqual({
      kind: 'RSS',
      displayName: 'Release notes',
      canonicalUrl: 'https://example.test/feed',
    });
    expect(adapter.buildSourceRightsPayload(true)).toEqual({ confirmed: true });
    expect(adapter.buildSourceCreatePayload(url)).not.toHaveProperty(
      'rightsConfirmed'
    );

    const manual = new FormData();
    manual.set('kind', 'MANUAL');
    manual.set('displayName', 'Editorial notes');
    manual.set('manualText', 'Keep claims specific.');
    expect(adapter.buildSourceCreatePayload(manual)).toEqual({
      kind: 'MANUAL',
      displayName: 'Editorial notes',
      manualText: 'Keep claims specific.',
    });
  });

  test('maps the controller source envelope without legacy aliases', () => {
    expect(
      adapter.mapSourcesEnvelope({
        sources: [
          {
            id: 'source-1',
            kind: 'RSS',
            displayName: 'Release feed',
            canonicalUrl: 'https://example.test/feed',
            desiredState: 'ACTIVE',
            healthState: 'POLICY_BLOCKED',
            rightsState: 'DENIED',
            robotsState: 'DISALLOWED',
            currentSnapshot: {
              observedAt: '2026-08-20T10:00:00.000Z',
              freshUntil: '2026-08-21T10:00:00.000Z',
              evidenceCount: 4,
            },
          },
        ],
        capabilities: { directFetch: false, validate: true, sync: false },
      })
    ).toEqual({
      sources: [
        {
          id: 'source-1',
          kind: 'RSS',
          displayName: 'Release feed',
          canonicalUrl: 'https://example.test/feed',
          desiredState: 'ACTIVE',
          healthState: 'POLICY_BLOCKED',
          rightsState: 'DENIED',
          robotsState: 'DISALLOWED',
          currentSnapshot: {
            observedAt: '2026-08-20T10:00:00.000Z',
            freshUntil: '2026-08-21T10:00:00.000Z',
            evidenceCount: 4,
          },
        },
      ],
      capabilities: { directFetch: false, validate: true, sync: false },
    });
  });

  test('maps the exact ContentContextEnvelopeV1 and joins citation IDs to evidence', () => {
    expect(
      adapter.mapContentContextEnvelope({
        contractVersion: 'content-context/v1',
        contentContextSnapshotId: 'ctx-1',
        status: 'BLOCKED_CONFLICT',
        generationPolicy: 'EVIDENCE_REQUIRED',
        errorCode: 'CONTENT_EVIDENCE_REQUIRED',
        builtAt: '2026-08-20T10:00:00.000Z',
        expiresAt: '2026-08-20T11:00:00.000Z',
        profile: {
          mode: 'resolved',
          versionId: 'version-4',
          versionNumber: 4,
          contentDigest: 'digest-4',
        },
        facts: [
          {
            citationId: 'fact-citation-1',
            factId: 'fact-1',
            statement: 'The release window changed.',
            temporalKind: 'CURRENT',
            verifiedAt: '2026-08-20T09:00:00.000Z',
            freshUntil: '2026-08-21T09:00:00.000Z',
            evidenceCitationIds: ['evidence-citation-1'],
          },
        ],
        evidence: [
          {
            citationId: 'evidence-citation-1',
            evidenceId: 'evidence-1',
            sourceSnapshotId: 'snapshot-1',
            title: 'Product handbook',
            excerpt: 'Tuesday morning.',
            url: null,
            exposure: 'INTERNAL_ONLY',
            publishedAt: null,
            retrievedAt: '2026-08-20T09:30:00.000Z',
          },
        ],
        rejected: [{ itemId: 'provider-summary', reason: 'UNVERIFIED' }],
      })
    ).toEqual({
      contextId: 'ctx-1',
      status: 'BLOCKED_CONFLICT',
      generationPolicy: 'EVIDENCE_REQUIRED',
      errorCode: 'CONTENT_EVIDENCE_REQUIRED',
      profile: {
        mode: 'resolved',
        versionId: 'version-4',
        versionNumber: 4,
      },
      facts: [
        {
          id: 'fact-1',
          statement: 'The release window changed.',
          status: 'CONFLICT',
          currentRequired: true,
          evidence: [
            {
              id: 'evidence-1',
              sourceLabel: 'Product handbook',
              excerpt: 'Tuesday morning.',
              relation: 'SUPPORTS',
              sourceState: 'AVAILABLE',
            },
          ],
        },
      ],
      rejected: [{ label: 'provider-summary', reason: 'UNVERIFIED' }],
    });
  });

  test('never converts an unavailable or evidence-required context into ALLOW', () => {
    const unavailable = adapter.mapContentContextEnvelope({
      contractVersion: 'content-context/v1',
      contentContextSnapshotId: 'ctx-unavailable',
      status: 'UNAVAILABLE',
      generationPolicy: 'EVIDENCE_REQUIRED',
      errorCode: 'CONTENT_EVIDENCE_REQUIRED',
      builtAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-20T11:00:00.000Z',
      profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
      facts: [],
      evidence: [],
      rejected: [],
    });

    expect(unavailable.status).toBe('UNAVAILABLE');
    expect(unavailable.generationPolicy).toBe('EVIDENCE_REQUIRED');
    expect(unavailable.errorCode).toBe('CONTENT_EVIDENCE_REQUIRED');
  });

  test('loads a context through the exact encoded GET boundary before mapping success', async () => {
    const calls = [];
    const result = await adapter.loadContentContext(async (path) => {
      calls.push(path);
      return {
        contractVersion: 'content-context/v1',
        contentContextSnapshotId: 'ctx / live',
        status: 'READY',
        generationPolicy: 'ALLOW_GROUNDED',
        errorCode: null,
        builtAt: '2026-08-20T10:00:00.000Z',
        expiresAt: '2026-08-20T11:00:00.000Z',
        profile: {
          mode: 'neutral_fallback',
          reason: 'NO_PROFILE',
        },
        facts: [],
        evidence: [],
        rejected: [],
      };
    }, 'ctx / live');

    expect(calls).toEqual(['/content-intelligence/contexts/ctx%20%2F%20live']);
    expect(result).toMatchObject({
      contextId: 'ctx / live',
      status: 'READY',
      generationPolicy: 'ALLOW_GROUNDED',
      errorCode: null,
    });
  });

  test.each([
    ['unknown contract', { contractVersion: 'content-context/v2' }],
    [
      'inconsistent ready policy',
      {
        contractVersion: 'content-context/v1',
        status: 'READY',
        generationPolicy: 'EVIDENCE_REQUIRED',
        errorCode: 'CONTENT_EVIDENCE_REQUIRED',
      },
    ],
    [
      'missing evidence error code',
      {
        contractVersion: 'content-context/v1',
        status: 'BLOCKED_STALE',
        generationPolicy: 'EVIDENCE_REQUIRED',
        errorCode: null,
      },
    ],
  ])('fails closed for %s', (_label, override) => {
    const mapped = adapter.mapContentContextEnvelope({
      contractVersion: 'content-context/v1',
      contentContextSnapshotId: 'ctx-malformed',
      status: 'READY',
      generationPolicy: 'ALLOW_GROUNDED',
      errorCode: null,
      builtAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-20T11:00:00.000Z',
      profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
      facts: [],
      evidence: [],
      rejected: [],
      ...override,
    });

    expect(mapped).toMatchObject({
      status: 'UNAVAILABLE',
      generationPolicy: 'EVIDENCE_REQUIRED',
      errorCode: 'CONTENT_EVIDENCE_REQUIRED',
    });
    expect(mapped.facts).toEqual([]);
  });

  test.each([
    ['missing citation', ['missing-citation']],
    ['empty citation', ['']],
  ])('fails closed when a fact has a %s', (_label, citationIds) => {
    const mapped = adapter.mapContentContextEnvelope({
      contractVersion: 'content-context/v1',
      contentContextSnapshotId: 'ctx-bad-citation',
      status: 'READY',
      generationPolicy: 'ALLOW_GROUNDED',
      errorCode: null,
      builtAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-20T11:00:00.000Z',
      profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
      facts: [
        {
          citationId: 'fact-citation-1',
          factId: 'fact-1',
          statement: 'A fact that must never become verified without evidence.',
          temporalKind: 'CURRENT',
          verifiedAt: '2026-08-20T09:00:00.000Z',
          freshUntil: '2026-08-21T09:00:00.000Z',
          evidenceCitationIds: citationIds,
        },
      ],
      evidence: [],
      rejected: [],
    });

    expect(mapped.status).toBe('UNAVAILABLE');
    expect(mapped.generationPolicy).toBe('EVIDENCE_REQUIRED');
    expect(mapped.errorCode).toBe('CONTENT_EVIDENCE_REQUIRED');
    expect(mapped.facts).toEqual([]);
  });

  test('preserves the returned source draft-material evidence and provenance', () => {
    expect(
      adapter.mapSourceDraftMaterial({
        sourceId: 'source-1',
        snapshotId: 'snapshot-1',
        evidence: [
          {
            evidenceId: 'evidence-1',
            excerpt: 'Verified source excerpt.',
            observedAt: '2026-08-20T09:00:00.000Z',
            freshUntil: null,
            freshnessStatus: 'FRESH',
            provenance: { kind: 'URL', retrievalProvider: 'direct-fetch-v1' },
          },
        ],
        trace: {
          contractVersion: 'source-draft-material/v1',
          builtAt: '2026-08-20T10:00:00.000Z',
        },
      })
    ).toEqual({
      sourceId: 'source-1',
      snapshotId: 'snapshot-1',
      evidence: [
        {
          evidenceId: 'evidence-1',
          excerpt: 'Verified source excerpt.',
          observedAt: '2026-08-20T09:00:00.000Z',
          freshUntil: null,
          freshnessStatus: 'FRESH',
          provenance: { kind: 'URL', retrievalProvider: 'direct-fetch-v1' },
        },
      ],
      trace: {
        contractVersion: 'source-draft-material/v1',
        builtAt: '2026-08-20T10:00:00.000Z',
      },
    });
  });
});

describe('production view behavior', () => {
  test('makes access restriction visible without invented success', () => {
    const restricted = renderToStaticMarkup(
      React.createElement(view.ContentIntelligenceView, {
        locale: 'en',
        activeSection: 'sources',
        state: 'restricted',
        data: scenes.contentIntelligenceScenes.sources.fixture,
        actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
      })
    );

    expect(restricted).not.toContain('Saved successfully');
    expect(restricted).toContain('Workspace administrator access is required');
    expect(restricted).toContain('aria-disabled="true"');
  });

  test('an async error replaces stale selected data and exposes only the safe retry', () => {
    const markup = renderToStaticMarkup(
      React.createElement(view.ContentIntelligenceView, {
        locale: 'en',
        activeSection: 'sources',
        state: 'error',
        data: scenes.contentIntelligenceScenes.sources.fixture,
        actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
      })
    );

    expect(markup).toContain('Content intelligence could not be loaded');
    expect(markup).toContain('Retry');
    expect(markup).not.toContain('Product handbook');
    expect(markup).not.toContain('Editorial voice · v4');
  });

  test('shows canonical rights, policy, archive and returned material states', () => {
    const markup = renderToStaticMarkup(
      React.createElement(view.ContentIntelligenceView, {
        locale: 'en',
        activeSection: 'sources',
        state: 'long-content',
        data: scenes.contentIntelligenceScenes.sources.fixture,
        actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
      })
    );

    expect(markup).toContain('Rights confirmed');
    expect(markup).toContain('Policy blocked');
    expect(markup).toContain('Ownership check required');
    expect(markup).toContain('Rights denied');
    expect(markup).toContain('New source');
    expect(markup).toContain('source-draft-material/v1');
  });

  test('renders fact conflicts and evidence provenance without treating provider summaries as evidence', () => {
    const markup = renderToStaticMarkup(
      React.createElement(view.ContentIntelligenceView, {
        locale: 'en',
        activeSection: 'provenance',
        state: 'selected',
        data: scenes.contentIntelligenceScenes.provenance.fixture,
        actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
      })
    );

    expect(markup).toContain('Conflict');
    expect(markup).toContain('Evidence 2 of 2');
    expect(markup).toContain('SOURCE_REMOVED');
    expect(markup).toContain('Provider summaries are not evidence');
    expect(markup).toContain(
      'Generation blocked until current evidence is available'
    );
  });
});

test('production adapter resolves exact source and context controller routes', () => {
  expect(adapter.sourceEndpoint()).toBe('/content-intelligence/sources');
  expect(adapter.sourceEndpoint('source / 1', 'validate')).toBe(
    '/content-intelligence/sources/source%20%2F%201/validate'
  );
  expect(adapter.sourceEndpoint('source-1', 'rights')).toBe(
    '/content-intelligence/sources/source-1/rights'
  );
  expect(adapter.sourceEndpoint('source-1', 'activate')).toBe(
    '/content-intelligence/sources/source-1/activate'
  );
  expect(adapter.sourceEndpoint('source-1', 'sync')).toBe(
    '/content-intelligence/sources/source-1/sync'
  );
  expect(adapter.sourceEndpoint('source-1', 'draft-material')).toBe(
    '/content-intelligence/sources/source-1/draft-material'
  );
  expect(adapter.contextEndpoint('ctx / 1')).toBe(
    '/content-intelligence/contexts/ctx%20%2F%201'
  );
});

describe('keyboard and state integrity', () => {
  afterEach(() => cleanup());

  test('keeps the controlled context input value through unavailable feedback', () => {
    const fixture = scenes.contentIntelligenceScenes.sources.fixture;
    const props = {
      locale: 'en',
      data: fixture,
      actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
      contextIdValue: 'ctx-original',
      onContextIdChange: () => undefined,
    };
    const rendered = render(React.createElement(view.ContentIntelligenceView, props));
    rendered.rerender(
      React.createElement(view.ContentIntelligenceView, {
        ...props,
        data: { ...fixture, provenanceAvailable: true },
        sectionFeedback: { provenance: 'unavailable' },
        contextIdValue: 'ctx-corrected-after-404',
      })
    );

    expect(screen.getByLabelText('Context snapshot ID').value).toBe(
      'ctx-corrected-after-404'
    );
    expect(screen.getByRole('button', { name: 'Inspect context' }).disabled).toBe(
      false
    );
  });

  test('a context 404 preserves the editable ID and restores focus to Inspect', () => {
    const fixture = scenes.contentIntelligenceScenes.provenance.fixture;
    const props = {
      locale: 'en',
      activeSection: 'provenance',
      visibleSections: ['provenance'],
      data: fixture,
      actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
      contextIdValue: 'ctx-missing-but-correctable',
      onContextIdChange: () => undefined,
    };
    const rendered = render(React.createElement(view.ContentIntelligenceView, props));
    const inspect = screen.getByRole('button', { name: 'Inspect context' });
    inspect.focus();
    fireEvent.click(inspect);
    rendered.rerender(
      React.createElement(view.ContentIntelligenceView, {
        ...props,
        sectionFeedback: { provenance: 'pending' },
      })
    );
    rendered.rerender(
      React.createElement(view.ContentIntelligenceView, {
        ...props,
        data: {
          ...fixture,
          provenance: {
            contextId: null,
            status: 'EMPTY',
            generationPolicy: 'EVIDENCE_REQUIRED',
            errorCode: 'CONTENT_EVIDENCE_REQUIRED',
            profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
            facts: [],
            rejected: [],
          },
        },
        sectionFeedback: { provenance: 'unavailable' },
      })
    );

    expect(screen.getByLabelText('Context snapshot ID').value).toBe(
      'ctx-missing-but-correctable'
    );
    expect(screen.getByRole('button', { name: 'Inspect context' })).toBe(
      document.activeElement
    );
  });

  test('server capabilities disable direct validation and sync with an accessible reason', () => {
    const fixture = scenes.contentIntelligenceScenes.sources.fixture;
    render(
      React.createElement(view.ContentIntelligenceView, {
        locale: 'en',
        activeSection: 'sources',
        visibleSections: ['sources'],
        data: {
          ...fixture,
          sourceCapabilities: {
            directFetch: false,
            validate: true,
            sync: true,
          },
        },
        actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
      })
    );

    expect(screen.getByText('Direct fetch is unavailable')).toBeTruthy();
    for (const button of screen.getAllByRole('button', { name: 'Validate' })) {
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-describedby')).toBe(
        'source-direct-fetch-reason'
      );
    }
    for (const button of screen.getAllByRole('button', { name: 'Sync now' })) {
      expect(button.disabled).toBe(true);
    }
    expect(screen.getByRole('button', { name: 'Activate' }).disabled).toBe(true);
  });

  test.each([
    [
      'remote draft before rights',
      { kind: 'URL', desiredState: 'DRAFT', rightsState: 'UNCONFIRMED', healthState: 'NEVER_SYNCED', currentSnapshot: null },
      { validate: false, activate: false, sync: false },
    ],
    [
      'confirmed remote draft before validation',
      { kind: 'URL', desiredState: 'DRAFT', rightsState: 'CONFIRMED', healthState: 'NEVER_SYNCED', currentSnapshot: null },
      { validate: true, activate: false, sync: false },
    ],
    [
      'validated healthy remote draft',
      { kind: 'RSS', desiredState: 'DRAFT', rightsState: 'CONFIRMED', healthState: 'FRESH', currentSnapshot: { observedAt: '2026-08-20T10:00:00.000Z', freshUntil: null, evidenceCount: 1 } },
      { validate: true, activate: true, sync: false },
    ],
    [
      'policy-blocked remote draft',
      { kind: 'RSS', desiredState: 'DRAFT', rightsState: 'CONFIRMED', robotsState: 'DISALLOWED', healthState: 'POLICY_BLOCKED', currentSnapshot: { observedAt: '2026-08-20T10:00:00.000Z', freshUntil: null, evidenceCount: 1 } },
      { validate: true, activate: false, sync: false },
    ],
    [
      'fresh remote draft blocked by robots policy',
      { kind: 'RSS', desiredState: 'DRAFT', rightsState: 'CONFIRMED', robotsState: 'DISALLOWED', healthState: 'FRESH', currentSnapshot: { observedAt: '2026-08-20T10:00:00.000Z', freshUntil: null, evidenceCount: 1 } },
      { validate: true, activate: false, sync: false },
    ],
    [
      'healthy active remote source',
      { kind: 'URL', desiredState: 'ACTIVE', rightsState: 'CONFIRMED', healthState: 'FRESH', currentSnapshot: { observedAt: '2026-08-20T10:00:00.000Z', freshUntil: null, evidenceCount: 1 } },
      { validate: false, activate: false, sync: true },
    ],
    [
      'stale active remote source with allowed last policy',
      { kind: 'URL', desiredState: 'ACTIVE', rightsState: 'CONFIRMED', healthState: 'STALE', currentSnapshot: { observedAt: '2026-08-01T10:00:00.000Z', freshUntil: '2026-08-02T10:00:00.000Z', evidenceCount: 1 } },
      { validate: false, activate: false, sync: true },
    ],
    [
      'policy-blocked active remote source',
      { kind: 'URL', desiredState: 'ACTIVE', rightsState: 'CONFIRMED', robotsState: 'DISALLOWED', healthState: 'POLICY_BLOCKED', currentSnapshot: { observedAt: '2026-08-20T10:00:00.000Z', freshUntil: null, evidenceCount: 1 } },
      { validate: false, activate: false, sync: false },
    ],
    [
      'fresh active remote source blocked by robots policy',
      { kind: 'URL', desiredState: 'ACTIVE', rightsState: 'CONFIRMED', robotsState: 'DISALLOWED', healthState: 'FRESH', currentSnapshot: { observedAt: '2026-08-20T10:00:00.000Z', freshUntil: null, evidenceCount: 1 } },
      { validate: false, activate: false, sync: false },
    ],
    [
      'archived source',
      { kind: 'URL', desiredState: 'ARCHIVED', rightsState: 'CONFIRMED', healthState: 'FRESH', currentSnapshot: { observedAt: '2026-08-20T10:00:00.000Z', freshUntil: null, evidenceCount: 1 } },
      { validate: false, activate: false, sync: false },
    ],
  ])('matches the backend lifecycle for %s', (_label, source, expected) => {
    expect(
      view.sourceLifecycleActions(
        { id: 'source-table', displayName: 'Table source', canonicalUrl: null, robotsState: 'ALLOWED', ...source },
        { directFetch: true, validate: true, sync: true }
      )
    ).toEqual(expected);
  });

  test('capabilities close every remote lifecycle gate', () => {
    const source = {
      id: 'source-capability',
      kind: 'URL',
      displayName: 'Capability source',
      canonicalUrl: 'https://example.test/source',
      desiredState: 'DRAFT',
      rightsState: 'CONFIRMED',
      robotsState: 'ALLOWED',
      healthState: 'FRESH',
      currentSnapshot: {
        observedAt: '2026-08-20T10:00:00.000Z',
        freshUntil: null,
        evidenceCount: 1,
      },
    };
    expect(
      view.sourceLifecycleActions(source, {
        directFetch: false,
        validate: true,
        sync: true,
      })
    ).toEqual({ validate: false, activate: false, sync: false });
  });

  test.each(['sources', 'provenance'])(
    'restricted %s scene exposes no enabled button action',
    (sceneName) => {
      const fixture = scenes.contentIntelligenceScenes[sceneName].fixture;
      render(
        React.createElement(view.ContentIntelligenceView, {
          locale: 'en',
          activeSection: sceneName,
          visibleSections: [sceneName],
          state: 'restricted',
          data: fixture,
          actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
        })
      );

      // Hint triggers are excluded because they are not actions: a hint opens
      // a tooltip and changes nothing, and it is wanted most where a person
      // cannot act and needs to know why. `data-hint-trigger` is set by the
      // primitive itself, so this exclusion cannot quietly widen to cover a
      // real action that forgot to disable itself.
      for (const button of screen.getAllByRole('button')) {
        if (button.dataset.hintTrigger === 'true') continue;
        expect(button.disabled).toBe(true);
      }
      cleanup();
    }
  );

  test('retry restores focus to the section heading when error content is replaced', () => {
    const fixture = scenes.contentIntelligenceScenes.provenance.fixture;
    const props = {
      locale: 'en',
      activeSection: 'provenance',
      visibleSections: ['provenance'],
      data: fixture,
      actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
      sectionStates: { provenance: 'error' },
    };
    const rendered = render(React.createElement(view.ContentIntelligenceView, props));
    const retry = screen.getByRole('button', { name: 'Retry' });
    retry.focus();
    fireEvent.click(retry);
    rendered.rerender(
      React.createElement(view.ContentIntelligenceView, {
        ...props,
        sectionStates: { provenance: 'default' },
      })
    );

    expect(screen.getByRole('heading', { name: 'Provenance inspector' })).toBe(
      document.activeElement
    );
  });

  test('keyboard-initiated mutation restores focus to status when its control becomes disabled', () => {
    const fixture = scenes.contentIntelligenceScenes.sources.fixture;
    const props = {
      locale: 'en',
      activeSection: 'sources',
      visibleSections: ['sources'],
      data: fixture,
      actions: view.NOOP_CONTENT_INTELLIGENCE_ACTIONS,
    };
    const rendered = render(React.createElement(view.ContentIntelligenceView, props));
    const remove = screen.getAllByRole('button', { name: 'Remove' })[0];
    remove.focus();
    fireEvent.keyDown(remove, { key: 'Enter' });
    fireEvent.click(remove);
    rendered.rerender(
      React.createElement(view.ContentIntelligenceView, {
        ...props,
        sectionFeedback: { sources: 'pending' },
      })
    );
    rendered.rerender(
      React.createElement(view.ContentIntelligenceView, {
        ...props,
        data: {
          ...fixture,
          sources: fixture.sources.map((source, index) =>
            index === 0 ? { ...source, desiredState: 'ARCHIVED' } : source
          ),
        },
        sectionFeedback: { sources: 'error' },
      })
    );

    const status = screen
      .getAllByRole('alert')
      .find((element) => element.tabIndex === -1);
    expect(status).toBe(document.activeElement);
  });
});
