const fs = require('node:fs');
const path = require('node:path');

const root = process.env.SUPPLY_CHAIN_ROOT || path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const listing = (relativePath) =>
  exists(relativePath) ? fs.readdirSync(path.join(root, relativePath)) : [];

describe('supply-chain metadata', () => {
/**
 * Files deleted rather than corrected, each with the reason it does not come
 * back. An entry is an assertion about absence, so it states what returning
 * would cost.
 */
const removedArtifacts = [
  {
    path: '.github/workflows/build-extension.yaml',
    reason: 'built the extension against upstream and uploaded it to a foreign store',
  },
  {
    path: '.github/workflows/publish-extension.yml',
    reason: 'published the extension to a Chrome Web Store account this product does not hold',
  },
  {
    path: '.gitmodules',
    reason: "declared a submodule on upstream's private repository with no gitlink in the index",
  },
  {
    path: '.github/FUNDING.yaml',
    reason: "collected money into the upstream project's open_collective",
  },
  {
    path: '.coderabbit.yaml',
    reason: 'configured a third-party reviewer the repository does not use',
  },
  {
    path: 'sonar-project.properties',
    reason: "named upstream's SonarCloud project; nothing here invokes Sonar",
  },
  {
    path: '.github/workflows/build-containers.yml',
    reason:
      'published a container image to a registry this product does not use; the image reaches the host by `docker save` over ssh',
  },
  {
    path: '.github/copilot-instructions.md',
    reason:
      'spoke for the upstream project to a coding agent this repository does not use; the contracts are AGENTS.md and CLAUDE.md',
  },
  {
    path: 'ICLA.md',
    reason: "described a foreign CLA programme; this product runs none",
  },
  {
    path: 'CCLA.md',
    reason: "described a foreign CLA programme; this product runs none",
  },
  {
    path: 'docker-compose.yaml',
    reason:
      "was upstream's packaged self-host example and pulled ghcr.io/gitroomhq/postiz-app:latest; local development uses docker-compose.dev.yaml and production uses deploy/production/",
  },
];

for (const artifact of removedArtifacts) {
  test(`${artifact.path} stays deleted: it ${artifact.reason}`, () => {
    expect(exists(artifact.path)).toBe(false);
  });
}

const issueTemplateText = [
  read('.github/ISSUE_TEMPLATE/01_bug_report.yml'),
  read('.github/ISSUE_TEMPLATE/02_feature_request.yml'),
  read('.github/ISSUE_TEMPLATE/config.yml'),
].join('\n');
for (const marker of [
  'discord.postiz.com',
  'discord.gitroom.com',
  'github.com/gitroomhq/postiz-app/security/advisories',
]) {
  test(`issue templates do not route to ${marker}`, () => {
    expect(issueTemplateText).not.toContain(marker);
  });
}

test("issue templates use this repository's private advisory form", () => {
  expect(issueTemplateText).toMatch(
    /github\.com\/maslennikov-ig\/content-factory-next\/security\/advisories\/new/
  );
});

const envExample = read('.env.example');
test('the Resend example does not resemble a credential', () => {
  expect(envExample).not.toMatch(/RESEND_API_KEY\s*=\s*["'][A-Za-z0-9+/]{20,}["']/);
});

test('the Resend example keeps an explicit empty placeholder', () => {
  expect(envExample).toContain('#RESEND_API_KEY=""');
});

const extensionManifest = JSON.parse(read('apps/extension/manifest.dev.json'));
test('the development manifest does not embed an upstream extension key', () => {
  expect(Object.hasOwn(extensionManifest, 'key')).toBe(false);
});

const workflowFiles = listing('.github/workflows')
  .filter((file) => /\.ya?ml$/i.test(file))
  .map((file) => `.github/workflows/${file}`);

const workflowText = workflowFiles.map((file) => read(file)).join('\n');

for (const marker of [
  'platform.postiz.com',
  'NEXTCLOUD_',
  'mnao305/chrome-extension-upload',
  'CHROME_REFRESH_TOKEN',
]) {
  test(`remaining workflows do not contain ${marker}`, () => {
    expect(workflowText).not.toContain(marker);
  });
}

// ---------------------------------------------------------------------------
// Upstream voice
//
// A workflow runs on our behalf, the pull request template and the root
// markdown speak to our contributors, and a compose file describes a runtime we
// actually stand up. None of them may carry the upstream project's name, its
// author, or its hosts.
//
// The surfaces are read from disk rather than listed, so a contributor-facing
// file that returns — a CLA, a second compose — is scanned on the run it
// reappears instead of on the day someone remembers to add it here.
//
// Three mentions have to survive, and each is an allowance below that names
// what it allows and why. LICENSE is the fourth and is deliberately not a
// surface at all: AGPL-3.0 requires the upstream copyright and licence text to
// stay verbatim, so a guard able to fail on it would be a guard asking us to
// break the licence.
//
// The ledger shrinks. An allowance that no longer explains a real line fails
// the staleness test at the end and is deleted, never left standing.

const UPSTREAM_MARKERS = ['Postiz', 'Nevo David', 'gitroomhq'];

const carriesUpstreamVoice = (line) =>
  UPSTREAM_MARKERS.some((marker) => new RegExp(marker, 'i').test(line));

const voiceAllowances = [
  {
    file: 'SECURITY.md',
    allows: 'the sentence stating which project this one is a fork of',
    reason:
      'AGPL provenance. A security policy that hid the fork relationship would leave a researcher unable to tell whose bug they found.',
    explains: (line) =>
      line.includes('is a fork of [Postiz](https://github.com/gitroomhq/postiz-app)'),
  },
  {
    file: 'SECURITY.md',
    allows: "the link to the upstream project's advisory form",
    reason:
      'Most of this fork is still upstream code, so a finding that also exists there belongs in their advisory system as well as ours. Deliberately addressed to the reader on their behalf.',
    explains: (line) =>
      line.includes('https://github.com/gitroomhq/postiz-app/security/advisories/new'),
  },
  {
    file: 'docker-compose.dev.yaml',
    allows: 'the two commands of the migration note, and nothing else in the file',
    reason:
      'The identifiers are gone: services, containers, network and credentials now carry this product’s name. What is left is a note telling whoever ran the old stack which containers and volumes to remove, and an instruction cannot name them without naming them. Matched by their exact text so that new prose about upstream is still caught.',
    explains: (line) =>
      line.includes('docker rm -f postiz-postgres postiz-redis') ||
      line.includes('docker volume ls | grep postiz'),
  },
];

const usedAllowances = new Set();

function unexplainedVoice(surface) {
  const allowances = voiceAllowances.filter((allowance) => allowance.file === surface);

  return read(surface)
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => carriesUpstreamVoice(line))
    .filter(({ line }) => {
      const allowance = allowances.find((candidate) => candidate.explains(line));
      if (!allowance) return true;
      usedAllowances.add(allowance);
      return false;
    })
    .map(({ line, number }) => `${surface}:${number}: ${line.trim().slice(0, 120)}`);
}

const isComposeFile = (name) => /^docker-compose[\w.-]*\.ya?ml$/i.test(name);

const voiceSurfaces = [
  '.github/PULL_REQUEST_TEMPLATE.md',
  ...workflowFiles,
  // Root markdown a contributor reads before touching anything. A CLA file is
  // deleted rather than rewritten, so any that reappears is matched by shape.
  ...['CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'],
  ...listing('.').filter((name) => /^[a-z]*cla\.md$/i.test(name)),
  // Compose files describe the runtime, and the root one was upstream's own
  // self-host example until it was deleted.
  ...listing('.').filter(isComposeFile),
  ...listing('deploy/production')
    .filter(isComposeFile)
    .map((name) => `deploy/production/${name}`),
].filter(exists);

for (const surface of voiceSurfaces) {
  test(`${surface} does not speak for the upstream project`, () => {
    expect(unexplainedVoice(surface)).toEqual([]);
  });
}

test('every upstream-voice allowance still explains a real line', () => {
  // Depends on the scans above having run, which is why it is declared last.
  for (const surface of voiceSurfaces) unexplainedVoice(surface);

  const stale = voiceAllowances
    .filter((allowance) => !usedAllowances.has(allowance))
    .map((allowance) => `${allowance.file}: ${allowance.allows}`);

  expect(stale).toEqual([]);
});
});
