'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * «Решите за меня» on the interview card: the page's «Решите всё за меня»,
 * `skipInterview`. W3 recheck R-4: the question decided on the card is not
 * «one question waits on the post card»; what waits under the post — two
 * optional questions for more material — is counted exactly and quoted whole (final recheck F-3b).
 */
module.exports = {
  id: 'piece-adapt-decide-all',
  title: 'Вопросы адаптации — «Решите за меня» на все',
  covers: ['piece.adapt'],
  world: {
    adaptQuestions: [{ key: 'hook', question: 'С чего начать?', suggested: 'С цифры' }],
    materialAsks: {
      c1: [
        'Какой случай из вашей кофейни показал, что обучение бариста окупилось?',
        'Сколько стоила бы своя обжарка в первый год — хотя бы примерно, по вашим прикидкам и опыту знакомых владельцев кофеен в вашем городе?',
      ],
    },
  },
  turns: [
    { say: 'Адаптируй cnt-1 в канал', model: [[['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]]] },
    { resume: { decideForPerson: true }, model: [] },
    { resume: { decideForPerson: true }, model: [[['text', 'Черновик сохранён, личные факты не выдуманы.']]] },
  ],
  check: (run) => {
    const screen = screenPieces();
    expect(run.turns[0].suspended[0].payload.kind).toBe('domain-questions');
    expect(run.requests.filter(([door]) => door === 'piece.adapt')[1][2]).toEqual(
      screen.buildAdaptPayload({ integrationId: 'c1', kind: 'post', skipInterview: true })
    );
    expect(run.turns[1].outputs).toEqual([]);
    const material = run.turns[1].suspended[0].payload;
    expect(material).toMatchObject({kind: 'domain-questions', activeKey: 'ask-1', answers: []});
    expect(material.questions.map(question => question.question)).toEqual([
      'Какой случай из вашей кофейни показал, что обучение бариста окупилось?',
      'Сколько стоила бы своя обжарка в первый год — хотя бы примерно, по вашим прикидкам и опыту знакомых владельцев кофеен в вашем городе?',
    ]);
    const summary = run.turns[2].outputs[0].output.summary;
    expect(summary).toMatchObject({ state: 'draft', answeredOnCard: 3 });
    expect(summary.asked).toBeUndefined();
    expect(summary.openQuestions).toEqual({count: 0});
    expect(run.requests.filter(([door]) => door === 'piece.material-questions')).toEqual([
      ['piece.material-questions', 'p1', 'c1', {adaptationId: 'a1', dismiss: true}],
    ]);
    expect(run.writes.filter(([kind]) => kind === 'adaptation.created')).toEqual([['adaptation.created', 'a1', 'c1']]);
    expect(run.writes.filter(([kind]) => kind === 'piece.core.rebuilt')).toEqual([]);
  },
};
