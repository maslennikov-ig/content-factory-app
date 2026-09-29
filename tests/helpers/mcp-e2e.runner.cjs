'use strict';

/**
 * MCP end to end (`content-factory-next-kcxz.26`), in a child process of
 * `tests/mcp.e2e.test.cjs`: the MCP SDK client and `@mastra/mcp` are loaded
 * as they run, which the jest runner does not do. Prints one line
 * `REPORT {json}` for the suite to read.
 *
 * Real: a Nest application with the product's MCP controllers, bearer
 * middleware, throttle guards, DTOs, the global `ValidationPipe` of `main.ts`
 * and Nest's own body parsers; `McpOAuthService`; `McpServers` building
 * `@mastra/mcp` servers from the capability registry; the real
 * `PermissionsService` behind the door policies; `acting.user`; the MCP SDK
 * client (`@modelcontextprotocol/sdk` Streamable HTTP with its OAuth flow).
 *
 * Stubbed: the database (the in-memory repository), the session in front of
 * the consent doors (the product's `AuthMiddleware` sets `req.user` and
 * `req.org`; this sets the same two), and the product services a capability
 * calls (fakes answering what the doors answer).
 */

require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { Module, ValidationPipe } = require('@nestjs/common');
const { ThrottlerModule } = require('@nestjs/throttler');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { auth } = require('@modelcontextprotocol/sdk/client/auth.js');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const {
  loadRegistry,
  permissionsService,
  services: serviceTokens,
} = require('./agent-capabilities.cjs');
const { createMemoryMcpOAuthRepository, standardPeople } = require('./mcp-oauth-memory.cjs');

const SECRET = 'sk-proj-E2ESECRETVALUE0123456789abcdef';
const ORG_API_KEY = '5f0c1d2e3f4a5b6c7d8e9f00112233445566778899aabbccddeeff';

/** Modules shared by every file loaded below, by each spelling of their import. */
const shared = {};
const load = (file, aliases = []) => {
  const exports = loadTypeScriptModule(file, {}, { resolve: (request) => shared[request] });
  for (const alias of aliases) shared[alias] = exports;
  return exports;
};

const registry = loadRegistry();
const permissions = permissionsService();
const PermissionsService = permissions.constructor;
for (const alias of [
  '@contentfactory/nestjs-libraries/chat/capabilities/capability.registry',
  '@contentfactory/nestjs-libraries/chat/capabilities/door-policy',
  '@contentfactory/nestjs-libraries/chat/capabilities/capability.context',
  '@contentfactory/nestjs-libraries/chat/capabilities/mcp.adapter',
  '@contentfactory/nestjs-libraries/chat/capabilities/person-time',
]) {
  shared[alias] = registry;
}
shared['@contentfactory/backend/services/auth/permissions/permissions.service'] = { PermissionsService };
const McpOAuthRepository = class McpOAuthRepository {};
shared['@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.repository'] = {
  McpOAuthRepository,
};

const actingUser = load('libraries/nestjs-libraries/src/user/acting.user.ts', [
  '@contentfactory/nestjs-libraries/user/acting.user',
]);
load('libraries/nestjs-libraries/src/database/prisma/oauth/mcp-oauth.rules.ts', [
  '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.rules',
]);
const { McpOAuthService } = load(
  'libraries/nestjs-libraries/src/database/prisma/oauth/mcp-oauth.service.ts',
  ['@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.service']
);
const { McpServers, createMcpBodyParser } = load('libraries/nestjs-libraries/src/chat/start.mcp.ts', [
  '@contentfactory/nestjs-libraries/chat/start.mcp',
]);
load('apps/backend/src/api/routes/mcp.throttle.ts', ['./mcp.throttle']);
const { McpBearerMiddleware } = load('apps/backend/src/services/auth/mcp.bearer.middleware.ts', [
  '@contentfactory/backend/services/auth/mcp.bearer.middleware',
]);
const { McpOAuthMetadataController, McpOAuthController, McpOAuthConsentController } = load(
  'apps/backend/src/api/routes/mcp-oauth.controller.ts'
);
const { McpController } = load('apps/backend/src/api/routes/mcp.controller.ts');

