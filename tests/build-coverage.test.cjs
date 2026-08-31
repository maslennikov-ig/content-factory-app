const fs = require('fs');
const path = require('path');

/**
 * Every application that can be built has to be built by the release gate.
 *
 * `apps/commands` sat outside the root `build` script and did not compile for
 * over a year: the command `run:agent` arrived from upstream calling a method
 * the service never had, and no gate looked. The break surfaced only because an
 * audit read the file. Adding that application to the script fixes this
 * instance; this test is what stops the next one, because the failure mode is
 * not a bad application but a forgotten one.
 *
 * An application may be left out — the browser extension legitimately is — but
 * only by name and with a reason, so the omission is a decision somebody can
 * read rather than an oversight nobody can see.
 */
const repoRoot = path.join(__dirname, '..');

const EXCLUDED = {
  extension:
    'Browser extension, not part of the server release: its build shells out to `zip` and produces extension.zip, which no deployment consumes.',
};

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
}

function buildableApps() {
  return fs
    .readdirSync(path.join(repoRoot, 'apps'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const manifest = path.join(repoRoot, 'apps', name, 'package.json');
      if (!fs.existsSync(manifest)) return false;
      return Boolean(readJson(`apps/${name}/package.json`).scripts?.build);
    })
    .sort();
}

function filteredApps(script) {
  return [...script.matchAll(/--filter\s+\.\/apps\/([\w-]+)/g)]
    .map((match) => match[1])
    .sort();
}

describe('release build coverage', () => {
  const rootScript = readJson('package.json').scripts.build;

  test('builds every application that is not excluded by name', () => {
    const built = filteredApps(rootScript);
    const expected = buildableApps().filter((name) => !(name in EXCLUDED));

    expect(built).toEqual(expected);
  });

  test('excludes nothing that does not exist, and gives a reason for what it does', () => {
    const apps = buildableApps();
    for (const [name, reason] of Object.entries(EXCLUDED)) {
      expect(apps).toContain(name);
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(40);
    }
  });

  test('does not build an application twice', () => {
    const built = filteredApps(rootScript);
    expect(new Set(built).size).toBe(built.length);
  });

  test('the command whose absence hid the break is gone, not renamed', () => {
    expect(fs.existsSync(path.join(repoRoot, 'apps/commands/src/tasks/agent.run.ts'))).toBe(false);

    const module = fs.readFileSync(
      path.join(repoRoot, 'apps/commands/src/command.module.ts'),
      'utf8'
    );
    expect(module).not.toMatch(/AgentRun|agent\.run/);
  });
});
