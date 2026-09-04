'use strict';

/**
 * The door `CreateContentFactDto` never had on the frontend.
 *
 * `POST /content-intelligence/facts` and its list existed on the backend
 * before this file did — `BriefFactV1.factId` was built to point at a fact in
 * this catalogue, and `groundedBrief` refuses an id this workspace does not
 * hold. Nothing in the interface could put an id there: the only way to ground
 * a brief was to paste a URL. This guard is about the wire this task adds, and
 * the three things it must not get wrong:
 *
 *  - a fact is created through the real contract, not a guess at its shape.
 *  - a refusal is read the way the rest of this section already reads one —
 *    `voice-materials.adapter.ts`'s table, not a second copy of it.
 *  - the list refreshes after a create, so what a person just added is what
 *    `groundedBrief` would find if a brief cited its id.
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

const { act, cleanup, fireEvent, render, screen, within } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const FILES = {
  container: `${base}/content-facts.container.tsx`,
  adapter: `${base}/content-facts.adapter.ts`,
  screen: `${base}/content-section.screen.tsx`,
  // `content-factory-next-odb8.2` moved the door itself: «Происхождение»
  // became a view-only witness (`content-facts.showcase.tsx`), so a fact is
  // now added where the brief asks «чем подтвердишь», not on a fourth tab.
  briefContainer: 'apps/frontend/src/components/brand-voice/voice-brief.container.tsx',
  showcase: `${base}/content-facts.showcase.tsx`,
};

const source = (key) => fs.readFileSync(path.join(root, FILES[key]), 'utf8');

test('the container and its adapter exist', () => {
  for (const file of Object.values(FILES)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
});

if (!Object.values(FILES).every((file) => fs.existsSync(path.join(root, file))))
  return;

const adapter = loadTypeScriptModule(FILES.adapter);
const container = loadTypeScriptModule(FILES.container);
const showcase = loadTypeScriptModule(FILES.showcase);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

/* -------------------------------------------------------------------------
 * A server, stubbed at the one place the product talks to it
 * ---------------------------------------------------------------------- */

// `content-factory-next-fn33.65`: the shared request helper hands the common
// refusal handler a copy of the response, so a fake answer has to be
// clonable the way a real `Response` is.
const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});
const refusal = (status, body) => ({
  ok: false,
  status,
  json: async () => body,
  clone() {
    return this;
  },
});

let calls = [];

const serve = (table) => {
  calls = [];
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const call = { url, method, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const answer = table[`${method} ${url}`];
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return typeof answer === 'function' ? answer(call) : answer;
  };
};

const EXISTING = {
  facts: [
    {
      id: 'fact-1',
      claimKey: 'pricing|trial_length',
      statement: 'Пробный период — 14 дней.',
      language: 'ru',
      temporalKind: 'TIMELESS',
      freshUntil: null,
      status: 'UNVERIFIED',
      evidence: [],
    },
  ],
};

const renderContainer = async (locale = 'ru') => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          variables.VariableContextComponent,
          { language: locale },
          React.createElement(container.ContentFactsContainer)
        )
      )
    );
  });
  await act(async () => {});
};

const renderShowcase = async (locale = 'ru') => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          variables.VariableContextComponent,
          { language: locale },
          React.createElement(showcase.ContentFactsShowcase)
        )
      )
    );
  });
  await act(async () => {});
};

const click = async (element) => {
  await act(async () => {
    fireEvent.click(element);
  });
  await act(async () => {});
};

