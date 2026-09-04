const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

/**
 * The stand and the suite must not share the working tree.
 *
 * `next dev` watches `apps/frontend/src` and Tailwind globs it — and all of
 * `libraries/**` — on every CSS build; `nest start --watch` watches the same
 * trees. A fixture that appears and disappears there during a run has already
 * cost this project hours: when the delete lands between Tailwind's glob and
 * its read, the CSS build throws `ENOENT` against a file that no longer
 * exists, nothing can invalidate that failure, and every page of the running
 * stand answers 500 until `.next` is removed and the server restarted.
 *
 * The guard turns that into a test failure at the moment of the write.
 */
describe('the suite never writes into the tree the stand watches', () => {
  test('Jest loads the guard for every suite', () => {
    const config = require('../jest.config.cjs');

    expect(config.setupFiles).toContain(
      '<rootDir>/tests/helpers/source-tree-guard.cjs'
    );
  });

  test('refuses a write into a watched tree and names the way out', () => {
    const target = path.join(
      repositoryRoot,
      'apps/frontend/src/__guard_probe__.ts'
    );

    expect(() => fs.writeFileSync(target, 'probe')).toThrow(
      /apps\/frontend\/src\/__guard_probe__\.ts/
    );
    expect(() => fs.writeFileSync(target, 'probe')).toThrow(/temporary/i);
    expect(fs.existsSync(target)).toBe(false);
  });

  test('covers the ways a fixture actually reaches the tree', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-guard-probe-'));
    try {
      const source = path.join(scratch, 'source.ts');
      fs.writeFileSync(source, 'export const a = 1;\n');

      // The brand-scan fixtures were symlinks, and a copy or a rename reaches
      // the same place by another name.
      const link = path.join(
        repositoryRoot,
        'libraries/nestjs-libraries/src/chat/__guard_probe__.ts'
      );
      expect(() => fs.symlinkSync(source, link)).toThrow(/__guard_probe__/);
      expect(() =>
        fs.copyFileSync(
          source,
          path.join(repositoryRoot, 'apps/sdk/src/__guard_probe__.ts')
        )
      ).toThrow(/__guard_probe__/);
      expect(() =>
        fs.renameSync(
          source,
          path.join(repositoryRoot, 'apps/orchestrator/src/__guard_probe__.ts')
        )
      ).toThrow(/__guard_probe__/);
      expect(() =>
        fs.mkdirSync(path.join(repositoryRoot, 'apps/frontend/src/__probe__'))
      ).toThrow(/__probe__/);

      // Deleting there is the other half of the same defect.
      expect(() =>
        fs.rmSync(
          path.join(repositoryRoot, 'apps/frontend/src/app/global.scss'),
          { force: true }
        )
      ).toThrow(/global\.scss/);
      expect(
        fs.existsSync(
          path.join(repositoryRoot, 'apps/frontend/src/app/global.scss')
        )
      ).toBe(true);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  // A green suite that leaves the tree dirty is a green suite nobody can
  // record a release receipt against without cleaning up by hand first. The
  // public funnel proof did exactly that on every full run, rewriting the day
  // inside its own evidence (content-factory-next-4a79).
  test('refuses a write into stage evidence and says why that is different', () => {
    const target = path.join(
      repositoryRoot,
      '.codex/stages/content-factory-next-or3/evidence/public-funnel-runtime/database.json'
    );
    // The public tree carries no stage evidence at all (the runbook strips
    // `.codex/stages/*/evidence/` on purpose), so the record may be absent
    // where CI runs. The refusal is about the path, not the file.
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

    expect(() => fs.writeFileSync(target, '{}')).toThrow(/database\.json/);
    expect(() => fs.writeFileSync(target, '{}')).toThrow(/records a run/i);
    expect(() =>
      fs.rmSync(path.dirname(target), { recursive: true, force: true })
    ).toThrow(/public-funnel-runtime/);
    if (before !== null) {
      expect(fs.readFileSync(target, 'utf8')).toBe(before);
    } else {
      expect(fs.existsSync(target)).toBe(false);
    }
  });

  test('leaves the rest of a stage — its summary and its plan — alone', () => {
    const { isWatched } = require('./helpers/source-tree-guard.cjs');

    expect(
      isWatched(path.join(repositoryRoot, '.codex/stages/some-stage/summary.md'))
    ).toBe(false);
    expect(isWatched(path.join(repositoryRoot, '.codex/handoff.md'))).toBe(false);
    // A fixture repository built in a temporary directory has the same shape
    // and is not this repository's evidence.
    expect(
      isWatched(path.join(os.tmpdir(), 'fixture/.codex/stages/a/evidence/x.txt'))
    ).toBe(false);
  });

  test('leaves reads, build output and everything outside those trees alone', () => {
    expect(() =>
      fs.readFileSync(
        path.join(repositoryRoot, 'apps/frontend/src/app/global.scss'),
        'utf8'
      )
    ).not.toThrow();

    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-guard-allow-'));
    try {
      const file = path.join(scratch, 'fixture.ts');
      fs.writeFileSync(file, 'ok');
      expect(fs.readFileSync(file, 'utf8')).toBe('ok');
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }

    const { isWatched } = require('./helpers/source-tree-guard.cjs');
    expect(isWatched(path.join(repositoryRoot, 'apps/frontend/.next/dev/x')))
      .toBe(false);
    expect(isWatched(path.join(repositoryRoot, 'apps/backend/dist/main.js')))
      .toBe(false);
    expect(isWatched(path.join(repositoryRoot, 'node_modules/x/index.js')))
      .toBe(false);
    expect(isWatched(path.join(repositoryRoot, 'coverage/junit.xml'))).toBe(
      false
    );
  });
});
