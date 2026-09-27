'use strict';

/** «Нет» on the card: the call is denied, the piece stays. */
module.exports = {
  id: 'piece-delete-declined',
  title: 'Удаление заготовки — отказ',
  covers: ['piece.delete'],
  turns: [
    { say: 'Удали заготовку cnt-1', model: [[['tool', 'piece_delete', { pieceId: 'p1' }]]] },
    { approve: false, model: [[['text', 'Оставили заготовку как есть.']]] },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.approvals).toHaveLength(1);
    expect(answer.types).toContain('tool-output-denied');
    expect(answer.outputs).toEqual([]);
    expect(answer.text).toBe('Оставили заготовку как есть.');
    expect(run.writes).toEqual([]);
    expect(run.world.pieces.map((piece) => piece.id)).toEqual(['p1', 'p0']);
    // The refusal still ran the model: billed as its own request.
    expect(run.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['agent', 'agent', 'user-1', 'succeeded'],
    ]);
  },
};
