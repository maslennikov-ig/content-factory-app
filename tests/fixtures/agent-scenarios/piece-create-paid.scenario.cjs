'use strict';
const {INTAKE_QUESTIONS} = require('../../helpers/agent-scenarios.cjs');

/**
 * A paid creation needs no separate approval and admits its own `intake`
 * operation beside the turn's `agent` one (U1). Its editorial questions
 * remain explicit native questions after the initial piece is saved.
 */
module.exports = {
  id: 'piece-create-paid',
  title: 'Новая заготовка — платное действие со своим учётом',
  covers: ['piece.create'],
  world: {intakeQuestions: INTAKE_QUESTIONS},
  endsPending: true,
  turns: [
    {
      say: 'Напиши заготовку: мысль про созвоны без повестки',
      model: [
        [['tool', 'piece_create', { inputKind: 'thought' }]],
        [['text', 'Заготовка cnt-9 готова, у неё два вопроса — ответьте на них в карточке.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    // The record written: the person's words verbatim, the chat's language,
    // research off as the door's default, the acting user.
    expect(run.writes).toEqual([['piece.created', 'p9']]);
    expect(run.world.pieces.find((piece) => piece.id === 'p9')).toMatchObject({
      code: 'cnt-9',
      body: 'Напиши заготовку: мысль про созвоны без повестки',
      language: 'ru',
      research: false,
      createdBy: 'user-1',
    });
    // Progress as it happens, then the card by id; the model gets ids only.
    const stages = turn.data.filter((part) => part.type === 'data-progress');
    expect(stages.map((part) => part.data.stage)).toEqual([
      'intake-started',
      'brief-started',
      'brief-filled',
      'piece',
      'questions',
      'done',
    ]);
    expect(turn.data.map((part) => part.type)).toEqual([
      ...stages.map(() => 'data-progress'),
      'data-piece',
      'data-tool-call-suspended',
    ]);
    // The saved artifact and exact native question card retain the same count.
    expect(turn.data.find(part => part.type === 'data-piece').data).toEqual({ kind: 'piece', id: 'p9', code: 'cnt-9', questions: 2 });
    expect(turn.outputs).toEqual([]);
    expect(turn.suspended[0].payload).toMatchObject({kind: 'domain-questions', source: {pieceId: 'p9'}, answers: []});
    expect(turn.suspended[0].payload.questions.map(question => question.question)).toEqual(INTAKE_QUESTIONS.map(question => question.question));
    expect(turn.modelCalls).toBe(1);
    // Two rows, each with its own role, both closed.
    expect(run.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
    // While parked, native tool invocation/checkpoint owns the saved piece
    // reference and exact card; final custom result parts arrive on completion.
    expect(run.storedPartTypes).toContain('tool-invocation');
    expect(run.pendingCards).toHaveLength(1);
    expect(run.pendingCards[0].suspendPayload).toEqual(turn.suspended[0].payload);
    expect(run.storedPartTypes).not.toContain('data-progress');
  },
};
