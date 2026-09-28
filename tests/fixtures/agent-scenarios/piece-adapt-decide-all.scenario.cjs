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
    { resume: { decideForPerson: true }, model: [[['text', 'Пост готов.']]] },
  ],
  check: (run) => {
    const screen = screenPieces();
    expect(run.turns[0].suspended[0].payload.kind).toBe('interview');
    expect(run.requests.filter(([door]) => door === 'piece.adapt')[1][2]).toEqual(
      screen.buildAdaptPayload({ integrationId: 'c1', kind: 'post', skipInterview: true })
    );
    const summary = run.turns[1].outputs[0].output.summary;
    expect(summary).toMatchObject({ state: 'draft', answeredOnCard: 1 });
    expect(summary.asked).toBeUndefined();
    expect(summary.openQuestions).toEqual({
      count: 2,
      optional: true,
      questions: [
        'Какой случай из вашей кофейни показал, что обучение бариста окупилось?',
        // Whole, so the agent can quote it word for word (final recheck
        // F-3b); a runaway question is still cut at `QUOTED_QUESTION_MAX`.
        'Сколько стоила бы своя обжарка в первый год — хотя бы примерно, по вашим прикидкам и опыту знакомых владельцев кофеен в вашем городе?',
      ],
    });
  },
};
