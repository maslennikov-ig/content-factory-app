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
    const steps = [...section.matchAll(/t\(\s*'(mcp_connect_step_[a-z]+)'/gu)].map(([, key]) => key);
    expect(steps).toEqual(['mcp_connect_step_claude', 'mcp_connect_step_chatgpt', 'mcp_connect_step_allow']);
    const ru = JSON.parse(
      fs.readFileSync(
        path.join(root, 'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'),
        'utf8'
      )
    );
    for (const key of steps) expect(ru[key]).toMatch(/[а-яё]/u);
    expect(source).not.toContain('MCP_HINTS_RU');
  });
});
