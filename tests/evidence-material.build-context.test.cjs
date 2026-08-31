const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  repositoryRoot,
  readDockerignore,
  isExcludedFromBuildContext,
} = require('./helpers/build-context.cjs');

/**
 * What Git refuses to store, the image must refuse to carry.
 *
 * `.gitignore` keeps the measuring stand's material out of the repository and
 * says why in its own words: the corpora are «the owner's own posts … personal
 * text: it stays on the machine that measured it», and the second ruler's
 * Python environment and model weights «never enter the repository». Nothing
 * repeated that in `.dockerignore`, and `COPY . /app` does not read
 * `.gitignore`.
 *
 * This is not hypothetical. The release of 2026-08-30 (`ac9e978a582a`) shipped
 * `scripts/evidence/voice-eval` whole to a shared host and a registry: 2.1 MB
 * of three real people's posts — each file carrying the organisation id and the
 * avatar id beside the text — under 1.95 GB of PyTorch and downloaded model
 * weights. That is the entire difference between that image's 4.78 GB and the
 * 2.72 GB of the two before it, and it went unnoticed because the size was the
 * only thing that looked wrong.
 *
 * The rule is deliberately stated as "ignored by Git implies absent from the
 * build context" rather than as a list of paths. A list only ever catches the
 * material somebody already thought of; the next corpus arrives under a new
 * name.
 */

/**
 * The one thing Git ignores that the image genuinely needs.
 *
 * `var/source/` is generated during the release build and copied in explicitly
 * by the Dockerfile — it is how the running product offers its own source, so
 * an AGPL obligation is met by a file that no commit contains.
 */
const REQUIRED_THOUGH_UNTRACKED = ['var/source/'];

const gitIgnoredPaths = (directory) => {
  // `--others --ignored` lists what is present on this machine, which is what
  // a build context is actually assembled from.
  const output = execFileSync(
    'git',
    [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
      '--',
      directory,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (entry) => !REQUIRED_THOUGH_UNTRACKED.some((kept) => entry.startsWith(kept))
    );
};

describe('the measuring stand does not travel in the image', () => {
  const patterns = readDockerignore();

  it('excludes the personal corpora by the name they are written under', () => {
    // Named literally as well as caught by the rule below, because the corpora
    // are the part with a person behind it and the machine that builds a
    // release is not always the machine that measured anything.
    const corpora = [
      'scripts/evidence/voice-eval/corpus.owner.json',
      'scripts/evidence/voice-eval/corpus.avetov.json',
      'scripts/evidence/voice-eval/corpus.britva.json',
    ];

    const shipped = corpora.filter(
      (file) => !isExcludedFromBuildContext(file, patterns)
    );

    expect(shipped).toEqual([]);
  });

  it('excludes the second ruler’s environment and weights', () => {
    const instrument = [
      'scripts/evidence/voice-eval/second-ruler/.venv',
      'scripts/evidence/voice-eval/second-ruler/.venv/lib/python3.12/site-packages/torch/lib/libtorch_cpu.so',
      'scripts/evidence/voice-eval/second-ruler/weights',
      'scripts/evidence/voice-eval/second-ruler/weights/models--StyleDistance--mstyledistance/blobs/57827687b77b',
    ];

    const shipped = instrument.filter(
      (file) => !isExcludedFromBuildContext(file, patterns)
    );

    expect(shipped).toEqual([]);
  });

  it('keeps the scripts themselves, so the rule is not a blanket', () => {
    // The counterpart. Excluding `scripts/evidence` whole would pass every
    // check above while quietly changing what the image contains for reasons
    // this guard never examined.
    for (const file of [
      'scripts/evidence/voice-eval/measure.cjs',
      'scripts/evidence/voice-eval/second-ruler/embed.py',
    ]) {
      expect(isExcludedFromBuildContext(file, patterns)).toBe(false);
    }
  });

  it('drops everything Git ignores under the evidence directory', () => {
    // Only sees what exists on this machine, so it is empty on a clean
    // checkout and loud on the machine where a release is actually built —
    // which is the machine where this went wrong.
    const shipped = gitIgnoredPaths('scripts/evidence').filter(
      (entry) => !isExcludedFromBuildContext(entry.replace(/\/$/, ''), patterns)
    );

    expect(shipped).toEqual([]);
  });

  it('names var/source as the one exception, and it exists in a release build', () => {
    // If the Dockerfile stops copying it, the exception above is stale and the
    // product stops offering its own source.
    const dockerfile = fs.readFileSync(
      path.join(repositoryRoot, 'Dockerfile'),
      'utf8'
    );

    expect(dockerfile).toContain('var/source/content-factory-source.tar.gz');
    expect(REQUIRED_THOUGH_UNTRACKED).toEqual(['var/source/']);
  });
});
