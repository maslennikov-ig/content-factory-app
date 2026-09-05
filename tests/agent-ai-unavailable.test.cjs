'use strict';

/**
 * `content-factory-next-fn33.153` — экран «Агент» в области, где ИИ не
 * подключён.
 *
 * На боевом прогоне 05.09.2026 (область без включённого лимита и без ключа)
 * экран здоровался и обещал работу: «Я могу запланировать публикацию одного
 * или нескольких постов … а также сгенерировать изображения и видео». При этом
 * уже на открытии уходил `POST /copilot/agent` и возвращал 503
 * `AI_SELECTED_CREDENTIAL_UNAVAILABLE`; ответ шёл через рантайм CopilotKit,
 * мимо общего обработчика отказов, и на экран не попадало ни слова. Человек
 * написал бы агенту и не понял, почему тот молчит.
 *
 * Проверяется решение до монтирования рантайма: пока звать модель нечем,
 * `CopilotKit` в дерево не попадает вовсе — значит, и запроса, который заведомо
 * упадёт, не уходит, — а на экране стоит та же строка, что говорит раздел
 * «Контент».
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/agents/new',
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

const GATE = 'apps/frontend/src/components/agents/agent.availability.tsx';
const CHAT = 'apps/frontend/src/components/agents/agent.chat.tsx';

const gate = loadTypeScriptModule(GATE);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const i18next = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/translation/i18next.ts'
).default;

const russian = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
    ),
    'utf8'
  )
);

/**
 * `content-factory-next-fn33.65`: общий помощник запроса отдаёт обработчику
 * отказов копию ответа, поэтому подделка обязана клонироваться как настоящий
 * `Response`.
 */
const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

let asked = [];

const serve = (allowance) => {
  asked = [];
  global.fetch = async (url, init = {}) => {
    asked.push(`${String(init.method || 'GET').toUpperCase()} ${url}`);
    if (String(url).endsWith('/settings/ai/allowance')) return ok(allowance);
    throw new Error(`no stub for ${url}`);
  };
};

const CHILD_MARK = 'рантайм помощника поднялся';

const renderGate = async () => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          variables.VariableContextComponent,
          { language: 'ru', backendUrl: 'http://backend' },
          React.createElement(
            gate.AgentAvailabilityGate,
            {},
            React.createElement('div', {}, CHILD_MARK)
          )
        )
      )
    );
  });
  await act(async () => {});
};

beforeAll(async () => {
  await i18next.changeLanguage('ru');
  await i18next.loadNamespaces('translation');
  i18next.addResourceBundle('ru', 'translation', russian, true, true);
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('экран «Агент» говорит, что ИИ не подключён', () => {
  test('без лимита и без ключа вместо приветствия стоит честная строка, и рантайм не поднимается', async () => {
    serve({ mode: 'unavailable' });
    await renderGate();

    expect(document.body.textContent).toContain(
      russian['ai_allowance_unavailable']
    );
    expect(document.body.textContent).toContain(
      russian['agent_ai_unavailable_title']
    );
    // Ни одного ребёнка: приветствие, поле ввода и сам рантайм не появляются.
    expect(document.body.textContent).not.toContain(CHILD_MARK);
    // Ни одного запроса к двери помощника: спрошена только квота, один раз.
    expect(asked.filter((call) => call.includes('/copilot'))).toEqual([]);
    expect(
      asked.filter((call) => call.includes('/settings/ai/allowance')).length
    ).toBe(1);
  });

  test('с включённым лимитом разговор открывается как раньше', async () => {
    serve({
      mode: 'included',
      used: 1,
      limit: 100,
      remaining: 99,
      resetsAt: '2026-10-01T00:00:00.000Z',
    });
    await renderGate();

    expect(document.body.textContent).toContain(CHILD_MARK);
    expect(document.body.textContent).not.toContain(
      russian['ai_allowance_unavailable']
    );
  });

  test('с ключом пространства разговор тоже открывается', async () => {
    serve({ mode: 'workspace_key' });
    await renderGate();

    expect(document.body.textContent).toContain(CHILD_MARK);
  });

  test('пока ответа нет, экран не утверждает ни того, ни другого', async () => {
    asked = [];
    let answer;
    const pending = new Promise((resolve) => {
      answer = resolve;
    });
    global.fetch = async (url) => {
      asked.push(url);
      // Дверь не отвечает в этом такте: состояние «проверяем».
      return pending;
    };
    await act(async () => {
      render(
        React.createElement(
          SWRConfig,
          { value: { provider: () => new Map(), dedupingInterval: 0 } },
          React.createElement(
            variables.VariableContextComponent,
            { language: 'ru', backendUrl: 'http://backend' },
            React.createElement(
              gate.AgentAvailabilityGate,
              {},
              React.createElement('div', {}, CHILD_MARK)
            )
          )
        )
      );
    });

    expect(document.body.textContent).not.toContain(CHILD_MARK);
    expect(document.body.textContent).not.toContain(
      russian['ai_allowance_unavailable']
    );
    expect(document.body.textContent).toContain(russian['agent_checking_ai']);

    // Дверь отвечает — и экран перестаёт «проверять», не оставляя за собой
    // висящего запроса.
    await act(async () => {
      answer(ok({ mode: 'workspace_key' }));
      await pending;
    });
    expect(document.body.textContent).toContain(CHILD_MARK);
  });
});

describe('решение принимается до рантайма помощника', () => {
  const source = fs.readFileSync(path.join(root, CHAT), 'utf8');

  test('CopilotKit стоит внутри проверки, а не рядом с ней', () => {
    expect(source).toContain('AgentAvailabilityGate');
    expect(source).toMatch(
      /<AgentAvailabilityGate>[\s\S]*?<CopilotKit/u
    );
  });

  test('честная строка та же, что в разделе «Контент», а не вторая её редакция', () => {
    const gateSource = fs.readFileSync(path.join(root, GATE), 'utf8');
    expect(gateSource).toContain('ai_allowance_unavailable');
  });
});
