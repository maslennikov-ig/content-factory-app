'use strict';

/**
 * Четверо ворот перед формой входа, и порядок между ними.
 *
 * `content-factory-next-tu3k.4`, Given/When/Then №5 плана: «Написать»
 * выключено с текстом «Выберите канал» и запроса нет; при недоступном ИИ
 * вместо формы стоит объяснение, и запроса тоже нет.
 *
 * Проверяется не только то, что нарисовалось, но и то, чего не случилось: ни
 * одного `POST /content-intelligence/intake`. Дверь, которая всё равно
 * стучится, а отказ показывает потом, — это ровно тот дефект, который в этом
 * разделе уже чинили однажды (`content-factory-next-fn33.90.8`).
 */

const React = require('react');
const { JSDOM } = require('jsdom');

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

const { act, cleanup, render, screen } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/intake';
const container = loadTypeScriptModule(`${base}/intake.container.tsx`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

// Общий помощник запросов отдаёт отказу копию ответа, поэтому подделка
// обязана уметь `clone()` так же, как настоящий `Response`.
const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const TELEGRAM = {
  id: 'int-tg',
  name: 'Мой канал',
  identifier: 'telegram',
  picture: '',
  disabled: false,
  inBetweenSteps: false,
  contentLanguage: 'ru',
};

let calls = [];

const serve = (table) => {
  calls = [];
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    calls.push({ url, method });
    const answer = table[`${method} ${url}`];
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return typeof answer === 'function' ? answer() : answer;
  };
};

const table = ({ allowance, integrations = [TELEGRAM] }) => ({
  'GET /integrations/list': ok({ integrations }),
  'GET /settings/ai/allowance': ok(allowance),
});

const open = async ({ role = 'ADMIN', ...rest }) => {
  serve(table(rest));
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          userContext.UserContext.Provider,
          { value: { role } },
          React.createElement(
            variables.VariableContextComponent,
            { language: 'ru' },
            React.createElement(container.IntakeContainer, { surface: 'brief' })
          )
        )
      )
    );
  });
  /*
    Список каналов и остаток ИИ приходят разными тактами очереди: без
    настоящего таймера набор проверял бы кадр до ответа сервера и читал бы
    «нет каналов» там, где канал есть.
  */
  for (let tick = 0; tick < 20; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (calls.some((call) => call.url === '/integrations/list')) break;
  }
  await act(async () => {});
};

const panel = () => document.querySelector('[data-content-panel="intake"]');
const intakeCalls = () =>
  calls.filter((call) => call.url === '/content-intelligence/intake');

beforeAll(async () => {
  const i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized) {
    await new Promise((resolve) => i18n.on('initialized', resolve));
  }
  await i18n.loadLanguages(['en', 'ru']);
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

test('with an AI to call and a channel, the form is open and waits for words', async () => {
  await open({ allowance: { mode: 'included', remaining: 10, limit: 100, resetsAt: '2026-10-01T00:00:00.000Z' } });

  expect(panel().getAttribute('data-intake-state')).toBe('idle');
  expect(document.querySelector('[name="intake-input"]')).not.toBeNull();
  // Ничего ещё не написано, и кнопка говорит именно это.
  expect(
    document.querySelector('[data-intake-block-reason="input"]').textContent
  ).toBe('Напишите хотя бы пару слов');
  expect(intakeCalls()).toHaveLength(0);
});

test('no AI to call: the reason instead of the form, and not one request', async () => {
  await open({ allowance: { mode: 'unavailable' } });

  expect(panel().getAttribute('data-intake-state')).toBe('restricted');
  expect(document.querySelector('[name="intake-input"]')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Написать' })).toBeNull();
  expect(intakeCalls()).toHaveLength(0);
});

test('a USER reads the screen and writes nothing, and is told whom to ask', async () => {
  await open({
    role: 'USER',
    allowance: { mode: 'included', remaining: 10, limit: 100, resetsAt: '2026-10-01T00:00:00.000Z' },
  });

  expect(panel().getAttribute('data-intake-state')).toBe('read-only');
  const note = document.querySelector('[data-content-read-only]');
  expect(note).not.toBeNull();
  expect(note.getAttribute('data-content-read-only-refusal')).toBe('role');
  expect(note.textContent).toContain('редактор или администратор');
  // Экран виден целиком, но выключен: пустое место вместо кнопки ничего не
  // объясняет.
  expect(document.querySelector('fieldset').disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Сделать заготовку' }).disabled).toBe(true);
  expect(intakeCalls()).toHaveLength(0);
});

test('a workspace with no usable channel still makes a piece, and offers no channel', async () => {
  await open({
    integrations: [{ ...TELEGRAM, disabled: true }],
    allowance: { mode: 'included', remaining: 10, limit: 100, resetsAt: '2026-10-01T00:00:00.000Z' },
  });

  // С волны «заготовка и адаптации» (решение владельца 06.09.2026) канал
  // необязателен: без единого канала заготовка всё равно делается, кнопка
  // читается «Сделать заготовку», а выбирать некого.
  expect(panel().getAttribute('data-intake-state')).toBe('idle');
  expect(screen.getByRole('button', { name: 'Сделать заготовку' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Мой канал' })).toBeNull();
  expect(intakeCalls()).toHaveLength(0);
});

test('a channel still half-connected does not count as somewhere to write', async () => {
  await open({
    integrations: [{ ...TELEGRAM, inBetweenSteps: true }],
    allowance: { mode: 'included', remaining: 10, limit: 100, resetsAt: '2026-10-01T00:00:00.000Z' },
  });

  expect(panel().getAttribute('data-intake-state')).toBe('idle');
  expect(screen.queryByRole('button', { name: 'Мой канал' })).toBeNull();
});

test('the door that says nothing at all is not read as a refusal', async () => {
  // `unknown` — дверь не ответила. Про подключение мы ничего не узнали, и
  // утверждать «ИИ недоступен» было бы неправдой.
  await open({ allowance: null });

  expect(panel().getAttribute('data-intake-state')).toBe('idle');
});
