'use strict';

/**
 * «Откуда факты» and «Что уже написали» when the workspace may look but not
 * write (`content-factory-next-cl19`).
 *
 * The audit of 02.09.2026 (№16) found both screens covering loading, empty,
 * error and «ничего не найдено» — and rendering «Снять», «Копировать»,
 * «Подтвердить» and «Занести текст» unconditionally, with no idea a refusal by
 * right existed. What happened when one arrived was the part worth a test:
 * `SubscriptionException` puts `{ section, action }` on the wire and no
 * `message`, so the shared `jsonReader` invented one from the status and the
 * screen printed «Material request failed: 402» where the explanation goes,
 * over a row whose buttons still invited the same click.
 *
 * These screens do not guess in advance. Their doors carry `Sections.AI` and
 * `Sections.POSTS_PER_MONTH` — plan sections, open to every member on an
 * instance without billing (`docs/product/roles-matrix.md`) — so hiding the
 * buttons from a member the way «Откуда идеи» hides its administrator actions
 * would break a door that works. The right is learned from the server's own
 * answer, and the screen goes read-only the moment it hears one.
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

const { act, cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const FOLDER = 'apps/frontend/src/components/content-intelligence';
const SHOWCASE = `${FOLDER}/content-facts.showcase.tsx`;
const ARCHIVE = `${FOLDER}/content-archive.container.tsx`;
const RIGHT = `${FOLDER}/content-write-right.tsx`;
const SCENE = `${FOLDER}/content-facts.review-scene.tsx`;
const REVIEW_ROUTE =
  'apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx';
const MAP = 'docs/product/content-section-map.md';

const source = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

const showcase = loadTypeScriptModule(SHOWCASE);
const archive = loadTypeScriptModule(ARCHIVE);
const right = loadTypeScriptModule(RIGHT);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const FACT = Object.freeze({
  id: 'fact-1',
  claimKey: 'подшипники|поставщик',
  topic: 'подшипники',
  topicLabel: 'Подшипники',
  statement: 'Мы поменяли поставщика подшипников в марте.',
  language: 'ru',
  temporalKind: 'DATED',
  freshUntil: null,
  status: 'UNVERIFIED',
  supersedesFactId: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  createdByName: 'Ирина',
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
});

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

/** What `permissions.guard.ts` throws: a section, an action, and no sentence. */
const refused = (status, section) => ({
  ok: false,
  status,
  json: async () => ({ section, action: 'create' }),
  clone() {
    return this;
  },
});

const serve = (table) => {
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const answer = table[`${method} ${url}`];
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return typeof answer === 'function' ? answer() : answer;
  };
};

/**
 * Роль пришла в архив 05.09.2026 (`content-factory-next-fn33.90.8`): экран
 * читает её из сеанса и не ждёт первого отказа. Этот набор про отказ по
 * тарифу — тот в браузере не сосчитать, и он по-прежнему приходит ответом, —
 * поэтому сеанс здесь администраторский: иначе роль закрыла бы дверь раньше
 * тарифа и проверять было бы нечего. Саму роль держит
 * `tests/content-archive.role.test.cjs`.
 */
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

const renderScreen = async (element) => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          userContext.UserContext.Provider,
          { value: { role: 'ADMIN' } },
          React.createElement(
            variables.VariableContextComponent,
            { language: 'ru' },
            React.createElement(element)
          )
        )
      )
    );
  });
  await act(async () => {});
};

const click = async (name) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
  await act(async () => {});
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('a refusal by right is a state of the screen, not a failed click', () => {
  const withFacts = (retract) =>
    serve({
      'GET /content-intelligence/facts': ok({ facts: [FACT] }),
      'POST /content-intelligence/facts/fact-1/retract': retract,
    });

  test('the witness screen reports «restricted», not «error», after a 403', async () => {
    withFacts(refused(403, 'admin'));
    await renderScreen(showcase.ContentFactsShowcase);
    await click('Снять');

    const section = document.querySelector('[data-content-fact-showcase-state]');
    expect(section.getAttribute('data-content-fact-showcase-state')).toBe(
      'restricted'
    );
    expect(
      document.querySelector('[data-content-read-only="facts"]')
    ).not.toBeNull();
  });

  test('the three actions go dead and say why, instead of inviting the same click', async () => {
    withFacts(refused(403, 'admin'));
    await renderScreen(showcase.ContentFactsShowcase);
    await click('Снять');

    for (const label of ['Снять', 'Копировать']) {
      const button = screen.getByRole('button', { name: label });
      expect(button.disabled).toBe(true);
      // The explanation is text a screen reader reaches from the control,
      // not an empty space where a button used to be.
      const described = button.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      expect(document.getElementById(described)).not.toBeNull();
    }
    // The list itself stays readable: looking at the workspace's memory is
    // not the door that refused.
    expect(document.body.textContent).toContain(FACT.statement);
  });

  test('the machine sentence built from a status never reaches the reader', async () => {
    withFacts(refused(402, 'ai'));
    await renderScreen(showcase.ContentFactsShowcase);
    await click('Снять');

    expect(document.body.textContent).not.toContain('Material request failed');
    expect(
      document
        .querySelector('[data-content-read-only="facts"]')
        .getAttribute('data-content-read-only-refusal')
    ).toBe('plan');
  });

  test('an ordinary failure is still an ordinary failure', async () => {
    withFacts({
      ok: false,
      status: 500,
      json: async () => ({ code: 'CONTENT_FACT_UNKNOWN', message: 'Не вышло.' }),
      clone() {
        return this;
      },
    });
    await renderScreen(showcase.ContentFactsShowcase);
    await click('Снять');

    expect(document.querySelector('[data-content-read-only="facts"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Снять' }).disabled).toBe(false);
    expect(document.body.textContent).toContain('Не вышло.');
  });

  test('nothing is claimed before the server has answered', async () => {
    withFacts(refused(403, 'admin'));
    await renderScreen(showcase.ContentFactsShowcase);

    expect(document.querySelector('[data-content-read-only="facts"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Снять' }).disabled).toBe(false);
  });
});

