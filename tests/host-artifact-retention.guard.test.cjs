'use strict';

/**
 * The rails on the one standing permission this repository has.
 *
 * On 03.09.2026 the owner made image retention a permanent authorization
 * instead of a question asked every release: «давай сделаем, чтобы покрывало
 * на будущее, чтобы тебе постоянно меня не спрашивать». That trade is only
 * honest while the rails are checked by a program rather than by whoever is
 * running the release — a standing permission over a script that quietly grew
 * a `prune` in it is a standing permission over something else entirely.
 *
 * The host is shared. n8n, trend-pars, psk-dom-bot, cortex, glitchtip and a
 * dozen more of the owner's containers live beside ours, and every rule below
 * exists because of that, not because of ours.
 *
 * The script keeps two things: our release images and the configuration copies
 * each switch leaves behind. The second half was added on 03.09.2026, when the
 * directory held 78 of them going back to 16.08. Not an exposure — every
 * `.env` copy was `600` and the `docker-compose.yaml` copies carry `${VAR}`
 * references rather than values — but 78 copies of files that do hold secrets
 * is 78 chances for one to be mis-permissioned later.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SCRIPT = 'scripts/release/retain-host-artifacts.sh';
const RUNBOOK = 'docs/operations/production-deploy.md';
const CONTRACT = 'AGENTS.md';

const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

/**
 * The script's own prose names the two forbidden commands in order to forbid
 * them, and `${targets[*]}` is array expansion rather than a glob. A guard
 * that reads comments finds both and calls them defects, so it reads code.
 */
const codeOf = (relative) =>
  read(relative)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

test('the retention script exists and is executable', () => {
  const full = path.join(root, SCRIPT);
  expect(fs.existsSync(full)).toBe(true);
  // eslint-disable-next-line no-bitwise
  expect(fs.statSync(full).mode & 0o111).toBeGreaterThan(0);
});

