'use strict';

/**
 * Хранимая разметка адаптации и то, как её читает человек.
 *
 * `content-factory-next-97dq.4`, живой прогон 18.09.2026: тело адаптации
 * хранится с `**жирным**`, а страница заготовки печатала его как есть — человек
 * читал свой будущий пост со звёздочками посреди фразы.
 *
 * Здесь проверяется ровно то, чем формат отличается от библиотеки Markdown:
 * узнаётся один знак, ошибочная пара печатается буквально, переводы строк
 * остаются на месте, а HTML не собирается строкой.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/pieces';
const { formatStoredMarkup, hasStoredMarkup } = loadTypeScriptModule(
  `${base}/adaptation-markup.tsx`
);
const { AdaptationBody } = loadTypeScriptModule(`${base}/adaptation-body.tsx`);

afterEach(cleanup);

const draw = (text, props = {}) =>
  render(
    React.createElement(AdaptationBody, { locale: 'ru', text, ...props })
  );

describe('the formatter reads one mark and invents nothing', () => {
  test('a balanced pair on one line becomes a strong element', () => {
    const view = render(
      React.createElement('p', null, formatStoredMarkup('До **важного** после'))
    );
    expect(view.container.querySelector('strong').textContent).toBe('важного');
    expect(view.container.textContent).toBe('До важного после');
  });

  test.each([
    ['unclosed', 'Одна **звёздочка осталась'],
    ['broken by a line break', 'Начало **через\nстроку** конец'],
    ['empty', 'Пусто **** внутри'],
    ['a single star', 'Цена 5*5 и *акцент*'],
  ])('%s renders literally', (_name, text) => {
    const view = render(React.createElement('p', null, formatStoredMarkup(text)));
    expect(view.container.querySelector('strong')).toBeNull();
    expect(view.container.textContent).toBe(text);
  });

  test('several pairs and the tail survive in order', () => {
    const view = render(
      React.createElement(
        'p',
        null,
        formatStoredMarkup('**Раз** и **два**, дальше текст')
      )
    );
    expect(
      [...view.container.querySelectorAll('strong')].map((node) => node.textContent)
    ).toEqual(['Раз', 'два']);
    expect(view.container.textContent).toBe('Раз и два, дальше текст');
  });

  test('paragraphs and line breaks are left exactly as they came', () => {
    const text = 'Первый абзац.\n\nВторой **абзац**.\nСтрока.';
    const view = render(React.createElement('p', null, formatStoredMarkup(text)));
    expect(view.container.textContent).toBe(
      'Первый абзац.\n\nВторой абзац.\nСтрока.'
    );
  });

  test('markup is recognised without the formatter being run twice', () => {
    expect(hasStoredMarkup('нет разметки')).toBe(false);
    expect(hasStoredMarkup('есть **разметка**')).toBe(true);
    // A global regular expression keeps its index; the second question must
    // get the same answer as the first.
    expect(hasStoredMarkup('есть **разметка**')).toBe(true);
  });

  test('a text that looks like HTML stays text', () => {
    const view = render(
      React.createElement(
        'p',
        null,
        formatStoredMarkup('**<script>alert(1)</script>**')
      )
    );
    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.querySelector('strong').textContent).toBe(
      '<script>alert(1)</script>'
    );
  });
});

describe('the body shows the text, and the markup on request', () => {
  test('the toggle is a pressed-state button and swaps the two views', () => {
    draw('Строка с **выделением** внутри.');
    const toggle = screen.getByRole('button', { name: 'Показать разметку' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('strong')).toBeTruthy();
    expect(document.body.textContent).not.toContain('**');

    fireEvent.click(toggle);

    const pressed = screen.getByRole('button', { name: 'Скрыть разметку' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('strong')).toBeNull();
    expect(document.querySelector('article').textContent).toBe(
      'Строка с **выделением** внутри.'
    );
  });

  test('nothing to toggle, no toggle: a text without markup offers no button', () => {
    draw('Обычный текст без выделений.');
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('article').textContent).toBe(
      'Обычный текст без выделений.'
    );
  });

  test('the English label is the English label', () => {
    draw('A line with **emphasis** in it.', { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Show markup' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show markup' }));
    expect(screen.getByRole('button', { name: 'Hide markup' })).toBeTruthy();
  });

  test('the streaming draft keeps the marks the page finds it by', () => {
    draw('Текст **черновика**.', { draftId: 'adaptation-1' });
    const article = document.querySelector('article');
    expect(article.getAttribute('data-intake-draft')).toBe('true');
    expect(article.getAttribute('data-piece-draft-id')).toBe('adaptation-1');
    expect(article.querySelector('strong').textContent).toBe('черновика');
  });
});
