'use strict';

/**
 * The agent's selection and piece cards (`content-factory-next-kcxz.16`,
 * spec §6.2, canvas C).
 *
 * Selection: the rows `piece_create` suspends with at the research pause
 * (`tests/fixtures/agent-scenarios/piece-task-research.scenario.cjs`), the
 * product's defaults ticked, the answer in the shape the capability's
 * `resumeSchema` takes — `{ factKeys }` — or «Решите за меня». The rows are
 * the found-facts rows of the entry screen (`SelectionRows`), not a copy.
 *
 * Piece: the line in the chat says how many questions wait (D4, held in
 * `agent-screen.live-walk.test.cjs`); the panel that opens it carries
 * «Открыть на экране» to the piece page and renders the piece screen itself.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/new',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = path.resolve(__dirname, '..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const h = React.createElement;

const copy = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const selection = loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.selection-card.tsx'
);
const ru = copy.agentCopy.ru;
const en = copy.agentCopy.en;

afterEach(cleanup);

// The payload of the scenario, as the contract will hand it to the card.
const QUESTION = {
  // No `cardId` on the payload below: a card from before the id (review W2 F3).
  cardId: null,
  kind: 'selection',
  text: 'Отметьте факты, на которые опираемся',
  answerKey: 'factKeys',
  canDecideForPerson: true,
  options: [
    { id: 'f1', label: 'Руководитель проводит на созвонах 23 часа в неделю', selected: true, status: 'confirmed', source: 'hbr.org' },
    { id: 'f2', label: 'Половина созвонов без повестки', selected: false, status: 'unverified', source: null },
    { id: 'f3', label: 'Короткие созвоны продуктивнее', selected: true, status: 'confirmed', source: 'example.org' },
  ],
};

const renderCard = async (props = {}) => {
  const answers = [];
  await act(async () => {
    render(
      h(selection.SelectionCard, {
        question: QUESTION,
        busy: false,
        onAnswer: (data) => answers.push(data),
        words: ru,
        ...props,
      })
    );
  });
  const card = document.querySelector('[data-agent-card="selection"]');
  return { answers, card };
};

describe('the selection card', () => {
  test('shows every row with the product’s defaults ticked, source and status in words', async () => {
    const { card } = await renderCard();
    expect(card.getAttribute('aria-label')).toBe(`Выбор: ${QUESTION.text}`);
    const boxes = within(card).getAllByRole('checkbox');
    expect(boxes.map((box) => box.checked)).toEqual([true, false, true]);
    expect(boxes[1].getAttribute('aria-label')).toBe(`Взять: ${QUESTION.options[1].label}`);
    expect(card.textContent).toContain('hbr.org · подтверждено');
    expect(card.textContent).toContain('не подтверждено');
    expect(within(card).getByRole('button', { name: 'Оставить выбранные · 2' })).toBeTruthy();
  });

  test('answers with the ticked ids under the capability’s key, in row order', async () => {
    const { answers, card } = await renderCard();
    const boxes = within(card).getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(boxes[2]);
      fireEvent.click(boxes[1]);
    });
    const keep = within(card).getByRole('button', { name: 'Оставить выбранные · 2' });
    await act(async () => fireEvent.click(keep));
    expect(answers).toEqual([{ factKeys: ['f1', 'f2'] }]);
    // One answer: everything locks while it goes.
    for (const box of within(card).getAllByRole('checkbox')) expect(box.disabled).toBe(true);
  });

  test('nothing ticked goes on without the rows', async () => {
    const { answers, card } = await renderCard();
    const boxes = within(card).getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(boxes[0]);
      fireEvent.click(boxes[2]);
    });
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: 'Продолжить без них' }))
    );
    expect(answers).toEqual([{ factKeys: [] }]);
  });

  test('«Решите за меня» leaves the choice to the product', async () => {
    const { answers, card } = await renderCard();
    await act(async () =>
      fireEvent.click(within(card).getByRole('button', { name: /Решите за меня/ }))
    );
    expect(answers).toEqual([{ decideForPerson: true }]);
  });

  test('a busy chat holds the answer back', async () => {
    const { card } = await renderCard({ busy: true });
    for (const button of within(card).getAllByRole('button')) expect(button.disabled).toBe(true);
  });

  test('without «Решите за меня» on the payload there is no such button', async () => {
    const { card } = await renderCard({
      question: { ...QUESTION, canDecideForPerson: false },
    });
    expect(within(card).queryByRole('button', { name: /Решите за меня/ })).toBeNull();
  });

  test('an unknown status says nothing rather than its code', async () => {
    const { card } = await renderCard({
      question: {
        ...QUESTION,
        options: [{ id: 'c1', label: 'Убрать штамп', selected: true, status: 'rewrite-hint', source: null }],
      },
      words: en,
    });
    expect(card.textContent).not.toContain('rewrite-hint');
    expect(within(card).getByRole('button', { name: 'Keep the ticked · 1' })).toBeTruthy();
  });

  test('fact states and review changes speak the piece page’s words, in both languages', async () => {
    const intake = loadTypeScriptModule(
      'apps/frontend/src/components/content-intelligence/intake/intake.copy.ts'
    ).intakeCopy;
    const pieces = loadTypeScriptModule(
      'apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts'
    ).piecesCopy;
    expect(ru.selection.statuses).toEqual({
      confirmed: intake.ru.factVerified,
      unverified: intake.ru.factUnverified,
      conflicting: intake.ru.factConflicting,
      not_found: intake.ru.factNotFound,
      show: 'правка',
      silent: 'исправление опечатки',
    });
    expect(en.selection.statuses).toMatchObject({
      not_found: intake.en.factNotFound,
      show: 'change',
      silent: 'typo',
    });
    expect(pieces.ru.typoPrefix.toLowerCase()).toContain(ru.selection.statuses.silent);
    const { card } = await renderCard({
      question: {
        ...QUESTION,
        options: [
          { id: 'f9', label: 'Созвоны съедают треть недели', selected: false, status: 'not_found', source: null },
          { id: 'c1', label: 'встреча → созвон', selected: true, status: 'show', source: null },
          { id: 'c2', label: 'созвонв → созвон', selected: true, status: 'silent', source: null },
        ],
      },
    });
    const captions = [...card.querySelectorAll('[data-selection-row] .cf-caption')].map((node) => node.textContent);
    expect(captions).toEqual(['не найдено', 'правка', 'исправление опечатки']);
  });

  test('the contract reads the capability’s payload as a selection question', () => {
    const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
    // As `piece_create` suspends at the research pause (kcxz.12) — the extra
    // keys the capability keeps for its answer are not part of the question.
    const payload = {
      kind: 'selection',
      question: QUESTION.text,
      answerKey: 'factKeys',
      options: QUESTION.options,
      canDecideForPerson: true,
      snapshotKey: 'snap-1',
      level: 'deep',
    };
    expect(contract.readQuestion('piece_create', payload, null)).toEqual(QUESTION);
    // A review or rewrite card (kcxz.13): the same shape, its own key.
    expect(
      contract.readQuestion('piece_rewrite', { ...payload, answerKey: 'changeIds', token: 't' }, null)
    ).toEqual({ ...QUESTION, answerKey: 'changeIds' });
    expect(contract.readQuestion('x', { question: 'q', options: [] }, null).kind).toBe('choice');
    expect(contract.selectionAnswer({ answerKey: 'changeIds' }, ['a'])).toEqual({ changeIds: ['a'] });
  });

  test('the conversation draws it for an open selection question only', () => {
    const conversation = source('apps/frontend/src/components/agents/agent.conversation.tsx');
    expect(conversation).toMatch(
      /const selection = block\.question;\s*if \(selection\.kind === 'selection' && block\.runId\)/
    );
  });
});

describe('the rows are the entry screen’s, not a copy', () => {
  test('intake’s found facts and the card both render SelectionRows', () => {
    const research = source('apps/frontend/src/components/content-intelligence/intake/intake.research.tsx');
    const card = source('apps/frontend/src/components/agents/agent.selection-card.tsx');
    for (const file of [research, card]) expect(file).toContain('<SelectionRows');
    expect(research).not.toContain('<CheckboxField');
    expect(card).not.toContain('<CheckboxField');
  });
});

describe('the piece opened beside the chat', () => {
  const loadPanel = () =>
    loadWithMocks('apps/frontend/src/components/agents/agent.panel.tsx', {
      react: React,
      'next/link': {
        __esModule: true,
        default: ({ href, prefetch: _prefetch, children, ...rest }) => h('a', { href, ...rest }, children),
      },
      'next/dynamic': () => (props) =>
        h('div', { 'data-piece-stub': props.pieceId, 'data-embedded': String(props.embedded) }),
      '@contentfactory/react/translation/use-interface-language': {
        useInterfaceLanguage: () => 'ru',
      },
      '@contentfactory/frontend/components/onboarding/use-onboarding-progress': {
        useOnboardingProgress: () => ({ progress: null, answered: false, error: null }),
      },
    });

  test('the panel renders the piece screen embedded and leads to its page', async () => {
    const panel = loadPanel();
    await act(async () => {
      render(
        h(panel.ArtifactColumn, {
          artifact: { kind: 'piece', id: 'p9', title: 'Созвоны', code: 'cnt-9', data: { questions: 2 } },
          onClose: () => {},
          empty: null,
          words: ru,
        })
      );
    });
    const stub = document.querySelector('[data-piece-stub]');
    expect(stub.getAttribute('data-piece-stub')).toBe('p9');
    expect(stub.getAttribute('data-embedded')).toBe('true');
    const open = screen.getByRole('link', { name: /Открыть на экране/ });
    expect(open.getAttribute('href')).toBe('/content/pieces/p9');
  });
});
