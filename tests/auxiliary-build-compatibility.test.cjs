const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
describe('retained auxiliary build consumers', () => {
  let temporary;
  beforeEach(() => {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-aux-build-'));
  });
  afterEach(() => fs.rmSync(temporary, { recursive: true, force: true }));
  test.each([0, 7])(
    'local Docker helper keeps both tags and stops on build exit %i',
    (status) => {
      const log = path.join(temporary, 'commands');
      fs.writeFileSync(
        path.join(temporary, 'docker'),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CF_AUX_LOG"\nif [ "$1" = build ]; then exit "$CF_AUX_BUILD_STATUS"; fi\n'
      );
      fs.chmodSync(path.join(temporary, 'docker'), 0o700);
      const result = spawnSync(
        'bash',
        [path.join(root, 'var/docker/docker-build.sh')],
        {
          cwd: temporary,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${temporary}:${process.env.PATH}`,
            CF_AUX_LOG: log,
            CF_AUX_BUILD_STATUS: String(status),
          },
        }
      );
      expect(result.status).toBe(status);
      const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
      expect(lines[0]).toBe(
        'build -t localhost/content-factory -f Dockerfile.dev .'
      );
      expect(lines).toEqual(
        status === 0
          ? [
              lines[0],
              'tag localhost/content-factory localhost/content-factory-devcontainer',
            ]
          : [lines[0]]
      );
    }
  );
  test.each([
    ['v22.23.2', '10.6.1', 0],
    ['v20.17.0', '10.6.1', 1],
    ['v22.23.2', '8.15.0', 1],
  ])(
    'optional Jenkins checks actual tool exits for %s / %s',
    (nodeVersion, pnpmVersion, expected) => {
      for (const [name, value] of [
        ['node', nodeVersion],
        ['pnpm', pnpmVersion],
        ['curl', 'fixture'],
        ['unzip', 'fixture'],
      ]) {
        fs.writeFileSync(
          path.join(temporary, name),
          `#!/bin/sh\nprintf '%s\\n' '${value}'\n`
        );
        fs.chmodSync(path.join(temporary, name), 0o700);
      }
      for (const file of ['Build.Jenkinsfile', 'BuildPR.Jenkinsfile']) {
        const source = fs.readFileSync(
          path.join(root, 'Jenkins', file),
          'utf8'
        );
        const setup = source.match(
          /stage\('Setup Environment and Tools'\)[\s\S]*?sh '\'\'([\s\S]*?)'\'\'/
        )[1];
        const result = spawnSync('sh', ['-c', setup], {
          encoding: 'utf8',
          env: { ...process.env, PATH: `${temporary}:${process.env.PATH}` },
        });
        expect(result.status).toBe(expected);
        expect(source).toContain('pnpm install --frozen-lockfile');
        expect(source).not.toContain('setup_20.x');
        expect(source).not.toContain('pnpm@8');
      }
    }
  );
});
