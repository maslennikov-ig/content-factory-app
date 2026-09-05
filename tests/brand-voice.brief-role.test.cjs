/**
 * The brief tab shows the role before a click, not after one.
 *
 * `content-factory-next-fn33.90.7`: the roles walk of 05.09.2026 found
 * «Проверить бриф», «Добавить факт» and «Сохранить факт» live for a `USER`,
 * each answering 403 only once pressed. The owner's rule is «the user looks,
 * the editor writes», and the screen has to say so up front — the same way the
 * archive does (`fn33.90.8`), from the same `writeRightFromRole`.
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

const { render, screen, cleanup, act } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const FILE = 'apps/frontend/src/components/brand-voice/voice-brief.container.tsx';

jest.mock('react-hotkeys-hook', () => ({ useHotkeys: () => {} }), {
  virtual: true,
});

const container = loadTypeScriptModule(FILE);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const TABLE = {
  'GET /integrations/list': ok({ integrations: [] }),
  'GET /content-intelligence/brief/radar': ok({
    state: 'default',
    ready: false,
    missing: ['thesis'],
    questions: [{ field: 'thesis', question: 'Что именно вы утверждаете?' }],
    ungroundedFacts: [],
    topics: [],
  }),
  'GET /content-intelligence/facts': ok({ facts: [] }),
};

const renderTab = async (role) => {
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const answer = TABLE[`${method} ${url}`];
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return answer;
  };
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
            React.createElement(container.VoiceBriefContainer)
          )
        )
      )
    );
  });
  await act(async () => {});
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('fn33.90.7 — бриф читают все, проверяет редактор', () => {
  test('Пользователю кнопки не нажимаются, поля закрыты, объяснение названо', async () => {
    await renderTab('USER');

    const check = screen.getByRole('button', { name: 'Проверить бриф' });
    const addFact = screen.getByRole('button', { name: 'Добавить факт' });
    const saveFact = screen.getByRole('button', { name: 'Сохранить факт' });
    expect(check.disabled).toBe(true);
    expect(addFact.disabled).toBe(true);
    expect(saveFact.disabled).toBe(true);

    const thesis = document.querySelector('[name="brief-thesis"]');
    expect(thesis).not.toBeNull();
    // A native `<fieldset disabled>` closes every field inside it; the
    // property on the field itself reflects only its own attribute.
    expect(thesis.closest('fieldset').disabled).toBe(true);

    const note = document.querySelector('[data-content-read-only="brief"]');
    expect(note).not.toBeNull();
    expect(note.getAttribute('data-content-read-only-refusal')).toBe('role');
    expect(check.getAttribute('aria-describedby')).toBe(note.id);
    expect(note.textContent).toContain('редактор или администратор');
    expect(note.textContent).not.toContain('владелец');
  });

  test.each([['EDITOR'], ['ADMIN']])('%s проверяет бриф, объяснения нет', async (role) => {
    await renderTab(role);
    expect(screen.getByRole('button', { name: 'Проверить бриф' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Добавить факт' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Сохранить факт' }).disabled).toBe(false);
    expect(document.querySelector('[data-content-read-only="brief"]')).toBeNull();
  });

  test('право читается общей функцией, а не своим списком ролей', () => {
    const source = fs.readFileSync(path.join(root, FILE), 'utf8');
    expect(source).toContain('writeRightFromRole');
    expect(source).not.toMatch(/role\s*===\s*'(ADMIN|EDITOR|USER)'/u);
  });
});
