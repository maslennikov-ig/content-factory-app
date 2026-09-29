'use strict';

/**
 * The MCP server's own pieces (`content-factory-next-kcxz.26`,
 * `libraries/nestjs-libraries/src/chat/start.mcp.ts`, `mcp.adapter.ts`):
 * the dark default, the identity an MCP request carries, the context a tool
 * call gets, and the guard around `@mastra/mcp`'s call path (no argument echo,
 * one log line per call). The whole path through the SDK client is
 * `mcp.e2e.test.cjs`.
 */

const { RequestContext } = require('@mastra/core/request-context');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadRegistry } = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const logged = [];
const mcp = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/start.mcp.ts',
  {
    '@nestjs/common': {
      ...require('@nestjs/common'),
      Logger: {
        log: (message, context) => logged.push(`${context} ${message}`),
        warn: (message, context) => logged.push(`${context} ${message}`),
      },
    },
    '@mastra/mcp': { MCPServer: class {} },
    '@contentfactory/backend/services/auth/permissions/permissions.service': {
      PermissionsService: class {},
    },
    '@contentfactory/nestjs-libraries/chat/capabilities/capability.registry': registry,
    '@contentfactory/nestjs-libraries/chat/capabilities/door-policy': registry,
    '@contentfactory/nestjs-libraries/chat/capabilities/capability.context': registry,
    '@contentfactory/nestjs-libraries/chat/capabilities/mcp.adapter': registry,
    '@contentfactory/nestjs-libraries/chat/capabilities/person-time': registry,
  }
);

const person = {
  organizationId: 'org-1',
  organizationCreatedAt: '2026-01-01T00:00:00.000Z',
  userId: 'user-1',
  role: 'EDITOR',
  userLanguage: 'ru',
  userTimezone: 180,
};

beforeEach(() => {
  logged.length = 0;
});

describe('MCP is dark unless lit (kcxz.1)', () => {
  test('only the exact string "true" lights it', () => {
    for (const value of [undefined, '', 'false', '1', 'TRUE', ' true']) {
      expect(mcp.isMcpEnabled({ MCP_ENABLED: value })).toBe(false);
    }
    expect(mcp.isMcpEnabled({ MCP_ENABLED: 'true' })).toBe(true);
    expect(mcp.MCP_SERVER_INFO).toEqual({ name: 'Content Factory MCP', version: '1.0.0' });
    expect(mcp.MCP_HTTP_PATH).toBe('/mcp');
  });
});

describe('the identity of an MCP request', () => {
  test('the chat’s rules: interface language; no browser, so the saved offset or UTC', () => {
    expect(mcp.mcpCapabilityIdentity(person)).toEqual({
      organizationId: 'org-1',
      organizationCreatedAt: '2026-01-01T00:00:00.000Z',
      userId: 'user-1',
      role: 'EDITOR',
      language: 'ru',
      timeZone: '+03:00',
    });
    expect(
      mcp.mcpCapabilityIdentity({ ...person, userLanguage: 'de', userTimezone: 'garbage' })
    ).toMatchObject({ language: 'en', timeZone: 'UTC' });
  });

  test('mapAuthInfoToUser writes exactly what the tools’ requestContextSchema reads', async () => {
    const identity = mcp.mcpCapabilityIdentity(person);
    const requestContext = new RequestContext();
    const user = await mcp.seedMcpRequestContext({ authInfo: { extra: { identity } }, requestContext });
    expect(user).toEqual({ id: 'user-1' });
    expect(registry.readCapabilityIdentity(requestContext)).toEqual(identity);
    expect(registry.capabilityContextSchema.safeParse(
      Object.fromEntries([...requestContext.entries()])
    ).success).toBe(true);
    // No identity from the bearer check: nothing is written, the tool refuses.
    const empty = new RequestContext();
    expect(await mcp.seedMcpRequestContext({ authInfo: { extra: {} }, requestContext: empty })).toBeUndefined();
    expect(registry.readCapabilityIdentity(empty)).toBeNull();
  });
});

