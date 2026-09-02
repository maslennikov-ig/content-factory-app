'use strict';

/**
 * The Brief tab, wired to the routes behind it.
 *
 * `content-factory-next-07h.4` built the gate, the radar, the composer and the
 * three routes, and scoped the tab itself as routes only — so the screen was
 * rendered by nothing but `/interface-review` and a person had no door to it.
 * This guard is about the wire, and about the four things it must not get
 * wrong:
 *
 *  - the gate is a gate. A draft built from a brief with no substance reads
 *    like content and says nothing, and nobody notices until it is published.
 *  - an incomplete brief answers with questions, not with a failure. That is
 *    the useful half of the answer and the reason the route exists.
 *  - a fact with nothing checkable behind it is named as such rather than
 *    silently accepted or refused as invalid input.
 *  - a topic is a suggestion about what to write, not the claim being made:
 *    taking one must not overwrite a thesis somebody already typed.
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

const base = 'apps/frontend/src/components/brand-voice';
const FILES = {
  container: `${base}/voice-brief.container.tsx`,
  adapter: `${base}/voice-brief.adapter.ts`,
  screen: `${base}/voice-brief.screen.tsx`,
};

const source = (key) => fs.readFileSync(path.join(root, FILES[key]), 'utf8');

const code = (key) =>
  source(key)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

test('the container and its adapter exist', () => {
  for (const file of Object.values(FILES)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
});

if (!Object.values(FILES).every((file) => fs.existsSync(path.join(root, file))))
  return;

jest.mock('react-hotkeys-hook', () => ({ useHotkeys: () => {} }), {
  virtual: true,
});

const adapter = loadTypeScriptModule(FILES.adapter);
const container = loadTypeScriptModule(FILES.container);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

/* -------------------------------------------------------------------------
 * A server, stubbed at the one place the product talks to it
 * ---------------------------------------------------------------------- */

const QUESTIONS = [
  { field: 'thesis', question: 'Что именно вы утверждаете?' },
  { field: 'facts', question: 'На чём это стоит?' },
  { field: 'position', question: 'Что вы об этом думаете?' },
  { field: 'disagreement', question: 'С чем здесь можно не согласиться?' },
  { field: 'audience', question: 'Для кого это?' },
];

const RADAR = Object.freeze({
  state: 'default',
  ready: false,
  missing: QUESTIONS.map((one) => one.field),
  questions: QUESTIONS,
  ungroundedFacts: [],
  topics: [
    {
      id: 'topic-1',
      title: 'Почему мы поменяли поставщика подшипников',
      score: 82,
      evidenceCount: 3,
      reasons: ['три факта младше месяца', 'об этом ещё не писали'],
    },
  ],
});

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const refusal = (status, body) => ({
  ok: false,
  status,
  json: async () => body,
});

let calls = [];

const serve = (table) => {
  calls = [];
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const call = {
      url,
      method,
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const answer = table[`${method} ${url}`];
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return typeof answer === 'function' ? answer(call) : answer;
  };
};

const baseTable = () => ({
  'GET /integrations/list': ok({ integrations: [] }),
  'GET /content-intelligence/brief/radar': ok(RADAR),
  // `content-factory-next-odb8.2` embeds the fact catalogue
  // (`content-facts.container.tsx`) directly in this tab, right where «чем
  // подтвердишь» is asked. Unstubbed, its own request would fail and print
  // a second `role="alert"`, which is exactly what collides with the
  // brief's own alert assertions below.
  'GET /content-intelligence/facts': ok({ facts: [] }),
});

const renderTab = async (locale = 'ru') => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          variables.VariableContextComponent,
          { language: locale },
          React.createElement(container.VoiceBriefContainer)
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

