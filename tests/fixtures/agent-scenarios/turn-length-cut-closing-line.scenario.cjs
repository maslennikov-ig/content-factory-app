'use strict';

const { loadCapabilityModule } = require('../../helpers/agent-capabilities.cjs');

const { STEP_CAP_CLOSING } = loadCapabilityModule('../conductor/conductor.steps.ts');

/**
 * Correctness review of the W3 walk fixes, F1: a reasoning model whose budget
 * went on reasoning ends the step after a tool with `finishReason: length`
 * and no words (the production chain has met this, 97dq.68). The door's
 * closing line answers for it; a turn that spoke is left alone.
 */
module.exports = {
  id: 'turn-length-cut-closing-line',
  title: 'Обрыв по длине после инструмента — дверь закрывает ход строкой',
  covers: ['channels.list'],
  turns: [
    {
      say: 'Какие у меня каналы?',
      model: [[['tool', 'channels_list', {}]], [['finish', 'length']]],
    },
    {
      say: 'А ещё раз?',
      model: [[['tool', 'channels_list', {}]], [['text', 'Один канал: «Канал про работу».'], ['finish', 'length']]],
    },
  ],
  check: (run) => {
    const [cut, spoke] = run.turns;
    expect(cut.modelCalls).toBe(2);
    expect(cut.text).toBe(STEP_CAP_CLOSING.ru);
    expect(cut.types.slice(-4)).toEqual(['text-start', 'text-delta', 'text-end', 'finish']);
    // Words after the tool are an answer, whatever the finish reason.
    expect(spoke.text).toBe('Один канал: «Канал про работу».');
  },
};
