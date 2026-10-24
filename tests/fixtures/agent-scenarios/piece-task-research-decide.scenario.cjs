'use strict';
const {INTAKE_QUESTIONS} = require('../../helpers/agent-scenarios.cjs');

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
  world: { researchFacts: FACTS, intakeQuestions: INTAKE_QUESTIONS },
  turns: [
    {
      say: 'Напиши пост про созвоны, с поиском',
      model: [[['tool', 'piece_create', { selection: 'person', inputKind: 'instruction', research: 'standard' }]]],
    },
    { resume: { decideForPerson: true }, model: [] },
    { resume: { decideForPerson: true }, model: [[['text', 'Опоры выбраны, суть обновлена без выдуманных фактов.']]] },
  ],
  check: (run) => {
    const second = run.requests.filter(([door]) => door === 'intake')[1][1];
    expect(second).toMatchObject({ researchSelections: ['f1'], snapshotKey: 'snap-1' });
    expect(run.turns[1].outputs).toEqual([]);
    expect(run.turns[1].suspended[0].payload.kind).toBe('domain-questions');
    expect(run.turns[2].outputs[0].output.summary).toMatchObject({ factsKept: 1, factsCard: 'answered', questions: 0 });
  },
};
