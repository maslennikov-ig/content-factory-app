'use strict';

const {INTAKE_QUESTIONS} = require('../../helpers/agent-scenarios.cjs');

/** The original create parks on authoritative questions before the model can decide them. */
module.exports = {
  id: 'piece-create-questions-first',
  title: 'Новая заготовка: вопросы сначала видит человек, «Решите за меня» — только его',
  covers: ['piece.create', 'piece.open'],
  world: {intakeQuestions: INTAKE_QUESTIONS},
  turns: [
    {
      say: 'мы в команде отказались от ежедневных созвонов-статусов',
      model: [
        [['tool', 'piece_create', {inputKind: 'thought'}]],
        [['tool', 'piece_answer', {pieceId: 'p9', answers: null, decide: ['audience', 'ask-1']}]],
      ],
    },
    {
      resume: {decideForPerson: true},
      model: [[['tool', 'piece_open', {pieceId: 'p9'}]], [['text', 'Суть обновлена без выдуманных личных фактов.']]],
    },
  ],
  check: run => {
    const [create, decided] = run.turns;
    expect(create.outputs).toEqual([]);
    expect(create.toolCalls.map(call => call.toolName)).toEqual(['piece_create']);
    expect(create.suspended[0].payload).toMatchObject({kind: 'domain-questions', activeKey: 'audience', answers: []});
    expect(create.suspended[0].payload.questions.map(question => question.question)).toEqual(INTAKE_QUESTIONS.map(question => question.question));
    expect(create.admissions.map(([operation]) => operation)).toEqual(['agent', 'intake']);
    expect(run.requests.filter(([door]) => door === 'piece.answer')).toEqual([
      ['piece.answer', 'p9', {decide: ['audience']}],
    ]);
    expect(decided.outputs[0].output).toMatchObject({ok: true, summary: {pieceId: 'p9', questions: 0, leftToAuthor: ['Какой итог?']}});
    expect(run.writes).toEqual([['piece.created', 'p9'], ['piece.answered', 'p9', 'user-1']]);
  },
};