const type = async (name, value) => {
  const field = document.querySelector(`[name="${name}"]`);
  expect(field).not.toBeNull();
  await act(async () => {
    fireEvent.change(field, { target: { value } });
  });
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

/* ---------------------------------------------------------------------- */

describe('what already exists is read from the real catalogue', () => {
  test('the list shows what the server holds, id included', async () => {
    serve({ 'GET /content-intelligence/facts': ok(EXISTING) });
    await renderContainer();

    const row = document.querySelector('[data-content-fact-id="fact-1"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Пробный период — 14 дней.');
    expect(row.textContent).toContain('fact-1');
  });

  test('a workspace with nothing remembered yet is told so, not shown a bare table', async () => {
    serve({ 'GET /content-intelligence/facts': ok({ facts: [] }) });
    await renderContainer();

    expect(document.querySelector('[data-content-fact-id]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a list that failed to load is named, not swallowed', async () => {
    serve({
      'GET /content-intelligence/facts': refusal(500, {
        code: 'CONTENT_CONTEXT_NOT_FOUND',
        message: 'Каталог фактов недоступен.',
      }),
    });
    await renderContainer();

    expect(screen.getByRole('alert').textContent).toContain(
      'Каталог фактов недоступен.'
    );
  });
});

/**
 * `ContentFact.status` is a plain `String` column, not an enum, and the brief
 * refuses three of its values outright: `UNUSABLE_FACT_STATUSES` in
 * `content-brief.service.ts` is `TOMBSTONED`, `RETRACTED`, `SUPERSEDED`.
 * `listFacts` filters only the first of the three, so the other two reach
 * this list — and the first pass at this door knew five status values, none
 * of them those two, and quietly relabelled them «Не проверен». The section
 * then offered an id under a label saying it was fine, and the brief refused
 * it with `BRIEF_FACT_UNGROUNDED` and no way to connect the two.
 */
describe('a fact the brief will not take is not offered as if it would', () => {
  const withStatus = (status) => ({
    facts: [{ ...EXISTING.facts[0], id: 'fact-x', status }],
  });

  test.each(['RETRACTED', 'SUPERSEDED'])(
    'a %s fact is named, and the row says the brief will refuse it',
    async (status) => {
      serve({ 'GET /content-intelligence/facts': ok(withStatus(status)) });
      await renderContainer();

      const row = document.querySelector('[data-content-fact-id="fact-x"]');
      expect(row).not.toBeNull();
      expect(row.textContent).not.toContain('Не проверен');
      expect(row.getAttribute('data-content-fact-usable')).toBe('false');
      expect(row.textContent).toMatch(/бриф/iu);
    }
  );

  test('a status nobody here has heard of is shown as it came, not renamed', async () => {
    serve({ 'GET /content-intelligence/facts': ok(withStatus('QUARANTINED')) });
    await renderContainer();

    const row = document.querySelector('[data-content-fact-id="fact-x"]');
    expect(row.textContent).toContain('QUARANTINED');
    expect(row.textContent).not.toContain('Не проверен');
  });

  test('an ordinary unverified fact is still offered as usable', async () => {
    serve({ 'GET /content-intelligence/facts': ok(EXISTING) });
    await renderContainer();

    const row = document.querySelector('[data-content-fact-id="fact-1"]');
    expect(row.getAttribute('data-content-fact-usable')).toBe('true');
    expect(row.textContent).toContain('Не проверен');
  });

  /**
   * The id is what this whole card exists to hand over, and it is a cuid. The
   * first pass printed it inside a caption and left the person to select it
   * by hand — in a different tab from the field it goes into, which is the
   * one place a mis-selected character is not caught until the brief refuses
   * the fact.
   */
  test('an id can be taken, not only read', async () => {
    const written = [];
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => void written.push(value) },
    });
    try {
      serve({ 'GET /content-intelligence/facts': ok(EXISTING) });
      await renderContainer();

      const button = document.querySelector('[data-content-fact-copy="fact-1"]');
      expect(button).not.toBeNull();
      await click(button);

      expect(written).toEqual(['fact-1']);
      expect(button.textContent).toContain('Скопирован');
    } finally {
      delete global.navigator.clipboard;
    }
  });

  test('no clipboard means no button, and the id is still on the screen', async () => {
    serve({ 'GET /content-intelligence/facts': ok(EXISTING) });
    await renderContainer();

    expect(document.querySelector('[data-content-fact-copy]')).toBeNull();
    expect(
      document.querySelector('[data-content-fact-id="fact-1"]').textContent
    ).toContain('fact-1');
  });

  test('the unusable list is the brief service’s own, not a second copy of it', () => {
    const briefSource = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.service.ts'
      ),
      'utf8'
    );
    const declared = briefSource
      .match(/const UNUSABLE_FACT_STATUSES = \[([^\]]*)\]/u)[1]
      .match(/'([A-Z_]+)'/gu)
      .map((one) => one.replace(/'/gu, ''));
    expect([...adapter.UNUSABLE_FACT_STATUSES].sort()).toEqual(declared.sort());
  });
});