describe('the archive says the same thing about «Занести текст»', () => {
  test('a plan refusal on import leaves the button dead with a reason', async () => {
    serve({
      'GET /content-intelligence/materials/archive?limit=20&offset=0': ok({
        state: 'default',
        materials: [],
        page: 0,
        limit: 20,
        total: 0,
        counts: {
          MADE_HERE: 0,
          IMPORTED_PRE_PRODUCT: 0,
          PUBLISHED_ELSEWHERE: 0,
        },
      }),
      'POST /content-intelligence/materials/archive/import': refused(
        402,
        'posts_per_month'
      ),
    });
    await renderScreen(archive.ContentArchiveContainer);
    await click('Занести текст');

    const title = document.querySelector('input[name="archive-import-title"]');
    const body = document.querySelector('textarea[name="archive-import-body"]');
    await act(async () => {
      fireEvent.change(title, { target: { value: 'Старый текст' } });
      fireEvent.change(body, { target: { value: 'Тело старого текста.' } });
    });
    await click('Занести');

    const note = document.querySelector('[data-content-read-only="archive"]');
    expect(note).not.toBeNull();
    expect(note.getAttribute('data-content-read-only-refusal')).toBe('plan');
    const button = screen.getByRole('button', { name: 'Занести текст' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe(note.id);
  });
});

describe('the reading of a refusal lives in one place', () => {
  test('a status is what says whether the right refused', () => {
    expect(right.readWriteRight({ status: 403 })).toEqual({
      allowed: false,
      refusal: 'role',
    });
    expect(right.readWriteRight({ status: 402 })).toEqual({
      allowed: false,
      refusal: 'plan',
    });
    expect(right.readWriteRight({ status: 500 })).toEqual(right.WRITE_ALLOWED);
    // A named refusal belongs to the request, not to the reader.
    expect(
      right.readWriteRight({ status: 403, code: 'CONTENT_FACT_UNKNOWN' })
    ).toEqual(right.WRITE_ALLOWED);
    expect(right.readWriteRight(undefined)).toEqual(right.WRITE_ALLOWED);
  });

  test('neither screen keeps a second opinion about what a refusal is', () => {
    for (const file of [SHOWCASE, ARCHIVE]) {
      expect(source(file)).toContain('readWriteRight');
      expect(source(file)).not.toMatch(/status\s*===\s*40[23]/u);
    }
  });
});

describe('the state a reviewer can look at', () => {
  test('the witness screen has a review scene that carries «restricted»', () => {
    expect(fs.existsSync(path.join(root, SCENE))).toBe(true);
    expect(source(SCENE)).toContain("'restricted'");
    expect(source(REVIEW_ROUTE)).toContain('content-facts.review-scene');
  });

  test('the scene draws the state with the screen’s own row, not a redrawing of it', async () => {
    const reviewScene = loadTypeScriptModule(SCENE);
    await act(async () => {
      render(
        React.createElement(reviewScene.Scene, {
          context: {
            state: 'restricted',
            theme: 'dark',
            locale: 'ru',
            viewport: 390,
          },
        })
      );
    });

    expect(
      document.querySelector('[data-content-read-only="facts"]')
    ).not.toBeNull();
    for (const label of ['Снять', 'Копировать', 'Подтвердить']) {
      const buttons = screen.getAllByRole('button', { name: label });
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) expect(button.disabled).toBe(true);
    }
  });

  test('the map no longer calls read-only a gap in the mock-ups', () => {
    const map = source(MAP);
    expect(map).toMatch(/только чтение/u);
    expect(map).toContain('content-factory-next-cl19');
  });
});
