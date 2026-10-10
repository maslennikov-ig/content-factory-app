'use strict';
const { fixture, dribbble } = require('./helpers/token-refresh.module.cjs');
const { sensitive } = require('./helpers/token-refresh.module.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('first failed token marks reconnect, keeps its secret and still refreshes both later channels', async () => {
  const f = fixture({ throwAt: 0 });
  const result = await f.service.refreshTokens();
  expect(f.attempts).toEqual([0, 1, 2]);
  expect(f.rows[0]).toEqual({ ...f.before[0], refreshNeeded: true });
  expect(f.rows[1].token).toBe('new-access-1');
  expect(f.rows[2].token).toBe('new-access-2');
  expect(result).toEqual({ total: 3, refreshed: 2, reconnectRequired: 1, failed: 0, notificationFailures: 0 });
});

test('Dribbble explicitly requires reconnect and performs no Pinterest or other network request', async () => {
  const d = dribbble();
  await expect(d.provider.refreshToken('inert-refresh')).resolves.toMatchObject({
    error: 'DRIBBBLE_RECONNECT_REQUIRED', accessToken: '', refreshToken: '', expiresIn: 0,
  });
  expect(d.requests).toEqual([]);
});

test.each([[0, 'empty'], [1, 'throw'], [1, 'empty'], [2, 'throw'], [2, 'empty']])(
  'failure at position %s (%s) preserves that secret and attempts the entire batch', async (index, kind) => {
    const f = fixture({ [kind === 'throw' ? 'throwAt' : 'emptyAt']: index });
    const result = await f.service.refreshTokens();
    expect(f.attempts).toEqual([0, 1, 2]);
    expect(f.rows[index]).toEqual({ ...f.before[index], refreshNeeded: true });
    for (let i = 0; i < 3; i++) {
      if (i !== index) expect(f.rows[i].token).toBe(`new-access-${i}`);
    }
    expect(result).toEqual({ total: 3, refreshed: 2, reconnectRequired: 1, failed: 0, notificationFailures: 0 });
    expect(f.updates[0].where).toEqual({ id: `channel-${index}`, organizationId: f.rows[index].organizationId });
  }
);

test.each([null, undefined, { accessToken: '', refreshToken: 'present', expiresIn: 3600 },
  { accessToken: 'present', refreshToken: '', expiresIn: 3600 },
  { accessToken: 'present', refreshToken: 'present', expiresIn: 0 }])(
  'invalid refresh reply %j never overwrites credentials or skips later channels', async reply => {
    const f = fixture({ reply: index => index === 0 ? reply : {
      accessToken: `new-access-${index}`, refreshToken: `new-refresh-${index}`, expiresIn: 3600,
    } });
    const result = await f.service.refreshTokens();
    expect(f.rows[0]).toEqual({ ...f.before[0], refreshNeeded: true });
    expect(f.rows[1].token).toBe('new-access-1');
    expect(f.rows[2].token).toBe('new-access-2');
    expect(result).toMatchObject({ refreshed: 2, reconnectRequired: 1, failed: 0 });
    expect(JSON.stringify(result)).not.toContain('present');
  }
);

test('notification failure keeps the persisted reconnect marker and permits later tenant/channel writes', async () => {
  const f = fixture({ throwAt: 0, notificationFailureOrg: 'tenant-a' });
  const result = await f.service.refreshTokens();
  expect(f.notifications[0].rowsAtNotification[0].refreshNeeded).toBe(true);
  expect(f.rows[0]).toEqual({ ...f.before[0], refreshNeeded: true });
  expect(f.rows[1].token).toBe('new-access-1'); // same external ID in the other tenant
  expect(f.rows[2].token).toBe('new-access-2');
  expect(result).toEqual({ total: 3, refreshed: 2, reconnectRequired: 1, failed: 0, notificationFailures: 1 });
  expect(JSON.stringify(result)).not.toContain(sensitive);
});

