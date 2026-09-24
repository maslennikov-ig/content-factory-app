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

  test('every client hint has a Russian sentence', () => {
    const source = fs.readFileSync(path.join(root, componentPath), 'utf8');
    const hints = new Set(
      [...source.matchAll(/hint: '([^']+)'/gu)].map(([, hint]) => hint)
    );
    expect(hints.size).toBeGreaterThanOrEqual(8);
    const table = source.slice(
      source.indexOf('const MCP_HINTS_RU'),
      source.indexOf('const localizeMcpHint')
    );
    for (const hint of hints) {
      expect(table).toContain(`'${hint}':`);
    }
    expect(source).toMatch(/localizeMcpHint\(hint, locale\)/u);
  });
});
