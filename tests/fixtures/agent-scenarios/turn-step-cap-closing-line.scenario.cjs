'use strict';

const { loadCapabilityModule } = require('../../helpers/agent-capabilities.cjs');

const { STEP_CAP_CLOSING } = loadCapabilityModule('../conductor/conductor.steps.ts');

/** A silent technical stop gets a visible incomplete closing in the native UI stream. */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-closing-line',
  incompleteTurns: [0],
  title: 'Предел шагов — поставщик не послушал: дверь сама закрывает ход строкой «напишите «дальше»»',
  covers: ['channels.list'],
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
  },
};
