'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * «Решите за меня» on the interview card: the page's «Решите всё за меня»,
 * `skipInterview`.
 */
module.exports = {
  id: 'piece-adapt-decide-all',
  title: 'Вопросы адаптации — «Решите за меня» на все',
  covers: ['piece.adapt'],
  world: { adaptQuestions: [{ key: 'hook', question: 'С чего начать?', suggested: 'С цифры' }] },
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
    expect(run.turns[1].outputs[0].output.summary).toMatchObject({ state: 'draft', asked: 1 });
  },
};
