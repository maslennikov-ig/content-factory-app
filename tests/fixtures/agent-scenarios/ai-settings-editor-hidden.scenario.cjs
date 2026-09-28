'use strict';

/**
 * The AI settings are the administrator's (the `/settings/ai` doors'
 * `@CheckPolicies`): an editor is offered none of them — not the reads, not
 * the mode, not the key card (kcxz.20).
 */
module.exports = {
  id: 'ai-settings-editor-hidden',
  title: 'Редактор — ни одного действия настроек ИИ',
  role: 'EDITOR',
  covers: ['workspace.snapshot'],
  turns: [
    {
      say: 'Покажи настройки ИИ и поставь наш ключ',
      model: [[['tool', 'workspace_snapshot', {}]], [['text', 'Настройки ИИ — у администратора пространства.']]],
    },
  ],
  check: (run) => {
    const offered = run.firstCall.tools;
    expect(offered).toEqual(expect.arrayContaining(['workspace_snapshot', 'channels_list']));
    expect(offered.filter((tool) => tool.startsWith('ai_'))).toEqual([]);
    expect(run.reads.filter((name) => name.startsWith('AiProviderService'))).toEqual([]);
    expect(run.writes).toEqual([]);
  },
};
