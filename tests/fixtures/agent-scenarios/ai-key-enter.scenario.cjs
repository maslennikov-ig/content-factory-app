'use strict';

const contract = require('../../helpers/load-tsx.cjs').loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.contract.ts'
);

/**
 * Entering a key from the chat (kcxz.20, spec §1.5, §6.2 «Secret»): the tool
 * only shows the key card; the key is typed into the card and the browser
 * posts it to `POST /settings/ai` itself (played here by `before`, which puts
 * it where the settings door stores it). The model hears «card shown», and
 * after the person's «сохранил» reads the stored flag — never the key.
 */
const KEY = 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE11111111';

module.exports = {
  id: 'ai-key-enter',
  title: 'Свой ключ ИИ — карточка ключа, ключ уходит из браузера в настройки, в чат приходит только флаг',
  role: 'ADMIN',
  covers: ['ai.key.enter', 'ai.settings'],
  world: { ai: { usageMode: 'included' } },
  turns: [
    {
      say: 'Хотим работать на своём ключе OpenRouter',
      model: [
        [['tool', 'ai_key_enter', { field: 'workspace' }]],
        [['text', 'Введите ключ в карточке — он сразу уйдёт в настройки.']],
      ],
    },
    {
      // The key card's «Сохранить в настройках»: the browser's own request to
      // the settings door, which moves the workspace to its own key.
      before: (rows) => {
        rows.ai.apiKey = KEY;
        rows.ai.usageMode = 'workspace_key';
      },
      say: 'Ключ сохранил в настройках, продолжаем.',
      model: [[['tool', 'ai_settings', {}]], [['text', 'Ключ на месте, работаем на своём ключе.']]],
    },
  ],
  check: (run) => {
    const [ask, after] = run.turns;
    expect(ask.data).toEqual([
      {
        type: 'data-secret',
        data: { kind: 'secret', id: 'workspace-key', field: 'workspace-key' },
        transient: false,
      },
    ]);
    expect(ask.outputs[0].output).toEqual({
      ok: true,
      capability: 'ai.key.enter',
      summary: {
        field: 'workspace',
        shown: 'card',
        // On «Ключи системы» the own key is not named, not even as a flag
        // (review W3-20 F8).
        savingSwitchesTo: 'workspace_key',
        next: 'The person types the key into the card; it never reaches you. Wait for them to say it is saved, then read ai.settings.',
      },
      card: { kind: 'secret', id: 'workspace-key' },
    });
    expect(after.outputs[0].output.summary.untrustedData.value).toMatchObject({
      mode: 'workspace_key',
      keys: { workspace: true, tavily: false, exa: false },
    });
    // A reload draws the key card again, by field only.
    const blocks = contract
      .readThreadHistory(run.history)
      .messages.filter((message) => message.role === 'assistant')
      .flatMap((message) => contract.readMessageBlocks(message, []));
    expect(blocks.filter((block) => block.type === 'secret').map((block) => block.secret)).toEqual([
      { field: 'workspace-key' },
    ]);
    // Nothing went through the chat to the settings door.
    expect(run.requests.filter(([name]) => name === 'ai.settings')).toEqual([]);
    expect(run.writes).toEqual([]);
    expect(run.world.ai.apiKey).toBe(KEY);
    expect(run.secrets).toEqual({ sent: [], model: [], stored: [], stream: [], history: [], requests: [], logs: [] });
  },
};