const fillEverything = async () => {
  await type('brief-thesis', 'Поставщика надо было менять раньше.');
  await type('brief-position', 'Считаем, что тянули лишний квартал.');
  await type('brief-disagreement', 'Можно возразить, что цена была ниже.');
  await type('brief-audience', 'Снабженцы небольших производств.');
  await type('brief-fact-0', 'Просрочки упали на 40% за месяц.');
  await type('brief-fact-source-0', 'https://example.org/report');
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

/* ---------------------------------------------------------------------- */

describe('the radar suggests, and the reason travels with the suggestion', () => {
  test('the topics are the ones the route returned, each with its reasons', async () => {
    serve(baseTable());
    await renderTab();

    const topic = document.querySelector('[data-voice-topic="topic-1"]');
    expect(topic).not.toBeNull();
    expect(topic.textContent).toContain('поставщика подшипников');
    // A rank is not one number: the reason it ranked here travels with it.
    expect(topic.textContent).toContain('три факта младше месяца');
  });

  test('a topic fills an empty thesis and never overwrites one', async () => {
    serve(baseTable());
    await renderTab();

    await click(screen.getByRole('button', { name: 'Взять в бриф' }));
    expect(document.querySelector('[name="brief-thesis"]').value).toBe(
      'Почему мы поменяли поставщика подшипников'
    );

    await type('brief-thesis', 'Своя формулировка.');
    await click(screen.getByRole('button', { name: 'Взять в бриф' }));
    // The radar suggests what to write about; the thesis is the claim being
    // made, and it is the one thing the radar cannot suggest.
    expect(document.querySelector('[name="brief-thesis"]').value).toBe(
      'Своя формулировка.'
    );
  });

  test('a radar that could not be built does not take the brief with it', async () => {
    serve({
      ...baseTable(),
      'GET /content-intelligence/brief/radar': refusal(503, {
        code: 'RADAR_UNAVAILABLE',
        message: 'Радар тем сейчас не собирается.',
      }),
    });
    await renderTab();

    expect(screen.getByRole('alert').textContent).toContain(
      'Радар тем сейчас не собирается'
    );
    // The form is still there and still typeable: the suggestion failed, not
    // the brief.
    expect(document.querySelector('[name="brief-thesis"]')).not.toBeNull();
  });
});

describe('the gate stands between a brief and a draft', () => {
  test('an unanswered brief keeps the button shut and shows the five questions', async () => {
    serve(baseTable());
    await renderTab();

    const create = screen.getByRole('button', { name: 'Создать черновик' });
    expect(create.disabled).toBe(true);
    expect(
      document.querySelector('[data-voice-brief-blocked="true"]')
    ).not.toBeNull();
    for (const question of QUESTIONS) {
      expect(
        document.querySelector(`[data-voice-brief-question="${question.field}"]`)
      ).not.toBeNull();
    }
    expect(
      document.querySelector('[data-voice-surface="brief"]').getAttribute(
        'data-voice-brief-ready'
      )
    ).toBe('false');
  });

  test('a checked brief sends what was typed and opens the button', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/brief/evaluate': ok({
        state: 'success',
        ready: true,
        missing: [],
        questions: [],
        ungroundedFacts: [],
        brief: { thesis: 'Поставщика надо было менять раньше.' },
        topics: RADAR.topics,
      }),
    });
    await renderTab();
    await fillEverything();
    await click(screen.getByRole('button', { name: 'Проверить бриф' }));

    const sent = calls.find((call) =>
      call.url.endsWith('/brief/evaluate')
    ).body;
    expect(sent.thesis).toBe('Поставщика надо было менять раньше.');
    expect(sent.audience).toBe('Снабженцы небольших производств.');
    expect(sent.facts).toEqual([
      {
        statement: 'Просрочки упали на 40% за месяц.',
        sourceUrl: 'https://example.org/report',
      },
    ]);
    // Empty optional fields are dropped rather than sent as blank lines.
    expect(sent).not.toHaveProperty('goal');

    expect(
      screen.getByRole('button', { name: 'Создать черновик' }).disabled
    ).toBe(false);
    expect(
      document.querySelector('[data-voice-brief-blocked="true"]')
    ).toBeNull();
  });

  test('a fact grounded by a remembered id sends that id, not just its statement', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/brief/evaluate': ok({
        state: 'success',
        ready: true,
        missing: [],
        questions: [],
        ungroundedFacts: [],
        topics: RADAR.topics,
      }),
    });
    await renderTab();
    await fillEverything();
    // The third way to ground the same fact: an id from working memory
    // instead of a link. `content-facts.container.tsx`, the Provenance tab.
    await type('brief-fact-id-0', 'a319bf77-f217-4536-89f0-d18c5fcbbbd0');
    await click(screen.getByRole('button', { name: 'Проверить бриф' }));

    const sent = calls.find((call) => call.url.endsWith('/brief/evaluate')).body;
    expect(sent.facts).toEqual([
      {
        statement: 'Просрочки упали на 40% за месяц.',
        sourceUrl: 'https://example.org/report',
        factId: 'a319bf77-f217-4536-89f0-d18c5fcbbbd0',
      },
    ]);
  });

  test('an id nobody typed is never sent as an empty string', async () => {
    // `factId` is `@IsOptional()` on the DTO — an empty string would still
    // pass validation and read as a claim of a remembered fact that names
    // nothing, rather than as what it actually is: a field left blank.
    serve({
      ...baseTable(),
      'POST /content-intelligence/brief/evaluate': ok({
        state: 'success',
        ready: true,
        missing: [],
        questions: [],
        ungroundedFacts: [],
        topics: RADAR.topics,
      }),
    });
    await renderTab();
    await fillEverything();
    await click(screen.getByRole('button', { name: 'Проверить бриф' }));

    const sent = calls.find((call) => call.url.endsWith('/brief/evaluate')).body;
    expect(sent.facts[0]).not.toHaveProperty('factId');
  });

  test('a fact with nothing checkable behind it is named, not refused', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/brief/evaluate': ok({
        state: 'default',
        ready: false,
        missing: ['facts'],
        questions: [QUESTIONS[1]],
        ungroundedFacts: ['Все так делают.'],
        topics: RADAR.topics,
      }),
    });
    await renderTab();
    await type('brief-fact-0', 'Все так делают.');
    await click(screen.getByRole('button', { name: 'Проверить бриф' }));

    const shown = document.querySelector('[data-voice-brief-ungrounded="true"]');
    expect(shown).not.toBeNull();
    expect(shown.textContent).toContain('Все так делают.');
    expect(
      screen.getByRole('button', { name: 'Создать черновик' }).disabled
    ).toBe(true);
  });

  test('a draft refused for want of substance comes back as questions, not as an error', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/brief/evaluate': ok({
        state: 'success',
        ready: true,
        missing: [],
        questions: [],
        ungroundedFacts: [],
        topics: RADAR.topics,
      }),
      'POST /content-intelligence/brief/draft': ok({
        outcome: 'insufficient',
        questions: [QUESTIONS[3]],
      }),
    });
    await renderTab();
    await fillEverything();
    await click(screen.getByRole('button', { name: 'Проверить бриф' }));
    await click(screen.getByRole('button', { name: 'Создать черновик' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      document.querySelector('[data-voice-brief-question="disagreement"]')
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Создать черновик' }).disabled
    ).toBe(true);
  });

  test('a refusal keeps its code and the sentence the server wrote', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/brief/evaluate': refusal(422, {
        code: 'BRIEF_FACT_UNGROUNDED',
        message:
          'Факт ссылается на память рабочего пространства, но такого факта здесь нет.',
      }),
    });
    await renderTab();
    await fillEverything();
    await click(screen.getByRole('button', { name: 'Проверить бриф' }));

    expect(screen.getByRole('alert').textContent).toContain(
      'BRIEF_FACT_UNGROUNDED'
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'такого факта здесь нет'
    );
    // Nothing typed is lost to a refusal.
    expect(document.querySelector('[name="brief-thesis"]').value).toBe(
      'Поставщика надо было менять раньше.'
    );
  });

  test('a refusal by an unknown id names which fact failed, not just that one did', async () => {
    // With more than one fact in the brief, "such a fact does not exist"
    // alone leaves a person guessing which of them it was about. The server
    // puts the failing statement in `subject`; the screen must print it.
    serve({
      ...baseTable(),
      'POST /content-intelligence/brief/evaluate': refusal(422, {
        code: 'BRIEF_FACT_UNGROUNDED',
        message:
          'Факт ссылается на память рабочего пространства, но такого факта здесь нет.',
        subject: 'Просрочки упали на 40% за месяц.',
      }),
    });
    await renderTab();
    await fillEverything();
    await click(
      screen.getByRole('button', { name: 'Добавить факт' })
    );
    await type('brief-fact-1', 'Второе, никак не связанное утверждение.');
    await click(screen.getByRole('button', { name: 'Проверить бриф' }));

    const alert = screen.getByRole('alert').textContent;
    expect(alert).toContain('такого факта здесь нет');
    // The subject names the fact that actually failed — the first one, not
    // the second, which is what a bare code-and-message pair could not say.
    expect(alert).toContain('Просрочки упали на 40% за месяц.');
  });
});

