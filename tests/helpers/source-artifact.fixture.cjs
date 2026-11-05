const { randomUUID } = require('node:crypto');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/';
const authenticated = loadTypeScriptModule(base + 'user/authenticated.session.ts');
const repository = loadTypeScriptModule(base + 'content-intelligence/social-factory/source-artifact.repository.ts', { '../../user/authenticated.session': authenticated });
const { SourceArtifactServiceV1 } = loadTypeScriptModule(base + 'content-intelligence/social-factory/source-artifact.service.ts', { './source-artifact.repository': repository });
const copy = value => structuredClone(value);
const isDate = value => Object.prototype.toString.call(value) === '[object Date]';
const equal = (a, b) => isDate(a) || isDate(b) ? new Date(a).getTime() === new Date(b).getTime() : JSON.stringify(a) === JSON.stringify(b);
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key.includes('_') && !(key in row) && value && typeof value === 'object') return matches(row, value);
    if (value && typeof value === 'object' && !isDate(value)) {
      if ('equals' in value) return value.equals?.constructor?.name === 'AnyNull' ? row[key] === null : equal(row[key], value.equals);
      if ('in' in value) return value.in.includes(row[key]);
      if ('gt' in value) return row[key] !== null && row[key] > value.gt;
      if ('gte' in value) return row[key] !== null && row[key] >= value.gte;
      if ('lt' in value) return row[key] !== null && row[key] < value.lt;
      return matches(row[key] || {}, value);
    }
    return equal(row[key], value);
  });
}
function fixture() {
  const ids = { org: randomUUID(), actor: randomUUID(), otherActor: randomUUID(), piece: randomUUID(), adaptation: randomUUID(), post: randomUUID(), integration: randomUUID() };
  const names = ['user', 'userOrganization', 'contentPiece', 'contentDerivation', 'post', 'integration', 'socialFactoryRecord', 'videoPromptDraft', 'videoGenerationJob', 'videoAccessPreflight', 'videoRouteIntent', 'videoSubscriptionJob', 'media'];
  const tables = Object.fromEntries(names.map(name => [name, new Map()])), reads = [], writes = [];
  const stamp = new Date('2026-01-01T00:00:00Z');
  const db = { transactions: 0, $transaction: async run => { db.transactions++; const saved = copy(tables); try { return await run(db); } catch (error) { for (const name of names) tables[name] = saved[name]; throw error; } } };
  for (const name of names) {
    const rows = where => [...tables[name].values()].map(row => name === 'userOrganization' ? { ...row, user: tables.user.get(row.userId) } : row).filter(row => matches(row, where));
    const project = (row, query) => {
      if (!row) return null;
      const value = copy(row);
      if (name === 'post' && query.include?.integration) {
        const integration = tables.integration.get(row.integrationId);
        value.integration = Object.fromEntries(Object.keys(query.include.integration.select).map(key => [key, copy(integration?.[key])]));
      }
      return value;
    };
    db[name] = {
      findFirst: async (query = {}) => { reads.push([name, copy(query.where)]); return project(rows(query.where)[0], query); },
      findFirstOrThrow: async (query = {}) => { const row = await db[name].findFirst(query); if (!row) throw new Error('Fixture row missing'); return row; },
      findUnique: async query => db[name].findFirst(query),
      findMany: async (query = {}) => { reads.push([name, copy(query.where)]); return rows(query.where).map(row => project(row, query)); },
      create: async ({ data }) => {
        writes.push([name, 'create', copy(data)]);
        const row = { id: randomUUID(), version: 1, state: 'accepted', revision: 1, deletedAt: null, invalidatedAt: null, expiresAt: null, createdAt: new Date(), updatedAt: new Date(), receipt: null, submittedAt: null,
          resultMediaId: null, leaseOwner: null, leaseUntil: null, submitAttempts: 0, pollAttempts: 0, saveAttempts: 0, runCycle: 0, actualCost: null, costUsd: null, ...copy(data) };
        tables[name].set(row.id, row); return copy(row);
      },
      updateMany: async ({ where, data }) => {
        writes.push([name, 'updateMany', copy(where), copy(data)]); const found = rows(where);
        for (const row of found) for (const [key, value] of Object.entries(data)) tables[name].get(row.id)[key] = value && typeof value === 'object' && 'increment' in value ? (row[key] || 0) + value.increment : copy(value);
        return { count: found.length };
      },
      upsert: async query => { const old = await db[name].findFirst({ where: query.where }); if (old) return old; return db[name].create({ data: query.create }); },
    };
  }
  for (const id of [ids.actor, ids.otherActor]) {
    tables.user.set(id, { id, activated: true });
    const memberId = randomUUID(); tables.userOrganization.set(memberId, { id: memberId, organizationId: ids.org, userId: id, role: 'EDITOR', disabled: false, updatedAt: stamp });
  }
  tables.contentPiece.set(ids.piece, { id: ids.piece, organizationId: ids.org, title: 'Original source', body: 'The old core says 10 kg.', brief: null, kind: 'CORE', language: 'en', archivedAt: null, updatedAt: stamp });
  tables.contentDerivation.set(ids.adaptation, { id: ids.adaptation, organizationId: ids.org, contentPieceId: ids.piece, postId: ids.post, integrationId: ids.integration,
    title: 'Saved adaptation', body: 'The stale adaptation says 10 kg.', platform: 'telegram', format: 'post', kind: 'post', updatedAt: stamp });
  tables.integration.set(ids.integration, { id: ids.integration, organizationId: ids.org, contentLanguage: 'ru', updatedAt: stamp });
  tables.post.set(ids.post, { id: ids.post, organizationId: ids.org, integrationId: ids.integration, title: 'Current edited post',
    content: '<p>Масса 12,5 кг. Не содержит сахар.</p>\n', parentPostId: null, deletedAt: null, updatedAt: stamp });
  const repo = new repository.SourceArtifactRepositoryV1(db), service = new SourceArtifactServiceV1(repo);
  return { ids, tables, db, reads, writes, repo, service, repository, get piece() { return tables.contentPiece.get(ids.piece); }, get post() { return tables.post.get(ids.post); },
    get adaptation() { return tables.contentDerivation.get(ids.adaptation); }, get integration() { return tables.integration.get(ids.integration); },
    selection: { version: 1, kind: 'adaptation', pieceId: ids.piece, adaptationId: ids.adaptation },
    editPost(text) { const post = tables.post.get(ids.post); post.content = text; post.updatedAt = new Date(post.updatedAt.getTime() + 1); },
  };
}
module.exports = { fixture, loadTypeScriptModule, base, copy, authenticated };
