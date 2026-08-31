const fs = require('node:fs');
const path = require('node:path');

const {
  repositoryRoot,
  readDockerignore,
  isExcludedFromBuildContext,
} = require('./helpers/build-context.cjs');

/**
 * The published legal documents are read off disk at request time, so they
 * have to be inside the image — and `.dockerignore` excludes `**\/*.md`,
 * which is exactly what they are.
 *
 * This is not hypothetical. The documents shipped on 2026-08-20 looked correct
 * in the repository and in the source archive, while `/privacy` served its
 * "not published yet" placeholder in production: the build context dropped all
 * 48 files and left the directory empty. Nothing failed, nothing logged, and
 * the page rendered a heading over an apology.
 *
 * The `.dockerignore` reading lives in `helpers/build-context.cjs`: the same
 * matching decides what `tests/evidence-material.build-context.test.cjs` sees,
 * and two copies of one Docker pattern parser would drift apart exactly when
 * one of them mattered.
 */

describe('the published legal documents reach the image', () => {
  const patterns = readDockerignore();
  const contentDirectory = path.join(
    repositoryRoot,
    'apps/frontend/src/content/legal'
  );

  it('ships every document the repository publishes', () => {
    const documents = fs
      .readdirSync(contentDirectory)
      .filter((name) => name.endsWith('.md'));

    // A guard over an empty directory proves nothing.
    expect(documents.length).toBeGreaterThan(0);

    const dropped = documents.filter((name) =>
      isExcludedFromBuildContext(
        `apps/frontend/src/content/legal/${name}`,
        patterns
      )
    );

    expect(dropped).toEqual([]);
  });

  it('still keeps ordinary repository prose out', () => {
    // The counterpart: if the blanket `**/*.md` rule were dropped instead of
    // excepted, the test above would pass while the image gained every runbook
    // and ADR in the repository.
    for (const file of ['README.md', 'AGENTS.md', 'docs/operations/configuration.md']) {
      expect(isExcludedFromBuildContext(file, patterns)).toBe(true);
    }
  });

  it('reads them from the path the exception names', () => {
    // The exception is written as a literal path, so a move would silently put
    // the documents back outside the build context.
    const loader = fs.readFileSync(
      path.join(
        repositoryRoot,
        'apps/frontend/src/components/public-saas/legal-documents.ts'
      ),
      'utf8'
    );

    expect(loader).toContain("join('src', 'content', 'legal')");
    expect(loader).toContain("'apps', 'frontend'");
  });
});
