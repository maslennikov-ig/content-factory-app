'use strict';

/**
 * «Решите за меня» on the facts card: the product keeps its own defaults —
 * what the screen sends when the person presses «Продолжить» untouched.
 */
const FACTS = [
  { factKey: 'f1', statement: 'Первая опора', status: 'confirmed', selected: true },
  { factKey: 'f2', statement: 'Вторая опора', status: 'unverified', selected: false },
];

module.exports = {
  id: 'piece-task-research-decide',
  title: 'Выбор опор — «Решите за меня»',
  covers: ['piece.create'],
  world: { researchFacts: FACTS },
  turns: [
    {
      say: 'Напиши пост про созвоны, с поиском',
      model: [[['tool', 'piece_create', { text: 'Напиши пост про созвоны', inputKind: 'instruction', research: 'standard' }]]],
    },
    { resume: { decideForPerson: true }, model: [[['text', 'Готово, опоры выбрали за вас.']]] },
  ],
  check: (run) => {
    const second = run.requests.filter(([door]) => door === 'intake')[1][1];
    expect(second).toMatchObject({ researchSelections: ['f1'], snapshotKey: 'snap-1' });
    expect(run.turns[1].outputs[0].output.summary).toMatchObject({ factsKept: 1, factsCard: 'answered', questions: 2 });
  },
};
