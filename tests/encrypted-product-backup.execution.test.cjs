const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../scripts/operations/encrypted-product-backup.sh');
const recipient = 'F'.repeat(40);
let workspace;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-encrypted-backup-'));
  fs.mkdirSync(path.join(workspace, 'bin'));
  fs.mkdirSync(path.join(workspace, 'artifacts'));
  fs.writeFileSync(path.join(workspace, 'bin/docker'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$CF_FIXTURE_CALLS"
if [[ "$*" == *'printf %s "$POSTGRES_USER"'* ]]; then
  printf postgres
elif [[ "$*" == 'exec cf-next-postgres pg_dumpall -U postgres' ]]; then
  printf '%s\\n' 'synthetic cluster SQL'
  [[ "\${CF_FIXTURE_MODE:-}" != dump-failure ]] || exit 3
else
  exit 99
fi
`, { mode: 0o700 });
  fs.writeFileSync(path.join(workspace, 'bin/gpg'), `#!/usr/bin/env bash
set -euo pipefail
cat >/dev/null
case "\${CF_FIXTURE_MODE:-}" in
  encryption-failure) printf 'failed output'; exit 2 ;;
  empty-success) exit 0 ;;
  *) printf 'synthetic encrypted and signed archive' ;;
esac
`, { mode: 0o700 });
});

afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

function run(mode = '', output = path.join(workspace, 'artifacts'), key = recipient) {
  return spawnSync('bash', [script, output, key], {
    env: {
      ...process.env,
      PATH: `${path.join(workspace, 'bin')}:${process.env.PATH}`,
      CF_FIXTURE_MODE: mode,
      CF_FIXTURE_CALLS: path.join(workspace, 'calls'),
    },
    encoding: 'utf8',
  });
}

const artifactName = 'postgres_cf-next-postgres.sql.gpg';

describe('product-only encrypted cluster backup publication', () => {
  test('publishes a nonempty private encrypted file without a plaintext intermediate', () => {
    const result = run();
    expect(result.status).toBe(0);
    const artifact = path.join(workspace, 'artifacts', artifactName);
    expect(fs.readFileSync(artifact, 'utf8')).toBe('synthetic encrypted and signed archive');
    expect(fs.statSync(artifact).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.join(workspace, 'artifacts'))).toEqual([artifactName]);
    expect(fs.readFileSync(path.join(workspace, 'calls'), 'utf8')).toContain('exec cf-next-postgres pg_dumpall -U postgres');
  });

  test.each(['encryption-failure', 'empty-success', 'dump-failure'])(
    'refuses %s and leaves no published or temporary artifact', (mode) => {
      const result = run(mode);
      expect(result.status).not.toBe(0);
      expect(fs.readdirSync(path.join(workspace, 'artifacts'))).toEqual([]);
    }
  );

  test('preserves an existing archive and refuses before calling Docker', () => {
    const artifact = path.join(workspace, 'artifacts', artifactName);
    fs.writeFileSync(artifact, 'existing valid archive');
    const result = run();
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(artifact, 'utf8')).toBe('existing valid archive');
    expect(fs.existsSync(path.join(workspace, 'calls'))).toBe(false);
  });

  test('refuses an artifact symlink without touching its target', () => {
    const target = path.join(workspace, 'preserved');
    fs.writeFileSync(target, 'preserved');
    fs.symlinkSync(target, path.join(workspace, 'artifacts', artifactName));
    expect(run().status).not.toBe(0);
    expect(fs.readFileSync(target, 'utf8')).toBe('preserved');
    expect(fs.existsSync(path.join(workspace, 'calls'))).toBe(false);
  });

  test('refuses a symlink output directory without creating or removing files', () => {
    const link = path.join(workspace, 'linked');
    fs.symlinkSync(path.join(workspace, 'artifacts'), link);
    expect(run('', link).status).not.toBe(0);
    expect(fs.readdirSync(path.join(workspace, 'artifacts'))).toEqual([]);
    expect(fs.existsSync(path.join(workspace, 'calls'))).toBe(false);
  });

  test('refuses an invalid recipient before reading a database', () => {
    expect(run('', undefined, 'not-a-fingerprint').status).not.toBe(0);
    expect(fs.existsSync(path.join(workspace, 'calls'))).toBe(false);
  });
});
