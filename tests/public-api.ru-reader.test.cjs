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

  test('every client hint goes through translation', () => {
    const source = fs.readFileSync(path.join(root, componentPath), 'utf8');
    // The hints used to be English literals with a Russian side table; they
    // are locale keys now, so every interface language gets them.
    expect(source).not.toMatch(/hint: '[^']+'/u);
    const hints = [...source.matchAll(/hint: t\(\s*'(mcp_hint_[a-z_]+)'/gu)];
    expect(hints.length).toBeGreaterThanOrEqual(16);
    expect(source).not.toContain('MCP_HINTS_RU');
  });
});
