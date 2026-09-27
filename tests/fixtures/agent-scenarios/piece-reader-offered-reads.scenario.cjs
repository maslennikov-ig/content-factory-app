'use strict';

/**
 * A «Пользователь» reads pieces in the chat but is not offered the write or
 * paid ones (activeTools from the doors' policies).
 */
module.exports = {
  id: 'piece-reader-offered-reads',
  title: 'Пользователь видит заготовки, но не пишет и не платит',
  role: 'USER',
  covers: ['piece.open'],
  turns: [
    {
      say: 'Открой cnt-1',
      model: [[['tool', 'piece_open', { pieceId: 'p1' }]], [['text', 'Открыли.']]],
    },
  ],
  check: (run) => {
    const offered = run.firstCall.tools;
    expect(offered).toEqual(expect.arrayContaining(['piece_list', 'piece_open']));
    for (const tool of ['piece_create', 'piece_answer', 'piece_archive', 'piece_rename', 'piece_delete']) {
      expect(offered).not.toContain(tool);
    }
    expect(run.turns[0].outputs[0].output).toMatchObject({ ok: true, card: { kind: 'piece', id: 'p1' } });
    expect(run.writes).toEqual([]);
  },
};
