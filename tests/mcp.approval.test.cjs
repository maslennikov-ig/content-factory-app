const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
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

const ULTIMATE_LIFETIME = {
  subscriptionTier: 'ULTIMATE',
  totalChannels: 1000000,
  isLifetime: true,
};

function organization(activatedFlags) {
  return {
    id: 'org-1',
    apiKey: 'encrypted-key',
    subscription: ULTIMATE_LIFETIME,
    users: activatedFlags.map((activated) => ({ user: { activated } })),
  };
}

/**
 * Runs `startMcp` against a fake Nest application and returns the Express
 * handlers it registered, so every authenticated MCP entry point can be driven
 * without a server, Mastra, or a database.
 */
async function mountMcp({ org = null, authorization = null } = {}) {
  const startHTTP = jest.fn().mockResolvedValue(undefined);
  const startSSE = jest.fn().mockResolvedValue(undefined);
  const getOrgByApiKey = jest.fn(async () => org);
  const getOrgByOAuthToken = jest.fn(async () => authorization);

  const organizationService = { getOrgByApiKey };
  const oauthService = { getOrgByOAuthToken };
  const mastraService = {
    mastra: async () => ({
      getAgent: () => ({ listTools: async () => ({}) }),
    }),
  };

  const routes = new Map();
  const app = {
    get(token) {
      if (token === organizationServiceToken) return organizationService;
      if (token === oauthServiceToken) return oauthService;
      return mastraService;
    },
    use(pathOrHandler, handler) {
      const paths = Array.isArray(pathOrHandler)
        ? pathOrHandler
        : [pathOrHandler];
      for (const route of paths) {
        routes.set(route, handler);
      }
    },
  };

  const organizationServiceToken = class OrganizationService {};
  const oauthServiceToken = class OAuthService {};

  const { startMcp } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/start.mcp.ts',
    {
      '@nestjs/common': { INestApplication: class {} },
      '@contentfactory/nestjs-libraries/chat/mastra.service': {
        MastraService: class {},
      },
      '@mastra/mcp': {
        MCPServer: class {
          startHTTP(...args) {
            return startHTTP(...args);
          }
          startSSE(...args) {
            return startSSE(...args);
          }
        },
      },
      '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
        { OrganizationService: organizationServiceToken },
      '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.service': {
        OAuthService: oauthServiceToken,
      },
      './async.storage': { runWithContext: (_context, run) => run() },
      './oauth-middleware': {
        createOAuthMiddleware: () => async () => ({ proceed: false }),
      },
    }
  );

  await startMcp(app);

  return { routes, startHTTP, startSSE, getOrgByApiKey, getOrgByOAuthToken };
}

function responseDouble() {
  const sent = [];
  const res = {
    setHeader() {},
    sendStatus(code) {
      sent.push({ code });
    },
    status(code) {
      return {
        send(body) {
          sent.push({ code, body });
        },
        json(body) {
          sent.push({ code, body });
        },
      };
    },
    json(body) {
      sent.push({ code: 200, body });
    },
  };
  return { res, sent };
}

function requestDouble(overrides = {}) {
  return {
    method: 'POST',
    path: '/',
    originalUrl: '/mcp',
    headers: {},
    rawHeaders: [],
    params: {},
    ...overrides,
  };
}

describe('MCP approval gate', () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://backend.example';
  });

  afterAll(() => {
    if (originalBackendUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
    } else {
      process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
    }
  });

  test('the bearer key of an organization awaiting approval opens no MCP session', async () => {
    const { routes, startHTTP } = await mountMcp({
      org: organization([false]),
    });
    const { res, sent } = responseDouble();

    await routes.get('/mcp')(
      requestDouble({ headers: { authorization: 'Bearer enterprise-key' } }),
      res,
      () => {}
    );

    expect(startHTTP).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { code: 401, body: 'Invalid API Key or OAuth token' },
    ]);
  });

  test('the same key in the streamable path is refused too', async () => {
    const { routes, startHTTP } = await mountMcp({
      org: organization([false]),
    });
    const { res, sent } = responseDouble();

    await routes.get('/mcp/:id')(
      requestDouble({ params: { id: 'enterprise-key' } }),
      res,
      () => {}
    );

    expect(startHTTP).not.toHaveBeenCalled();
    expect(sent).toEqual([{ code: 400, body: 'Invalid API Key' }]);
  });

  test('the same key in the SSE path is refused too', async () => {
    const { routes, startSSE } = await mountMcp({
      org: organization([false]),
    });
    const { res, sent } = responseDouble();

    await routes.get('/sse/:id')(
      requestDouble({ params: { id: 'enterprise-key' }, originalUrl: '/sse/x' }),
      res,
      () => {}
    );

    expect(startSSE).not.toHaveBeenCalled();
    expect(sent).toEqual([{ code: 400, body: 'Invalid API Key' }]);
  });

  test('an OAuth token minted for a blocked account is refused', async () => {
    const { routes, startHTTP } = await mountMcp({
      authorization: {
        organization: organization([false]),
        user: { id: 'user-1', activated: false },
      },
    });
    const { res, sent } = responseDouble();

    await routes.get('/mcp')(
      requestDouble({ headers: { authorization: 'Bearer pos_token' } }),
      res,
      () => {}
    );

    expect(startHTTP).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { code: 401, body: 'Invalid API Key or OAuth token' },
    ]);
  });

  test('one approved member keeps the key working on every entry point', async () => {
    const { routes, startHTTP, startSSE } = await mountMcp({
      org: organization([false, true]),
    });

    const bearer = responseDouble();
    await routes.get('/mcp')(
      requestDouble({ headers: { authorization: 'Bearer enterprise-key' } }),
      bearer.res,
      () => {}
    );
    expect(bearer.sent).toEqual([]);

    const streamable = responseDouble();
    await routes.get('/mcp/:id')(
      requestDouble({ params: { id: 'enterprise-key' } }),
      streamable.res,
      () => {}
    );
    expect(streamable.sent).toEqual([]);

    const sse = responseDouble();
    await routes.get('/sse/:id')(
      requestDouble({ params: { id: 'enterprise-key' }, originalUrl: '/sse/x' }),
      sse.res,
      () => {}
    );
    expect(sse.sent).toEqual([]);

    expect(startHTTP).toHaveBeenCalledTimes(2);
    expect(startSSE).toHaveBeenCalledTimes(1);
  });

  test('an approved OAuth token still opens a session', async () => {
    const { routes, startHTTP } = await mountMcp({
      authorization: {
        organization: organization([true]),
        user: { id: 'user-1', activated: true },
      },
    });
    const { res, sent } = responseDouble();

    await routes.get('/mcp')(
      requestDouble({ headers: { authorization: 'Bearer pos_token' } }),
      res,
      () => {}
    );

    expect(sent).toEqual([]);
    expect(startHTTP).toHaveBeenCalledTimes(1);
  });
});
