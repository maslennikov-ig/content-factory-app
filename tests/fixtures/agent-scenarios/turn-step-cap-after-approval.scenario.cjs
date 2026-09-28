'use strict';

/**
 * Correctness review of the W3 walk fixes, F1 / residual risk: a run resumed
 * after «Да» carries the steps it took before the card in Mastra's
 * `stepNumber` (six here), while Mastra's own cap counts only this stream's
 * steps, the resumed one among them. The last-step rule counted from 0, so
 * the first step after «Да» ran tools-off and the person's follow-up could
 * not run. Now the request counts its own: the resumed step, five model steps
 * with tools, the last one speaks.
 */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-after-approval',
  title: 'Предел шагов после «Да» — шаги до карточки не съедают шаги ответа',
  role: 'ADMIN',
  covers: ['channels.list', 'channel.delete'],
  turns: [
    {
      say: 'Проверь каналы, потом удали «Канал про работу»',
      model: [...Array.from({ length: 5 }, () => [LIST]), [['tool', 'channel_delete', { channelId: 'c1' }]]],
    },
    {
      approve: true,
      model: [
        ...Array.from({ length: 5 }, () => [LIST]),
        [LIST, ['text', 'Канал удалён, каналы проверены. Напишите «дальше» — продолжим.']],
      ],
    },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.approvals).toHaveLength(1);
    expect(ask.steps).toHaveLength(6);
    expect(answer.outputs[0].output).toMatchObject({ ok: true, summary: { deleted: true } });
    // The answer's own cap: tools on the first five model steps, off on the last.
    expect(answer.steps.map((step) => step.toolChoice === 'none')).toEqual([
      false, false, false, false, false, true,
    ]);
    expect(answer.steps.map((step) => step.lastStepNote)).toEqual([
      false, false, false, false, false, true,
    ]);
    expect(answer.toolCalls.filter(({ toolName }) => toolName === 'channels_list')).toHaveLength(5);
    expect(answer.text).toContain('Напишите «дальше» — продолжим.');
  },
};
