'use strict';

/**
 * The core by hand and from material (`kcxz.13`): the person's own text
 * replaces the core as the page's hand edit does; added material waits for
 * «Пересобрать суть», which pays for itself.
 */
module.exports = {
  id: 'piece-core-edit-rebuild',
  title: 'Суть: правка руками, материал и пересборка',
  covers: ['piece.core.edit', 'piece.material.add', 'piece.core.rebuild'],
  turns: [
    {
      say: 'Замени суть cnt-1 на: Созвоны без повестки съедают три часа в день.',
      model: [
        [['tool', 'piece_core_edit', { pieceId: 'p1', text: 'Созвоны без повестки съедают три часа в день.' }]],
        [['text', 'Суть заменена.']],
      ],
    },
    {
      say: 'Допиши материал: у нас в команде созвоны сократили до 15 минут. И пересобери',
      model: [
        [['tool', 'piece_material_add', { pieceId: 'p1', text: 'У нас в команде созвоны сократили до 15 минут.' }]],
        [['tool', 'piece_core_rebuild', { pieceId: 'p1' }]],
        [['text', 'Суть пересобрана с новым материалом.']],
      ],
    },
  ],
  check: (run) => {
    const [edit, rebuild] = run.turns;
    // The hand edit's body: the new text, and the current core as `expected`.
    expect(run.requests.filter(([door]) => door === 'piece.core.edit')).toEqual([
      [
        'piece.core.edit',
        'p1',
        { text: 'Созвоны без повестки съедают три часа в день.', expected: 'Созвоны без повестки съедают день.' },
      ],
    ]);
    expect(edit.outputs[0].output).toMatchObject({ ok: true, summary: { pieceId: 'p1', versions: 2 }, card: { kind: 'piece', id: 'p1' } });
    expect(edit.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);

    expect(run.requests.filter(([door]) => door === 'piece.material')).toEqual([
      ['piece.material', 'p1', { text: 'У нас в команде созвоны сократили до 15 минут.' }],
    ]);
    expect(rebuild.outputs.map((one) => one.output.summary)).toEqual([
      { pieceId: 'p1', materialAdded: 1, rebuildPending: true },
      { pieceId: 'p1', versions: 3 },
    ]);
    // The rebuild admitted its own operation, as the door's does.
    expect(rebuild.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
    expect(run.writes).toEqual([
      ['piece.core.edited', 'p1'],
      ['piece.material.added', 'p1'],
      ['piece.core.rebuilt', 'p1'],
    ]);
    expect(run.world.pieces[0]).toMatchObject({
      body: 'Созвоны без повестки съедают три часа в день. Пересобрано.',
      materialPending: false,
    });
  },
};
