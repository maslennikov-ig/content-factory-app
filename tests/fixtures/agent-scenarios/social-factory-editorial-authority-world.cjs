'use strict';

// Real profile and permission services + source-authority checks, over scoped
// in-memory persistence. No account creation, retrieval, model or provider port.
const { loadTypeScriptModule } = require('../../helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/content-intelligence/social-factory';
const repository = {
  SocialFactoryRepository: class {},
  SocialFactoryError: class extends Error { constructor(code, message) { super(message ?? code); this.code = code; } },
  resourceRef: (kind, id) => `resource:${kind}:${id}`, sourceRef: id => `source:${id}`,
};
const { ChannelProfileServiceV1 } = loadTypeScriptModule(`${ROOT}/profiles/channel-profile.v1.ts`, { '../social-factory.repository': repository });
const { SocialFactorySourcePermissionService } = loadTypeScriptModule(`${ROOT}/source-permission.service.ts`, {
  './social-factory.repository': repository,
  '../source-registry/source-registry.repository': { ContentSourceRegistryRepository: class {} },
});
const EXPIRES = '2099-01-01T00:00:00.000Z';
const OBSERVED = '2026-01-01T00:00:00.000Z';
const copy = value => structuredClone(value);
const profile = (extra = {}) => ({ version: 1, channelId: 'c1', platform: 'telegram', audience: 'Редакторы небольших команд', promise: 'Один практический редакционный приём', goals: ['объяснять'], expertise: ['редакционная работа'], pillars: ['проверка текста'], languages: ['ru'], geography: [], exclusions: [], evidence: [], openQuestions: [], ...copy(extra) });
const source = (id, confirmed) => ({ organizationId: 'org-1', id, kind: 'URL', canonicalUrl: `https://example.test/${id}`, displayName: 'Учебный зарегистрированный источник', configVersion: 1,
  currentSnapshotId: `snapshot:${id}`, desiredState: 'ACTIVE', rightsState: confirmed ? 'CONFIRMED' : 'UNKNOWN', usagePurpose: 'EVIDENCE', rightsConfirmedByUserId: confirmed ? 'user-1' : null, rightsConfirmedAt: confirmed ? OBSERVED : null,
  freshUntil: EXPIRES, archivedAt: null, purgedAt: null,
  currentSnapshot: { id: `snapshot:${id}`, organizationId: 'org-1', sourceId: id, normalizedTitle: 'Учебная памятка', retrievalProvider: 'source-fetch-v1', requestedCanonicalUrl: null, finalCanonicalUrl: null, providerMetadata: null, retentionUntil: EXPIRES, purgedAt: null, supersededAt: null,
    evidence: [{ id: `evidence:${id}`, organizationId: 'org-1', sourceSnapshotId: `snapshot:${id}`, excerpt: 'Учебный пример проверенного текста.', observedAt: OBSERVED, freshUntil: EXPIRES, freshnessStatus: 'FRESH', tombstone: null, locator: null, structuredData: null }] } });
const permission = (extra = {}) => ({ sourceId: 'registered-owned', expectedRevision: 0, purposes: ['editorial'], basis: 'owned', expiresAt: EXPIRES, origin: 'web', acquisition: 'url', sourceContext: 'Владелец подтвердил права на собственную учебную памятку', channelIds: ['c1'], ...copy(extra) });
const editorialAuthorityRows = () => ({ socialFactoryEditorialAuthority: { records: [], sources: [source('registered-owned', true), source('public-unknown', false)], invalidations: [] } });
const summary = (turn, tool) => turn.outputs.find(output => output.toolName === tool)?.output.summary?.untrustedData?.value;
function matches(row, where = {}) {
  return row && Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      return matches(row[key], value);
    }
    return value instanceof Date ? new Date(row[key]).getTime() === value.getTime() : row[key] === value;
  });
}
const socialFactoryEditorialAuthorityServices = ({ rows, requests, writes, scoped }) => {
  const data = rows.socialFactoryEditorialAuthority; if (!data) return {};
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  const call = (name, org, ...args) => { scoped(name, org); requests.push([name, org, ...copy(args)]); };
  const channel = (org, id) => {
    if (org !== 'org-1') return null;
    const row = rows.channels.find(row => row.id === id && (!row.organizationId || row.organizationId === org));
    return row ? { ...row, contentLanguage: 'ru', deletedAt: null, writingProfile: null } : null;
  };
  const record = (org, kind, id) => data.records.find(row => row.organizationId === org && row.kind === kind && row.id === id) ?? null;
  let queue = Promise.resolve();
  const client = {
    contentSource: {
      findFirst: async ({ where }) => copy(data.sources.find(row => matches(row, where)) ?? null),
      updateMany: async ({ where, data: patch }) => { const row = data.sources.find(row => matches(row, where)); if (!row) return { count: 0 }; Object.assign(row, copy(patch)); return { count: 1 }; },
    },
    socialFactoryRecord: {
      findFirst: async ({ where }) => copy(data.records.find(row => matches(row, where)) ?? null),
      create: async ({ data: input }) => {
        if (record(input.organizationId, input.kind, input.id)) fail('SOCIAL_FACTORY_CONFLICT');
        const row = { revision: 1, parentId: null, deletedAt: null, invalidatedAt: null, sourceIds: [], createdAt: new Date(), updatedAt: new Date(), ...copy(input) };
        data.records.push(row); return copy(row);
      },
      updateMany: async ({ where, data: patch }) => {
        let count = 0;
        for (const row of data.records.filter(row => matches(row, where))) { for (const [key, value] of Object.entries(patch)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : copy(value); count++; }
        return { count };
      },
    },
  };
  const store = {
    read: async (org, kind, id) => copy(record(org, kind, id)),
    page: async (org, kind, { parentId }) => ({ items: copy(data.records.filter(row => row.organizationId === org && row.kind === kind && row.parentId === parentId)), nextCursor: null }),
    put: async ({ organizationId, kind, id, payload, expectedRevision }) => {
      const current = record(organizationId, kind, id); if ((current?.revision ?? 0) !== expectedRevision) fail('SOCIAL_FACTORY_CONFLICT');
      const next = { organizationId, kind, id, payload: copy(payload), revision: expectedRevision + 1, parentId: null, sourceIds: [], createdAt: new Date(), updatedAt: new Date() };
      if (current) Object.assign(current, next); else data.records.push(next); return copy(next);
    },
    readSourcePermissionState: async (org, id) => { const row = record(org, 'source_permission', id); return row ? { state: 'present', record: copy(row) } : { state: 'absent' }; },
    invalidateBySource: async (org, id) => { data.invalidations.push([org, id]); return 0; },
    renewSourceRetention: async () => {},
    transactSourcePermission: async work => {
      const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous;
      const before = copy(data);
      try { return await work(store, client); } catch (error) { Object.assign(data, before); throw error; } finally { release(); }
    },
  };
  const profiles = new ChannelProfileServiceV1({ store, integrations: { getIntegrationById: async (org, id) => channel(org, id) }, brands: { getActiveRuntimeVersion: async () => null, getOverview: async () => ({ profile: null }) } });
  const permissions = new SocialFactorySourcePermissionService(store, {}, {});
  return {
    ChannelProfileServiceV1: {
      save: async (org, input, revision) => { call('profile.save', org, input, revision); const result = await profiles.save(org, input, revision); writes.push(['profile.saved', org, result.id, result.revision]); return result; },
      resolve: async (org, id) => { call('profile.resolve', org, id); return profiles.resolve(org, id); },
    },
    SocialFactoryService: { assertChannel: async (org, id) => { call('source.assertChannel', org, id); return channel(org, id) ?? fail('CHANNEL_NOT_FOUND'); } },
    SocialFactorySourcePermissionService: {
      save: async (org, actor, input) => { call('permission.save', org, actor, input); const result = await permissions.save(org, actor, input); writes.push(['permission.saved', org, actor, result.id, result.revision]); return result; },
      revoke: async (org, id, revision) => { call('permission.revoke', org, id, revision); const result = await permissions.revoke(org, id, revision); writes.push(['permission.revoked', org, id, revision]); return result; },
    },
  };
};
module.exports = { profile, permission, EXPIRES, editorialAuthorityRows, summary, socialFactoryEditorialAuthorityServices };