describe('creating a fact goes through the real contract', () => {
  const fillMinimum = async () => {
    await type('claimKey', 'pricing|trial_length');
    await type('statement', 'Пробный период — 14 дней.');
    await type('valueText', '14');
  };

  test('the payload is CreateContentFactDto, not a guess at its shape', async () => {
    serve({
      'GET /content-intelligence/facts': ok({ facts: [] }),
      'POST /content-intelligence/facts': ok({ id: 'fact-new' }),
    });
    await renderContainer();
    await fillMinimum();
    await click(screen.getByRole('button', { name: 'Сохранить факт' }));

    const sent = calls.find((call) => call.method === 'POST').body;
    expect(sent).toEqual({
      claimKey: 'pricing|trial_length',
      statement: 'Пробный период — 14 дней.',
      language: 'ru',
      valueText: '14',
      temporalKind: 'TIMELESS',
    });
  });

  test('after creation the list is refreshed and the new id is announced', async () => {
    let listedOnce = false;
    serve({
      'GET /content-intelligence/facts': () =>
        ok(listedOnce ? EXISTING : (listedOnce = true, { facts: [] })),
      'POST /content-intelligence/facts': ok({ id: 'fact-1' }),
    });
    await renderContainer();
    await fillMinimum();
    await click(screen.getByRole('button', { name: 'Сохранить факт' }));

    // The id is the one thing a brief needs to cite this fact by.
    expect(screen.getByRole('status').textContent).toContain('fact-1');
    expect(document.querySelector('[data-content-fact-id="fact-1"]')).not.toBeNull();
    // The form is ready for the next fact rather than holding the last one.
    expect(document.querySelector('[name="claimKey"]').value).toBe('');
  });

  test('a fact good enough for a brief needs no evidence to exist', async () => {
    // `groundedBrief` only checks that the id exists in this workspace and is
    // not TOMBSTONED, RETRACTED or SUPERSEDED — a freshly created,
    // UNVERIFIED fact already clears that bar, so evidence-linking is a
    // separate door and this test is the contract's own words, not a guess.
    const brief = fs.readFileSync(
      path.join(root, 'libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.service.ts'),
      'utf8'
    );
    const declared = brief.match(/UNUSABLE_FACT_STATUSES = \[([^\]]+)\]/);
    expect(declared).not.toBeNull();
    const statuses = declared[1];
    expect(statuses).toContain('TOMBSTONED');
    expect(statuses).toContain('RETRACTED');
    expect(statuses).toContain('SUPERSEDED');
    expect(statuses).not.toContain('UNVERIFIED');
  });

  test('an invalid claim rejected by the server is named, and nothing typed is lost', async () => {
    serve({
      'GET /content-intelligence/facts': ok({ facts: [] }),
      'POST /content-intelligence/facts': refusal(422, {
        code: 'CONTENT_CONTEXT_INPUT_INVALID',
        message: 'Fact lifecycle dates are invalid',
      }),
    });
    await renderContainer();
    await fillMinimum();
    await click(screen.getByRole('button', { name: 'Сохранить факт' }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Fact lifecycle dates are invalid'
    );
    expect(document.querySelector('[name="claimKey"]').value).toBe(
      'pricing|trial_length'
    );
  });

  test('a refusal with no message of its own still tells a person something happened', async () => {
    // `SubscriptionException` (the `aiCreate` policy gate) answers with
    // `{ section, action }`, not `{ code, message }` — there is nothing in the
    // body to print, so the surface's own fallback sentence is what is shown,
    // never a blank alert or "unknown error".
    serve({
      'GET /content-intelligence/facts': ok({ facts: [] }),
      'POST /content-intelligence/facts': refusal(402, {
        section: 'ai',
        action: 'create',
      }),
    });
    await renderContainer();
    await fillMinimum();
    await click(screen.getByRole('button', { name: 'Сохранить факт' }));

    expect(screen.getByRole('alert').textContent.trim().length).toBeGreaterThan(0);
    expect(document.querySelector('[name="claimKey"]').value).toBe(
      'pricing|trial_length'
    );
  });
});

