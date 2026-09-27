'use strict';

/** «Решите за меня» on the facts card: the page's own preselection is kept. */
module.exports = {
  id: 'piece-research-decide',
  title: 'Ресерч сути — «Решите за меня» берёт отмеченное продуктом',
  covers: ['piece.research'],
  world: {
    coreResearchFacts: [
      { factKey: 'r1', statement: 'Первая', status: 'confirmed', selected: true },
      { factKey: 'r2', statement: 'Вторая', status: 'unverified', selected: false },
      { factKey: 'r3', statement: 'Третья', status: 'confirmed', selected: true },
    ],
  },
  turns: [
    { say: 'Дополни cnt-1 ресерчем', model: [[['tool', 'piece_research', { pieceId: 'p1' }]]] },
    { resume: { decideForPerson: true }, model: [[['text', 'Взяли подтверждённые опоры.']]] },
  ],
  check: (run) => {
    expect(run.requests.filter(([door]) => door === 'piece.research')[0][3]).toEqual({
      confirmWebSpend: true,
      level: 'standard',
    });
    expect(run.requests.filter(([door]) => door === 'piece.research.accept')).toEqual([
      ['piece.research.accept', 'p1', 'user-1', { snapshotKey: 'core-snap-1', selectedKeys: ['r1', 'r3'] }],
    ]);
  },
};
