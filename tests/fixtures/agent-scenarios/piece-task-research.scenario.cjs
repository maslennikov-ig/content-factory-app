'use strict';

const { screenIntakeBody } = require('../../helpers/agent-scenarios.cjs');

/**
 * «Задание» with a web search: the intake pauses at the found facts, the
 * person keeps some on the selection card, and the same call continues the
 * first pass's snapshot — the screen's two requests, byte for byte.
 */
const TASK = 'Напиши пост о том, сколько времени съедают созвоны';
const FACTS = [
  { factKey: 'f1', statement: 'Руководитель проводит на созвонах 23 часа в неделю', status: 'confirmed', selected: true, sourceUrl: 'https://www.hbr.org/meetings' },
  { factKey: 'f2', statement: 'Половина созвонов без повестки', status: 'unverified', selected: false, sourceUrl: null },
  { factKey: 'f3', statement: 'Короткие созвоны продуктивнее', status: 'confirmed', selected: true, sourceUrl: 'https://example.org/a' },
];

module.exports = {
  id: 'piece-task-research',
  title: 'Задание с поиском → выбор опор → заготовка',
  covers: ['piece.create'],
  world: { researchFacts: FACTS, intakeQuestions: [] },
  endsPending: false,
  turns: [
    {
      say: `${TASK}, поищи глубоко`,
      model: [[['tool', 'piece_create', { text: TASK, inputKind: 'instruction', research: 'deep' }]]],
    },
    {
      resume: { factKeys: ['f1', 'f2'] },
      model: [[['text', 'Заготовка cnt-9 готова на выбранных опорах.']]],
    },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    // The card: the rows, the product's defaults, «Решите за меня».
    expect(ask.suspended).toEqual([
      {
        runId: expect.any(String),
        toolName: 'piece_create',
        payload: {
          kind: 'selection',
          question: expect.stringContaining('Отметьте'),
          answerKey: 'factKeys',
          options: [
            { id: 'f1', label: FACTS[0].statement, selected: true, status: 'confirmed', source: 'hbr.org' },
            { id: 'f2', label: FACTS[1].statement, selected: false, status: 'unverified', source: null },
            { id: 'f3', label: FACTS[2].statement, selected: true, status: 'confirmed', source: 'example.org' },
          ],
          canDecideForPerson: true,
          // The snapshot key and when it was asked stay on the server (W2 F9).
          cardId: expect.stringMatching(/^[0-9a-f]{32}$/),
          level: 'deep',
        },
      },
    ]);
    expect(ask.outputs).toEqual([]);
    // First pass paid for itself: extraction and the search.
    expect(ask.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
      ['web_research', expect.any(String), 'user-1', 'succeeded'],
    ]);

    // The two bodies the screen sends: the task, then the kept rows with the
    // first pass's snapshot.
    const screen = {
      input: TASK,
      language: 'ru',
      materialKind: 'instruction',
      options: { researchEnabled: true, researchLevel: 'deep' },
    };
    expect(run.requests.filter(([door]) => door === 'intake')).toEqual([
      ['intake', screenIntakeBody(screen)],
      ['intake', screenIntakeBody({ ...screen, researchSelections: ['f1', 'f2'], snapshotKey: 'snap-1' })],
    ]);
    // The continuation wrote the core with its own operation.
    expect(answer.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
    expect(run.world.pieces.find((piece) => piece.id === 'p9')).toMatchObject({
      inputKind: 'instruction',
      facts: ['f1', 'f2'],
    });
    expect(answer.outputs).toEqual([
      {
        toolName: 'piece_create',
        output: expect.objectContaining({
          ok: true,
          // kcxz.36 (F6): the choice is said to be done, so the model does
          // not send the person back to mark facts.
          summary: { pieceId: 'p9', code: 'cnt-9', questions: 0, research: 'deep', factsKept: 2, factsCard: 'answered' },
        }),
      },
    ]);
    // The facts went to the person's card, never to the model.
    expect(JSON.stringify(answer.outputs)).not.toContain('23 часа');
    expect(answer.data.at(-1)).toEqual({
      type: 'data-piece',
      data: { kind: 'piece', id: 'p9', code: 'cnt-9', questions: 0 },
      transient: false,
    });
  },
};
