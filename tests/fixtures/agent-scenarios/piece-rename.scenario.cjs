'use strict';

/** A reversible write runs without a card and names the piece on its card. */
module.exports = {
  id: 'piece-rename',
  title: 'Переименование заготовки',
  covers: ['piece.rename'],
  turns: [
    {
      say: 'Назови cnt-1 «Созвоны без боли»',
      model: [
        [['tool', 'piece_rename', { pieceId: 'p1', title: 'Созвоны без боли' }]],
        [['text', 'Переименовали.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(run.writes).toEqual([['piece.title', 'p1', 'Созвоны без боли']]);
    expect(run.world.pieces.find((piece) => piece.id === 'p1').title).toBe('Созвоны без боли');
    expect(turn.data).toEqual([
      { type: 'data-piece', data: { kind: 'piece', id: 'p1', title: 'Созвоны без боли' }, transient: false },
    ]);
    expect(turn.outputs[0].output).toMatchObject({
      ok: true,
      summary: { pieceId: 'p1', title: 'Созвоны без боли' },
      card: { kind: 'piece', id: 'p1' },
    });
    expect(turn.approvals).toEqual([]);
    expect(run.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
  },
};
