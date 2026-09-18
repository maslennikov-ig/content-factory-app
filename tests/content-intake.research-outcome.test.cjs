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
      continueAbove: true,
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
    expect(summaryRow.textContent).not.toContain('проверить нечем');
    expect(document.querySelector('[data-intake-research-level="standard"]').textContent).toBe(
      'стандартный · 8 источников, 1 энциклопедия'
    );
  });

  test('строки: расходится с кнопкой «Вернуть моё» и подтверждено с цитатой; неподтверждённое скрыто', () => {
    const calls = renderOutcome();
    const rows = [...document.querySelectorAll('[data-intake-research-claims] > li')];
    expect(rows.map((row) => row.getAttribute('data-intake-claim-status'))).toEqual([
      'conflicting',
      'confirmed',
    ]);
    expect(rows[0].textContent).toContain('25 тысяч → около 2 500.');
    expect(rows[0].querySelector('[data-intake-claim-quote]').textContent).toBe('«The trials involved 2,500 workers»');
    expect(within(rows[0]).getByRole('link', { name: 'источник: autonomy.work' })).toBeTruthy();
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Вернуть моё' }));
    expect(calls.toggleCorrection).toEqual(['ev-1:fix:1']);
    expect(document.body.textContent).not.toContain('Числа в источниках нет.');
    expect(within(rows[1]).getByRole('link', { name: 'источник: bbc.com' })).toBeTruthy();
  });

  test('снятая поправка: слова остаются с пунктиром, кнопка зовёт принять, «Оставить мои числа» пропадает', () => {
    renderOutcome({ corrections: corrections(false) });
    expect(document.querySelector('[data-intake-correction="kept"]').textContent).toBe('25 тысяч');
    expect(screen.getByRole('button', { name: 'Принять поправку' })).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Оставить мои числа' })).toEqual([]);
    expect(screen.getAllByRole('button', { name: 'Продолжить' })).toHaveLength(2);
  });

  test('найденное отмечено заранее, снимается галочкой по ключу; две кнопки продолжения отдают режим', () => {
    const calls = renderOutcome();
    const found = document.querySelector('[data-intake-research-found]');
    const box = within(found).getByRole('checkbox');
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(calls.toggleFound).toEqual([['ev-2:x', false]]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Продолжить с правками' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Оставить мои числа' })[1]);
    expect(calls.continue).toEqual(['with-fixes', 'keep-mine']);
  });

  /*
    Владелец, 18.09.2026: «кнопка находится в самом низу. Может быть, её имеет
    смысл продублировать и сверху». Ряд один, монтируется дважды, и список
    источников несёт только нижний — иначе длинная строка адресов повторяется.
  */
  test('ряд продолжения стоит и над находками, и под ними, а источники — один раз', () => {
    const calls = renderOutcome();
    const rows = [...document.querySelectorAll('[data-intake-research-row]')];
    expect(rows.map((row) => row.getAttribute('data-intake-research-row'))).toEqual([
      'above',
      'below',
    ]);
    const claims = document.querySelector('[data-intake-research-claims]');
    const { DOCUMENT_POSITION_PRECEDING, DOCUMENT_POSITION_FOLLOWING } = dom.window.Node;
    expect(rows[0].compareDocumentPosition(claims) & DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows[1].compareDocumentPosition(claims) & DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(rows[0].textContent).not.toContain('autonomy.work');
    expect(rows[1].textContent).toContain('autonomy.work');

    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Продолжить с правками' }));
    expect(calls.continue).toEqual(['with-fixes']);
  });

  /*
    Тот же итог рисует страница заготовки, и там находки стоят коротким
    блоком: ряд там один, и решает это вызывающий, а не компонент.
  */
  test('без просьбы вызывающего верхнего ряда нет, а нижний на месте', () => {
    renderOutcome({ continueAbove: false });
    const rows = [...document.querySelectorAll('[data-intake-research-row]')];
    expect(rows.map((row) => row.getAttribute('data-intake-research-row'))).toEqual(['below']);
    expect(screen.getAllByRole('button', { name: 'Продолжить с правками' })).toHaveLength(1);
  });

  /*
    «После нажатия „Продолжить с правками“ все как будто немножко подвисло»
    (владелец, 18.09.2026): ход занимает место ряда, а не появляется экраном
    ниже. Кнопок в это время нет — нажать второй раз нечего.
  */
  test('во время второго прохода на месте ряда стоит строка хода со словом шага', () => {
    renderOutcome({ pending: false, working: true, workingLabel: 'Пишем…' });
    const lines = [...document.querySelectorAll('[data-intake-research-working]')];
    expect(lines.map((line) => line.getAttribute('data-intake-research-working'))).toEqual([
      'above',
      'below',
    ]);
    expect(lines[0].textContent).toContain('Пишем…');
    expect(lines[0].getAttribute('aria-live')).toBe('polite');
    expect(screen.queryAllByRole('button', { name: 'Продолжить с правками' })).toEqual([]);
    expect(document.querySelector('[data-intake-research-row]')).toBeNull();
  });

  test('после продолжения кнопок нет, а галочки становятся значками', () => {
    renderOutcome({ pending: false });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.querySelector('[data-intake-research-working]')).toBeNull();
    expect(document.querySelector('[data-intake-research-found]')).not.toBeNull();
  });
});
