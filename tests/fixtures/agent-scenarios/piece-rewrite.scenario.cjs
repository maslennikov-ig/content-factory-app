'use strict';

/**
 * «Переписать…» by the person's instruction; the person takes one change and
 * the core's accept door gets only that one. Taking none changes nothing.
 */
const CHANGES = [
  { id: 'w1', basket: 'show', excerpt: 'съедают день', replacement: 'съедают полдня', why: 'Короче' },
  { id: 'w2', basket: 'show', excerpt: 'без повестки', replacement: 'без плана', why: 'Проще' },
];

module.exports = {
  id: 'piece-rewrite',
  title: '«Переписать…» → выбор правок человеком',
  covers: ['piece.rewrite'],
  world: { reviewChanges: CHANGES },
  turns: [
    {
      say: 'Перепиши суть cnt-1 короче',
      model: [[['tool', 'piece_rewrite', { pieceId: 'p1', instruction: 'короче' }]]],
    },
    { resume: { changeIds: ['w2', 'w9'] }, model: [[['text', 'Приняли одну правку.']]] },
    {
      say: 'Ещё раз, проще',
      model: [[['tool', 'piece_rewrite', { pieceId: 'p1', instruction: 'проще' }]]],
    },
    { resume: { changeIds: [] }, model: [[['text', 'Оставили как было.']]] },
  ],
  check: (run) => {
    expect(run.requests.filter(([door]) => door === 'piece.review')).toEqual([
      ['piece.review', 'p1', null, { instruction: 'короче' }],
      ['piece.review', 'p1', null, { instruction: 'проще' }],
    ]);
    expect(run.turns[0].admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
    // An id the card did not offer is dropped; nothing is chosen by the model.
    expect(run.requests.filter(([door]) => door === 'piece.review.accept')).toEqual([
      ['piece.review.accept', 'p1', null, { token: 'token-1', selectedIds: ['w2'] }],
    ]);
    expect(run.turns[1].outputs[0].output.summary).toEqual({ pieceId: 'p1', outcome: 'applied', offered: 2, applied: 1, declined: 1, waitingOnCard: 0 });
    // None taken: the core stays, no accept, no card.
    expect(run.turns[3].outputs[0].output.summary).toEqual({ pieceId: 'p1', outcome: 'kept-as-is', offered: 2, applied: 0, declined: 2, waitingOnCard: 0 });
    expect(run.turns[3].data.filter((part) => part.type === 'data-piece')).toEqual([]);
    expect(run.writes).toEqual([['piece.review.accepted', 'p1', ['w2']]]);
  },
};
