'use strict';

/**
 * `kcxz.32` N2 (a): a card of proposed changes answered after its text
 * changed. The live recheck of 27.09.2026 left a card that quoted a sentence
 * no longer in the text, still answerable. Here the core is edited by hand
 * between the card and the answer; «Оставить выбранные» then applies nothing
 * — the accept door's compare-and-swap refuses it — and the result says so
 * honestly (`outcome: stale`), with nothing more spent.
 */
const CHANGES = [
  { id: 'w1', basket: 'show', excerpt: 'съедают день', replacement: 'съедают полдня', why: 'Короче' },
];

module.exports = {
  id: 'piece-rewrite-stale',
  title: 'Устаревшая правка: текст изменился — ничего не применили и честно сказали',
  covers: ['piece.rewrite'],
  world: { reviewChanges: CHANGES },
  turns: [
    {
      say: 'Перепиши суть cnt-1 короче',
      model: [[['tool', 'piece_rewrite', { pieceId: 'p1', instruction: 'короче' }]]],
    },
    {
      // The person edits the core on the piece page before answering.
      before: (rows) => {
        rows.pieces[0].body = 'Созвоны без плана съедают утро.';
      },
      resume: { changeIds: ['w1'] },
      model: [[['text', 'Правка устарела: текст уже изменился, ничего не меняли.']]],
    },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    // The card's target never reaches the browser (server-only, like the token).
    expect(ask.suspended[0].payload).not.toHaveProperty('target');
    expect(ask.suspended[0].payload).not.toHaveProperty('token');
    expect(answer.outputs[0].output.summary).toEqual(
      expect.objectContaining({ pieceId: 'p1', outcome: 'stale', offered: 1, applied: 0, declined: 0, waitingOnCard: 0 })
    );
    // The accept door was asked once and refused it: nothing written, the
    // hand edit stays, no card of a changed piece.
    expect(run.requests.filter(([door]) => door === 'piece.review.accept')).toHaveLength(1);
    expect(run.writes).toEqual([]);
    expect(run.world.pieces[0].body).toBe('Созвоны без плана съедают утро.');
    expect(answer.data.filter((part) => part.type === 'data-piece')).toEqual([]);
    // Nothing more spent: the answer's request is the turn's own admission only.
    expect(answer.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    // Its line says «правка устарела», as the screen reads the stream.
    const contract = require('../../helpers/load-tsx.cjs').loadTypeScriptModule(
      'apps/frontend/src/components/agents/agent.contract.ts'
    );
    const blocks = answer.client.messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => contract.readMessageBlocks(message));
    expect(blocks.filter((block) => block.type === 'done' || block.type === 'question')).toEqual([
      expect.objectContaining({ type: 'done', toolName: 'piece_rewrite', stale: true }),
    ]);
  },
};
