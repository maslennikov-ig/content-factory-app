'use strict';

/**
 * A paid action runs without asking (spec §1.2) and admits its own `intake`
 * operation beside the turn's `agent` one — never absorbed by it (U1).
 */
module.exports = {
  id: 'piece-create-paid',
  title: 'Новая заготовка — платное действие со своим учётом',
  covers: ['piece.create'],
  turns: [
    {
      say: 'Напиши заготовку: мысль про созвоны без повестки',
      model: [
        [['tool', 'piece_create', { text: 'Мысль про созвоны без повестки', inputKind: 'thought' }]],
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
      body: 'Мысль про созвоны без повестки',
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
    ]);
    // The open questions are counted (kcxz.29, D4): the card and the model
    // both know the person has two to answer.
    expect(turn.data.at(-1).data).toEqual({ kind: 'piece', id: 'p9', code: 'cnt-9', questions: 2 });
    expect(turn.outputs[0].output).toMatchObject({
      ok: true,
      summary: { pieceId: 'p9', code: 'cnt-9', questions: 2 },
      card: { kind: 'piece', id: 'p9' },
    });
    expect(JSON.stringify(turn.outputs[0].output)).not.toContain('созвоны без повестки');
    // Two rows, each with its own role, both closed.
    expect(run.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
    // Progress is transient: the thread keeps the card, not the stages.
    expect(run.storedPartTypes).toContain('data-piece');
    expect(run.storedPartTypes).not.toContain('data-progress');
  },
};
