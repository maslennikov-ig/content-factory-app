'use strict';

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { IntegrationRepository } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
  '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
});

// Matches Prisma predicates against persisted adapter rows. PostgreSQL evidence
// exercises the same real repository separately at the final acceptance boundary.
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object'
    ? ('not' in value ? row[key] !== value.not : value.in.includes(row[key]))
    : row[key] === value);
}
function fixture() {
  const rows = [
    ['a', 'linkedin', 'root'], ['a', 'linkedin-page', 'page'],
    ['a', 'unrelated', 'other'], ['b', 'linkedin', 'root'], ['b', 'linkedin-page', 'page'],
  ].map(([organizationId, providerIdentifier, internalId]) => ({
    id: `${organizationId}-${internalId}`, organizationId, providerIdentifier, internalId,
    rootInternalId: 'root', token: `old-${organizationId}-${internalId}`, refreshToken: `refresh-${organizationId}-${internalId}`,
    tokenExpiration: new Date('2026-01-01Z'), refreshNeeded: true,
  }));
  const predicates = [];
  const model = {
    upsert: async ({ where, create, update }) => {
      let row = rows.find(row => matches(row, where.organizationId_internalId));
      if (!row) { row = { id: 'new-row', ...create }; rows.push(row); }
      else Object.assign(row, update);
      return { ...row };
    },
    findFirst: async ({ where }) => rows.find(row => matches(row, where)),
    updateMany: async ({ where, data }) => {
      predicates.push(where);
      const affected = rows.filter(row => matches(row, where));
      for (const row of affected) Object.assign(row, data);
      return { count: affected.length };
    },
  };
  const repository = new IntegrationRepository({ model: { integration: model } });
  const refresh = (org, provider = 'linkedin', internalId = 'root', isRefresh = true) => repository.createOrUpdateIntegration(
    undefined, true, org, 'Synthetic', undefined, 'social', internalId, provider, `new-${org}`, `new-refresh-${org}`, 3600,
    undefined, false, isRefresh ? `${org}-${internalId}` : undefined
  );
  return { rows, predicates, refresh };
}

test.each([true, false])('tenant A refresh=%s preserves tenant B and unrelated provider, and shares with its own LinkedIn page', async isRefresh => {
  const f = fixture();
  const untouched = structuredClone(f.rows.filter(row => row.organizationId === 'b' || row.providerIdentifier === 'unrelated'));
  await f.refresh('a', 'linkedin', 'root', isRefresh);
  expect(f.rows.filter(row => row.organizationId === 'b' || row.providerIdentifier === 'unrelated')).toEqual(untouched);
  const page = f.rows.find(row => row.id === 'a-page');
  expect(page).toMatchObject({ token: 'new-a', refreshToken: 'new-refresh-a', refreshNeeded: false });
  expect(page.tokenExpiration.getTime()).toBeGreaterThan(new Date('2026-01-01Z').getTime());
  expect(f.predicates[0]).toMatchObject({ organizationId: 'a', providerIdentifier: { in: ['linkedin', 'linkedin-page'] }, rootInternalId: 'root' });
});

test('concurrent different-tenant refreshes retain independent credentials on accounts and pages', async () => {
  const f = fixture();
  await Promise.all([f.refresh('a'), f.refresh('b')]);
  for (const row of f.rows.filter(row => row.providerIdentifier !== 'unrelated')) {
    expect(row.token).toBe(`new-${row.organizationId}`);
    expect(row.refreshToken).toBe(`new-refresh-${row.organizationId}`);
    expect(row.refreshNeeded).toBe(false);
  }
});

test('page refresh updates the allowed account/page family, while unknown providers share only their own identifier', async () => {
  const f = fixture();
  await f.refresh('a', 'linkedin-page', 'page');
  expect(f.rows.find(row => row.id === 'a-root').token).toBe('new-a');
  const linkedinBefore = structuredClone(f.rows.filter(row => row.providerIdentifier.startsWith('linkedin')));
  await f.refresh('a', 'unrelated', 'other');
  expect(f.rows.filter(row => row.providerIdentifier.startsWith('linkedin'))).toEqual(linkedinBefore);
  expect(f.predicates.at(-1).providerIdentifier).toEqual({ in: ['unrelated'] });
});