describe('around @mastra/mcp’s call path', () => {
  const server = (execute) => ({
    convertedTools: {
      piece_create: {
        parameters: { jsonSchema: { type: 'object' }, validate: async () => ({ success: false }) },
        execute,
      },
    },
  });

  test('the server’s own check passes, core’s refusal loses every value, and each call is logged', async () => {
    const seen = [];
    const fake = server(async (args, options) => {
      seen.push(args);
      return {
        error: true,
        message: "Tool input validation failed for piece_create.\n- inputKind: Invalid enum value. Expected 'idea', received 'sk-proj-SECRET'\n\nProvided arguments: {\"inputKind\":\"sk-proj-SECRET\"}",
        validationErrors: {},
      };
    });
    registry.hardenMcpServerTools(fake, mcp.logMcpCall);
    const tool = fake.convertedTools.piece_create;
    expect(await tool.parameters.validate({ inputKind: 'sk-proj-SECRET' })).toEqual({
      success: true,
      value: { inputKind: 'sk-proj-SECRET' },
    });
    expect(tool.parameters.jsonSchema).toEqual({ type: 'object' });

    const requestContext = new RequestContext();
    registry.seedCapabilityContext(requestContext, mcp.mcpCapabilityIdentity(person));
    const output = await tool.execute({ inputKind: 'sk-proj-SECRET' }, { requestContext });
    expect(JSON.stringify(output)).not.toContain('sk-proj');
    expect(output).toMatchObject({ ok: false, code: 'CAPABILITY_INPUT_INVALID' });
    expect(output.reason).toContain('(inputKind)');
    expect(seen).toHaveLength(1);
    expect(logged).toEqual(['MCP tools/call piece_create organization=org-1 user=user-1 role=EDITOR']);
  });

  test('a thrown error or an error result reaches the client as a code, never a message or stack (review W5-26 (c))', async () => {
    const requestContext = new RequestContext();
    registry.seedCapabilityContext(requestContext, mcp.mcpCapabilityIdentity(person));
    const thrown = server(async () => {
      throw new Error('connect ECONNREFUSED /srv/app/secret.sock at Object.<anonymous>');
    });
    registry.hardenMcpServerTools(thrown, mcp.logMcpCall, mcp.logMcpFailure);
    const failed = await thrown.convertedTools.piece_create.execute({}, { requestContext });
    expect(failed).toEqual({ ok: false, code: 'CAPABILITY_FAILED', reason: expect.any(String) });
    expect(JSON.stringify(failed)).not.toMatch(/ECONNREFUSED|secret\.sock|Object\.<anonymous>/);

    // A product code keeps its sentence, as in the web chat.
    const coded = server(async () => {
      throw Object.assign(new Error('В этом месяце посты кончились.'), { code: 'posts_limit_reached' });
    });
    registry.hardenMcpServerTools(coded, mcp.logMcpCall, mcp.logMcpFailure);
    const codedOutput = await coded.convertedTools.piece_create.execute({}, { requestContext });
    expect(codedOutput.ok).toBe(false);
    expect(typeof codedOutput.code).toBe('string');

    // An error-shaped result from core (a MastraError's toJSON) is cleaned too.
    const shaped = server(async () => ({ error: true, message: 'stack at /srv/app/x.js:1', details: { args: 'sk-proj-X' } }));
    registry.hardenMcpServerTools(shaped, mcp.logMcpCall, mcp.logMcpFailure);
    const shapedOutput = await shaped.convertedTools.piece_create.execute({}, { requestContext });
    expect(shapedOutput).toEqual({ ok: false, code: 'CAPABILITY_FAILED', reason: expect.any(String) });
    // Logged on our side only, without arguments.
    expect(logged.some((line) => line.startsWith('MCP tools/call piece_create failed: connect ECONNREFUSED'))).toBe(true);
  });

  test('the large body parser runs only for a live MCP access token, checked before the body (F4, R2)', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      MCP_ENABLED: 'true',
      NEXT_PUBLIC_BACKEND_URL: 'https://factory.example/api',
      FRONTEND_URL: 'https://factory.example',
    });
    try {
      const asked = [];
      const bearer = {
        authenticate: async (token) => {
          asked.push(token);
          return token === 'mcpa_live' ? { identity: { userId: 'user-1' } } : { refused: 'unknown' };
        },
      };
      const parsed = [];
      const parser = mcp.createMcpBodyParser(() => bearer, (req, _res, next) => {
        parsed.push(req.headers.authorization);
        next();
      });
      const seen = [];
      for (const authorization of [undefined, 'Bearer 5f0c1d2e3f4a5b6c', 'Bearer pos_x', 'Basic abc', 'Bearer mcpa_fake', 'Bearer mcpa_live']) {
        const req = { headers: authorization ? { authorization } : {} };
        await new Promise((resolve) => parser(req, {}, resolve));
        seen.push(req.mcpBearerCheck?.result ?? null);
      }
      // Only `mcpa_` tokens are looked up; only a live one gets the large parse.
      expect(asked).toEqual(['mcpa_fake', 'mcpa_live']);
      expect(parsed).toEqual(['Bearer mcpa_live']);
      // The answer is kept for the bearer middleware, which does not ask again.
      expect(seen.slice(4)).toEqual([{ refused: 'unknown' }, { identity: { userId: 'user-1' } }]);

      // Dark: nothing is looked up, nothing large is parsed.
      process.env.MCP_ENABLED = 'false';
      await new Promise((resolve) => parser({ headers: { authorization: 'Bearer mcpa_live' } }, {}, resolve));
      expect(asked).toHaveLength(2);
    } finally {
      process.env = saved;
    }
  });

  test('an oversized body is a 413 logged as a warning, with or without a token (walk recheck observation)', async () => {
    const { PassThrough } = require('node:stream');
    const saved = { ...process.env };
    Object.assign(process.env, {
      MCP_ENABLED: 'true',
      NEXT_PUBLIC_BACKEND_URL: 'https://factory.example/api',
      FRONTEND_URL: 'https://factory.example',
    });
    try {
      const bearer = { authenticate: async () => ({ refused: 'unknown' }) };
      const parser = mcp.createMcpBodyParser(() => bearer);
      const body = JSON.stringify({ jsonrpc: '2.0', method: 'x', params: { text: 'a'.repeat(200 * 1024) } });
      for (const authorization of [undefined, 'Bearer mcpa_unknown']) {
        const req = new PassThrough();
        req.headers = {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
          ...(authorization ? { authorization } : {}),
        };
        req.method = 'POST';
        const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = text; } };
        let passedOn = 'not called';
        const finished = new Promise((resolve) => {
          const originalEnd = res.end.bind(res);
          res.end = (text) => { originalEnd(text); resolve(); };
          parser(req, res, (error) => { passedOn = error ?? null; resolve(); });
        });
        req.end(body);
        await finished;
        expect(passedOn).toBe('not called');
        expect(res.statusCode).toBe(413);
        expect(JSON.parse(res.body)).toEqual({ statusCode: 413, message: 'request entity too large' });
      }
      expect(logged.filter((line) => line.startsWith('McpBody /mcp body over the limit'))).toHaveLength(2);
    } finally {
      process.env = saved;
    }
  });

  test('a failure log goes through the chat’s key redaction (R6)', () => {
    mcp.logMcpFailure('ai_settings', new Error('provider said: bad key sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE2222 and mcpa_Xk3v9QpL0aZ-7yN2bR8sT1uV4wE6fG5hJ_cD0eIoKmM'));
    expect(logged.at(-1)).toBe('MCP tools/call ai_settings failed: provider said: bad key [KEY] and [KEY]');
  });

  test('a server that moved its tools is refused at build, not trusted silently', () => {
    expect(() => registry.hardenMcpServerTools({}, mcp.logMcpCall)).toThrow(/convertedTools/);
  });

  test('roles with the same MCP list share it; USER’s list is the reads only', () => {
    const catalogue = registry.CAPABILITY_CATALOGUE;
    expect(registry.mcpToolNamesFor(catalogue, 'ADMIN')).toEqual(
      registry.mcpToolNamesFor(catalogue, 'SUPERADMIN')
    );
    const reads = new Set(
      catalogue.filter((entry) => entry.risk === 'read').map((entry) => registry.toolNameOf(entry.id))
    );
    for (const name of registry.mcpToolNamesFor(catalogue, 'USER')) expect(reads.has(name)).toBe(true);
    expect(registry.mcpToolNamesFor(catalogue, 'EDITOR')).toEqual(
      Object.keys(
        registry.buildMcpCapabilityTools(catalogue, {
          services: () => ({}),
          gate: { check: async () => ({ allowed: true, policies: [] }) },
          language: 'en',
          role: 'EDITOR',
        })
      )
    );
  });
});
