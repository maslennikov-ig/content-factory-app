'use strict';

/**
 * MCP end to end (`content-factory-next-kcxz.26`): the MCP SDK client against
 * the product's Nest doors in-process — registration, consent, the token with
 * PKCE, the tool list, a read and a paid call, refresh — and the refusals
 * around them. The walk runs in `helpers/mcp-e2e.runner.cjs` (a child
 * process: the SDK client and `@mastra/mcp` are not loaded by jest); this
 * suite reads its report.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

let report;

beforeAll(() => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'mcp-e2e.runner.cjs')], {
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, MCP_URL: '' },
  });
  const line = output.split('\n').find((entry) => entry.startsWith('REPORT '));
  report = JSON.parse(line.slice('REPORT '.length));
}, 150_000);

const noError = (name) => {
  expect(report.fatal).toBeUndefined();
  expect(report[name]?.error).toBeUndefined();
  return report[name];
};

describe('discovery (RFC 9728, RFC 8414)', () => {
  test('protected-resource and authorization-server metadata are served; other suffixes are not', () => {
    const run = noError('discovery');
    expect(run.prm.status).toBe(200);
    expect(run.prmMcp).toEqual(run.prm);
    expect(run.prm.body.resource).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(run.prm.body.authorization_servers).toEqual([run.as.body.issuer]);
    expect(run.as.body).toMatchObject({
      authorization_endpoint: 'http://frontend.test/oauth/authorize',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
    });
    expect(run.prmOther.status).toBe(404);
    expect(run.asOther.status).toBe(404);
  });

  test('under a path, the RFC’s suffixed locations answer for that issuer and resource', () => {
    const run = noError('discoveryUnderPath');
    expect(run.prm.status).toBe(200);
    expect(run.prm.body.resource).toMatch(/\/api\/mcp$/);
    expect(run.as.status).toBe(200);
    expect(run.as.body.issuer).toMatch(/\/api$/);
    expect(run.as.body.token_endpoint).toMatch(/\/api\/oauth\/mcp\/token$/);
    expect(run.prmWrong.status).toBe(404);
  });
});

describe('who gets in', () => {
  test('no token: 401 with the challenge that starts OAuth; the organization API key: 401 (X3)', () => {
    const run = noError('unauthenticated');
    expect(run.bare.status).toBe(401);
    expect(run.bare.challenge).toMatch(
      /^Bearer resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp", scope="mcp"$/
    );
    expect(run.apiKey.status).toBe(401);
    expect(run.apiKey.challenge).toMatch(/^Bearer error="invalid_token", resource_metadata=/);
  });

  test('the SDK client registers, the person consents, the code comes back with state and iss', () => {
    const run = noError('oauth');
    expect(run.first).toBe('UnauthorizedError');
    expect(run.registered).toEqual({ clientIdPrefix: 'mcp_', method: 'none' });
    expect(run.authorization).toMatchObject({
      origin: 'http://frontend.test',
      path: '/oauth/authorize',
      method: 'S256',
      hasChallenge: true,
      state: 'state-e2e',
    });
    expect(run.authorization.resource).toMatch(/\/mcp$/);
    expect(run.shown).toEqual({
      client: { name: 'E2E Assistant' },
      redirectHost: '127.0.0.1:43210',
      workspace: { id: 'org-1', name: 'Stand kcxz' },
      scope: 'mcp',
    });
    expect(run.redirect).toMatchObject({
      origin: 'http://127.0.0.1:43210/callback',
      state: 'state-e2e',
      hasCode: true,
    });
    expect(run.redirect.iss).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(run.tokens).toEqual({ type: 'Bearer', expiresIn: 3600, access: 'mcpa_', refresh: 'mcpr_' });
    // The SDK's own token request is form-urlencoded; it passed Nest's parser.
    expect(run.tokenContentTypes).toEqual(['application/x-www-form-urlencoded']);
  });

  test('a JSON token request works too; a disabled membership is refused on the next request', () => {
    const run = noError('membership');
    expect(run).toEqual({ jsonToken: 'mcpa_', live: 200, disabled: 401 });
  });
});

describe('the tools', () => {
  test('an editor gets the chat catalogue minus confirm, input and secret, with hints', () => {
    const run = noError('session');
    expect(run.toolNames).toContain('channels_list');
    expect(run.toolNames).toContain('piece_create');
    expect(run.toolNames).toContain('ideas_check');
    for (const webOnly of ['piece_delete', 'channel_connect', 'plan_publish_now', 'ai_key_enter', 'ideas_topic_add', 'media_keep']) {
      expect(run.toolNames).not.toContain(webOnly);
    }
    expect(run.annotations.channels_list).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(run.annotations.piece_create).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });

  test('a read runs for the OAuth person’s workspace', () => {
    const run = noError('session');
    expect(run.channels).toMatchObject({ ok: true, capability: 'channels.list' });
    expect(run.channels.summary.untrustedData.value.channels).toEqual([
      expect.objectContaining({ id: 'c1', platform: 'telegram' }),
    ]);
  });

  test('a paid call reaches the service as the OAuth person (X2)', () => {
    const run = noError('session');
    expect(run.paid).toMatchObject({ ok: true, capability: 'ideas.check' });
    expect(run.paidCalls).toEqual([{ organizationId: 'org-1', subscriptionId: 'sub-2', actingUser: 'user-1' }]);
  });

  test('arguments that fail the schema are refused without being echoed', () => {
    const run = noError('session');
    expect(run.echoed.text).not.toContain('sk-proj');
    expect(run.echoed.text).not.toContain('Provided arguments');
    expect(JSON.parse(run.echoed.text)).toMatchObject({ ok: false, code: 'CAPABILITY_INPUT_INVALID' });
  });

  test('every tools/call is logged with the tool, workspace and person, never the arguments', () => {
    const lines = noError('logs');
    expect(lines).toEqual([
      'MCP tools/call channels_list organization=org-1 user=user-1 role=EDITOR',
      'MCP tools/call ideas_check organization=org-1 user=user-1 role=EDITOR',
      'MCP tools/call piece_create organization=org-1 user=user-1 role=EDITOR',
      'MCP tools/call piece_list organization=org-1 user=user-1 role=EDITOR',
      // The failure, on our side only.
      'MCP tools/call piece_list failed: connect ECONNREFUSED /srv/app/secret.sock',
    ]);
  });

  test('a service failure reaches the client as the chat’s code, without its message (review W5-26 (c))', () => {
    const run = noError('session');
    expect(JSON.parse(run.failed.text)).toEqual({
      ok: false,
      code: 'CAPABILITY_FAILED',
      reason: expect.any(String),
    });
    expect(run.failed.text).not.toMatch(/ECONNREFUSED|secret\.sock|stack/);
  });

  test('a member demoted to USER sees only the reads on their next request', () => {
    const run = noError('demotion');
    expect(run.tools).toEqual([
      'workspace_snapshot',
      'channels_list',
      'piece_list',
      'piece_open',
      'plan_ahead',
      'plan_calendar',
      'plan_ready',
      'avatar_list',
      'avatar_overview',
      'avatar_proposal',
      'avatar_manual',
      'avatar_samples',
      'avatar_learning',
      'channel_open',
      'channel_posts',
      'ideas_list',
      'ideas_queue',
      'facts_list',
      'texts_related',
      'analytics_production',
      'analytics_channel',
      'media_library',
    ]);
    expect(run.refused).toEqual({ isError: true, text: 'Unknown tool: ideas_check' });
  });
});

describe('refresh', () => {
  test('the SDK refreshes: both tokens rotate, the old access token stops working', () => {
    const run = noError('refresh');
    expect(run.result).toBe('AUTHORIZED');
    expect(run.rotated).toBe(true);
    expect(run.oldAccess).toBe(401);
    expect(run.newAccess).toBe(200);
    expect(run.tokenContentTypes).toEqual([
      'application/x-www-form-urlencoded',
      'application/x-www-form-urlencoded',
    ]);
  });

  test('the rotated-away refresh token is refused and ends the connection', () => {
    const run = noError('refresh');
    expect(run.replay).toEqual({
      status: 400,
      body: { error: 'invalid_grant', error_description: expect.any(String) },
      cache: 'no-store',
    });
    expect(run.afterReplay).toBe(401);
  });
});

describe('what is gone and what holds', () => {
  test('SSE, /message, /mcp-oauth and the key-in-address path are 404; GET and DELETE /mcp are 405', () => {
    expect(noError('oldPaths')).toEqual({
      'GET /sse': 404,
      'POST /message': 404,
      'GET /mcp-oauth': 404,
      'POST /mcp-oauth': 404,
      'GET /mcp/5f0c1d2e3f4a5b6c7d8e9f00112233445566778899aabbccddeeff': 404,
      'POST /mcp/sse': 404,
      'GET /mcp': 405,
      'GET /mcp allow': 'POST',
      'DELETE /mcp': 405,
    });
  });

  test('throttled per token: the 61st request in a minute is 429, another token still passes', () => {
    expect(noError('throttle')).toEqual({ firstSixty: [200], sixtyFirst: 429, otherToken: 200 });
  });

  test('a refused consent request is shown with its host, never followed by the page (review W5-26 F2)', () => {
    const run = noError('consentRefusals');
    expect(run.refused).toEqual({
      refused: true,
      error: 'unsupported_response_type',
      redirectHost: 'evil.example',
      redirect: 'evil.example',
    });
  });

  test('the decision must name the workspace the page showed (review W5-26 F5)', () => {
    const run = noError('consentRefusals');
    expect(run.mismatch).toEqual({
      status: 409,
      body: { error: 'workspace_changed', error_description: expect.any(String) },
    });
    expect(run.missing).toBe(409);
    expect(run.grantsWritten).toBe(0);
    // Deny goes back as access_denied whatever the workspace (R4).
    expect(run.denied).toBe('access_denied');
  });

  test('a body over 100 KB is parsed for a live token only; an unknown mcpa_ gets 413 before auth (R2)', () => {
    const run = noError('largeBodies');
    expect(run.bytes).toBeGreaterThan(200_000);
    expect(run.live).toBe(200);
    expect(run.fake).toBe(413);
  });

  test('refused requests are throttled too, per address (review W5-26 F4)', () => {
    expect(noError('refusalThrottle').statuses).toEqual([401, 429]);
  });

  test('dark unless MCP_ENABLED: /mcp, discovery and registration are 404', () => {
    expect(noError('dark')).toEqual({ mcp: 404, prm: 404, register: 404 });
  });
});
