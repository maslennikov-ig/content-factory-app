'use strict';

/**
 * Архив под ролью (`content-factory-next-fn33.90.8`).
 *
 * Живой прогон 05.09.2026, роль USER: «Занести текст» открывала форму целиком,
 * человек вводил заголовок и текст, нажимал «Занести» — и получал 403 на
 * `POST /content-intelligence/materials/archive/import`. Диалог отказа был
 * верным, но приходил после работы, а не вместо неё.
 *
 * Экран умел показывать «раздел открыт на чтение» и раньше — он только ждал
 * первого отказа, чтобы это узнать. Роль ждать незачем: она лежит в сеансе, а
 * решает её та же функция, что и на сервере. Предел тарифа по-прежнему
 * узнаётся из ответа: в браузере его не сосчитать.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/content?tab=archive',
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

const FILE =
  'apps/frontend/src/components/content-intelligence/content-archive.container.tsx';

const container = loadTypeScriptModule(FILE);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

const ARCHIVE = Object.freeze({
  state: 'default',
  materials: [
    {
      id: 'piece-1',
      code: 'cnt-01',
      title: 'Почему мы поменяли поставщика подшипников',
      format: 'длинный',
      postCount: 0,
      queuedCount: 0,
      draftCount: 2,
      date: '04.09.26',
      voiceVersion: 'v3',
      layer: 'MADE_HERE',
      platforms: ['telegram'],
      contentContextSnapshotId: null,
      origin: null,
    },
  ],
  page: 0,
  limit: 20,
  total: 1,
  counts: { MADE_HERE: 1, IMPORTED_PRE_PRODUCT: 0, PUBLISHED_ELSEWHERE: 0 },
});

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const renderArchive = async (role) => {
  global.fetch = async () => ok(ARCHIVE);
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
            React.createElement(container.ContentArchiveContainer)
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

describe('fn33.90.8 — архив открыт на чтение всем, заносит редактор', () => {
  test('Пользователю кнопка не нажимается, а объяснение стоит рядом и названо', async () => {
    await renderArchive('USER');

    const button = screen.getByRole('button', { name: 'Занести текст' });
    expect(button.disabled).toBe(true);

    const note = document.querySelector('[data-content-read-only="archive"]');
    expect(note).not.toBeNull();
    expect(note.getAttribute('data-content-read-only-refusal')).toBe('role');
    expect(button.getAttribute('aria-describedby')).toBe(note.id);

    // Роли «владелец» в продукте нет, и объяснение её не называет.
    expect(note.textContent).toContain('редактор или администратор');
    expect(note.textContent).not.toContain('владелец');

    // Список остаётся читаемым: чтение архива роли не несёт.
    expect(document.body.textContent).toContain('подшипников');
  });

  test.each([['EDITOR'], ['ADMIN']])(
    '%s заносит текст, и объяснения нет',
    async (role) => {
      await renderArchive(role);

      expect(
        screen.getByRole('button', { name: 'Занести текст' }).disabled
      ).toBe(false);
      expect(
        document.querySelector('[data-content-read-only="archive"]')
      ).toBeNull();
    }
  );

  test('право читается общей функцией, а не своим списком ролей', () => {
    const source = fs.readFileSync(path.join(root, FILE), 'utf8');
    expect(source).toContain('writeRightFromRole');
    expect(source).not.toMatch(/role\s*===\s*'(ADMIN|EDITOR|USER)'/u);
  });
});
