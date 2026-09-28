'use strict';

const { loadCapabilityModule } = require('../../helpers/agent-capabilities.cjs');

const { STEP_CAP_CLOSING } = loadCapabilityModule('../conductor/conductor.steps.ts');

/**
 * Correctness review of the W3 walk fixes, F1: `toolChoice: 'none'` honoured,
 * the model answers its last step with nothing — an empty text, finish
 * `stop`. Before, the door wrote its closing line only for a `tool-calls`
 * finish, so this turn still ended in silence. Now any finish that is not an
 * error, with no words and no card after the last tool, gets the line.
 */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-silent-last-step',
  title: 'Предел шагов — последний шаг пустой: дверь всё равно закрывает ход строкой',
  covers: ['channels.list'],
  turns: [
    {
      say: 'Проверь каналы по одному, сколько получится',
      model: [...Array.from({ length: 6 }, () => [LIST]), [['text', ' ']]],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.modelCalls).toBe(7);
    expect(turn.steps.at(-1).toolChoice).toBe('none');
    expect(turn.toolCalls).toHaveLength(6);
    expect(turn.text.trim()).toBe(STEP_CAP_CLOSING.ru);
    expect(turn.types.at(-1)).toBe('finish');
    expect(turn.types.at(-2)).toBe('text-end');
  },
};
