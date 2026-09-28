'use strict';

const { loadCapabilityModule } = require('../../helpers/agent-capabilities.cjs');

const { STEP_CAP_CLOSING } = loadCapabilityModule('../conductor/conductor.steps.ts');

/**
 * W3 live walk 28.09.2026, P2-B (b): a turn that uses every step of the cap
 * ends in words. The last step allowed runs with `toolChoice: 'none'` and the
 * last step's note (`lastStepSpeaks`, Mastra's `prepareStep`); a model that
 * would call a tool once more cannot, and says what was done and what is left.
 */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-last-step-speaks',
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
    expect(turn.modelCalls).toBe(7);
    expect(turn.steps.map((step) => step.toolChoice === 'none')).toEqual([
      false, false, false, false, false, false, true,
    ]);
    expect(turn.steps.map((step) => step.lastStepNote)).toEqual([
      false, false, false, false, false, false, true,
    ]);
    expect(turn.toolCalls).toHaveLength(6);
    expect(turn.text).toContain('Напишите «дальше» — продолжим.');
    // The model spoke: the door adds nothing of its own.
    expect(turn.text).not.toContain(STEP_CAP_CLOSING.ru);
    expect(turn.types.at(-1)).toBe('finish');
  },
};
