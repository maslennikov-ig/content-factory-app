'use strict';

const { loadCapabilityModule } = require('../../helpers/agent-capabilities.cjs');

const { STEP_CAP_CLOSING } = loadCapabilityModule('../conductor/conductor.steps.ts');

/** Repeated identical reads stop as incomplete; no forced tool-none step manufactures completion. */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-last-step-speaks',
  incompleteTurns: [0],
  title: 'Предел шагов — последний шаг без инструментов и со словами «что сделано и что осталось»',
  covers: ['channels.list'],
  turns: [
    {
      say: 'Проверь каналы по одному, сколько получится',
      model: [
        ...Array.from({ length: 6 }, () => [LIST]),
        // The model would go on; on the last step it cannot.
        [LIST, ['text', 'Проверили каналы шесть раз, дальше не успели. Напишите «дальше» — продолжим.']],
      ],
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
