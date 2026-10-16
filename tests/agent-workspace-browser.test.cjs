'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');
const BASE = 'libraries/nestjs-libraries/src/';
const prisma = { '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {}, PrismaTransaction: class {} } };
const { BrandProfileRepository } = loadTypeScriptModule(`${BASE}content-intelligence/brand-profile/brand-profile.repository.ts`, prisma);
const { IntegrationRepository } = loadTypeScriptModule(`${BASE}database/prisma/integrations/integration.repository.ts`, {
  ...prisma,
  '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
  '@contentfactory/nestjs-libraries/dtos/integrations/integration.time.dto': { IntegrationTimeDto: class {} },
  '@contentfactory/nestjs-libraries/dtos/plugs/plug.dto': { PlugDto: class {} },
  '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'generated-id' },
});
const identity = { organizationId: 'org-1', userId: 'user-1', role: 'USER', organizationCreatedAt: '2026-01-01T00:00:00Z', language: 'ru', timeZone: 'UTC' };
const setup = () => {
  const avatarRows = [
    { id: 'avatar-1', name: 'First', activeVersionId: 'version-1', activeVersion: { id: 'version-1' } },
    { id: 'avatar-2', name: 'Second', activeVersionId: null, activeVersion: null },
    { id: 'avatar-3', name: 'Third', activeVersionId: null, activeVersion: null },
  ];
  const channelRows = [{ id: 'channel-1', name: 'First', disabled: false, refreshNeeded: true, inBetweenSteps: false }];
  const avatarFind = jest.fn(async () => avatarRows);
  const channelFind = jest.fn(async () => channelRows);
  const profiles = new BrandProfileRepository({ model: { projectBrandProfile: { findMany: avatarFind } } }, {});
  const integrations = new IntegrationRepository({ model: { integration: { findMany: channelFind } } }, {}, {}, {}, {}, {});
  const gate = { check: jest.fn(async () => ({ allowed: true, policies: [] })) };
  const { AgentWorkObjectBrowser } = loadTypeScriptModule(`${BASE}chat/conductor/work-context.browser.ts`, {
    '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository': { BrandProfileRepository },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.repository': { IntegrationRepository },
  });
  const browser = new AgentWorkObjectBrowser({ services: (token) => token === BrandProfileRepository ? profiles : integrations, gate, capabilities: loadCapabilityModule('capability.registry.ts').CAPABILITY_CATALOGUE });
  return { browser, avatarFind, channelFind, gate };
};

test('avatar browsing pushes tenant/search/cursor/limit and metadata select into Prisma', async () => {
  const env = setup();
  const result = await env.browser.browse(identity, { kind: 'avatar', q: '  Saved name  ', cursor: 'avatar-0', limit: '2' });
  expect(env.avatarFind).toHaveBeenCalledWith({
    where: { organizationId: 'org-1', deletedAt: null, id: { gt: 'avatar-0' }, name: { contains: 'Saved name', mode: 'insensitive' } },
    take: 3,
    orderBy: { id: 'asc' },
    select: { id: true, name: true, activeVersionId: true, activeVersion: { select: { id: true } } },
  });
  expect(result).toEqual({ items: [{ id: 'avatar-1', name: 'First', analysed: true }, { id: 'avatar-2', name: 'Second', analysed: false }], hasMore: true, cursor: 'avatar-2' });
  expect(JSON.stringify(result)).not.toContain('version-1');
});

test('channel browsing never loads credentials, writing/profile JSON, posts or corpus', async () => {
  const env = setup();
  expect(await env.browser.browse(identity, { kind: 'channel', limit: '24' })).toEqual({ items: [{ id: 'channel-1', name: 'First', disabled: false, refreshNeeded: true, inBetweenSteps: false }], hasMore: false, cursor: null });
  expect(env.channelFind).toHaveBeenCalledWith({ where: { organizationId: 'org-1', deletedAt: null }, take: 25, orderBy: { id: 'asc' }, select: { id: true, name: true, disabled: true, refreshNeeded: true, inBetweenSteps: true } });
  expect(env.avatarFind).not.toHaveBeenCalled();
});

test('persisted refs lookup uses an explicit bounded id list inside the same tenant filter', async () => {
  const env = setup();
  env.channelFind.mockResolvedValueOnce([{ id: 'channel-1', name: 'First', disabled: false, refreshNeeded: false, inBetweenSteps: false }]);
  const result = await env.browser.browse(identity, { kind: 'channel', ids: 'channel-1,foreign-id', limit: '1' });
  expect(env.channelFind).toHaveBeenCalledWith({ where: { organizationId: 'org-1', deletedAt: null, id: { in: ['channel-1', 'foreign-id'] } }, take: 3, orderBy: { id: 'asc' }, select: { id: true, name: true, disabled: true, refreshNeeded: true, inBetweenSteps: true } });
  expect(result.items.map((row) => row.id)).toEqual(['channel-1']);
  expect(result).toMatchObject({ hasMore: false, cursor: null });
});

test.each([
  { kind: 'secrets' }, { kind: 'avatar', limit: '51' }, { kind: 'channel', limit: '0' },
  { kind: 'channel', limit: '1.5' }, { kind: 'avatar', cursor: '../other' },
  { kind: 'avatar', q: 'a'.repeat(201) }, { kind: 'avatar', organizationId: 'org-2' },
  { kind: 'avatar', ids: Array.from({ length: 25 }, (_, index) => `avatar-${index}`).join(',') },
  { kind: 'channel', ids: 'channel-1,../other' },
  { kind: 'channel', ids: 'channel-1', cursor: 'channel-0' },
])('refuses invalid browser query without reading storage %#', async (query) => {
  const env = setup();
  await expect(env.browser.browse(identity, query)).rejects.toMatchObject({ status: 400 });
  expect(env.avatarFind).not.toHaveBeenCalled();
  expect(env.channelFind).not.toHaveBeenCalled();
});

test('read policy refuses before storage; transient storage failure stays a failure', async () => {
  const env = setup();
  env.gate.check.mockResolvedValueOnce({ allowed: false, policies: [] });
  await expect(env.browser.browse(identity, { kind: 'channel' })).rejects.toMatchObject({ status: 403 });
  expect(env.channelFind).not.toHaveBeenCalled();
  env.channelFind.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(env.browser.browse(identity, { kind: 'channel' })).rejects.toThrow('database unavailable');
});
