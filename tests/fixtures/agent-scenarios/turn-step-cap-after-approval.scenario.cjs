'use strict';

/** A resumed approval retains tools and uses the current request execution budget. */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-after-approval',
  title: 'Предел шагов после «Да» — шаги до карточки не съедают шаги ответа',
  role: 'ADMIN',
  covers: ['channels.list', 'channel.delete'],
  turns: [
    {
      say: 'Проверь каналы, потом удали «Канал про работу»',
      model: [...Array.from({ length: 2 }, () => [LIST]), [['tool', 'channel_delete', { channelId: 'c1' }]]],
    },
    {
      approve: true,
      model: [
        ...Array.from({ length: 2 }, () => [LIST]),
        [['text', 'Канал удалён, каналы проверены.']],
      ],
    },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.approvals).toHaveLength(1);
    expect(ask.steps).toHaveLength(3);
    expect(answer.outputs[0].output).toMatchObject({ ok: true, summary: { deleted: true } });
    // Tools stay available after the approval; ordinary completion ends the run.
    expect(answer.steps.map((step) => step.toolChoice === 'none')).toEqual([
      false, false, false,
    ]);
    expect(answer.steps.map((step) => step.lastStepNote)).toEqual([
      false, false, false,
    ]);
    expect(answer.toolCalls.filter(({ toolName }) => toolName === 'channels_list')).toHaveLength(2);
    expect(answer.text).toBe('Канал удалён, каналы проверены.');
  },
};
