'use strict';

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
  incompleteTurns: [0, 1],
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
    expect(cut.text).toContain('Задача не завершена');
    expect(cut.types.slice(-4)).toEqual(['text-start', 'text-delta', 'text-end', 'finish']);
    // Preserve useful partial words, while the terminal length remains incomplete.
    expect(spoke.text).toBe('Один канал: «Канал про работу».');
    expect(run.writes).toEqual([]);
    for (const turn of [cut, spoke]) {
      expect(turn.modelCalls).toBe(2);
      expect(turn.toolCalls).toHaveLength(1);
      expect(turn.outputs[0]).toMatchObject({ toolName: 'channels_list', output: { ok: true } });
      expect(turn.admissions).toEqual([['agent', 'agent', 'user-1', 'failed']]);
    }
    expect(run.history.execution).toMatchObject({ state: 'settled', outcome: 'failed' });
  },
};
