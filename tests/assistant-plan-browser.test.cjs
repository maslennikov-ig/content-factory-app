'use strict';

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { matches } = require('./helpers/voice-memory-prisma.cjs');
const prefix = 'libraries/nestjs-libraries/src/';
const { PieceRepository } = loadWithMocks(`${prefix}content-intelligence/pieces/piece.repository.ts`, {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
  './adaptation-plan': { supersededDraftPostIds: async () => ['superseded-post'] },
});
const { AgentWorkObjectBrowser } = loadWithMocks(`${prefix}chat/conductor/work-context.browser.ts`, {
  '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.repository': { PieceRepository },
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository': { BrandProfileRepository: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.repository': { IntegrationRepository: class {} },
});

// A small relational Prisma stand-in, extending the shared scalar matcher.
const matching = (row, where) => Object.entries(where).every(([key, condition]) => {
  if (key === 'AND') return condition.every((one) => matching(row, one));
  if (key === 'OR') return condition.some((one) => matching(row, one));
  if (condition && typeof condition === 'object' && 'is' in condition) return !!row[key] && matching(row[key], condition.is);
  if (condition && typeof condition === 'object' && 'contains' in condition) return String(row[key] ?? '').toLowerCase().includes(condition.contains.toLowerCase());
  return matches(row, { [key]: condition });
});
const row = (id, plan, state = 'DRAFT', org = 'org-1') => ({
  id, organizationId: org, title: 'Variant', plan,
  piece: { id: `piece-${id}`, organizationId: org, title: `Материал ${id}` },
  post: { id: `post-${id}`, organizationId: org, integrationId: 'channel-1', state, deletedAt: null, publishDate: new Date('2026-10-20T10:00:00Z'), integration: { organizationId: org, deletedAt: null } },
});
const setup = () => {
  const rows = [
    ...Array.from({ length: 65 }, (_, n) => row(`a${String(n).padStart(3, '0')}`, null)),
    ...Array.from({ length: 27 }, (_, n) => row(`p${String(n).padStart(3, '0')}`, 'reserve')),
    row('p999', null, 'QUEUE'), row('foreign', 'reserve', 'DRAFT', 'org-2'),
  ];
  const findMany = jest.fn(async ({ where, take, select }) => rows.filter((one) => matching(one, where)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, take));
  const repository = new PieceRepository({ model: { contentDerivation: { findMany } } }, {}, {});
  const gate = { check: jest.fn(async () => ({ allowed: true })) };
  const browser = new AgentWorkObjectBrowser({ services: (token) => {
    if (token === PieceRepository) return repository;
    throw new Error('unexpected service');
  }, gate, capabilities: [{ id: 'plan.ready', door: { method: 'readyAdaptations' } }] });
  const identity = { organizationId: 'org-1', userId: 'u1' };
  return { rows, findMany, repository, browser, gate, identity };
};

test('planned rows beyond 50 free drafts remain searchable and have bounded server pages', async () => {
  const h = setup();
  const first = await h.browser.browse(h.identity, { kind: 'plan', limit: '24' });
  expect(first.items.map((one) => one.id)).toEqual(Array.from({ length: 24 }, (_, n) => `p${String(n).padStart(3, '0')}`));
  expect(first).toMatchObject({ hasMore: true, cursor: 'p023' });
  const second = await h.browser.browse(h.identity, { kind: 'plan', limit: '24', cursor: first.cursor });
  expect(second.items.map((one) => one.id)).toEqual(['p024', 'p025', 'p026', 'p999']);
  expect(second).toMatchObject({ hasMore: false, cursor: null });
  const found = await h.browser.browse(h.identity, { kind: 'plan', q: 'МАТЕРИАЛ p026', limit: '24' });
  expect(found.items.map((one) => one.id)).toEqual(['p026']);
  expect(found.items[0]).toMatchObject({ adaptationId: 'p026', pieceId: 'piece-p026', channelId: 'channel-1', postId: 'post-p026', slot: { status: 'reserved' } });
  expect(second.items.at(-1).slot.status).toBe('queued');
  const query = h.findMany.mock.calls[0][0];
  expect(query.where.organizationId).toBe('org-1');
  expect(query.take).toBeLessThanOrEqual(50);
  expect(query.select).not.toHaveProperty('body');
  expect(query.select.post.select).not.toHaveProperty('content');
  expect(JSON.stringify(first)).not.toContain('org-2');
});

test('superseded planned drafts do not consume a visible page; denied and invalid reads access no storage', async () => {
  const h = setup();
  h.rows[65].post.id = 'superseded-post';
  const result = await h.browser.browse(h.identity, { kind: 'plan', limit: '2' });
  expect(result.items.map((one) => one.id)).toEqual(['p001', 'p002']);
  expect(result.hasMore).toBe(true);
  h.findMany.mockClear();
  h.gate.check.mockResolvedValueOnce({ allowed: false });
  await expect(h.browser.browse(h.identity, { kind: 'plan' })).rejects.toMatchObject({ status: 403 });
  await expect(h.browser.browse(h.identity, { kind: 'plan', cursor: '../foreign' })).rejects.toMatchObject({ status: 400 });
  expect(h.findMany).not.toHaveBeenCalled();
});
