'use strict';

/**
 * `CONTENT_FACTORY_RELEASE` cannot be set by remembering to set it.
 *
 * It was wrong on 26.08, 01.09, 02.09 and 03.09.2026 — four releases, each
 * found afterwards, each recorded in `production-deploy.md` as its own
 * discovery. It is the most repeated defect in that document, and it is not a
 * cosmetic one: `initialize.sentry.ts` and the three frontend Sentry configs
 * pass it as `release`, so while it is stale every error report names a commit
 * that is not running. A stack trace against the wrong code is worse than no
 * marker at all, because someone believes it.
 *
 * The cause was always the same shape: the switch was two hand-typed `sed`
 * lines, and doing one of two things is what people do. So the fix is not a
 * louder line in the runbook — it is that both values come from one variable
 * in one script, and the script reads back what the container actually runs
 * and refuses to call the release finished if the three disagree.
 *
 * This guard holds that property, because the moment the read-back is dropped
 * the script becomes the two `sed` lines again with more ceremony.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SCRIPT = 'scripts/release/switch-host-image.sh';
const RUNBOOK = 'docs/operations/production-deploy.md';

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

test('the switch script exists and is executable', () => {
  const full = path.join(root, SCRIPT);
  expect(fs.existsSync(full)).toBe(true);
  // eslint-disable-next-line no-bitwise
  expect(fs.statSync(full).mode & 0o111).toBeGreaterThan(0);
});

describe('the marker cannot drift from what runs', () => {
  const script = codeOf(SCRIPT);

  test('both values are written from the same tag', () => {
    expect(script).toMatch(/CF_IMAGE=\\"\$\{image\}\\"/);
    expect(script).toMatch(/CONTENT_FACTORY_RELEASE=\\"\$\{tag\}\\"/);
    // `image` is built from `tag`, so there is one source, not two.
    expect(script).toContain('image="${repository}:${tag}"');
  });

  test('both are written by one command, not two steps a person sequences', () => {
    const editAt = script.indexOf("sed -i 's|^CF_IMAGE=");
    const markerAt = script.indexOf("sed -i 's|^CONTENT_FACTORY_RELEASE=");
    expect(editAt).toBeGreaterThan(-1);
    expect(markerAt).toBeGreaterThan(-1);
    // Between them there is no `run "` — that is, no second ssh invocation
    // anyone could perform without the other.
    const between = script.slice(editAt, markerAt);
    expect(between).not.toMatch(/\brun "/);
  });

  test('a missing marker is added rather than silently skipped', () => {
    expect(script).toMatch(/grep -q '\^CONTENT_FACTORY_RELEASE='/);
    expect(script).toMatch(/printf '\\nCONTENT_FACTORY_RELEASE=/);
  });

  test('the three are compared after the switch, and disagreement fails', () => {
    expect(script).toMatch(
      /running_image=.*docker inspect cf-next-app --format '\{\{\.Config\.Image\}\}'/
    );
    expect(script).toMatch(/marker=.*grep '\^CONTENT_FACTORY_RELEASE='/);
    expect(script).toMatch(
      /if \[ "\$running_tag" != "\$tag" \] \|\| \[ "\$marker" != "\$tag" \]/
    );
    // And it is a failure, not a warning printed into a scrollback nobody reads.
    const compareAt = script.indexOf('"$marker" != "$tag"');
    const exitAt = script.indexOf('exit 1', compareAt);
    expect(exitAt).toBeGreaterThan(compareAt);
  });
});

describe('the switch refuses the states that produced past incidents', () => {
  const script = codeOf(SCRIPT);

  test('an image the host does not have stops the switch', () => {
    // `pull-image-on-host.sh` proved the digest. Switching to a tag nobody
    // pulled would skip that proof.
    expect(script).toMatch(/docker image inspect \$\{image\}/);
    const inspectAt = script.indexOf('docker image inspect ${image}');
    const composeAt = script.indexOf('docker compose up -d cf-app');
    expect(inspectAt).toBeLessThan(composeAt);
  });

  test('success is health, not "Started"', () => {
    expect(script).toMatch(/\.State\.Health\.Status/);
    expect(script).toMatch(/if \[ "\$status" != "healthy" \]/);
  });

  test('an existing backup is never overwritten', () => {
    // A second run of the same release must not replace the state the first
    // run would be rolled back to.
    expect(script).toMatch(/\[ -f .{0,4}\$f\.bak-before-\$\{tag\}.{0,4} \] \|\| cp -a/);
  });

  test('the host is never named in this repository', () => {
    expect(script).toContain('CF_DEPLOY_HOST');
    expect(script).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(script).not.toContain('factory.aidevteam.ru');
  });
});

describe('the runbook sends a reader to the script, not to two sed lines', () => {
  const runbook = read(RUNBOOK);

  test('the switch step names the script', () => {
    expect(runbook).toContain('switch-host-image.sh');
  });

  test('the hand-typed marker edit is gone from the instructions', () => {
    // The four incidents all came from this line being a separate thing to
    // remember. It may still appear in the historical entries that record
    // them, but not as an instruction.
    const instructionsAt = runbook.indexOf('## Обновление версии');
    const historyAt = runbook.indexOf('### После переключения');
    const instructions = runbook.slice(instructionsAt, historyAt);
    expect(instructions).not.toMatch(
      /sed -i 's\|\^CONTENT_FACTORY_RELEASE=/
    );
  });
});
