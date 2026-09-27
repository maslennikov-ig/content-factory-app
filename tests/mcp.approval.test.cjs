'use strict';

/**
 * MCP between the conductor and its rebuild (`content-factory-next-kcxz.7`,
 * premortem X1).
 *
 * Until 27.09.2026 `startMcp` mounted the six MCP tools of the inherited
 * agent behind the organization key and OAuth; the approval gate of those
 * doors was tested here. The conductor replaced that agent and its eleven
 * Postiz tools, and MCP is rebuilt on the capability registry with per-person
 * OAuth and a throttler in `kcxz.26`. Until then a lit `MCP_ENABLED` must boot
 * the backend and mount nothing — neither a crash at boot looking for an
 * agent that is gone, nor a server with tools that no longer exist.
 *
 * `mayUseMcp`, the member rule the rebuild keeps, stays tested as a function.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const warnings = [];
const load = () =>
  loadTypeScriptModule('libraries/nestjs-libraries/src/chat/start.mcp.ts', {
    '@nestjs/common': {
      Logger: { warn: (message) => warnings.push(message) },
      INestApplication: class {},
    },
    '@contentfactory/nestjs-libraries/user/organization.roles': {
      isOrganizationEditor: (role) =>
        ['EDITOR', 'ADMIN', 'SUPERADMIN'].includes(role),
    },
  });

async function mountMcp(value) {
  const { startMcp } = load();
  const routes = new Map();
  const asked = [];
  const app = {
    get(token) {
      asked.push(token);
      throw new Error('startMcp must not resolve any provider now');
    },
    use(route, handler) {
      routes.set(route, handler);
    },
  };
  const saved = process.env.MCP_ENABLED;
  if (value === undefined) delete process.env.MCP_ENABLED;
  else process.env.MCP_ENABLED = value;
  try {
    await startMcp(app);
  } finally {
    if (saved === undefined) delete process.env.MCP_ENABLED;
    else process.env.MCP_ENABLED = saved;
  }
  return { routes, asked };
}

const authorization = (role, { disabled = false, activated = true } = {}) => ({
  organizationId: 'org-1',
  user: {
    activated,
    organizations: [
      { organizationId: 'other-org', role: 'ADMIN', disabled: false },
      { organizationId: 'org-1', role, disabled },
    ],
  },
});

describe('MCP until its rebuild on the registry (kcxz.26)', () => {
  beforeEach(() => {
    warnings.length = 0;
  });

  test('MCP is dark unless MCP_ENABLED is true (kcxz.1)', async () => {
    for (const value of [undefined, 'false', '1', 'TRUE']) {
      const { routes, asked } = await mountMcp(value);
      expect(routes.size).toBe(0);
      expect(asked).toEqual([]);
    }
    expect(warnings).toEqual([]);
  });

  test('a lit MCP_ENABLED boots, says why in the log and mounts nothing (X1)', async () => {
    const { routes, asked } = await mountMcp('true');
    expect(routes.size).toBe(0);
    expect(asked).toEqual([]);
    expect(warnings).toEqual([
      expect.stringContaining('content-factory-next-kcxz.26'),
    ]);
  });

  test('start.mcp no longer reaches the old agent or its tool list', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').resolve(
        __dirname,
        '..',
        'libraries/nestjs-libraries/src/chat/start.mcp.ts'
      ),
      'utf8'
    );
    expect(source).not.toMatch(/getAgent\(|listTools\(|MCP_TOOL_NAMES|MastraService/);
  });
});

describe('who may use MCP when it returns', () => {
  const { mayUseMcp } = load();

  test('a writer of the workspace may', () => {
    for (const role of ['EDITOR', 'ADMIN', 'SUPERADMIN']) {
      expect(mayUseMcp(authorization(role))).toBe(true);
    }
  });

  test('a reading member, a disabled one, an unactivated account or an outsider may not (kcxz.1)', () => {
    expect(mayUseMcp(authorization('USER'))).toBe(false);
    expect(mayUseMcp(authorization('EDITOR', { disabled: true }))).toBe(false);
    expect(mayUseMcp(authorization('EDITOR', { activated: false }))).toBe(false);
    expect(
      mayUseMcp({ ...authorization('EDITOR'), organizationId: 'org-2' })
    ).toBe(false);
    expect(mayUseMcp({ organizationId: 'org-1', user: null })).toBe(false);
  });
});
