'use strict';

/** A delete waits on its card; «Да» runs the stored call once. */
module.exports = {
  id: 'piece-delete-approved',
  title: 'Удаление заготовки — подтверждено',
  covers: ['piece.delete'],
  turns: [
    { say: 'Удали заготовку cnt-1', model: [[['tool', 'piece_delete', { pieceId: 'p1' }]]] },
    { approve: true, model: [[['text', 'Удалили заготовку cnt-1.']]] },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    // The first request stops at the card: nothing deleted yet.
    // The card says what and where: the piece read in this workspace by the
    // stored id, not the model's words (correctness review W1 F1).
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'piece_delete',
        reason: 'Удалить заготовку cnt-1 «Про созвоны» вместе с её адаптациями',
      }),
    ]);
    // Mastra's own approval data shows the real call, not a placeholder.
    expect(ask.data.find((part) => part.type === 'data-tool-call-approval').data.args).toEqual({
      pieceId: 'p1',
    });
    expect(ask.types).toContain('data-tool-call-approval');
    expect(ask.types).not.toContain('finish');
    expect(ask.outputs).toEqual([]);
    // The answer runs it.
    expect(answer.outputs).toEqual([
      {
        toolName: 'piece_delete',
        output: expect.objectContaining({ ok: true, summary: { pieceId: 'p1', deleted: true } }),
      },
    ]);
    expect(run.writes).toEqual([['piece.deleted', 'p1']]);
    expect(run.world.pieces.map((piece) => piece.id)).toEqual(['p0']);
    // Each model-running request is its own admission.
    expect(ask.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(answer.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
  },
};
