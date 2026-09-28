'use strict';

/**
 * kcxz W3 final live recheck 28.09.2026, F-2a: «до 800 знаков» on a channel
 * whose writing card was never saved. The card then reads as the platform's
 * defaults (Telegram: 500–1000, hard 1500), and the first fix took the
 * default 500 for the person's own minimum: it stored `idealMin 500`, the
 * agent said «нижняя граница осталась 500», and the card read «Свой:
 * 500–800». Now the defaults are not the person's numbers: no minimum is
 * stored, no «changed» hard maximum is reported, and the card reads
 * «Свой: до 800».
 */
module.exports = {
  id: 'channel-writing-max-only-unsaved-card',
  title: '«До N знаков» на несохранённой карточке — без минимума из умолчаний',
  covers: ['channel.writing'],
  world: {
    channels: [
      {
        id: 'c1',
        name: 'Кухня команды',
        providerIdentifier: 'telegram',
        disabled: false,
        refreshNeeded: false,
        planMode: 'reserve',
        posts: 0,
        profile: null,
      },
    ],
  },
  turns: [
    {
      say: 'На канале «Кухня команды» пиши до 800 знаков',
      model: [
        [['tool', 'channel_writing', { channelId: 'c1', length: 'range', lengthMin: null, lengthMax: 800, lengthHardMax: 800 }]],
        [['text', 'Готово: до 800 знаков.']],
      ],
    },
  ],
  check: (run) => {
    const output = run.turns[0].outputs[0].output;
    expect(output.ok).toBe(true);
    expect(output.summary.length).toEqual({ lengthMin: null, lengthMax: 800, lengthHardMax: 800 });
    // The defaults' 1500 was never the person's ceiling.
    expect(output.summary.hardMaxChanged).toBeUndefined();
    const bodies = run.requests.filter(([door]) => door === 'channel.writing-profile').map(([, , body]) => body);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ lengthPolicy: 'range', length: { idealMin: null, idealMax: 800, hardMax: 800 } });
    expect(run.world.channels[0].profile.lengthPolicy).toEqual({ idealMin: null, idealMax: 800, hardMax: 800 });
  },
};