describe('the tab prepares text and reaches nothing else', () => {
  test('the draft is a post in DRAFT, opened in the product own editor', () => {
    const container = code('container');
    // The rule `docs/product/migration-map.md` states, checked on imports and
    // calls rather than on words.
    expect(container).not.toMatch(/PostsService|providers\//u);
    expect(container).not.toMatch(/\.(?:publish|schedule|deliver|send)\s*\(/u);
    expect(container).toMatch(/add\.edit\.modal/u);
  });

  test('the refusal reading is the section own, not a second copy of it', () => {
    // A second table of what a 403 means is how two tabs of one section start
    // disagreeing about it.
    expect(code('adapter')).toMatch(/from '\.\/voice-materials\.adapter'/u);
    expect(code('adapter')).not.toMatch(/VOICE_ERROR_CODES\s*\[/u);
  });

  test('the payload drops what was never typed', () => {
    const empty = adapter.buildBriefPayload(adapter.emptyBrief());
    expect(empty).toEqual({});

    const partial = adapter.buildBriefPayload({
      ...adapter.emptyBrief(),
      thesis: '  Тезис.  ',
      facts: [
        { statement: '  Факт.  ', sourceUrl: '' },
        { statement: '', sourceUrl: 'https://example.org' },
      ],
    });
    expect(partial).toEqual({ thesis: 'Тезис.', facts: [{ statement: 'Факт.' }] });
  });

  test('an answer that lost its questions does not read as a finished brief', () => {
    // The gate reads `questions.length === 0`, so a malformed answer must not
    // unlock the draft over a brief nobody checked.
    const before = adapter.readBrief({ questions: QUESTIONS, topics: [] });
    const after = adapter.readBrief({ topics: [] }, before);
    expect(after.questions).toHaveLength(QUESTIONS.length);
  });
});
