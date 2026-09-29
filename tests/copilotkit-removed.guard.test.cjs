'use strict';

/**
 * CopilotKit left the repository with W6 (`content-factory-next-kcxz.28`).
 *
 * Its last user was the post editor's helper — a popup that rewrote the post
 * through a `setPosts` action, autocomplete in three text fields, and the
 * `POST /copilot/chat` runtime behind them. The agent chat does that work on
 * the piece and its adaptation now, and the post window opens it with
 * «Спросить агента». This guard keeps the library, its AG-UI transport and
 * the door from coming back by accident: a dependency, an import, a runtime
 * header, a style sheet or a route.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const REMOVED = /@copilotkit\/|@ag-ui\//;

const sources = () => {
  const out = [];
  const stack = ['apps', 'libraries'].map((dir) => path.join(root, dir));
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', '.next', 'dist', '.turbo'].includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(tsx?|jsx?|mjs|cjs|s?css|json)$/.test(entry.name)) {
        out.push({ relative: path.relative(root, full).split(path.sep).join('/'), source: fs.readFileSync(full, 'utf8') });
      }
    }
  }
  return out;
};

describe('CopilotKit is gone (kcxz.28)', () => {
  test('no package.json in the workspace depends on @copilotkit/* or @ag-ui/*', () => {
    const manifests = ['package.json', ...sources().filter(({ relative }) => relative.endsWith('/package.json')).map(({ relative }) => relative)];
    for (const manifest of manifests) {
      const json = JSON.parse(read(manifest));
      const named = Object.keys({
        ...json.dependencies,
        ...json.devDependencies,
        ...json.peerDependencies,
        ...json.optionalDependencies,
      });
      expect({ manifest, removed: named.filter((name) => REMOVED.test(name)) }).toEqual({ manifest, removed: [] });
    }
  });

  test('the committed lockfile resolves neither', () => {
    expect(read('pnpm-lock.yaml')).not.toMatch(REMOVED);
  });

  test('no source imports them or loads their style sheet', () => {
    const offenders = sources()
      .filter(({ source }) => /(from\s+|import\s*\(|import\s+|require\()\s*['"](@copilotkit|@ag-ui)\//.test(source))
      .map(({ relative }) => relative);
    expect(offenders).toEqual([]);
  });

  test('no copilot runtime door, CORS header or popup style is left', () => {
    expect(read('apps/backend/src/api/routes/copilot.controller.ts')).not.toMatch(/@Post\('\/chat'\)/);
    expect(read('apps/backend/src/cors.options.ts')).not.toMatch(/'x-copilotkit/i);
    expect(read('apps/frontend/src/app/global.scss')).not.toMatch(/copilotKit|copilot-kit/);
    expect(read('apps/frontend/src/components/layout/click.outside.tsx')).not.toMatch(/copilotKit/);
    expect(fs.existsSync(path.join(root, 'apps/frontend/src/components/copilot'))).toBe(false);
  });
});

describe('«есть ли чем ответить» outlived the helper', () => {
  const AVAILABILITY = 'apps/frontend/src/components/agents/assistant-availability.ts';
  const withoutBlockComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');

  test('asked of the existing allowance door, once per screen, and only when asked for', () => {
    const source = withoutBlockComments(read(AVAILABILITY));
    expect(source).toMatch(/useSWR\(\s*enabled \? ALLOWANCE_API : null/);
    expect(source).toMatch(/readAllowance/);
    expect(source).not.toMatch(/'\/copilot\//);
    // «Not known yet» and «the door did not answer» are not «yes».
    expect(source).toMatch(/if \(isLoading\) return 'checking';/);
    expect(source).toMatch(/if \(error\) return 'unknown';/);
    expect(source).toMatch(/useAssistantAvailable[\s\S]{0,200}useAssistantAvailability\(enabled\) === 'available'/);
  });
});
