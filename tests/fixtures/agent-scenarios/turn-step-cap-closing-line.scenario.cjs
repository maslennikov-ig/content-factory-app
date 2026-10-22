'use strict';

/** An explicitly configured technical stop remains visibly incomplete. */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-closing-line',
  incompleteTurns: [0],
  title: 'Настроенный предел трёх одинаковых результатов честно останавливает незавершённую задачу',
  covers: ['channels.list'],
  maxIdenticalToolResults: 3,
  ignoreToolChoice: true,
  turns: [
    {
      say: 'Проверь каналы по одному, сколько получится',
      model: Array.from({ length: 7 }, () => [LIST]),
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.modelCalls).toBe(3);
    expect(turn.steps.every((step) => step.toolChoice !== 'none' && !step.lastStepNote)).toBe(true);
    expect(turn.toolCalls).toHaveLength(3);
    expect(turn.text).toContain('Одинаковые действия');
    expect(turn.text).toContain('Задача не завершена');
    expect(turn.types.at(-1)).toBe('finish');
    expect(turn.client.messages.at(-1).parts.some((part) => part.type === 'text' && part.text.includes('Задача не завершена'))).toBe(true);
    expect(run.history.execution).toMatchObject({ state: 'settled', outcome: 'failed' });
  },
};