const token = (module, name) => serviceTokens[module][name];
const paidCalls = [];
const fakes = [
  {
    provide: token('@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service', 'IntegrationService'),
    useValue: {
      getIntegrationsForChannelList: async (organizationId) =>
        organizationId === 'org-1'
          ? [{ id: 'c1', name: 'Канал', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, _count: { posts: 2 } }]
          : [],
    },
  },
  {
    // A service failing the way a driver does: its message must not reach the client.
    provide: token('@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service', 'PieceService'),
    useValue: {
      list: async () => {
        throw new Error('connect ECONNREFUSED /srv/app/secret.sock');
      },
    },
  },
  {
    provide: token('@contentfactory/nestjs-libraries/content-intelligence/leads/content-lead.service', 'ContentLeadService'),
    useValue: {
      feedCheckEnabled: true,
      topicCheckEnabled: true,
      listSubscriptions: async () => ({
        subscriptions: [
          {
            id: 'sub-2',
            kind: 'TOPIC',
            displayName: 'ИИ в малом бизнесе',
            canonicalUrl: 'topic://ии',
            query: 'ИИ в малом бизнесе',
            state: 'ACTIVE',
            lastCheckedAt: null,
            lastErrorCode: null,
            leadsThisMonth: 0,
            acceptedThisMonth: 0,
          },
        ],
        capabilities: { feedCheck: true, topicCheck: true },
      }),
      // Where the door's own admission (`AiUsageService`) reads who pays.
      checkSubscription: async (organizationId, subscriptionId) => {
        paidCalls.push({ organizationId, subscriptionId, actingUser: actingUser.getActingUserId() ?? null });
        return { checked: true, created: 2 };
      },
    },
  },
];

const people = standardPeople();
const memory = createMemoryMcpOAuthRepository(people);
const logs = [];
const logger = {
  log: (message, context) => logs.push(`${context ?? ''} ${message}`),
  warn: (message, context) => logs.push(`${context ?? ''} ${message}`),
  error: (message, context) => logs.push(`${context ?? ''} ${message}`),
  debug() {},
  verbose() {},
  fatal: (message) => logs.push(String(message)),
};

/** The session in front of the consent doors, as `AuthMiddleware` leaves it. */
const session = (req, _res, next) => {
  req.user = { id: 'user-1' };
  req.org = { id: 'org-1', name: 'Stand kcxz', createdAt: people.organizations['org-1'].createdAt };
  next();
};

class TestModule {
  configure(consumer) {
    consumer.apply(session).forRoutes(McpOAuthConsentController);
    consumer.apply(McpBearerMiddleware).forRoutes(McpController);
  }
}
Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 3_600_000, limit: 10_000 }] })],
  controllers: [McpOAuthMetadataController, McpOAuthController, McpOAuthConsentController, McpController],
  providers: [
    McpOAuthService,
    { provide: McpOAuthRepository, useValue: memory.repository },
    McpServers,
    McpBearerMiddleware,
    { provide: PermissionsService, useValue: permissions },
    ...fakes,
  ],
})(TestModule);

const REDIRECT = 'http://127.0.0.1:43210/callback';

/** An assistant's OAuth state, as the SDK asks a client to keep it. */
class Assistant {
  constructor(name) {
    this.name = name;
    this.saved = {};
  }
  get redirectUrl() {
    return REDIRECT;
  }
  get clientMetadata() {
    return {
      client_name: this.name,
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp offline_access',
    };
  }
  state() {
    return 'state-e2e';
  }
  clientInformation() {
    return this.saved.client;
  }
  saveClientInformation(client) {
    this.saved.client = client;
  }
  tokens() {
    return this.saved.tokens;
  }
  saveTokens(tokens) {
    this.saved.tokens = tokens;
  }
  redirectToAuthorization(url) {
    this.saved.authorizationUrl = url;
  }
  saveCodeVerifier(verifier) {
    this.saved.verifier = verifier;
  }
  codeVerifier() {
    return this.saved.verifier;
  }
}

