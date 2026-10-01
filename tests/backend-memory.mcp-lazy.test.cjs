'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

function loadMcp({ failFirst = false } = {}) {
  let loads = 0;
  const constructed = [];
  const harden = jest.fn();
  const tools = jest.fn(() => ({ read: {} }));
  class FakeMcpServer {
    constructor(options) {
      this.options = options;
      this.startHTTP = jest.fn(async () => undefined);
      constructed.push(this);
    }
  }
  const mcp = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/start.mcp.ts',
    {
      '@contentfactory/backend/services/auth/permissions/permissions.service': {
        PermissionsService: class {},
      },
      '@contentfactory/nestjs-libraries/chat/capabilities/capability.registry': {
        CAPABILITY_CATALOGUE: [],
      },
      '@contentfactory/nestjs-libraries/chat/capabilities/door-policy': {
        DoorPolicyGate: class {},
      },
      '@contentfactory/nestjs-libraries/chat/capabilities/capability.context': {
        readCapabilityIdentity: () => null,
        seedCapabilityContext() {},
      },
      '@contentfactory/nestjs-libraries/chat/capabilities/mcp.adapter': {
        mcpToolNamesFor: (_catalogue, role) =>
          role === 'EDITOR' ? ['read', 'create'] : ['read'],
        buildMcpCapabilityTools: tools,
        hardenMcpServerTools: harden,
      },
      '@contentfactory/nestjs-libraries/chat/capabilities/person-time': {
        agentTimeZone: () => 'UTC',
      },
    },
    {
      resolve: (request) => {
        if (request !== '@mastra/mcp') return undefined;
        loads += 1;
        if (failFirst && loads === 1) throw new Error('synthetic SDK load failure');
        return { MCPServer: FakeMcpServer };
      },
    }
  );
  const servers = new mcp.McpServers({ get: () => ({}) });
  return { mcp, servers, constructed, harden, tools, loads: () => loads };
}

test('backend helpers and provider construction do not load the unused MCP SDK', () => {
  const run = loadMcp();
  expect(run.mcp.isMcpEnabled({})).toBe(false);
  expect(run.mcp.MCP_HTTP_PATH).toBe('/mcp');
  expect(run.loads()).toBe(0);
  expect(run.constructed).toHaveLength(0);
});

test('first authorized server use loads the SDK and preserves role/language cache and HTTP options', async () => {
  const run = loadMcp();
  expect(run.loads()).toBe(0);
  const first = run.servers.serverFor('EDITOR', 'ru');
  expect(run.loads()).toBe(1);
  expect(run.servers.serverFor('EDITOR', 'ru')).toBe(first);
  expect(run.loads()).toBe(1);
  expect(first.options).toMatchObject({
    name: 'Content Factory MCP',
    version: '1.0.0',
    tools: { read: {} },
    mapAuthInfoToUser: run.mcp.seedMcpRequestContext,
  });
  expect(run.tools).toHaveBeenCalledWith([], expect.objectContaining({ role: 'EDITOR', language: 'ru' }));
  expect(run.harden).toHaveBeenCalledWith(first, run.mcp.logMcpCall, run.mcp.logMcpFailure);
  expect(run.servers.serverFor('USER', 'ru')).not.toBe(first);
  expect(run.servers.serverFor('EDITOR', 'en')).not.toBe(first);
  expect(run.constructed).toHaveLength(3);
  const req = { url: '/mcp?probe=synthetic' };
  const res = {};
  await run.servers.handle(req, res, { role: 'EDITOR', language: 'ru' });
  expect(first.startHTTP).toHaveBeenCalledWith({
    url: new URL('/mcp?probe=synthetic', 'http://mcp.internal'),
    httpPath: '/mcp',
    req,
    res,
    options: { serverless: true },
  });
  expect(run.constructed).toHaveLength(3);
});

test('a failed first SDK load leaves the server cache empty and can be retried', () => {
  const run = loadMcp({ failFirst: true });
  expect(() => run.servers.serverFor('EDITOR', 'ru')).toThrow('synthetic SDK load failure');
  expect(run.constructed).toHaveLength(0);
  const server = run.servers.serverFor('EDITOR', 'ru');
  expect(run.loads()).toBe(2);
  expect(run.servers.serverFor('EDITOR', 'ru')).toBe(server);
  expect(run.constructed).toHaveLength(1);
});
