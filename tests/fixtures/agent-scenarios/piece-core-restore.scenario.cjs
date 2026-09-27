'use strict';

/**
 * Versions of the core: the open tool lists them without their texts, and
 * restoring one posts the page's body with the current core as `expected`.
 */
module.exports = {
  id: 'piece-core-restore',
  title: 'Суть: вернуть прежнюю версию',
  covers: ['piece.open', 'piece.core.restore'],
  turns: [
    {
      say: 'Верни первую версию сути cnt-1',
      model: [
        [['tool', 'piece_open', { pieceId: 'p1' }]],
        [['tool', 'piece_core_restore', { pieceId: 'p1', index: 0, replacedAt: '2026-09-20T10:00:00.000Z' }]],
        [['text', 'Вернули версию от 20.09.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    const opened = turn.outputs[0].output.summary.untrustedData.value;
    expect(opened.versions).toEqual([
      { index: 0, replacedAt: '2026-09-20T10:00:00.000Z', writtenBy: 'model' },
    ]);
    expect(opened.materialPending).toBe(false);
    expect(JSON.stringify(opened)).not.toContain('Первая суть');
    expect(run.requests.filter(([door]) => door === 'piece.core.restore')).toEqual([
      [
        'piece.core.restore',
        'p1',
        { index: 0, replacedAt: '2026-09-20T10:00:00.000Z', expected: 'Созвоны без повестки съедают день.' },
      ],
    ]);
    expect(run.writes).toEqual([['piece.core.restored', 'p1', 0]]);
    expect(run.world.pieces[0].body).toBe('Первая суть.');
    expect(run.admissions.every(([operation]) => operation === 'agent')).toBe(true);
  },
};
