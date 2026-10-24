'use strict';

/** A finite native no-progress budget stops redundant reads without a false success. */
const LIST = ['tool', 'channels_list', {}];
const ANSWER = 'Каналы проверены семь раз. Доступен «Канал про работу». Проверка завершена.';

module.exports = {
  id: 'turn-step-cap-last-step-speaks',
  title: 'Три одинаковых чтения без новых данных останавливаются с явным незавершённым результатом',
  incompleteTurns: [0],
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
    expect(turn.modelCalls).toBe(3);
    expect(turn.steps.every((step) => step.toolChoice !== 'none' && !step.lastStepNote)).toBe(true);
    expect(turn.toolCalls).toHaveLength(3);
    expect(turn.text).toMatch(/Одинаковые действия.*Задача не завершена/s);
    expect(turn.text).not.toContain(ANSWER);
    expect(turn.outputs.every(({ output }) => output.ok === true)).toBe(true);
    expect(turn.admissions).toEqual([['agent', 'agent', 'user-1', 'failed']]);
    expect(run.history.execution).toMatchObject({ state: 'settled', outcome: 'failed' });
    expect(turn.types.at(-1)).toBe('finish');
    expect(turn.client.messages.at(-1).parts.some((part) => part.type === 'text' && part.text === turn.text)).toBe(true);
  },
};
