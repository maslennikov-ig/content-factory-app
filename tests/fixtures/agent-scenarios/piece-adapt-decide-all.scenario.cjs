'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * «Решите за меня» on the interview card: the page's «Решите всё за меня»,
 * `skipInterview`. The answer resolves the interview and suppresses further
 * author questions for this adaptation; no material questions are reopened.
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
    { resume: { decideForPerson: true }, model: [[['text', 'Черновик сохранён, личные факты не выдуманы.']]] },
  ],
  check: (run) => {
    const screen = screenPieces();
    expect(run.turns[0].suspended[0].payload.kind).toBe('domain-questions');
    expect(run.requests.filter(([door]) => door === 'piece.adapt')[1][2]).toEqual(
      screen.buildAdaptPayload({ integrationId: 'c1', kind: 'post', skipInterview: true })
    );
    expect(run.turns[1].suspended).toEqual([]);
    const summary = run.turns[1].outputs[0].output.summary;
    expect(summary).toMatchObject({ state: 'draft', answeredOnCard: 1 });
    expect(summary.asked).toBeUndefined();
    expect(summary.openQuestions).toEqual({count: 0});
    expect(run.requests.filter(([door]) => door === 'piece.material-questions')).toEqual([]);
    expect(run.writes.filter(([kind]) => kind === 'adaptation.created')).toEqual([['adaptation.created', 'a1', 'c1']]);
    expect(run.writes.filter(([kind]) => kind === 'piece.core.rebuilt')).toEqual([]);
  },
};
