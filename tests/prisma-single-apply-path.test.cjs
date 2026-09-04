const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

/**
 * This repository has exactly one way to change the production schema, and it
 * is deliberate rather than accidental: `prisma migrate diff` prints the SQL,
 * the operator selects their own statements,
 * `scripts/operations/validate-prisma-migration-sql.cjs` checks the selection,
 * and a targeted `psql` applies it.
 *
 * The reason is in the same database. Mastra keeps 29 `mastra_*` tables in
 * schema `public` that `schema.prisma` does not describe, so anything that
 * reconciles the schema automatically reads them as drift and drops them —
 * this is why `prisma db push` is banned (issue `content-factory-next-3tx`).
 * Prisma has also never kept a migration history here, so `migrate deploy`
 * would treat the live database as uninitialised.
 *
 * A `migrations` directory therefore is not a harmless extra. It is a second,
 * undocumented apply path that looks official, and it appeared once already
 * (`content-factory-next-1ch`). These checks are what stop it appearing again
 * quietly.
 */

/**
 * Walked rather than read out of `git ls-files`: the image ships these tests
 * and has no git, and a guard that cannot run where the artifact runs is not a
 * guard. Dependencies and build output are skipped — they are not ours to
 * police and they are most of the tree.
 */
const skippedDirectories = new Set([
  '.git',
  '.beads',
  // Agent worktrees are whole copies of the tree; scanning them reports every
  // guard, this one included, as its own offender.
  '.claude',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'reports',
  'var',
]);

const listRepositoryFiles = (directory = repositoryRoot, prefix = '') => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) {
        continue;
      }
      files.push(
        ...listRepositoryFiles(
          path.join(directory, entry.name),
          `${prefix}${entry.name}/`
        )
      );
      continue;
    }
    if (entry.isFile()) {
      files.push(`${prefix}${entry.name}`);
    }
  }
  return files;
};

describe('the production schema has a single apply path', () => {
  const trackedFiles = listRepositoryFiles();

  it('carries no Prisma migrations directory', () => {
    const migrationFiles = trackedFiles.filter((file) =>
      /(^|\/)prisma\/migrations\//.test(file)
    );

    expect(migrationFiles).toEqual([]);
  });

  it('never invokes prisma migrate deploy or migrate dev', () => {
    const candidates = trackedFiles.filter(
      (file) =>
        // This file names the forbidden command in order to look for it.
        file !== 'tests/prisma-single-apply-path.test.cjs' &&
        (/\.(json|sh|ya?ml|cjs|mjs|ts|js)$/.test(file) ||
          /(^|\/)Dockerfile[^/]*$/.test(file))
    );

    const offenders = [];
    for (const file of candidates) {
      let contents;
      try {
        contents = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
      } catch (error) {
        /**
         * Отслеживаемый файл, которого нет на диске, — не нарушитель.
         *
         * `public-funnel-runtime-proof` пересобирает своё свидетельство и на
         * восемнадцать секунд удаляет шесть отслеживаемых файлов. В полном
         * прогоне два набора идут одновременно, и этот падал на `ENOENT` в
         * файле, к Prisma отношения не имеющем. Пропуск ничего не прячет:
         * страж ищет запрещённую команду в том, что лежит на диске, а команды,
         * которой на диске нет, нет и в образе.
         */
        if (error?.code !== 'ENOENT') throw error;
        continue;
      }
      if (/prisma\s+migrate\s+(deploy|dev|reset)/.test(contents)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the runbook truthful about the absent directory', () => {
    const runbook = fs.readFileSync(
      path.join(repositoryRoot, 'docs/operations/production-deploy.md'),
      'utf8'
    );

    expect(runbook).toContain('Каталога `migrations`');
    expect(runbook).toMatch(/prisma migrate diff/);
  });

  it('describes the support relay table in the schema, not in a migration', () => {
    // The table the stray migration would have created. If it is only in a
    // migration file, the documented path never creates it and the relay
    // silently queues forever.
    const schema = fs.readFileSync(
      path.join(
        repositoryRoot,
        'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
      ),
      'utf8'
    );

    expect(schema).toMatch(/model\s+TelegramSupportRelayOutbox\s*\{/);
  });
});
