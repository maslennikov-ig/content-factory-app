const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/**
 * Three names that differ by one word, and each swap breaks something else.
 *
 * Since 31.08.2026: `content-factory-next` is the private working repository,
 * `content-factory-app` is the published tree, and
 * `ghcr.io/…/content-factory-next` is the image registry the production host
 * pulls from. The registry kept the old name because the package was created
 * there, and the production host's `CF_IMAGE` points at it — renaming it to
 * match the public repository would break the deploy and its rollback target in
 * one move.
 *
 * Written down in AGENTS.md, and checked here, because a note is something to
 * remember and a test is something to trip over.
 */

const RELEASE_SCRIPTS = [
  'scripts/release/push-image.sh',
  'scripts/release/pull-image-on-host.sh',
];

describe('the release path keeps the registry name it was created with', () => {
  test.each(RELEASE_SCRIPTS)('%s builds the image path from content-factory-next', (relative) => {
    const source = read(relative);
    expect(source).toMatch(/content-factory-next:\$\{?tag\}?/);
  });

  test.each(RELEASE_SCRIPTS)('%s never names the public repository', (relative) => {
    // The public repository holds source, not packages. A rename here would be
    // invisible until a deploy pulled a tag that does not exist.
    expect(read(relative)).not.toContain('content-factory-app');
  });

  test('the deploy runbook still documents the old registry path', () => {
    expect(read('docs/operations/production-deploy.md')).toContain(
      'ghcr.io/maslennikov-ig/content-factory-next'
    );
  });
});

describe('reports and metadata point at the public repository', () => {
  test.each([
    ['SECURITY.md', 'security advisories'],
    ['.github/ISSUE_TEMPLATE/config.yml', 'the issue template'],
    ['package.json', 'package metadata'],
  ])('%s names content-factory-app (%s)', (relative) => {
    const source = read(relative);
    expect(source).toContain('maslennikov-ig/content-factory-app');
    expect(source).not.toContain('maslennikov-ig/content-factory-next');
  });
});

describe('the contract states all three addresses', () => {
  const agents = read('AGENTS.md');

  test.each([
    ['maslennikov-ig/content-factory-next', 'the private working repository'],
    ['maslennikov-ig/content-factory-app', 'the published tree'],
    ['ghcr.io/maslennikov-ig/content-factory-next', 'the image registry'],
  ])('AGENTS.md names %s — %s', (address) => {
    expect(agents).toContain(address);
  });

  test('and warns against the two swaps that would do damage', () => {
    // Losing the warnings is how the distinction gets lost. Anchored on the
    // rule, not on the wording, so the text can be improved without this test
    // becoming a spelling check.
    expect(agents).toMatch(/Never add the public remote to this checkout/);
    expect(agents).toMatch(/Never rename the image package/);
  });
});

describe('the public clone is an output, not a second working copy', () => {
  test('nothing in this repository reads or writes it as a source', () => {
    // `prepare-public-tree.sh` takes the target as an argument precisely so the
    // path is not baked in anywhere. A hardcoded path would be the first step
    // towards treating it as a place to work.
    const script = read('scripts/operations/prepare-public-tree.sh');
    expect(script).not.toContain('/home/me/code/content-factory-app');
  });
});
