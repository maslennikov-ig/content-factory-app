const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

function loadConfigModule() {
  return loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.provider.config.ts',
    {
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: {
          fixedDecryption: (value) => `decrypted:${value}`,
        },
      },
    }
  );
}

/**
 * The module owns no database client of its own. It reads through whichever
 * connection pool the application already lends it, so a test lends it one too.
 */
function loadConfig(findUnique) {
  const config = loadConfigModule();
  config.setAiProviderSettingReader((organizationId) =>
    findUnique({ where: { organizationId } })
  );
  return config;
}

const workspaceRow = {
  usageMode: 'workspace_key',
  provider: 'openrouter',
  apiKey: 'workspace-ai',
  textModel: 'workspace-text',
  imageModel: 'workspace-image',
  searchEnabled: true,
  searchProvider: 'tavily',
  searchApiKey: 'workspace-search',
  searchTopic: 'news',
  searchDepth: 'advanced',
};

describe('hybrid AI credential resolver', () => {
  const managedEnv = {
    AI_INCLUDED_API_KEY: 'managed-ai',
    AI_INCLUDED_SEARCH_API_KEY: 'managed-search',
    AI_PROVIDER: 'openai',
    AI_TEXT_MODEL: 'managed-text',
    AI_IMAGE_MODEL: 'managed-image',
  };

  beforeEach(() => {
    Object.assign(process.env, managedEnv);
  });

  afterEach(() => {
    for (const key of Object.keys(managedEnv)) delete process.env[key];
  });

  test('workspace_key uses only this organization encrypted credentials', async () => {
    const { loadAiConfig } = loadConfig(async () => workspaceRow);

    const config = await loadAiConfig('organization-a');

    expect(config).toMatchObject({
      usageMode: 'workspace_key',
      apiKey: 'decrypted:workspace-ai',
      textModel: 'workspace-text',
      imageModel: 'workspace-image',
      workspaceKeyConfigured: true,
      search: { apiKey: 'decrypted:workspace-search' },
    });
    expect(JSON.stringify(config)).not.toContain('managed-ai');
    expect(JSON.stringify(config)).not.toContain('managed-search');
  });

  test('a legacy setting row without a mode remains workspace_key', async () => {
    const { usageMode: _usageMode, ...legacyRow } = workspaceRow;
    const { loadAiConfig } = loadConfig(async () => legacyRow);

    await expect(loadAiConfig('organization-a')).resolves.toMatchObject({
      usageMode: 'workspace_key',
      apiKey: 'decrypted:workspace-ai',
    });
  });

  test('included uses only managed credentials and ignores stored keys and models', async () => {
    const { loadAiConfig } = loadConfig(async () => ({
      ...workspaceRow,
      usageMode: 'included',
    }));

    const config = await loadAiConfig('organization-a');

    expect(config).toMatchObject({
      usageMode: 'included',
      apiKey: 'managed-ai',
      textModel: 'managed-text',
      imageModel: 'managed-image',
      workspaceKeyConfigured: true,
      search: { apiKey: 'managed-search' },
    });
    expect(JSON.stringify(config)).not.toContain('decrypted:workspace');
  });

  test.each([
    ['included', 'AI_INCLUDED_API_KEY', { ...workspaceRow, usageMode: 'included' }],
    ['workspace_key', null, { ...workspaceRow, apiKey: null }],
  ])('%s never falls back to the other credential source', async (mode, missingEnv, row) => {
    if (missingEnv) delete process.env[missingEnv];
    const { requireAiConfig } = loadConfig(async () => row);

    const error = await requireAiConfig('organization-a').catch(
      (caught) => caught
    );
    expect(error).toMatchObject({ name: 'AiProviderNotConfigured' });
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      code: 'AI_SELECTED_CREDENTIAL_UNAVAILABLE',
    });
    const message = JSON.stringify(error.getResponse());
    expect(message).not.toMatch(/wait|refresh/i);
    expect(message).toMatch(/operator[\s\S]*included credentials/i);
    expect(message).toMatch(/workspace administrator[\s\S]*workspace_key/i);
  });

  test('resolution opens no connection pool of its own', () => {
    const source = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/openai/ai.provider.config.ts'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/new PrismaClient/);
    expect(source).not.toMatch(/^import .*\bPrismaClient\b/m);
  });

  test('an unlent reader fails closed rather than guessing a credential', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { loadAiConfig } = loadConfigModule();

    const config = await loadAiConfig('organization-a');

    expect(config).toMatchObject({
      apiKey: '',
      usageMode: 'workspace_key',
      workspaceKeyConfigured: false,
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('an explicit reader overrides the lent one without crossing tenants', async () => {
    const lent = jest.fn(async () => workspaceRow);
    const explicit = jest.fn(async ({ where }) => {
      expect(where).toEqual({ organizationId: 'organization-b' });
      return { ...workspaceRow, textModel: 'explicit-text' };
    });
    const config = loadConfig(lent);

    await expect(
      config.loadAiConfig('organization-b', (organizationId) =>
        explicit({ where: { organizationId } })
      )
    ).resolves.toMatchObject({ textModel: 'explicit-text' });
    expect(lent).not.toHaveBeenCalled();
  });

  test('a mode switch is visible on the next resolve without a process-local stale source', async () => {
    let row = workspaceRow;
    const findUnique = jest.fn(async () => row);
    const { loadAiConfig } = loadConfig(findUnique);

    expect((await loadAiConfig('organization-a')).usageMode).toBe(
      'workspace_key'
    );
    row = { ...workspaceRow, usageMode: 'included' };
    expect((await loadAiConfig('organization-a')).usageMode).toBe('included');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

test('production env exposes only real fail-closed AI and growth secrets', () => {
  const example = fs.readFileSync(
    path.join(root, 'deploy/production/app.env.example'),
    'utf8'
  );

  for (const name of [
    'AI_INCLUDED_API_KEY',
    'AI_INCLUDED_SEARCH_API_KEY',
    'PUBLIC_GROWTH_DEDUPE_KEY',
  ]) {
    expect(example).toMatch(new RegExp(`^${name}=""$`, 'm'));
  }
  for (const unused of [
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'TAVILY_API_KEY',
  ]) {
    expect(example).not.toMatch(new RegExp(`^#?${unused}=`, 'm'));
  }
  expect(example).toMatch(/stable[\s\S]*independent[\s\S]*at least 32 bytes/i);
  expect(example).toMatch(/do not reuse JWT_SECRET/i);
});

test('schema adds a compatible mode, zero quota and privacy-safe ledger', () => {
  const schema = fs.readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );

  expect(schema).toMatch(/enum AiUsageMode\s*{\s*included\s+workspace_key\s*}/s);
  expect(schema).toMatch(
    /usageMode\s+AiUsageMode\s+@default\(workspace_key\)/
  );
  expect(schema).toMatch(
    /includedAiMonthlyOperations\s+Int\s+@default\(0\)/
  );
  const ledger = schema.match(/model AiUsageRecord\s*{([\s\S]*?)\n}/)?.[1] || '';
  expect(ledger).toContain('organizationId');
  expect(ledger).toContain('operation');
  expect(ledger).toContain('status');
  expect(ledger).not.toMatch(/prompt|output|error|payload|token|cost/i);
});
