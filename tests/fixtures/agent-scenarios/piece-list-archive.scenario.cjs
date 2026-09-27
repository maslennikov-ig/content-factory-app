'use strict';

/**
 * Finding pieces and moving one to the archive: the list the «Контент» table
 * reads (titles as data), and the archive door's reversible write.
 */
module.exports = {
  id: 'piece-list-archive',
  title: 'Найти заготовку и убрать её в архив',
  covers: ['piece.list', 'piece.archive'],
  turns: [
    {
      say: 'Найди заготовку про созвоны и убери её в архив',
      model: [
        [['tool', 'piece_list', { search: 'созвоны' }]],
        [['tool', 'piece_archive', { pieceId: 'p1', archived: true }]],
        [['text', 'Заготовка cnt-1 в архиве.']],
      ],
    },
    {
      say: 'Покажи и архивные',
      model: [[['tool', 'piece_list', { includeArchived: true }]], [['text', 'Вот все.']]],
    },
  ],
  check: (run) => {
    const [first, second] = run.turns;
    const listed = first.outputs[0].output.summary;
    expect(listed.untrustedData.sources).toEqual(['workspace-text']);
    expect(listed.untrustedData.value).toEqual({
      total: 1,
      pieces: [{ id: 'p1', code: 'cnt-1', title: 'Про созвоны', date: '27.09.26', archived: false }],
    });
    expect(first.outputs[1].output).toMatchObject({ ok: true, summary: { pieceId: 'p1', archived: true } });
    expect(run.writes).toEqual([['piece.archived', 'p1', true]]);
    expect(run.world.pieces.find((piece) => piece.id === 'p1').archivedAt).not.toBeNull();
    expect(
      run.requests.filter(([door, query]) => door === 'piece.list' && Object.keys(query).length)
    ).toEqual([
      ['piece.list', { q: 'созвоны' }],
      ['piece.list', { includeArchived: true }],
    ]);
    expect(second.outputs[0].output.summary.untrustedData.value.total).toBe(2);
    // Nothing here is paid: one `agent` operation per request, nothing else.
    expect(run.admissions.every(([operation]) => operation === 'agent')).toBe(true);
  },
};
