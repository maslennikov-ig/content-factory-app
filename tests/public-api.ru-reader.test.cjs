'use strict';

/**
 * `content-factory-next-fn33.143` — «Настройки → Разработчики» under a
 * Russian interface read «Developer access», «Public API and MCP» and «Run
 * this command in your terminal.»: the surface was never told the language
 * and the client hints were English literals.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const componentPath =
  'apps/frontend/src/components/public-api/public.component.tsx';
const { PublicApiSurface } = loadTypeScriptModule(
  'apps/frontend/src/components/public-api/public-api.surface.tsx'
);

describe('developer settings speak the reader language', () => {
  test('ru surface has no English header', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PublicApiSurface, { state: 'default', locale: 'ru' })
    );
    expect(markup).toContain('Доступ разработчика');
    expect(markup).toContain('Публичный API и MCP');
    expect(markup).not.toMatch(/Developer access|Public API and MCP|Manage API/u);
  });

  test('every surface call site passes the interface language', () => {
    const source = fs.readFileSync(path.join(root, componentPath), 'utf8');
    const calls = source.match(/<PublicApiSurface\b[^>]*>/gu) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) expect(call).toMatch(/locale=\{locale\}/u);
  });

  test('the MCP steps go through translation; no per-client key config is left', () => {
    const source = fs.readFileSync(path.join(root, componentPath), 'utf8');
    // The per-client hints configured the workspace key in a header; MCP takes
    // OAuth only (`content-factory-next-kcxz.26`) and moved to «Одобренные
    // приложения», which every member sees (live walk W4 P2-A).
    expect(source).not.toMatch(/hint: '[^']+'/u);
    expect(source).not.toMatch(/mcp_hint_|mcp-oauth|McpSection|Authorization: \$\{|headers: \{ Authorization/u);
    const section = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/approved-apps/mcp-connect.section.tsx'),
      'utf8'
    );
    /*
      `content-factory-next-kcxz.54`: the shared mixed list split into two
      scenarios behind `Segmented`, so a source-order regex over one flat list
      no longer describes the file — the two step columns live in different
      JSX branches. What still has to hold: every step title, body and
      menu-path chip goes through `t()`, and nothing is a hand-typed English
      literal.
    */
    const keys = [
      ...new Set(
        [...section.matchAll(/t\(\s*'(mcp_connect_[a-z0-9_]+)'/gu)].map(
          ([, key]) => key
        )
      ),
    ];
    expect(keys.sort()).toEqual(
      [
        'mcp_connect_assistant_chatgpt',
        'mcp_connect_assistant_claude',
        'mcp_connect_assistant_switch_label',
        'mcp_connect_chatgpt_1_body',
        'mcp_connect_chatgpt_1_title',
        'mcp_connect_chatgpt_2_body',
        'mcp_connect_chatgpt_2_title',
        'mcp_connect_chatgpt_3_body',
        'mcp_connect_chatgpt_3_title',
        'mcp_connect_chatgpt_readonly_lead',
        'mcp_connect_chatgpt_readonly_rest',
        'mcp_connect_claude_1_body',
        'mcp_connect_claude_1_title',
        'mcp_connect_claude_2_body',
        'mcp_connect_claude_2_title',
        'mcp_connect_claude_3_body',
        'mcp_connect_claude_3_title',
        'mcp_connect_description',
        'mcp_connect_footer_note',
        'mcp_connect_menu_chatgpt_create',
        'mcp_connect_menu_chatgpt_developer',
        'mcp_connect_menu_claude_connectors',
        'mcp_connect_title',
      ].sort()
    );
    const ru = JSON.parse(
      fs.readFileSync(
        path.join(root, 'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'),
        'utf8'
      )
    );
    // Brand names and ChatGPT's own (English-only) menu labels carry the same
    // text in both languages on purpose — the rest is prose and must read as
    // Russian, not a leftover English sentence.
    const literalEverywhere = new Set([
      'mcp_connect_assistant_claude',
      'mcp_connect_assistant_chatgpt',
      'mcp_connect_menu_chatgpt_developer',
      'mcp_connect_menu_chatgpt_create',
    ]);
    for (const key of keys) {
      expect(typeof ru[key]).toBe('string');
      if (!literalEverywhere.has(key)) expect(ru[key]).toMatch(/[а-яё]/u);
    }
    expect(source).not.toContain('MCP_HINTS_RU');
  });
});
