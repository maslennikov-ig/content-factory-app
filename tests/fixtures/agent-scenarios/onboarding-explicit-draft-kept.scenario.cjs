'use strict';

/**
 * Review W3-21 P2-1 / P3-1: the workspace-start skill sets «Бронь» only on a
 * channel whose plan mode nobody chose. A channel set to «Без плана» on its
 * card reads `planMode: 'draft'` with `planModeChosen: true` and is left
 * alone; the channel connected in this conversation reads the service's
 * default (`reserve`, from a NULL column) with `planModeChosen: false`, and
 * only that one gets channel.plan.
 *
 * The model is scripted, so what this proves is the data the skill decides
 * on — both channels as production reads them — and that the call the skill
 * asks for touches only the new channel.
 */
const KEPT = {
  id: 'c1',
  name: 'Кухня продукта',
  providerIdentifier: 'telegram',
  disabled: false,
  refreshNeeded: false,
  planMode: 'draft',
  posts: 0,
  profile: null,
};
const NEW = {
  id: 'c2',
  name: 'Заметки из цеха',
  providerIdentifier: 'telegram',
  disabled: false,
  refreshNeeded: false,
  planMode: null,
  posts: 0,
  profile: null,
};

module.exports = {
  id: 'onboarding-explicit-draft-kept',
  title: 'Новому каналу — «Бронь», канал «Без плана» остаётся как выбран',
  role: 'ADMIN',
  covers: ['channel.open', 'channel.plan'],
  world: { pieces: [], channels: [{ ...KEPT }], avatars: [], adaptations: [] },
  turns: [
    {
      before: (rows) => {
        rows.channels.push({ ...NEW });
      },
      say: 'Готово, подключил второй канал',
      model: [
        [
          ['tool', 'channel_open', { channelId: 'c2' }],
          ['tool', 'channel_plan', { channelId: 'c2', planMode: 'reserve' }],
        ],
        [['text', 'Канал «Заметки из цеха» подключён, посты будут вставать бронью.']],
      ],
    },
    { say: 'Что с каналами?', model: [[['text', 'Два канала.']]] },
  ],
  check: (run) => {
    const [first, second] = run.turns.map((turn) => turn.opening);

    // Both channels as production reads them: the explicit «Без плана» is
    // chosen; the new one reads the default and says nobody chose it.
    expect(first.channels).toEqual([
      expect.objectContaining({ id: 'c1', planMode: 'draft', planModeChosen: true }),
      expect.objectContaining({ id: 'c2', planMode: 'reserve', planModeChosen: false }),
    ]);
    // An explicit «Без плана» is a decision «когда выйдет»: «План» is closed
    // already, by the same rule as «С чего начать».
    expect(first.onboarding.done).toEqual(['channel', 'plan']);

    expect(run.turns[0].outputs.map(({ output }) => output.ok)).toEqual([true, true]);
    expect(run.turns[0].outputs[0].output.summary.untrustedData.value).toMatchObject({
      channelId: 'c2',
      planMode: 'reserve',
      planModeChosen: false,
    });

    // Only the new channel was written; the draft one is untouched.
    expect(run.writes).toEqual([['channel.plan-mode', 'c2', 'reserve']]);
    expect(run.world.channels.find((one) => one.id === 'c1').planMode).toBe('draft');
    expect(second.channels).toEqual([
      expect.objectContaining({ id: 'c1', planMode: 'draft', planModeChosen: true }),
      expect.objectContaining({ id: 'c2', planMode: 'reserve', planModeChosen: true }),
    ]);
  },
};
