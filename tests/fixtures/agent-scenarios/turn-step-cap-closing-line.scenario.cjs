'use strict';

const { loadCapabilityModule } = require('../../helpers/agent-capabilities.cjs');

const { STEP_CAP_CLOSING } = loadCapabilityModule('../conductor/conductor.steps.ts');

/**
 * W3 live walk 28.09.2026, P2-B (b), the door's guarantee: a provider that
 * calls tools even under `toolChoice: 'none'` still leaves the stream ending
 * on tool calls with no words and no card — the walk's silence. The door then
 * writes its own closing line before `finish`, and the browser's chat core
 * takes it like any text.
 */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-closing-line',
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
    expect(turn.modelCalls).toBe(7);
    expect(turn.steps.at(-1).toolChoice).toBe('none');
    expect(turn.toolCalls).toHaveLength(7);
    expect(turn.text).toBe(STEP_CAP_CLOSING.ru);
    // Before the finish, as ordinary text the chat core keeps.
    const types = turn.types;
    expect(types.slice(-4)).toEqual(['text-start', 'text-delta', 'text-end', 'finish']);
    expect(turn.client.messages.at(-1).parts.some((part) => part.type === 'text' && part.text === STEP_CAP_CLOSING.ru)).toBe(true);
  },
};
