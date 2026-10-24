'use strict';

const { screenIntakeBody, INTAKE_QUESTIONS } = require('../../helpers/agent-scenarios.cjs');

/**
 * `kcxz.12` acceptance: a thought → a piece with questions → the questions
 * asked in the chat → the person's answer, the rest «Решите за меня». Each
 * record is the one the screens write: the intake body of «Новый материал»,
 * the answer body of the piece page.
 */
module.exports = {
  id: 'piece-thought-answer',
  title: 'Мысль → заготовка с вопросами → ответ и «Решите за меня»',
  covers: ['piece.create', 'piece.open'],
  world: {intakeQuestions: INTAKE_QUESTIONS},
  turns: [
    {
      say: 'Напиши заготовку: созвоны без повестки съедают день',
      model: [
        [['tool', 'piece_create', {}]],
        [['text', 'Заготовка cnt-9 готова, у неё два вопроса. Ответим здесь?']],
      ],
    },
    {
      say: 'Давай',
      model: [
        [['tool', 'piece_open', { pieceId: 'p9' }]],
        [['text', 'Для кого пост? И какой итог — или решим за вас.']],
      ],
    },
    {
      resumeCardOfTurn: 1,
      resume: {answers: [{key: 'audience', mode: 'custom', text: 'Для руководителей'}]},
      model: [],
    },
    {
      resume: {answers: [{key: 'ask-1', mode: 'delegate'}]},
      model: [[['text', 'Суть переписана, личный опыт не выдуман.']]],
    },
  ],
  check: (run) => {
    const [create, open, partial, answer] = run.turns;
    const intake = run.requests.filter(([door]) => door === 'intake');
    // The intake body is the screen's for «Свой текст», search off.
    expect(intake).toEqual([
      [
        'intake',
        screenIntakeBody({
          input: 'Напиши заготовку: созвоны без повестки съедают день',
          language: 'ru', timeZone: '+03:00',
          materialKind: 'thought',
          options: { researchEnabled: false, researchLevel: 'standard' },
        }),
      ],
    ]);
    expect(create.outputs).toEqual([]);
    expect(create.suspended[0].payload).toMatchObject({kind: 'domain-questions', activeKey: 'audience', answers: []});
    expect(create.suspended[0].payload.questions.map(question => question.question)).toEqual(['Для кого?', 'Какой итог?']);
    expect(partial.outputs).toEqual([]);
    expect(partial.suspended[0].payload).toMatchObject({activeKey: 'ask-1', answers: [{key: 'audience', mode: 'custom', text: 'Для руководителей'}]});
    expect(partial.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);

    // Opening reads the question ids; the question words reach the model
    // only as data, and the card opens the piece by id.
    const opened = open.outputs[0].output;
    expect(opened.summary.untrustedData.sources).toEqual(['workspace-text', 'foreign-post']);
    expect(opened.summary.untrustedData.value.questions).toEqual([
      { id: 'audience', question: 'Для кого?' },
      { id: 'ask-1', question: 'Какой итог?' },
    ]);
    expect(open.data).toEqual([
      { type: 'data-piece', data: { kind: 'piece', id: 'p9', code: 'cnt-9', questions: 2 }, transient: false },
    ]);
    expect(open.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);

    // The answer body is the piece page's: the answer by field; the material
    // question explicitly delegated on the native card maps to the manual service omission.
    expect(run.requests.filter(([door]) => door === 'piece.answer')).toEqual([
      ['piece.answer', 'p9', { answers: [{ field: 'audience', text: 'Для руководителей' }] }],
    ]);
    expect(run.world.pieces.find((piece) => piece.id === 'p9').answers).toEqual([
      { field: 'audience', text: 'Для руководителей', origin: 'person' },
      { field: 'facts', key: 'ask-1', text: '', origin: 'model' },
    ]);
    expect(answer.outputs[0].output).toMatchObject({
      ok: true,
      summary: { pieceId: 'p9', code: 'cnt-9', questions: 0 },
      card: { kind: 'piece', id: 'p9' },
    });
    expect(JSON.stringify(answer.outputs[0].output)).not.toContain('Новая суть');
    // The answer paid for itself, beside the turn's own operation.
    expect(answer.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
    expect(answer.data.filter((part) => part.type === 'data-progress').map((part) => part.data)).toEqual([
      { capability: 'piece.answer', stage: 'answer-started' },
      { capability: 'piece.answer', stage: 'piece' },
      { capability: 'piece.answer', stage: 'done' },
    ]);
    expect(run.writes).toEqual([
      ['piece.created', 'p9'],
      ['piece.answered', 'p9', 'user-1'],
    ]);
  },
};
