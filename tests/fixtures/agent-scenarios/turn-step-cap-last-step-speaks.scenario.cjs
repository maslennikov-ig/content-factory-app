'use strict';

/** Native runs retain all tools until the model itself returns its final answer. */
const LIST = ['tool', 'channels_list', {}];
const ANSWER = 'Каналы проверены семь раз. Доступен «Канал про работу». Проверка завершена.';

module.exports = {
  id: 'turn-step-cap-last-step-speaks',
  title: 'Без настроенного предела модель завершает проверку после семи вызовов и сохраняет все инструменты',
  covers: ['channels.list'],
  turns: [
    {
      say: 'Проверь каналы по одному, сколько получится',
      model: [
        ...Array.from({ length: 7 }, () => [LIST]),
        [['text', ANSWER]],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.modelCalls).toBe(8);
    expect(turn.steps.every((step) => step.toolChoice !== 'none' && !step.lastStepNote)).toBe(true);
    expect(turn.toolCalls).toHaveLength(7);
    expect(turn.text).toBe(ANSWER);
    expect(turn.outputs.every(({ output }) => output.ok === true)).toBe(true);
    expect(turn.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(run.history.execution).toMatchObject({ state: 'settled', outcome: 'completed' });
    expect(turn.types.at(-1)).toBe('finish');
    expect(turn.client.messages.at(-1).parts.some((part) => part.type === 'text' && part.text === ANSWER)).toBe(true);
  },
};