test.each([
  ['lookup', { lookupFailure: 1 }, [0, 2]],
  ['marker', { throwAt: 1, markerFailure: 1 }, [0, 1, 2]],
  ['save', { saveFailure: 1 }, [0, 1, 2]],
])('%s error is counted as failed, leaves that row unchanged and permits the last channel', async (_name, options, attempts) => {
  const f = fixture(options);
  const result = await f.service.refreshTokens();
  expect(f.attempts).toEqual(attempts);
  expect(f.rows[1]).toEqual(f.before[1]);
  expect(f.rows[2].token).toBe('new-access-2');
  expect(result).toEqual({ total: 3, refreshed: 2, reconnectRequired: 0, failed: 1, notificationFailures: 0 });
  expect(JSON.stringify(result)).not.toContain(sensitive);
});

test.each([0, 3])('batch of %s successful candidates returns exact totals', async count => {
  const f = fixture({ count });
  expect(await f.service.refreshTokens()).toEqual({
    total: count, refreshed: count, reconnectRequired: 0, failed: 0, notificationFailures: 0,
  });
  expect(f.attempts).toHaveLength(count);
});

test('all failed tokens mark every channel while retaining every original secret', async () => {
  const f = fixture({ reply: () => null });
  expect(await f.service.refreshTokens()).toEqual({
    total: 3, refreshed: 0, reconnectRequired: 3, failed: 0, notificationFailures: 0,
  });
  expect(f.rows).toEqual(f.before.map(row => ({ ...row, refreshNeeded: true })));
});

test('candidate query retains deleted, between-step, reconnect and future-expiry filters', async () => {
  const f = fixture({ count: 4 });
  f.rows[0].refreshNeeded = true;
  f.rows[1].inBetweenSteps = true;
  f.rows[2].deletedAt = new Date('2000-01-01Z');
  f.rows[3].tokenExpiration = new Date(Date.now() + 100 * 86400000);
  const before = structuredClone(f.rows);
  expect(await f.service.refreshTokens()).toMatchObject({ total: 0, refreshed: 0, failed: 0 });
  expect(f.attempts).toEqual([]);
  expect(f.rows).toEqual(before);
  expect(f.queries[0]).toMatchObject({ inBetweenSteps: false, deletedAt: null, refreshNeeded: false });
  expect(f.queries[0].tokenExpiration.lte).toBeInstanceOf(Date);
});

test('candidate query failure is fatal and cannot report an empty successful batch', async () => {
  const f = fixture({ queryError: true });
  await expect(f.service.refreshTokens()).rejects.toThrow(sensitive);
  expect(f.attempts).toEqual([]);
  expect(f.rows).toEqual(f.before);
});

test('Dribbble batch failure flags only its row; subsequent channels still update', async () => {
  const f = fixture({ dribbbleIndex: 0 });
  expect(await f.service.refreshTokens()).toEqual({
    total: 3, refreshed: 2, reconnectRequired: 1, failed: 0, notificationFailures: 0,
  });
  expect(f.rows[0]).toEqual({ ...f.before[0], refreshNeeded: true });
  expect(f.rows[1].token).toBe('new-access-1');
  expect(f.rows[2].token).toBe('new-access-2');
  expect(f.requests).toEqual([]);
});

test('existing single-channel refresh consumes Dribbble reconnect-only result without changing credentials', async () => {
  const f = fixture({ dribbbleIndex: 0 });
  const { RefreshIntegrationService } = loadWithMocks(
    'libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts', {
      '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
      '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': { IntegrationService: class {} },
      'nestjs-temporal-core': { TemporalService: class {} },
    }
  );
  const refresh = new RefreshIntegrationService(f.manager, f.service, {});
  await expect(refresh.refresh(f.rows[0])).resolves.toBe(false);
  expect(f.rows[0]).toEqual({ ...f.before[0], refreshNeeded: true });
  expect(f.rows[1]).toEqual(f.before[1]);
  expect(f.requests).toEqual([]);
});

