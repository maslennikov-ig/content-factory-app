const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve(
  __dirname,
  '../apps/frontend/src/components/launches/statistics.empty.state.ts'
);
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(
  loaded.exports,
  require,
  loaded
);
const { statisticsEmptyState } = loaded.exports;

describe('post statistics capability empty state', () => {
  test('explains the provider boundary when platform analytics do not exist', () => {
    expect(statisticsEmptyState({ hasPostAnalytics: false, clicks: [] })).toBe(
      'platform-unavailable'
    );
  });

  test('keeps the ordinary no-data state for capable providers', () => {
    expect(statisticsEmptyState({ hasPostAnalytics: true, clicks: [] })).toBe(
      'no-data'
    );
  });

  test('does not render an empty state when short-link clicks exist', () => {
    expect(
      statisticsEmptyState({ hasPostAnalytics: false, clicks: [{}] })
    ).toBeNull();
  });
});