(async () => {
  const app = await NestFactory.create(TestModule, { logger });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  // As `main.ts` mounts it: the token is checked before the body is read.
  app.use(['/mcp'], createMcpBodyParser(() => app.get(McpOAuthService)));
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  Object.assign(process.env, {
    MCP_ENABLED: 'true',
    NEXT_PUBLIC_BACKEND_URL: base,
    FRONTEND_URL: 'http://frontend.test',
  });
  delete process.env.MCP_URL;
  const mcpUrl = new URL(`${base}/mcp`);

  const report = {};
  const step = async (name, run) => {
    try {
      report[name] = await run();
    } catch (error) {
      report[name] = { error: String(error?.stack ?? error) };
    }
  };

  // What went over the wire to the token endpoint: the content type only.
  const tokenRequests = [];
  const recordingFetch = async (url, init) => {
    if (String(url).endsWith('/oauth/mcp/token')) {
      tokenRequests.push(new Headers(init?.headers).get('content-type'));
    }
    return fetch(url, init);
  };

  const post = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const rpc = (accessToken, method, params = {}) =>
    post(
      '/mcp',
      { jsonrpc: '2.0', id: 1, method, params },
      {
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      }
    );

  /** The consent page's two requests, with the session. */
  const consent = async (authorizationUrl, action = 'approve') => {
    const query = authorizationUrl.search;
    const shown = await (await fetch(`${base}/oauth/mcp/authorize${query}`)).json();
    const decided = await (
      await post('/oauth/mcp/authorize', {
        ...Object.fromEntries(authorizationUrl.searchParams),
        action,
        // The workspace the page showed (review W5-26 F5).
        workspace_id: shown.workspace?.id,
      })
    ).json();
    return { shown, redirect: new URL(decided.redirect) };
  };

  const assistant = new Assistant('E2E Assistant');

  await step('discovery', async () => {
    const read = async (path) => {
      const response = await fetch(`${base}${path}`);
      return { status: response.status, body: response.status === 200 ? await response.json() : null };
    };
    return {
      prm: await read('/.well-known/oauth-protected-resource'),
      prmMcp: await read('/.well-known/oauth-protected-resource/mcp'),
      prmOther: await read('/.well-known/oauth-protected-resource/other'),
      as: await read('/.well-known/oauth-authorization-server'),
      asOther: await read('/.well-known/oauth-authorization-server/other'),
    };
  });

  // A backend under a path (production: `https://host/api`): the RFC's suffixed
  // locations, which an edge proxy passes here from the host root.
  await step('discoveryUnderPath', async () => {
    process.env.MCP_URL = `${base}/api`;
    const read = async (path) => {
      const response = await fetch(`${base}${path}`);
      return { status: response.status, body: response.status === 200 ? await response.json() : null };
    };
    const found = {
      prm: await read('/.well-known/oauth-protected-resource/api/mcp'),
      as: await read('/.well-known/oauth-authorization-server/api'),
      prmWrong: await read('/.well-known/oauth-protected-resource/mcp/api'),
    };
    delete process.env.MCP_URL;
    return found;
  });

  await step('unauthenticated', async () => {
    const bare = await rpc(null, 'tools/list');
    const apiKey = await rpc(ORG_API_KEY, 'tools/list');
    return {
      bare: { status: bare.status, challenge: bare.headers.get('www-authenticate'), body: await bare.json() },
      apiKey: { status: apiKey.status, challenge: apiKey.headers.get('www-authenticate') },
    };
  });

  await step('oauth', async () => {
    const transport = new StreamableHTTPClientTransport(mcpUrl, { authProvider: assistant, fetch: recordingFetch });
    const client = new Client({ name: 'e2e', version: '1.0.0' });
    let first;
    try {
      await client.connect(transport);
      first = 'connected without auth';
    } catch (error) {
      first = error?.constructor?.name;
    }
    const authorizationUrl = assistant.saved.authorizationUrl;
    const { shown, redirect } = await consent(authorizationUrl);
    await transport.finishAuth(redirect.searchParams.get('code'));
    return {
      first,
      registered: {
        clientIdPrefix: assistant.saved.client?.client_id?.slice(0, 4),
        method: assistant.saved.client?.token_endpoint_auth_method,
      },
      authorization: {
        origin: authorizationUrl.origin,
        path: authorizationUrl.pathname,
        method: authorizationUrl.searchParams.get('code_challenge_method'),
        hasChallenge: !!authorizationUrl.searchParams.get('code_challenge'),
        resource: authorizationUrl.searchParams.get('resource'),
        state: authorizationUrl.searchParams.get('state'),
      },
      shown,
      redirect: {
        origin: redirect.origin + redirect.pathname,
        state: redirect.searchParams.get('state'),
        iss: redirect.searchParams.get('iss'),
        hasCode: !!redirect.searchParams.get('code'),
      },
      tokens: {
        type: assistant.saved.tokens?.token_type,
        expiresIn: assistant.saved.tokens?.expires_in,
        access: assistant.saved.tokens?.access_token?.slice(0, 5),
        refresh: assistant.saved.tokens?.refresh_token?.slice(0, 5),
      },
      tokenContentTypes: [...tokenRequests],
    };
  });

  let client;
  await step('session', async () => {
    client = new Client({ name: 'e2e', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(mcpUrl, { authProvider: assistant, fetch: recordingFetch }));
    const tools = (await client.listTools()).tools;
    const channels = await client.callTool({ name: 'channels_list', arguments: {} });
    const paid = await client.callTool({ name: 'ideas_check', arguments: { subscriptionId: 'sub-2' } });
    const echoed = await client.callTool({
      name: 'piece_create',
      arguments: { text: 'мысль', inputKind: SECRET },
    });
    // A service that fails as a driver does (review W5-26 (c)).
    const failed = await client.callTool({ name: 'piece_list', arguments: {} });
    return {
      toolNames: tools.map((tool) => tool.name),
      annotations: Object.fromEntries(
        tools.filter((tool) => ['channels_list', 'piece_create'].includes(tool.name)).map((tool) => [tool.name, tool.annotations])
      ),
      channels: JSON.parse(channels.content[0].text),
      paid: JSON.parse(paid.content[0].text),
      paidCalls: [...paidCalls],
      echoed: { isError: !!echoed.isError, text: echoed.content[0].text },
      failed: { isError: !!failed.isError, text: failed.content[0].text },
    };
  });

  await step('logs', async () => logs.filter((line) => line.includes('tools/call')));

  await step('demotion', async () => {
    people.memberships['user-1:org-1'].role = 'USER';
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    const refused = await client.callTool({ name: 'ideas_check', arguments: { subscriptionId: 'sub-2' } });
    people.memberships['user-1:org-1'].role = 'EDITOR';
    return { tools, refused: { isError: !!refused.isError, text: refused.content[0].text } };
  });

  await step('refresh', async () => {
    const before = { ...assistant.saved.tokens };
    const result = await auth(assistant, { serverUrl: mcpUrl, fetchFn: recordingFetch });
    const after = { ...assistant.saved.tokens };
    const oldAccess = await rpc(before.access_token, 'tools/list');
    const newAccess = await rpc(after.access_token, 'tools/list');
    // The rotated-away refresh token comes back: refused, and the connection goes.
    const replay = await fetch(`${base}/oauth/mcp/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: assistant.saved.client.client_id,
        refresh_token: before.refresh_token,
      }),
    });
    const afterReplay = await rpc(after.access_token, 'tools/list');
    return {
      result,
      rotated: before.refresh_token !== after.refresh_token && before.access_token !== after.access_token,
      oldAccess: oldAccess.status,
      newAccess: newAccess.status,
      replay: { status: replay.status, body: await replay.json(), cache: replay.headers.get('cache-control') },
      afterReplay: afterReplay.status,
      tokenContentTypes: [...tokenRequests],
    };
  });

  /** A whole OAuth connection by hand, with a JSON token request. */
  const connectByHand = async (name) => {
    const registered = await (await post('/oauth/mcp/register', { client_name: name, redirect_uris: [REDIRECT] })).json();
    const verifier = 'e2e-verifier-'.padEnd(64, 'x');
    const challenge = require('node:crypto').createHash('sha256').update(verifier).digest('base64url');
    const authorizationUrl = new URL('http://frontend.test/oauth/authorize');
    authorizationUrl.search = new URLSearchParams({
      client_id: registered.client_id,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: mcpUrl.href,
      state: 'x',
    }).toString();
    const { redirect } = await consent(authorizationUrl);
    const tokens = await (
      await post('/oauth/mcp/token', {
        grant_type: 'authorization_code',
        client_id: registered.client_id,
        code: redirect.searchParams.get('code'),
        code_verifier: verifier,
        redirect_uri: REDIRECT,
        resource: mcpUrl.href,
      })
    ).json();
    return tokens.access_token;
  };

  await step('membership', async () => {
    const accessToken = await connectByHand('Membership');
    const live = await rpc(accessToken, 'tools/list');
    people.memberships['user-1:org-1'].disabled = true;
    const disabled = await rpc(accessToken, 'tools/list');
    people.memberships['user-1:org-1'].disabled = false;
    return { jsonToken: accessToken?.slice(0, 5), live: live.status, disabled: disabled.status };
  });

  await step('largeBodies', async () => {
    const accessToken = await connectByHand('Large bodies');
    // A tool call with a pasted text over express's 100 KB default.
    const big = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'channels_list', arguments: {}, _meta: { pad: 'я'.repeat(150_000) } },
    });
    const send = (authorization) =>
      fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18',
          authorization,
        },
        body: big,
      });
    return {
      bytes: Buffer.byteLength(big),
      live: (await send(`Bearer ${accessToken}`)).status,
      // An unknown `mcpa_` gets Nest's 100 KB parser, not the 4 MB one (R2).
      fake: (await send('Bearer mcpa_Xk3v9QpL0aZ-7yN2bR8sT1uV4wE6fG5hJ_cD0eIoKmM')).status,
    };
  });

  await step('oldPaths', async () => {
    const accessToken = await connectByHand('Old paths');
    const statuses = {};
    for (const [method, path] of [
      ['GET', '/sse'],
      ['POST', '/message'],
      ['GET', '/mcp-oauth'],
      ['POST', '/mcp-oauth'],
      ['GET', `/mcp/${ORG_API_KEY}`],
      ['POST', '/mcp/sse'],
    ]) {
      statuses[`${method} ${path}`] = (
        await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${accessToken}` } })
      ).status;
    }
    // The standalone SSE stream of Streamable HTTP is not offered either.
    const stream = await fetch(`${base}/mcp`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'text/event-stream' },
    });
    statuses['GET /mcp'] = stream.status;
    statuses['GET /mcp allow'] = stream.headers.get('allow');
    statuses['DELETE /mcp'] = (
      await fetch(`${base}/mcp`, { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } })
    ).status;
    return statuses;
  });

  await step('throttle', async () => {
    const first = await connectByHand('Throttle A');
    const second = await connectByHand('Throttle B');
    const statuses = [];
    for (let index = 0; index < 61; index += 1) {
      statuses.push((await rpc(first, 'ping')).status);
    }
    return {
      firstSixty: [...new Set(statuses.slice(0, 60))],
      sixtyFirst: statuses[60],
      otherToken: (await rpc(second, 'ping')).status,
    };
  });

  await step('consentRefusals', async () => {
    const registered = await (
      await post('/oauth/mcp/register', { client_name: 'Evil', redirect_uris: ['https://evil.example/login'] })
    ).json();
    // No PKCE and an implicit response type: refused after the redirect is known.
    const refusedQuery = new URLSearchParams({
      client_id: registered.client_id,
      redirect_uri: 'https://evil.example/login',
      response_type: 'token',
    });
    const refused = await (await fetch(`${base}/oauth/mcp/authorize?${refusedQuery}`)).json();
    // A workspace other than the one shown is refused at the decision.
    const good = new URLSearchParams({
      client_id: registered.client_id,
      redirect_uri: 'https://evil.example/login',
      response_type: 'code',
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
    });
    const mismatch = await post('/oauth/mcp/authorize', {
      ...Object.fromEntries(good),
      action: 'approve',
      workspace_id: 'org-other',
    });
    const grantsBefore = memory.grants.length;
    const missing = await post('/oauth/mcp/authorize', { ...Object.fromEntries(good), action: 'approve' });
    // Deny is never blocked by the workspace check (R4).
    const denied = await (
      await post('/oauth/mcp/authorize', { ...Object.fromEntries(good), action: 'deny', workspace_id: 'org-other' })
    ).json();
    return {
      denied: new URL(denied.redirect).searchParams.get('error'),
      refused: { ...refused, redirect: refused.redirect && new URL(refused.redirect).host },
      mismatch: { status: mismatch.status, body: await mismatch.json() },
      missing: missing.status,
      grantsWritten: memory.grants.length - grantsBefore,
    };
  });

  await step('dark', async () => {
    process.env.MCP_ENABLED = 'false';
    const statuses = {
      mcp: (await rpc(null, 'tools/list')).status,
      prm: (await fetch(`${base}/.well-known/oauth-protected-resource`)).status,
      register: (await post('/oauth/mcp/register', { redirect_uris: [REDIRECT] })).status,
    };
    process.env.MCP_ENABLED = 'true';
    return statuses;
  });

  await step('refusalThrottle', async () => {
    const statuses = [];
    for (let index = 0; index < 125; index += 1) statuses.push((await rpc(null, 'ping')).status);
    return { statuses: [...new Set(statuses)].sort() };
  });

  await client?.close().catch(() => undefined);
  await app.close();
  process.stdout.write(`\nREPORT ${JSON.stringify(report)}\n`);
  process.exit(0);
})().catch((error) => {
  process.stdout.write(`\nREPORT ${JSON.stringify({ fatal: String(error?.stack ?? error) })}\n`);
  process.exit(1);
});
