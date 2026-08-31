const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

// Every place that decides whether the generic OIDC button replaces the other
// sign-in providers. `.env.example` ships the flag as the string "false", and
// a truthiness test reads that as "on": the deployment loses Google, GitHub and
// Telegram sign-in and offers an identity provider it never configured.
const FLAG_READERS = [
  'apps/frontend/src/app/(app)/layout.tsx',
  'apps/frontend/src/app/(provider)/layout.tsx',
  'apps/frontend/src/app/(extension)/layout.tsx',
  'apps/frontend/src/proxy.ts',
];

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

describe('generic OIDC feature flag', () => {
  test.each(FLAG_READERS)('%s compares the flag to a value', (file) => {
    const source = read(file);
    expect(source).toContain('CONTENT_FACTORY_GENERIC_OAUTH');
    expect(source).toMatch(
      /CONTENT_FACTORY_GENERIC_OAUTH === 'true'|CONTENT_FACTORY_GENERIC_OAUTH === "true"/
    );
    expect(source).not.toMatch(/!!process\.env\.CONTENT_FACTORY_GENERIC_OAUTH/);
  });

  test('the shipped example keeps the flag off', () => {
    const example = read('.env.example');
    const line = example
      .split('\n')
      .find((candidate) =>
        candidate.startsWith('CONTENT_FACTORY_GENERIC_OAUTH=')
      );
    expect(line).toBeDefined();
    expect(line).not.toMatch(/=\s*"?true"?/);
  });
});
