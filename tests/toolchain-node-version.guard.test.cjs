const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

/**
 * `.nvmrc` names the Node this repository is built and tested against. Running
 * the suite on a different major does not fail as "wrong Node" — it fails
 * somewhere downstream, in someone else's words. The recorded case: under Node
 * 24 the public-funnel proof failed with a message about its own runtime, and
 * the version was suspected last rather than first.
 *
 * On this machine that is not a hypothetical. `/home/me/.local/bin/node` sits
 * ahead of nvm in PATH, so a shell that has not been pointed at
 * `~/.nvm/versions/node/<version>/bin` silently runs the wrong one, and every
 * command in a session inherits it.
 *
 * Majors, not exact versions: a patch difference has never caused a problem
 * here, and pinning to the patch would fail the suite for a reason nobody
 * needs to act on. The exact version is still named in the message, because
 * that is the one to install.
 */
describe('the suite runs on the Node this repository declares', () => {
  test('the running major matches .nvmrc', () => {
    const declared = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
    const declaredMajor = declared.replace(/^v/, '').split('.')[0];
    const runningMajor = process.versions.node.split('.')[0];

    expect({
      running: `v${process.versions.node}`,
      major: runningMajor,
      hint:
        runningMajor === declaredMajor
          ? 'matches .nvmrc'
          : `.nvmrc asks for v${declared}. Run: export PATH=$HOME/.nvm/versions/node/v${declared}/bin:$PATH — and check "node -v" before trusting any failure below, because a wrong major fails further down in unrelated words.`,
    }).toEqual({
      running: `v${process.versions.node}`,
      major: declaredMajor,
      hint: 'matches .nvmrc',
    });
  });
});