test('installed Temporal metadata retains only the historical PostActivity flat refreshToken handler and its failure wrapper', async () => {
  const { dependencyMocks } = require('./helpers/publication-v106.module.cjs');
  const temporal = require('nestjs-temporal-core');
  const { TemporalMetadataAccessor } = require('nestjs-temporal-core/dist/services/temporal-metadata.service');
  const mocks = {
    ...dependencyMocks,
    'nestjs-temporal-core': temporal,
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service': { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service': { RefreshIntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service': { WebhooksService: class {} },
    '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': {},
  };
  const { PostActivity } = loadWithMocks('apps/orchestrator/src/activities/post.activity.ts', mocks);
  const { IntegrationsActivity } = loadWithMocks('apps/orchestrator/src/activities/integrations.activity.ts', mocks);
  const instance = Object.create(PostActivity.prototype);
  const between = jest.fn();
  instance._integrationManager = { getSocialIntegration: () => ({}) };
  instance._refreshIntegrationService = {
    refresh: async () => { throw new Error(sensitive); }, setBetweenSteps: between,
  };
  const metadata = new TemporalMetadataAccessor();
  // Discovery uses the SDK's aggregate extractor, not its property getter.
  const extracted = metadata.extractActivityMethods(instance);
  expect(extracted.success).toBe(true);
  const handler = extracted.methods.get('refreshToken');
  expect(handler).toMatchObject({ name: 'refreshToken', originalName: 'refreshToken', className: 'PostActivity' });
  expect(metadata.extractActivityMethods(Object.create(IntegrationsActivity.prototype)).methods.has('refreshToken')).toBe(false);
  const integration = { id: 'synthetic-flat-alias', providerIdentifier: 'synthetic' };
  await expect(handler.handler(integration)).resolves.toBe(false);
  expect(between).toHaveBeenCalledWith(integration);
});

test.each([
  ['success', 0, { total: 3, refreshed: 3, reconnectRequired: 0, failed: 0, notificationFailures: 0 }],
  ['empty', 0, { total: 0, refreshed: 0, reconnectRequired: 0, failed: 0, notificationFailures: 0 }],
  ['partial', 1, { total: 3, refreshed: 2, reconnectRequired: 1, failed: 0, notificationFailures: 0 }],
  ['notification', 1, { total: 3, refreshed: 2, reconnectRequired: 1, failed: 0, notificationFailures: 1 }],
  ['persistence', 1, { total: 3, refreshed: 2, reconnectRequired: 0, failed: 1, notificationFailures: 0 }],
])('actual Nest command %s exposes count-only output and exits %s', (mode, status, expected) => {
  const run = spawnSync(process.execPath, [
    path.join(__dirname, 'helpers/token-refresh-command.runner.cjs'), mode,
  ], { encoding: 'utf8', timeout: 20_000 });
  expect({ error: run.error, stderr: run.stderr }).toEqual({ error: undefined, stderr: '' });
  expect(run.status).toBe(status);
  expect(JSON.parse(run.stdout.trim())).toEqual({ event: 'token_refresh_batch', ...expected });
  expect(run.stdout).not.toMatch(/inert-|new-access|new-refresh|channel-|tenant-/);
});

test('actual Nest command query failure exits nonzero with a fixed error and no fabricated totals or secret', () => {
  const run = spawnSync(process.execPath, [
    path.join(__dirname, 'helpers/token-refresh-command.runner.cjs'), 'fatal',
  ], { encoding: 'utf8', timeout: 20_000 });
  expect(run.error).toBeUndefined();
  expect(run.status).toBe(1);
  expect(run.stdout).toBe('');
  expect(run.stderr).toContain('Token refresh batch could not start');
  expect(run.stderr).not.toContain(sensitive);
});
