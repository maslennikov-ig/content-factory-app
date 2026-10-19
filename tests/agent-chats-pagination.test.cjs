'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
test('installed native Mastra pages reach 105 owned threads and all405 messages without model operations', () => {
  const result = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-chats-native-pagination.cjs')], { encoding: 'utf8', timeout: 30000 });
  expect(JSON.parse(result)).toEqual({ passed: true, threads: 105, messages: 405, modelCalls: 0 });
});
test('all16 navigation chrome locales are complete and keep distinct new/list actions', () => {
  const { chatWordsFor } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.chats.copy.ts');
  for (const locale of ['ru','en','de','fr','es','it','pt','tr','vi','ja','ko','zh','ar','he','bn','ka_ge']) {
    const words = chatWordsFor(locale);
    expect(Object.keys(words)).toHaveLength(19);
    expect(Object.values(words).every((value) => typeof value === 'string' && value.trim())).toBe(true);
    expect(words.label).not.toBe(words.newThread);
  }
  expect(chatWordsFor('ru-RU').newThread).toBe('Новый чат');
});
