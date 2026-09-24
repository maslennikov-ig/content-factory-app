'use strict';

/**
 * `content-factory-next-fn33.147` and `fn33.154` — two hints sent a reader to
 * settings tabs that do not exist: «Настройки → ИИ» (the AI keys live in
 * «Глобальные настройки») and «Настройки >> Публичный API» (the tab is
 * «Разработчики»), the second with «MCP Server» in English and a machine
 * `>>`. Each hint now names the tab by that tab's own label in every locale,
 * so the words cannot drift apart again without this failing.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localesDir = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);
const locales = fs
  .readdirSync(localesDir)
  .filter((locale) =>
    fs.existsSync(path.join(localesDir, locale, 'translation.json'))
  );
const read = (locale) =>
  JSON.parse(
    fs.readFileSync(path.join(localesDir, locale, 'translation.json'), 'utf8')
  );

describe('hints name settings tabs that exist', () => {
  test('the settings screen shows these two tabs under these keys', () => {
    const source = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/layout/settings.component.tsx'),
      'utf8'
    );
    expect(source).toContain("t('global_settings', 'Global Settings')");
    expect(source).toContain("t('developers', 'Developers')");
  });

  test.each(locales)('%s: AI hints point at global settings', (locale) => {
    const messages = read(locale);
    for (const key of ['ai_allowance_unavailable', 'ai_allowance_none']) {
      expect(messages[key]).toContain(messages.global_settings);
      expect(messages[key]).not.toMatch(/[→←] (AI|ИИ)\b/u);
    }
  });

  test.each(locales)('%s: the agent welcome points at developers', (locale) => {
    const welcome = read(locale).agent_welcome_message;
    expect(welcome).toContain(read(locale).developers);
    expect(welcome).not.toContain('>>');
    expect(welcome).not.toMatch(/Public API|MCP Server/u);
  });

  test('ru: no English inside the Russian welcome', () => {
    expect(read('ru').agent_welcome_message).toContain(
      'MCP-сервер: это в «Настройки → Разработчики».'
    );
  });
});
