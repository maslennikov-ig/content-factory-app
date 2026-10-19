'use strict';

const { loadCapabilityModule } = require('../../helpers/agent-capabilities.cjs');

const { STEP_CAP_CLOSING } = loadCapabilityModule('../conductor/conductor.steps.ts');

/** A naturally empty final response after useful tools gets the generic incomplete closing. */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-silent-last-step',
  incompleteTurns: [0],
  title: 'Предел шагов — последний шаг пустой: дверь всё равно закрывает ход строкой',
  covers: ['channels.list'],
  turns: [
    {
      say: 'Проверь каналы по одному, сколько получится',
      model: [...Array.from({ length: 2 }, () => [LIST]), [['text', ' ']]],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.modelCalls).toBe(3);
    expect(turn.steps.at(-1).toolChoice).not.toBe('none');
    expect(turn.toolCalls).toHaveLength(2);
    expect(turn.text.trim()).toBe(STEP_CAP_CLOSING.ru);
    expect(turn.types.at(-1)).toBe('finish');
    expect(turn.types.at(-2)).toBe('text-end');
  },
};
