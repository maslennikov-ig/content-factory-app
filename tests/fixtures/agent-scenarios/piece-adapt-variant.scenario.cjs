'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * No questions on a channel that already has a text, and a repeat adaptation
 * writes the next variant while the old one stays. The post fields the
 * person named go as the page's `adaptOverrides` would send them.
 */
module.exports = {
  id: 'piece-adapt-variant',
  title: 'Адаптация без вопросов, повтор даёт вариант',
  covers: ['piece.adapt'],
  world: {
    adaptQuestions: [{ key: 'hook', question: 'Не должен спрашиваться', suggested: null }],
    adaptations: [
      { id: 'a1', pieceId: 'p1', kind: 'post', platform: 'telegram', integrationId: 'c1', integrationName: 'Канал про работу', body: 'Старый', state: 'draft', mediaId: null },
    ],
  },
  turns: [
    {
      say: 'Ещё вариант для Telegram, без эмодзи и короче',
      model: [
        [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1', emojiLevel: 'none', wish: 'Короче' }]],
        [['text', 'Готов вариант 2.']],
      ],
    },
    {
      say: 'И ещё один',
      model: [[['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]], [['text', 'Вариант 3.']]],
    },
  ],
  check: (run) => {
    const screen = screenPieces();
    const [first, second] = run.turns;
    expect(first.suspended).toEqual([]);
    expect(run.requests.filter(([door]) => door === 'piece.adapt')).toEqual([
      [
        'piece.adapt',
        'p1',
        screen.buildAdaptPayload({
          integrationId: 'c1',
          kind: 'post',
          overrides: screen.adaptOverrides({
            length: 'channel',
            emoji: 'none',
            hashtags: 'channel',
            links: 'channel',
            cta: 'channel',
            brandProfileId: null,
            wish: 'Короче',
            link: '',
            linkText: '',
          }),
        }),
      ],
      ['piece.adapt', 'p1', screen.buildAdaptPayload({ integrationId: 'c1', kind: 'post' })],
    ]);
    expect(first.outputs[0].output.summary).toMatchObject({ adaptationId: 'a2', variant: 2, asked: 0 });
    expect(second.outputs[0].output.summary).toMatchObject({ adaptationId: 'a3', variant: 3 });
    // The old text stays: three rows for one channel.
    expect(run.world.adaptations.map((row) => row.id)).toEqual(['a1', 'a2', 'a3']);
    expect(first.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
  },
};