describe('what the script may never do on a shared host', () => {
  const script = codeOf(SCRIPT);

  test('no prune, in any spelling', () => {
    // Both of these act on the whole daemon by nature, including the "safe"
    // `-f` without `-a`. There is no form of them that is ours only.
    const pruning = /docker\s+(system|image|container|volume|network)\s+prune/.test(
      script
    );
    expect({
      pruning,
      hint: pruning
        ? `${SCRIPT} contains a prune. On this host that reaches a dozen unrelated production containers; the only permitted removal is "docker rmi" with names spelled out.`
        : 'in step',
    }).toEqual({ pruning: false, hint: 'in step' });
  });

  test('only our own repository can ever be a candidate', () => {
    expect(script).toContain(
      'repository="${registry}/${namespace}/content-factory-next"'
    );
    // Every removal goes through one list built from that repository name.
    expect(script).toMatch(/targets\+=\("\$\{repository\}:\$\{tag\}"\)/);
    expect(script).toMatch(/docker rmi \$\{targets\[\*\]\}/);
  });

  test('no wildcard reaches a removal', () => {
    const removalLines = script
      .split('\n')
      .filter((line) => /docker rmi/.test(line) && !/^\s*#/.test(line));
    expect(removalLines.length).toBeGreaterThan(0);
    for (const line of removalLines) {
      // `${targets[*]}` is the array this script built, name by name. Any
      // other star on a removal line would be the shell choosing the targets.
      expect(line.replace(/\$\{targets\[\*\]\}/g, '')).not.toMatch(/\*/);
    }
  });
});

describe('what the script must establish before removing anything', () => {
  const script = codeOf(SCRIPT);

  test('the running image is read from the container, not from .env', () => {
    // `CONTENT_FACTORY_RELEASE` in app.env was a release behind three times
    // running — 26.08, 01.09 and 03.09.2026. The container cannot be wrong
    // about what it runs.
    expect(script).toMatch(
      /running_image=.*docker inspect cf-next-app --format '\{\{\.Config\.Image\}\}'/
    );
    expect(script).not.toMatch(/CONTENT_FACTORY_RELEASE/);
  });

  test('a container that is not healthy stops the whole step', () => {
    expect(script).toMatch(/\.State\.Health\.Status/);
    expect(script).toMatch(/if \[ "\$health" != "healthy" \]/);
    // And it stops before anything is removed: the refusal exits.
    const healthAt = script.indexOf('$health" != "healthy"');
    const removeAt = script.indexOf('docker rmi');
    expect(healthAt).toBeGreaterThan(-1);
    expect(healthAt).toBeLessThan(removeAt);
  });

  test('fewer than two kept tags is refused', () => {
    // One tag means no rollback target, which is the only reason the previous
    // image is kept at all.
    expect(script).toMatch(/if ! \[ "\$keep" -ge 2 \]/);
  });

  test('the rollback target is proven present afterwards', () => {
    expect(script).toContain('rollback target present');
    const inspectAt = script.lastIndexOf('docker image inspect');
    const removeAt = script.indexOf('docker rmi');
    expect(inspectAt).toBeGreaterThan(removeAt);
  });

  test('the host is never named in this repository', () => {
    expect(script).toContain('CF_DEPLOY_HOST');
    expect(script).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(script).not.toContain('factory.aidevteam.ru');
  });
});

describe('the configuration copies it may remove, and the ones it may not', () => {
  const script = codeOf(SCRIPT);

  test('only *.bak* siblings are ever candidates', () => {
    // The live `.env`, `app.env` and `docker-compose.yaml` must not be matched
    // by any pattern here: they are what the product runs on.
    expect(script).toMatch(/for family in "\.env\.bak" "app\.env\.bak" "docker-compose\.yaml\.bak"/);
    const listing = script.match(/ls -1t \$\{family\}\*/);
    expect(listing).not.toBeNull();
  });

  test('a copy naming the running image or the rollback target is kept', () => {
    // That is the copy a rollback restores; a count-based rule alone would
    // eventually remove it.
    expect(script).toMatch(/\*"\$running_tag"\*\|\*"\$rollback"\*\) continue ;;/);
  });

  test('removal is by name, never by glob on the far side', () => {
    // The list printed above is the list removed: names go over stdin and
    // `xargs -r` refuses an empty one. No `rm .env.bak*` anywhere.
    expect(script).toMatch(/xargs -d '\\n' -r rm -f --/);
    // Line by line, because a pattern spanning newlines finds the `.bak*` of
    // a later listing and calls it a glob on a removal.
    const removalLines = script
      .split('\n')
      .filter((line) => /\brm\b/.test(line));
    expect(removalLines.length).toBeGreaterThan(0);
    for (const line of removalLines) {
      expect(line).toMatch(/xargs -d '\\n' -r rm -f --/);
    }
  });

  test('what remains cannot be readable beyond root', () => {
    expect(script).toMatch(/! -perm 600 -print -exec chmod 600/);
  });

  test('a dry run removes nothing', () => {
    const removalAt = script.indexOf("xargs -d '\\n' -r rm -f --");
    const guardAt = script.lastIndexOf('if [ "$dry_run" -eq 0 ]; then', removalAt);
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(removalAt);
  });
});

describe('the permission says what it covers, where a reader will look', () => {
  test('the runbook records the standing permission and its limits', () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toContain('retain-host-artifacts.sh');
    expect(runbook).toContain('Разрешение владельца на этот шаг — постоянное');
    // The limit matters more than the grant: a permission remembered without
    // its edges becomes a permission for everything nearby.
    expect(runbook).toMatch(/\*\*не\*\* покрывает ничего другого на общем хосте/);
  });

  test('the contract points at it instead of forbidding it outright', () => {
    const contract = read(CONTRACT);
    expect(contract).toContain('retain-host-artifacts.sh');
    expect(contract).toContain('host-artifact-retention.guard.test.cjs');
  });
});
