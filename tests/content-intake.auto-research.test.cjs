'use strict';

/**
 * «Задание» ищет факты сам (`content-factory-next-kcxz.50`, живой прогон
 * 30.09.2026): «расскажем о вчерашней презентации OpenAI» без поиска не
 * проверить, и сервер по умолчанию тоже включает поиск для этого вида
 * входа. Полоса «Что вы присылаете» держит то же правило на экране — но
 * только пока человек ни разу не тронул флажок поиска сам. Тронул — своя
 * рука побеждает, в любую сторону, и дальше смена вида флажок не трогает.
 *
 * `IntakeContainer` рисуется по-настоящему вместе с настоящим `IntakeScreen`;
 * подменены только двери, которые сходили бы в сеть или в сессию —
 * `useFetch`, `useUser`, `useVariables`, `useT`, `useAssistantAvailability`.
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

const { act, cleanup, fireEvent, render } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const translate = (key, fallback, values) => {
  const template = fallback ?? key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    template
  );
};

const mocks = {
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => async () => ({
      ok: true,
      body: null,
      json: async () => ({}),
    }),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ language: 'ru', backendUrl: '', mcpUrl: '', mcpEnabled: false }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => translate,
  },
  '../../layout/user.context': {
    useUser: () => ({ role: 'ADMIN' }),
  },
  '../../agents/assistant-availability': {
    useAssistantAvailability: () => 'available',
  },
};

const { IntakeContainer } = loadWithMocks(
  'apps/frontend/src/components/content-intelligence/intake/intake.container.tsx',
  mocks
);

const draw = () =>
  render(React.createElement(IntakeContainer, { surface: 'brief' }));

const click = async (element) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

const kindOption = (label) =>
  Array.from(document.querySelectorAll('[role="radio"]')).find(
    (node) => node.textContent === label
  );

const researchCheckbox = () => document.querySelector('input[type="checkbox"]');

const researchLevelSelect = () =>
  Array.from(document.querySelectorAll('select')).find((node) =>
    Array.from(node.options).some((option) => option.value === 'standard')
  );

afterEach(cleanup);

describe('«Задание» turns the search on for you, unless you already decided', () => {
  test('picking «Задание» turns search on at level «standard»', async () => {
    draw();
    const checkbox = researchCheckbox();
    expect(checkbox.checked).toBe(false);

    await click(kindOption('Задание'));

    expect(researchCheckbox().checked).toBe(true);
    expect(researchLevelSelect().value).toBe('standard');
  });

  test('the auto-enabled search says so, and stops saying so once touched', async () => {
    draw();
    await click(kindOption('Задание'));
    expect(document.body.textContent).toContain('Включено для задания');
    expect(document.body.textContent).toContain('Для задания ищем сами');

    await click(researchCheckbox());
    expect(document.body.textContent).not.toContain('Включено для задания');
    expect(document.body.textContent).not.toContain('Для задания ищем сами');
  });

  test('a search the person turns on themselves never carries the auto badge', async () => {
    draw();
    await click(researchCheckbox());
    expect(document.body.textContent).not.toContain('Включено для задания');
  });

  test('leaving «Задание» turns the auto-enabled search back off', async () => {
    draw();
    await click(kindOption('Задание'));
    expect(researchCheckbox().checked).toBe(true);

    await click(kindOption('Свой текст'));
    expect(researchCheckbox().checked).toBe(false);
  });

  test('a search the person turned on stays on across kinds, including «Задание»', async () => {
    draw();
    await click(researchCheckbox());
    expect(researchCheckbox().checked).toBe(true);

    await click(kindOption('Задание'));
    expect(researchCheckbox().checked).toBe(true);

    await click(kindOption('Чужой пост'));
    expect(researchCheckbox().checked).toBe(true);
  });

  test('a search the person turned off stays off even for «Задание»', async () => {
    draw();
    await click(kindOption('Задание'));
    expect(researchCheckbox().checked).toBe(true);

    await click(researchCheckbox());
    expect(researchCheckbox().checked).toBe(false);

    await click(kindOption('Свой текст'));
    await click(kindOption('Задание'));
    expect(researchCheckbox().checked).toBe(false);
  });
});
