'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * «Переписать и запомнить для канала»: the channel card is written first
 * through its own door (the page's `rememberedProfilePayload` over the
 * stored card), then the post is adapted «как в канале».
 */
module.exports = {
  id: 'channel-writing-remember',
  title: '«…и запомнить для канала» — карточка канала, потом адаптация',
  covers: ['channel.writing.remember'],
  world: {
    adaptations: [
      { id: 'a1', pieceId: 'p1', kind: 'post', platform: 'telegram', integrationId: 'c1', integrationName: 'Канал про работу', body: 'Текст', state: 'draft', mediaId: null },
    ],
  },
  turns: [
    {
      say: 'Перепиши пост без эмодзи и с вопросом в конце, и запомни так для канала',
      model: [
        [['tool', 'channel_writing_remember', { channelId: 'c1', emojiLevel: 'none', ctaKind: 'question' }]],
        [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]],
        [['text', 'Запомнили для канала и переписали.']],
      ],
    },
  ],
  check: (run) => {
    const screen = screenPieces();
    const stored = {
      version: 'channel-writing-profile/v2',
      lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
      emojiLevel: 'few',
      linkPolicy: 'end',
      hashtagPolicy: 'none',
      ctaKind: 'auto',
      formatPreference: 'auto',
      notes: 'Пишем коротко.',
      brandProfileId: 'a1',
    };
    expect(run.requests.filter(([door]) => door === 'channel.writing-profile')).toEqual([
      [
        'channel.writing-profile',
        'c1',
        screen.rememberedProfilePayload(stored, {
          length: 'channel',
          emoji: 'none',
          hashtags: 'channel',
          links: 'channel',
          cta: 'question',
          brandProfileId: 'a1',
          wish: '',
          link: '',
          linkText: '',
        }),
      ],
    ]);
    expect(run.turns[0].outputs[0].output.summary).toEqual({ channelId: 'c1', remembered: ['emojiLevel', 'ctaKind'] });
    // The post then follows the channel: no per-post fields.
    expect(run.requests.filter(([door]) => door === 'piece.adapt')).toEqual([
      ['piece.adapt', 'p1', screen.buildAdaptPayload({ integrationId: 'c1', kind: 'post' })],
    ]);
    expect(run.writes).toEqual([
      ['channel.profile.updated', 'c1'],
      ['adaptation.created', 'a2', 'c1'],
    ]);
  },
};
