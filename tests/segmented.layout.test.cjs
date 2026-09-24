'use strict';

/**
 * `Segmented` shares its width evenly and a «?» does not squeeze an item
 * (`content-factory-next-97dq.88`, fifteenth walk, shot A1_1: «Свой текст»
 * was the narrowest cell of «Свой текст / Чужой пост / Задание»).
 *
 * JSDOM lays nothing out, so the test holds the geometry contract the
 * browser acts on: equal `1fr` columns, the option filling its cell, the
 * hint in a cell of its own that never shrinks.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render, screen, within, fireEvent } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { Segmented } = loadTypeScriptModule('apps/frontend/src/components/ui/segmented.tsx');
const h = React.createElement;

afterEach(cleanup);

const classes = (element) => element.className.split(/\s+/);

test('options share the width evenly by default', () => {
  render(
    h(Segmented, {
      label: 'Вид',
      value: 'a',
      onChange: () => {},
      options: [
        { value: 'a', label: 'Карточки' },
        { value: 'b', label: 'Таблица целиком' },
      ],
    })
  );
  const group = screen.getByRole('radiogroup', { name: 'Вид' });
  expect(group.getAttribute('data-segmented-layout')).toBe('even');
  expect(classes(group)).toEqual(
    expect.arrayContaining(['inline-grid', 'max-w-full', 'auto-cols-fr', 'grid-flow-col'])
  );
  for (const radio of within(group).getAllByRole('radio')) {
    expect(classes(radio)).toEqual(expect.arrayContaining(['w-full', 'justify-center']));
  }
});

test('a «?» sits in its own cell and does not squeeze the option (intake picker)', () => {
  const onChange = jest.fn();
  render(
    h(Segmented, {
      label: 'Что это',
      value: 'thought',
      onChange,
      options: [
        { value: 'thought', label: 'Свой текст', hint: { label: 'Подсказка: свой текст', text: 'Мысль' } },
        { value: 'foreign_post', label: 'Чужой пост', hint: { label: 'Подсказка: чужой пост', text: 'Пост' } },
        { value: 'instruction', label: 'Задание', hint: { label: 'Подсказка: задание', text: 'Задание' } },
      ],
    })
  );
  const group = screen.getByRole('radiogroup', { name: 'Что это' });
  // Columns on a wide screen, a full-width column of rows on a phone.
  expect(classes(group)).toEqual(
    expect.arrayContaining(['grid', 'auto-cols-fr', 'grid-flow-row', 'sm:inline-grid', 'sm:grid-flow-col'])
  );
  expect(classes(group)).not.toContain('flex-wrap');
  const cells = group.querySelectorAll('[data-segmented-hint]');
  expect(cells).toHaveLength(3);
  for (const cell of cells) {
    expect(classes(cell)).toEqual(expect.arrayContaining(['flex', 'items-stretch']));
    const radio = within(cell).getByRole('radio');
    expect(classes(radio)).toEqual(expect.arrayContaining(['flex-1', 'justify-center']));
    const mark = cell.querySelector('[data-segmented-hint-mark]');
    expect(classes(mark)).toContain('shrink-0');
    expect(within(mark).getByRole('button').getAttribute('aria-label')).toMatch(/^Подсказка: /);
  }
  fireEvent.click(screen.getByRole('radio', { name: 'Чужой пост' }));
  expect(onChange).toHaveBeenCalledWith('foreign_post');
});

test('`wrap` keeps a long set wrapping on a narrow screen', () => {
  render(
    h(Segmented, {
      label: 'Варианты',
      value: '1',
      onChange: () => {},
      wrap: true,
      options: ['1', '2', '3', '4', '5'].map((value) => ({ value, label: `Вариант ${value}` })),
    })
  );
  const group = screen.getByRole('radiogroup', { name: 'Варианты' });
  expect(group.getAttribute('data-segmented-layout')).toBe('wrap');
  expect(classes(group)).toEqual(expect.arrayContaining(['inline-flex', 'max-w-full', 'flex-wrap']));
  // Items keep their own width: a wrapped row does not stretch (review F8).
  for (const radio of within(group).getAllByRole('radio')) {
    expect(classes(radio)).not.toContain('grow');
    expect(classes(radio)).not.toContain('w-full');
  }
});

test('long sets on narrow screens take `wrap`: adaptation kinds and the channels filter (review F4)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const kinds = read('apps/frontend/src/components/content-intelligence/pieces/piece-channel-tab.tsx');
  expect(kinds).toMatch(/<Segmented<AdaptationKindV1>[\s\S]*?\bwrap\b[\s\S]*?data-piece-kind-choice/);
  const channels = read('apps/frontend/src/components/channels/channels-screen.tsx');
  expect(channels).toMatch(/label=\{t\.filter\}[\s\S]*?options=\{filters\}\s*wrap\s*\/>/);
  expect(channels).not.toMatch(/overflow-x-auto">\s*<Segmented/);
});
