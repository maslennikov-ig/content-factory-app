'use strict';

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, within } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { agentCopy } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const localeRoot = path.join(__dirname, '../libraries/react-shared-libraries/src/translation/locales');
const locales = ['ar', 'bn', 'de', 'en', 'es', 'fr', 'he', 'it', 'ja', 'ka_ge', 'ko', 'pt', 'ru', 'tr', 'vi', 'zh'];
let locale = 'ru';
const translationMock = {
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key, fallback) => require(path.join(localeRoot, locale, 'translation.json'))[key] || fallback },
};
const { SelectionCard } = loadWithMocks('apps/frontend/src/components/agents/agent.selection-card.tsx', translationMock);
const before = `Исходный абзац.\n\n${'Очень длинный исходный текст. '.repeat(30)}Конец исходного текста.`;
const after = `Новое начало.\n\n${'Предлагаемый текст с подробностями. '.repeat(40)}Конец предложения <script>alert(1)</script>.`;
const { AdaptationReview } = loadWithMocks('apps/frontend/src/components/content-intelligence/pieces/adaptation-review.tsx', {
  ...translationMock,
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => async () => ({
    ok: true,
    json: async () => ({
      version: 'adaptation-review/v3', originalText: before, text: after, title: 'Тест', token: 'synthetic-local-only',
      summary: '', slopBefore: 1, slopAfter: 0, verdict: 'review',
      changes: [{ id: 'change-1', excerpt: before, replacement: after, why: 'Проверяем язык подписи.', basket: 'show' }],
    }),
  }) },
});
const question = {
  cardId: 'proposal-1', kind: 'selection', text: 'Предлагаем изменить текст', answerKey: 'changeIds', canDecideForPerson: false,
  options: [{ id: 'change-1', label: 'Обновить текст', selected: true, status: 'show', source: null, preview: { before, after, reason: 'Сохранили все подробности.', target: 'text' } }],
};
const draw = (overrides = {}) => {
  const answers = [];
  const { container } = render(React.createElement(SelectionCard, { question, busy: false, onAnswer: data => answers.push(data), words: agentCopy[locale === 'ru' ? 'ru' : 'en'], ...overrides }));
  return { container, answers };
};
afterEach(() => { cleanup(); locale = 'ru'; });

test('the full exact before and after are visible before acceptance, preserving paragraphs and escaping markup', () => {
  const { container } = draw();
  const preview = container.querySelector('[data-review-change-preview]');
  expect(preview).not.toBeNull();
  expect(preview.querySelector('[data-review-before]').textContent).toBe(before);
  expect(preview.querySelector('[data-review-after]').textContent).toBe(after);
  expect(preview.textContent).toContain('Сохранили все подробности.');
  expect(preview.querySelector('script')).toBeNull();
  expect(preview.closest('[role="region"]').hidden).toBe(false);
  expect(preview.querySelector('[data-review-after]').className).toContain('whitespace-pre-wrap');
  expect(preview.querySelector('[data-review-after]').className).toContain('[overflow-wrap:anywhere]');
});

test('preview disclosure does not select or submit, collapse can be reversed while busy', () => {
  const { container, answers } = draw({ busy: true });
  const trigger = within(container).getByRole('button', { name: 'Было и предлагается' });
  expect(trigger.disabled).toBe(false);
  const region = document.getElementById(trigger.getAttribute('aria-controls'));
  act(() => fireEvent.click(trigger));
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(region.hidden).toBe(true);
  act(() => fireEvent.click(trigger));
  expect(region.hidden).toBe(false);
  expect(within(container).getByRole('checkbox').checked).toBe(true);
  expect(answers).toEqual([]);
});

test('acceptance still sends only selected ids, with no proposal text', () => {
  const { container, answers } = draw();
  act(() => fireEvent.click(within(container).getByRole('button', { name: 'Оставить выбранные · 1' })));
  expect(answers).toEqual([{ changeIds: ['change-1'] }]);
});

test.each(locales)('before/after preview labels exist in interface locale %s', (language) => {
  locale = language;
  const words = require(path.join(localeRoot, locale, 'translation.json'));
  for (const key of ['review_preview_before', 'review_preview_after', 'review_preview_summary']) expect(typeof words[key]).toBe('string');
  document.documentElement.dir = ['ar', 'he'].includes(locale) ? 'rtl' : 'ltr';
  const { container } = draw();
  expect(within(container).getByRole('button', { name: words.review_preview_summary })).toBeTruthy();
  expect(within(container).getByText(words.review_preview_before)).toBeTruthy();
  expect(within(container).getByText(words.review_preview_after)).toBeTruthy();
});

test.each(locales)('manual review uses native interface locale %s for the same before/after labels', async (language) => {
  locale = language;
  const words = require(path.join(localeRoot, locale, 'translation.json'));
  const { container } = render(React.createElement(AdaptationReview, {
    pieceId: 'synthetic-piece', adaptationId: 'synthetic-adaptation', workspaceId: 'synthetic-workspace',
    // The older screen words remain Russian; new labels follow the native UI locale.
    locale: 'ru', onAccepted: () => {},
  }));
  await act(async () => fireEvent.click(within(container).getByRole('button', { name: 'Убрать следы ИИ' })));
  const preview = container.querySelector('[data-review-change-preview]');
  expect(preview).not.toBeNull();
  expect(within(preview).getByText(words.review_preview_before)).toBeTruthy();
  expect(within(preview).getByText(words.review_preview_after)).toBeTruthy();
  expect(preview.querySelector('[data-review-before]').textContent).toBe(before);
  expect(preview.querySelector('[data-review-after]').textContent).toBe(after);
});

test('the chat and manual review use the same pure before/after component', () => {
  for (const relative of ['agents/agent.selection-card.tsx', 'content-intelligence/pieces/adaptation-review.tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '../apps/frontend/src/components', relative), 'utf8');
    expect(source).toContain('<LocalizedReviewChangePreview');
  }
});