describe('the section does not reinvent what a refusal means', () => {
  test('the refusal reading comes from the section\'s own table', () => {
    const adapterCode = source('adapter');
    expect(adapterCode).toMatch(/from '\.\.\/brand-voice\/voice-materials\.adapter'/u);
    // A second table of what a 403 or 422 means is how two surfaces of one
    // section start disagreeing about it.
    expect(adapterCode).not.toMatch(/VOICE_ERROR_CODES\s*\[/u);
  });

  /**
   * `content-factory-next-odb8`: the door moved off the tab this test used
   * to name. «Происхождение» is a read-only witness now
   * (`content-facts.showcase.tsx`, mounted at `tab === 'provenance'` in
   * `content-section.screen.tsx` — that half still holds) and adding a fact
   * lives in the brief instead, right where «чем подтвердишь» is asked.
   */
  test('the door is wired into the Brief tab, where "чем подтвердишь" is asked', () => {
    const screenCode = source('screen');
    expect(screenCode).toMatch(/tab === 'provenance'/);
    expect(screenCode).not.toContain('ContentFactsContainer');

    const briefCode = source('briefContainer');
    expect(briefCode).toContain('ContentFactsContainer');
    expect(briefCode).toContain('onFactCreated');
  });
});

describe('the payload builder', () => {
  test('drops the optional dates nobody filled in rather than sending empty strings', () => {
    const payload = adapter.buildFactCreatePayload({
      claimKey: ' pricing|trial_length ',
      statement: ' Пробный период — 14 дней. ',
      language: 'ru',
      valueText: ' 14 ',
      temporalKind: 'TIMELESS',
      effectiveFrom: '',
      effectiveTo: '',
      freshUntil: '',
    });
    expect(payload).toEqual({
      claimKey: 'pricing|trial_length',
      statement: 'Пробный период — 14 дней.',
      language: 'ru',
      valueText: '14',
      temporalKind: 'TIMELESS',
    });
  });

  test('a filled date travels as the DTO expects it', () => {
    const payload = adapter.buildFactCreatePayload({
      claimKey: 'pricing|trial_length',
      statement: 'x',
      language: 'en',
      valueText: 'x',
      temporalKind: 'CURRENT',
      effectiveFrom: '',
      effectiveTo: '',
      freshUntil: '2026-12-31',
    });
    expect(payload.freshUntil).toBe('2026-12-31');
  });

  test('the claim key pattern mirrors the DTO exactly', () => {
    expect(adapter.CLAIM_KEY_PATTERN.test('pricing|trial_length')).toBe(true);
    expect(adapter.CLAIM_KEY_PATTERN.test('pricing')).toBe(false);
    expect(adapter.CLAIM_KEY_PATTERN.test('pricing|')).toBe(false);
    expect(adapter.CLAIM_KEY_PATTERN.test('pricing trial|length')).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * «Подтвердить» (`content-factory-next-tyrk`): the witness screen's third
 * action, visible only on a still-pending «найдено поиском» row. Every other
 * row — own word, own material, or a search result already confirmed — keeps
 * the two actions §8.2 of the map document settled on.
 * ---------------------------------------------------------------------- */

const searchPendingFact = (overrides = {}) => ({
  id: 'fact-search',
  claimKey: 'pricing|currency',
  topic: 'pricing',
  topicLabel: 'Pricing',
  statement: 'The currency is EUR.',
  language: 'en',
  temporalKind: 'TIMELESS',
  freshUntil: null,
  status: 'VERIFIED',
  supersedesFactId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  createdByName: null,
  grounding: {
    method: 'SEARCH_RESULT',
    evidenceId: 'evidence-1',
    excerpt: 'The article said exactly this.',
    sourceLabel: null,
    sourceUrl: 'https://example.com/found',
    observedAt: '2026-09-01T00:00:00.000Z',
  },
  needsLook: true,
  evidence: [
    {
      evidenceId: 'evidence-1',
      stance: 'SUPPORTS',
      reviewStatus: 'PROPOSED',
      title: 'Found article',
      sourceState: 'AVAILABLE',
      freshUntil: '2027-09-01T00:00:00.000Z',
    },
  ],
  ...overrides,
});

const ownWordFact = (overrides = {}) => ({
  id: 'fact-own-word',
  claimKey: 'pricing|trial_length',
  topic: 'pricing',
  topicLabel: 'Pricing',
  statement: 'The trial is 14 days.',
  language: 'en',
  temporalKind: 'TIMELESS',
  freshUntil: null,
  status: 'VERIFIED',
  supersedesFactId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  createdByName: 'Integrator',
  grounding: {
    method: 'OWN_WORD',
    evidenceId: null,
    excerpt: null,
    sourceLabel: null,
    sourceUrl: null,
    observedAt: null,
  },
  needsLook: false,
  evidence: [],
  ...overrides,
});

describe('«Подтвердить» renders only on a row that still needs a look', () => {
  test('a pending search-result row offers Подтвердить; an own-word row does not', async () => {
    serve({
      'GET /content-intelligence/facts': ok({
        facts: [searchPendingFact(), ownWordFact()],
      }),
    });
    await renderShowcase();

    expect(
      document.querySelector('[data-content-fact-confirm="fact-search"]')
    ).not.toBeNull();
    expect(
      document.querySelector('[data-content-fact-confirm="fact-own-word"]')
    ).toBeNull();
  });

  test('a search result already confirmed (needsLook: false) offers no Подтвердить either', async () => {
    serve({
      'GET /content-intelligence/facts': ok({
        facts: [
          searchPendingFact({
            id: 'fact-search-confirmed',
            needsLook: false,
            evidence: [
              {
                evidenceId: 'evidence-1',
                stance: 'SUPPORTS',
                reviewStatus: 'ACCEPTED',
                title: 'Found article',
                sourceState: 'AVAILABLE',
                freshUntil: '2027-09-01T00:00:00.000Z',
              },
            ],
          }),
        ],
      }),
    });
    await renderShowcase();

    expect(
      document.querySelector(
        '[data-content-fact-confirm="fact-search-confirmed"]'
      )
    ).toBeNull();
  });

  test('clicking Подтвердить calls the confirm endpoint and the row loses the action once refreshed', async () => {
    let confirmed = false;
    serve({
      'GET /content-intelligence/facts': () =>
        ok({
          facts: [
            searchPendingFact({
              needsLook: !confirmed,
              evidence: [
                {
                  evidenceId: 'evidence-1',
                  stance: 'SUPPORTS',
                  reviewStatus: confirmed ? 'ACCEPTED' : 'PROPOSED',
                  title: 'Found article',
                  sourceState: 'AVAILABLE',
                  freshUntil: '2027-09-01T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      'POST /content-intelligence/facts/fact-search/evidence/evidence-1/confirm':
        () => {
          confirmed = true;
          return ok({ id: 'assessment-1', status: 'ACCEPTED' });
        },
    });
    await renderShowcase();

    const button = document.querySelector(
      '[data-content-fact-confirm="fact-search"]'
    );
    expect(button).not.toBeNull();
    await click(button);

    expect(
      calls.some(
        (call) =>
          call.method === 'POST' &&
          call.url ===
            '/content-intelligence/facts/fact-search/evidence/evidence-1/confirm'
      )
    ).toBe(true);
    expect(
      document.querySelector('[data-content-fact-confirm="fact-search"]')
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * «Вернуть» refuses a SUPERSEDED row (review addendum to
 * `content-factory-next-tyrk`, 02.09.2026). Restoring a fact that
 * КОПИРОВАТЬ И ПОПРАВИТЬ replaced would put the corrected fact and the one
 * it replaced back in work at once, same claimKey, disagreeing statements —
 * exactly what copy-not-edit exists to prevent. Only a RETRACTED row keeps
 * the button; a SUPERSEDED one only names why it left work.
 * ---------------------------------------------------------------------- */

const inactiveFact = (overrides = {}) => ({
  id: 'fact-inactive',
  claimKey: 'pricing|trial_length',
  topic: 'pricing',
  topicLabel: 'Pricing',
  statement: 'The trial is 14 days.',
  language: 'en',
  temporalKind: 'TIMELESS',
  freshUntil: null,
  status: 'RETRACTED',
  supersedesFactId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  createdByName: null,
  grounding: {
    method: 'OWN_WORD',
    evidenceId: null,
    excerpt: null,
    sourceLabel: null,
    sourceUrl: null,
    observedAt: null,
  },
  needsLook: false,
  evidence: [],
  ...overrides,
});

describe('«Вернуть» offers a way back only for a RETRACTED row, never a SUPERSEDED one', () => {
  // The witness screen hides snятые by default («Снятые: Скрыты») — both
  // rows below only become visible once that filter is switched to «Показаны».
  const showRetracted = async () => {
    const select = document.querySelector('[name="retractedFilter"]');
    expect(select).not.toBeNull();
    await act(async () => {
      fireEvent.change(select, { target: { value: 'SHOWN' } });
    });
  };

  test('a RETRACTED row offers Вернуть', async () => {
    serve({
      'GET /content-intelligence/facts': ok({
        facts: [inactiveFact({ id: 'fact-retracted', status: 'RETRACTED' })],
      }),
    });
    await renderShowcase();
    await showRetracted();

    const row = document.querySelector('[data-content-fact-row="fact-retracted"]');
    expect(row).not.toBeNull();
    expect(row.getAttribute('data-content-fact-usable')).toBe('false');
    expect(within(row).getByRole('button', { name: 'Вернуть' })).toBeTruthy();
  });

  test('a SUPERSEDED row names why it left work but offers no Вернуть button', async () => {
    serve({
      'GET /content-intelligence/facts': ok({
        facts: [
          inactiveFact({ id: 'fact-superseded', status: 'SUPERSEDED' }),
        ],
      }),
    });
    await renderShowcase();
    await showRetracted();

    const row = document.querySelector('[data-content-fact-row="fact-superseded"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toMatch(/заменён/iu);
    expect(within(row).queryByRole('button', { name: 'Вернуть' })).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * The form asks a person what they know, not what the column is called
 * (content-factory-next-fn33.57, .62, .58, .59)
 * ---------------------------------------------------------------------- */

describe('the fact form asks one question and files the rest itself', () => {
  test('content-factory-next-fn33.57 — a claim alone is enough to save: the key is filed and the value falls back to the statement', async () => {
    serve({
      'GET /content-intelligence/facts': ok({ facts: [] }),
      'POST /content-intelligence/facts': ok({ id: 'fact-new' }),
    });
    await renderContainer();
    await type('statement', 'Пробный период — 14 дней.');
    await click(screen.getByRole('button', { name: 'Сохранить факт' }));

    const sent = calls.find((call) => call.method === 'POST').body;
    expect(sent.statement).toBe('Пробный период — 14 дней.');
    // Filed from the words of the claim, and a shape the DTO accepts.
    expect(sent.claimKey).toMatch(adapter.CLAIM_KEY_PATTERN);
    expect(sent.valueText).toBe('Пробный период — 14 дней.');
  });

  test('content-factory-next-fn33.57 — the internal key, the value and the two lifecycle dates are behind «Подробнее», and none of them is required', async () => {
    serve({ 'GET /content-intelligence/facts': ok({ facts: [] }) });
    await renderContainer();
    const source = fs.readFileSync(path.join(root, FILES.container), 'utf8');
    // The engineering apparatus leaves the first screen (карта раздела, §3,
    // §4): it is reachable, not asked for.
    const details = document.querySelector('[data-content-facts-details]');
    expect(details).not.toBeNull();
    expect(details.tagName).toBe('DETAILS');
    for (const name of ['claimKey', 'valueText', 'freshUntil', 'effectiveFrom', 'effectiveTo', 'language', 'temporalKind']) {
      const field = details.querySelector(`[name="${name}"]`);
      expect(field).not.toBeNull();
    }
    expect(details.querySelector('[name="claimKey"]').required).toBe(false);
    expect(details.querySelector('[name="valueText"]').required).toBe(false);
    // The claim itself stays outside the disclosure, where the question is.
    expect(details.querySelector('[name="statement"]')).toBeNull();
    expect(source).toContain('content-factory-next-fn33.57');
  });

  test('content-factory-next-fn33.62 — a rejected key names the obstacle instead of repeating the hint', async () => {
    serve({ 'GET /content-intelligence/facts': ok({ facts: [] }) });
    await renderContainer();
    await type('claimKey', 'редакция|правило факта');

    const field = document.querySelector('[name="claimKey"]');
    const error = document.body.textContent;
    expect(error).toMatch(/подчёркивания/u);
    // The red line is not the grey hint said twice.
    expect(error).not.toMatch(/Формат «тема\|атрибут»/u);
    expect(field.value).toBe('редакция|правило факта');
    expect(screen.getByRole('button', { name: 'Сохранить факт' }).disabled).toBe(true);
  });

  test('content-factory-next-fn33.59 — the language is named, not spelled as a column code', async () => {
    serve({ 'GET /content-intelligence/facts': ok({ facts: [] }) });
    await renderContainer();

    const select = document.querySelector('[name="language"]');
    const labels = [...select.querySelectorAll('option')].map((one) => one.textContent);
    expect(labels).toEqual(['Русский', 'English']);
  });

  test('content-factory-next-fn33.58 — a chosen date is read back in the order this locale writes dates in', async () => {
    serve({ 'GET /content-intelligence/facts': ok({ facts: [] }) });
    await renderContainer();
    await type('freshUntil', '2026-12-31');

    const echo = document.querySelector('[data-content-facts-date-echo="freshUntil"]');
    expect(echo).not.toBeNull();
    expect(echo.textContent).toBe('31.12.2026');
  });
});

describe('what the form files on a person’s behalf', () => {
  test('claimKeyFromStatement builds a key the DTO accepts, from the words of the claim', () => {
    expect(adapter.claimKeyFromStatement('Пробный период — 14 дней.')).toBe(
      'пробный|период_дней'
    );
    expect(adapter.claimKeyFromStatement('Trial')).toBe('trial|trial');
    expect(adapter.claimKeyFromStatement('  ...  ')).toBe('');
    for (const statement of [
      'Пробный период — 14 дней.',
      'Trial',
      'Просрочки упали на 40% за месяц.',
    ]) {
      expect(adapter.claimKeyFromStatement(statement)).toMatch(
        adapter.CLAIM_KEY_PATTERN
      );
    }
  });

  test('content-factory-next-fn33.112 — the topic is a word that means something, not the first word of the sentence', () => {
    // The radar names a topic from the left half of the key, and three facts
    // saved through the form came out as «В», «Наши» and «Редакция»: dividing
    // claims by the first word of a sentence is the same as not dividing them.
    expect(
      adapter.claimKeyFromStatement(
        'В нашей редакции с 1 сентября каждое число в тексте несёт ссылку на источник.'
      )
    ).toBe('редакции|сентября_число');
    expect(
      adapter.claimKeyFromStatement(
        'Наши авторы сдают список ссылок вместе с черновиком'
      )
    ).toBe('авторы|сдают_список');
    expect(
      adapter.claimKeyFromStatement('The trial period is 14 days for our team')
    ).toBe('trial|period_days');
  });

  test('content-factory-next-fn33.112 — a claim made only of function words still gets a key, and the same one twice', () => {
    const key = adapter.claimKeyFromStatement('И вот это всё о том же.');
    expect(key).toMatch(adapter.CLAIM_KEY_PATTERN);
    expect(key).toMatch(/^утверждение\|[0-9a-f]{6}$/u);
    // Filed, not invented anew on every keystroke: the preview under the field
    // and the key that is saved have to agree.
    expect(adapter.claimKeyFromStatement('И вот это всё о том же.')).toBe(key);
    expect(adapter.claimKeyFromStatement('А и не о том же.')).not.toBe(key);
  });

  test('claimKeyIssue separates a space from a missing bar, and says nothing about an empty field', () => {
    expect(adapter.claimKeyIssue('')).toBeNull();
    expect(adapter.claimKeyIssue('   ')).toBeNull();
    expect(adapter.claimKeyIssue('pricing|trial_length')).toBeNull();
    expect(adapter.claimKeyIssue('редакция|правило факта')).toBe('spaces');
    expect(adapter.claimKeyIssue('редакция')).toBe('shape');
  });

  test('readableDate keeps the day the person picked, with no timezone in the way', () => {
    expect(adapter.readableDate('2026-12-31', 'ru')).toBe('31.12.2026');
    expect(adapter.readableDate('2026-12-31', 'en')).toBe('12/31/2026');
    expect(adapter.readableDate('', 'ru')).toBe('');
    expect(adapter.readableDate('nonsense', 'ru')).toBe('nonsense');
  });
});
