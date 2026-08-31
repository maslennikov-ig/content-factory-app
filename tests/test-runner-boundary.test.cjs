const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

describe('root test runner boundary', () => {
  test('runs every node:test suite exactly outside Jest', () => {
    const testDirectory = path.join(repositoryRoot, 'tests');
    const nativeSuites = fs
      .readdirSync(testDirectory)
      .filter((name) => name.endsWith('.test.cjs'))
      .filter((name) =>
        /require\(['"]node:test['"]\)/.test(
          fs.readFileSync(path.join(testDirectory, name), 'utf8')
        )
      )
      .map((name) => `tests/${name}`)
      .sort();
    const config = require('../jest.config.cjs');
    const ignoredByJest = nativeSuites.filter((suite) =>
      config.testPathIgnorePatterns.some((pattern) =>
        new RegExp(pattern).test(`/${suite}`)
      )
    );
    const rootTestScript = require('../package.json').scripts.test;
    const nativeCommand = rootTestScript
      .split('&&')
      .map((part) => part.trim())
      .find((part) => part.startsWith('node --test'));

    expect(nativeSuites.length).toBeGreaterThan(0);
    expect(ignoredByJest).toEqual(nativeSuites);
    expect(nativeCommand).toContain('--test-concurrency=1');
    for (const suite of nativeSuites) {
      expect(nativeCommand).toContain(` ${suite}`);
    }
  });
});
