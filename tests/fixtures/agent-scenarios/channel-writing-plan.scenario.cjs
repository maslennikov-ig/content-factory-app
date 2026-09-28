'use strict';

/**
 * The writing card and the plan mode from the chat (kcxz.19): the card's own
 * door with the stored card underneath (what is not named stays), the
 * service's refusal under its code, then «Без плана» without a question. An
 * editor is not offered the channel's life (connect, times, bot, off, delete).
 */
module.exports = {
  id: 'channel-writing-plan',
  title: 'Карточка «Как пишем» и режим плана — через двери канала, отказ службы с её кодом',
  covers: ['channel.writing', 'channel.plan'],
  turns: [
    {
      say: 'В канал пиши 150–5000 знаков, на «вы» и без эмодзи, и переведи его в «Без плана»',
      model: [
        [['tool', 'channel_writing', { channelId: 'c1', length: 'range', lengthMin: 150, lengthMax: 5000, addressForm: 'vy', emojiLevel: 'none' }]],
        [['tool', 'channel_writing', { channelId: 'c1', length: 'range', lengthMin: 150, lengthMax: 400, addressForm: 'vy', emojiLevel: 'none' }]],
        [['tool', 'channel_plan', { channelId: 'c1', planMode: 'draft' }]],
        [['text', 'Готово: 150–400 знаков, на «вы», без эмодзи; канал — «Без плана».']],
      ],
    },
  ],
  check: (run) => {
    const offered = run.firstCall.tools;
    expect(offered).toEqual(expect.arrayContaining(['channel_open', 'channel_posts', 'channel_writing', 'channel_plan', 'channel_autopilot']));
    for (const tool of ['channel_connect', 'channel_times', 'channel_bot_rename', 'channel_disable', 'channel_delete']) {
      expect(offered).not.toContain(tool);
    }
    const [turn] = run.turns;
    expect(turn.outputs.map((one) => one.output)).toEqual([
      expect.objectContaining({ ok: false, code: 'CHANNEL_WRITING_PROFILE_INVALID', reason: 'CHANNEL_WRITING_PROFILE_INVALID: IDEAL_MAX_ABOVE_PROVIDER' }),
      expect.objectContaining({
        ok: true,
        summary: {
          channelId: 'c1',
          changed: ['length', 'emojiLevel', 'addressForm'],
          // The numbers the card now holds, for the agent to say (W3 walk P2-C).
          length: { lengthMin: 150, lengthMax: 400, lengthHardMax: 1500 },
        },
        card: { kind: 'channel', id: 'c1' },
      }),
      expect.objectContaining({ ok: true, summary: { channelId: 'c1', planMode: 'draft' }, card: { kind: 'channel', id: 'c1' } }),
    ]);
    // The door's body: the stored card with the named fields over it
    // (`buildWritingProfilePayload`), the address form only because it was named.
    const bodies = run.requests.filter(([door]) => door === 'channel.writing-profile').map(([, , body]) => body);
    expect(bodies[1]).toEqual({
      lengthPolicy: 'range',
      // The stored hard maximum stays when not named (review W3-19 P3-7).
      length: { idealMin: 150, idealMax: 400, hardMax: 1500 },
      emojiLevel: 'none',
      linkPolicy: 'end',
      hashtagPolicy: 'none',
      ctaKind: 'auto',
      formatPreference: 'auto',
      notes: 'Пишем коротко.',
      brandProfileId: 'a1',
      addressForm: 'vy',
    });
    expect(run.requests.filter(([door]) => door === 'channel.plan-mode')).toEqual([['channel.plan-mode', 'c1', 'draft']]);
    expect(run.writes).toEqual([
      ['channel.profile.updated', 'c1'],
      ['channel.plan-mode', 'c1', 'draft'],
    ]);
    const channel = run.world.channels.find((one) => one.id === 'c1');
    expect(channel.planMode).toBe('draft');
    expect(channel.profile).toMatchObject({
      lengthPolicy: { idealMin: 150, idealMax: 400, hardMax: 1500 },
      emojiLevel: 'none',
      addressForm: 'vy',
      linkPolicy: 'end',
    });
  },
};
