'use strict';

/**
 * Итог ресерча «сделали за вас» на экране входа (вариант 1, выбран владельцем
 * 13.09.2026; `content-factory-next-75xn.18`, `.19`).
 *
 * Дано: строки с вердиктами и две поправки. Ожидается: поправки видны прямо в
 * мысли (старое зачёркнуто, новое выделено), у каждой «Вернуть моё», сводка
 * одной строкой, найденное отмечено заранее, «Оставить мои числа» рядом с
 * «Продолжить с правками». Ключи, а не текст, уходят обратно.
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

const { cleanup, fireEvent, render, screen, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/intake';
const { ResearchOutcome } = loadTypeScriptModule(`${base}/intake.research.tsx`);

const THOUGHT =
  'Исландский эксперимент охватил 25 тысяч человек, длился десять лет, производительность выросла на 40%.';
const AUTONOMY = 'https://autonomy.work/portfolio/icelandsww/';

const facts = () => [
  {
    statement: 'Эксперимент охватил 25 тысяч человек', kind: 'own', origin: 'input', status: 'conflicting',
    selected: false, factKey: 'own:a', sourceUrl: AUTONOMY, quote: 'The trials involved 2,500 workers',
    note: 'Доклад называет 2 500 участников.', correction: { original: '25 тысяч', replacement: 'около 2 500' },
  },
  {
    statement: 'Эксперимент охватил около 2 500 человек', kind: 'own', origin: 'search', status: 'confirmed',
    selected: true, factKey: 'ev-1:fix:1', sourceUrl: AUTONOMY, quote: 'The trials involved 2,500 workers',
    note: 'Доклад называет 2 500 участников.', correction: { original: '25 тысяч', replacement: 'около 2 500' },
  },
  {
    statement: 'Производительность выросла на 40%', kind: 'own', origin: 'input', status: 'unverified',
    factKey: 'own:c', note: 'Числа в источниках нет.',
  },
  {
    statement: 'Сокращение без потери производительности подтверждается', kind: 'own', origin: 'input', status: 'confirmed',
    factKey: 'own:d', sourceUrl: 'https://www.bbc.com/news/1', quote: 'about 86% of the working population', note: 'BBC: 86% получили право.',
  },
  {
    statement: 'Производительность сохранилась или выросла', kind: 'found', origin: 'search', status: 'confirmed',
    selected: true, factKey: 'ev-2:x', sourceUrl: 'https://theconversation.com/a', quote: 'Productivity remained the same or improved',
  },
];
const corrections = (accepted = true) => [
  { factKey: 'ev-1:fix:1', original: '25 тысяч', replacement: 'около 2 500', sourceUrl: AUTONOMY, quote: 'The trials involved 2,500 workers', note: 'Доклад называет 2 500 участников.', accepted },
];
const summary = { confirmed: 1, conflicting: 1, unverified: 1, found: 1, sources: 8, encyclopedic: 1 };

const renderOutcome = (overrides = {}) => {
  const calls = { toggleCorrection: [], toggleFound: [], continue: [] };
  render(
    React.createElement(ResearchOutcome, {
      locale: 'ru',
      level: 'standard',
      input: THOUGHT,
      inputKind: 'thought',
      facts: facts(),
      corrections: corrections(),
      summary,
      pending: true,
      onToggleCorrection: (key) => calls.toggleCorrection.push(key),
      onToggleFound: (key, selected) => calls.toggleFound.push([key, selected]),
      onContinue: (mode) => calls.continue.push(mode),
      ...overrides,
    })
  );
  return calls;
};

afterEach(cleanup);

describe('итог ресерча «сделали за вас»', () => {
  test('поправка видна в мысли, сводка одной строкой, уровень и источники подписаны', () => {
    renderOutcome();
    const thought = document.querySelector('[data-intake-research-thought]');
    expect(thought.querySelector('[data-intake-correction="struck"]').textContent).toBe('25 тысяч');
    expect(thought.querySelector('[data-intake-correction="replacement"]').textContent).toBe('около 2 500');
    expect(thought.textContent).toContain('длился десять лет');

    const summaryRow = document.querySelector('[data-intake-research-summary]');
    expect(summaryRow.textContent).toContain('1 подтвердилось');
    expect(summaryRow.textContent).toContain('1 поправили по источникам');
    expect(summaryRow.textContent).toContain('1 проверить нечем');
    expect(document.querySelector('[data-intake-research-level="standard"]').textContent).toBe(
      'стандартный · 8 источников, 1 энциклопедия'
    );
  });

  test('строки: расходится с кнопкой «Вернуть моё», подтверждено с цитатой и адресом, «проверить нечем» со словами автора; поправка не дублируется строкой', () => {
    const calls = renderOutcome();
    const rows = [...document.querySelectorAll('[data-intake-research-claims] > li')];
    expect(rows.map((row) => row.getAttribute('data-intake-claim-status'))).toEqual([
      'conflicting',
      'unverified',
      'confirmed',
    ]);
    expect(rows[0].textContent).toContain('25 тысяч → около 2 500.');
    expect(rows[0].querySelector('[data-intake-claim-quote]').textContent).toBe('«The trials involved 2,500 workers»');
    expect(within(rows[0]).getByRole('link', { name: 'источник: autonomy.work' })).toBeTruthy();
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Вернуть моё' }));
    expect(calls.toggleCorrection).toEqual(['ev-1:fix:1']);
    expect(rows[1].textContent).toContain('Числа в источниках нет.');
    expect(within(rows[2]).getByRole('link', { name: 'источник: bbc.com' })).toBeTruthy();
  });

  test('снятая поправка: слова остаются с пунктиром, кнопка зовёт принять, «Оставить мои числа» пропадает', () => {
    renderOutcome({ corrections: corrections(false) });
    expect(document.querySelector('[data-intake-correction="kept"]').textContent).toBe('25 тысяч');
    expect(screen.getByRole('button', { name: 'Принять поправку' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Оставить мои числа' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeTruthy();
  });

  test('найденное отмечено заранее, снимается галочкой по ключу; две кнопки продолжения отдают режим', () => {
    const calls = renderOutcome();
    const found = document.querySelector('[data-intake-research-found]');
    const box = within(found).getByRole('checkbox');
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(calls.toggleFound).toEqual([['ev-2:x', false]]);

    fireEvent.click(screen.getByRole('button', { name: 'Продолжить с правками' }));
    fireEvent.click(screen.getByRole('button', { name: 'Оставить мои числа' }));
    expect(calls.continue).toEqual(['with-fixes', 'keep-mine']);
  });

  test('после продолжения кнопок нет, а галочки становятся значками', () => {
    renderOutcome({ pending: false });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.querySelector('[data-intake-research-found]')).not.toBeNull();
  });
});
