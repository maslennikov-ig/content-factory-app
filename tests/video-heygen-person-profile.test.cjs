const {randomUUID} = require('node:crypto');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/videos/subscriptions/';
const contract = load(`${ROOT}video-heygen-person-profile.v1.ts`);
const catalog = load(`${ROOT}video-heygen-owned-catalog.v1.ts`);
const {SocialFactoryRepository} = load('libraries/nestjs-libraries/src/content-intelligence/social-factory/social-factory.repository.ts');
const {HeygenPersonProfileServiceV1} = load(`${ROOT}video-heygen-person-profile.service.v1.ts`, {
  '../../content-intelligence/social-factory/social-factory.repository': {SocialFactoryRepository},
  './video-connection.service': {VideoConnectionService: class {}},
});
const code = value => ({response: {code: value}});
const ORG = 'workspace-a', ACTOR = 'person-a', ACCOUNT = 'a'.repeat(64), CONNECTION = 'c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0';
const privateCatalog = () => catalog.decodeHeygenOwnedCatalogV1({groups: [
  {id: 'group-a', name: 'Ilya', status: 'completed', type: 'digital_twin', consent_status: 'accepted'},
  {id: 'group-b', name: 'Ilya', status: 'completed', type: 'digital_twin', consent_status: 'accepted'},
], looks: [
  {id: 'look-a', group_id: 'group-a', name: 'Studio', status: 'completed', avatar_type: 'digital_twin', supported_api_engines: ['avatar_iv', 'avatar_v']},
  {id: 'look-a2', group_id: 'group-a', name: 'Desk', status: 'completed', avatar_type: 'digital_twin', supported_api_engines: ['avatar_v']},
  {id: 'look-b', group_id: 'group-b', name: 'Studio', status: 'completed', avatar_type: 'digital_twin', supported_api_engines: ['avatar_iv']},
], voices: [{voice_id: 'voice-a', name: 'Approved Ilya voice', language: 'Russian', type: 'private'}]}, {includeIdentityMetadata: true}).catalog;
const input = (extra = {}) => ({profileId: randomUUID(), expectedRevision: 0, connectionId: CONNECTION, displayName: 'Илья Примеров',
  aliases: ['Илья', 'Ilya Primerov'], preferredForName: false, groupIds: ['group-a'], preferredGroupId: 'group-a',
  sourceLooks: [{groupId: 'group-a', lookId: 'look-a', roles: ['style_base', 'appearance']},
    {groupId: 'group-a', lookId: 'look-a2', roles: ['style_base', 'appearance', 'animation_reference']}],
  preferredSourceLookId: 'look-a', defaultAppearanceLookId: 'look-a2', defaultAnimationReferenceLookId: 'look-a2',
  defaultVoice: {voiceId: 'voice-a', engine: 'starfish', baseline: {locale: 'ru-RU', speed: 1}}, ...extra});
const decision = (value, extra = {}, org = ORG, actor = ACTOR) => ({decisionId: randomUUID(), source: 'confirmed_chat_action',
  approvedDigest: contract.heygenPersonProfileApprovalDigestV1(org, actor, value, ACCOUNT), accountDigest: ACCOUNT, accountGeneration: 3,
  observedAt: '2030-01-01T00:00:00.000Z', catalog: privateCatalog(), ...extra});

/** Real SocialFactoryRepository, with Prisma semantics sufficient for actor/CAS/transaction tests. */
function fixture() {
  let rows = [], failDecision = false, serial = Promise.resolve();
  const match = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(clause => match(row, clause));
    if (key === 'AND') return value.every(clause => match(row, clause));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('path' in value) return value.path.reduce((item, key) => item?.[key], row[key]) === value.equals;
      if ('gt' in value) return row[key] != null && row[key] > value.gt;
      if ('has' in value) return row[key]?.includes(value.has);
    }
    return row[key] === value;
  });
  const model = {
    findFirst: async ({where}) => structuredClone(rows.find(row => match(row, where)) ?? null),
    findMany: async ({where, take}) => structuredClone(rows.filter(row => match(row, where)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, take)),
    create: async ({data}) => {
      if (failDecision && data.kind === 'decision') throw new Error('synthetic decision persistence failure');
      if (rows.some(row => row.organizationId === data.organizationId && row.kind === data.kind && row.id === data.id)) throw {code: 'P2002'};
      const row = {revision: 1, parentId: null, deletedAt: null, invalidatedAt: null, expiresAt: null, sourceIds: [],
        createdAt: new Date('2030-01-01'), updatedAt: new Date('2030-01-01'), ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))};
      rows.push(structuredClone(row)); return structuredClone(row);
    },
    updateMany: async ({where, data}) => {
      const selected = rows.filter(row => match(row, where));
      for (const row of selected) for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : structuredClone(value);
      return {count: selected.length};
    },
  };
  const db = {socialFactoryRecord: model};
  db.$transaction = work => {
    const run = serial.then(async () => {const before = structuredClone(rows); try {return await work(db);} catch (error) {rows = before; throw error;}});
    serial = run.catch(() => {}); return run;
  };
  const store = new SocialFactoryRepository({model: db}, {model: db});
  const account = {id: CONNECTION, ownerId: ACTOR, provider: 'heygen', walletDigest: ACCOUNT, generation: 3, tokenVersion: 1, state: 'connected'};
  const repository = {db: {media: {findFirst: jest.fn(async () => ({id: 'local-owned-media'}))}, projectBrandProfile: {findFirst: jest.fn(async () => null)}},
    member: jest.fn(async (org, actor) => {if (org !== ORG || ![ACTOR, 'person-b'].includes(actor)) throw new Error('not a workspace member');}),
    connection: jest.fn(async (org, actor, id) => {if (org !== ORG || actor !== ACTOR || id !== CONNECTION) throw new Error('not actor-owned connection'); return structuredClone(account);})};
  const connections = {repository, token: jest.fn(), provider: {submit: jest.fn()}};
  const service = new HeygenPersonProfileServiceV1(store, connections);
  return {service, store, db, account, connections, repository, get rows() {return rows;}, failDecision: () => {failDecision = true;}};
}

test('one human-approved person preserves multiple looks and exact separate role IDs without generation', async () => {
  const f = fixture(), value = input(), approved = decision(value);
  const saved = await f.service.saveHumanConfirmed(ORG, ACTOR, value, approved);
  expect(saved).toMatchObject({profileId: value.profileId, revision: 1, setupReusable: true, generationAuthorized: false, renderQualified: false,
    preferredSourceLookId: 'look-a', defaultAppearanceLookId: 'look-a2', sourceLooks: value.sourceLooks});
  expect(saved.observations.voice).toMatchObject({voiceId: 'voice-a', state: 'available'});
  const resolved = await f.service.resolve(ORG, ACTOR, {connectionId: CONNECTION, name: '  ИЛЬЯ   ПРИМЕРОВ '});
  expect(resolved.profileId).toBe(saved.profileId);
  const frozen = await f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, name: 'Илья', expectedRevision: 1, expectedDigest: saved.digest});
  expect(frozen).toMatchObject({profileId: saved.profileId, profileRevision: 1, profileDigest: saved.digest, groupId: 'group-a',
    baseLookId: 'look-a', appearanceLookId: 'look-a2', animationReferenceLookId: 'look-a2', voiceId: 'voice-a', generationAuthorized: false});
  expect(await f.service.read(ORG, ACTOR, value.profileId)).toEqual(saved);
  const durable = f.rows.find(row => row.kind === 'decision');
  expect(durable.payload.approvedDigest).toBe(saved.digest);
  await expect(f.store.put({...durable, expectedRevision: durable.revision, payload: {forged: true}})).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_IMMUTABLE');
  expect(f.connections.token).not.toHaveBeenCalled(); expect(f.connections.provider.submit).not.toHaveBeenCalled();
});

test('strict human input and trusted exact digest reject arbitrary approval flags, edits, foreign asset/group substitution and unbound previews', async () => {
  const f = fixture(), value = input();
  await expect(f.service.saveHumanConfirmed(ORG, ACTOR, {...value, humanApproved: true}, decision(value))).rejects.toMatchObject(code('VIDEO_INVALID_INPUT'));
  await expect(f.service.saveHumanConfirmed(ORG, ACTOR, value)).rejects.toMatchObject(code('VIDEO_PROFILE_HUMAN_DECISION_REQUIRED'));
  await expect(f.service.saveHumanConfirmed(ORG, ACTOR, {...value, displayName: 'Changed after approval'}, decision(value))).rejects.toMatchObject(code('VIDEO_PROFILE_HUMAN_DECISION_REQUIRED'));
  const cases = [
    input({sourceLooks: [{groupId: 'group-a', lookId: 'look-b', roles: ['style_base', 'appearance']}], preferredSourceLookId: 'look-b', defaultAppearanceLookId: 'look-b', defaultAnimationReferenceLookId: undefined}),
    input({defaultVoice: {voiceId: 'unowned-voice'}}),
    input({sourceLooks: [{groupId: 'group-a', lookId: 'look-a', roles: ['style_base', 'appearance'], previewMediaId: randomUUID()}], defaultAppearanceLookId: 'look-a', defaultAnimationReferenceLookId: undefined}),
  ];
  for (const invalid of cases) await expect(f.service.saveHumanConfirmed(ORG, ACTOR, invalid, decision(invalid))).rejects.toThrow();
  expect(f.rows).toEqual([]);
});

test('another workspace/actor cannot read, list, update or freeze private profile data', async () => {
  const f = fixture(), value = input(); await f.service.saveHumanConfirmed(ORG, ACTOR, value, decision(value));
  await expect(f.service.read(ORG, 'person-b', value.profileId)).rejects.toMatchObject(code('VIDEO_PROFILE_UNAVAILABLE'));
  expect(await f.service.list(ORG, 'person-b')).toEqual({items: [], nextCursor: null});
  await expect(f.service.read('workspace-b', ACTOR, value.profileId)).rejects.toThrow();
  await expect(f.service.freeze(ORG, 'person-b', {connectionId: CONNECTION, profileId: value.profileId})).rejects.toThrow();
  const foreign = {...value, expectedRevision: 1};
  await expect(f.service.saveHumanConfirmed(ORG, 'person-b', foreign, decision(foreign, {}, ORG, 'person-b'))).rejects.toThrow();
  expect((await f.service.read(ORG, ACTOR, value.profileId)).revision).toBe(1);
});

test('equal names never merge groups or select a first row; one deliberate preference resolves ambiguity', async () => {
  const f = fixture(), a = input(), b = input({groupIds: ['group-b'], preferredGroupId: 'group-b',
    sourceLooks: [{groupId: 'group-b', lookId: 'look-b', roles: ['style_base', 'appearance']}], preferredSourceLookId: 'look-b',
    defaultAppearanceLookId: 'look-b', defaultAnimationReferenceLookId: undefined});
  await f.service.saveHumanConfirmed(ORG, ACTOR, a, decision(a)); await f.service.saveHumanConfirmed(ORG, ACTOR, b, decision(b));
  await expect(f.service.resolve(ORG, ACTOR, {connectionId: CONNECTION, name: 'Илья'})).rejects.toMatchObject(code('VIDEO_PROFILE_SELECTION_REQUIRED'));
  expect((await f.service.resolve(ORG, ACTOR, {connectionId: CONNECTION, name: 'Илья', groupId: 'group-b'})).profileId).toBe(b.profileId);
  const preferred = {...b, expectedRevision: 1, preferredForName: true};
  await f.service.saveHumanConfirmed(ORG, ACTOR, preferred, decision(preferred));
  expect((await f.service.resolve(ORG, ACTOR, {connectionId: CONNECTION, name: 'Илья'})).profileId).toBe(b.profileId);
  expect((await f.service.list(ORG, ACTOR, {limit: 1})).nextCursor).toBeTruthy();
  expect(catalog.heygenOwnedCatalogIdentityGroupsV1(privateCatalog())).toEqual([
    {groupId: 'group-a', name: 'Ilya', lookIds: ['look-a', 'look-a2']}, {groupId: 'group-b', name: 'Ilya', lookIds: ['look-b']},
  ]);
});

test('only an exact human-approved multi-group binding permits another group source, preserving role-specific defaults', async () => {
  const f = fixture(), value = input();
  await f.service.saveHumanConfirmed(ORG, ACTOR, value, decision(value));
  await expect(f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId, lookId: 'look-b'})).rejects.toMatchObject(code('VIDEO_PROFILE_UNAVAILABLE'));
  const bound = {...value, expectedRevision: 1, groupIds: ['group-a', 'group-b'], sourceLooks: [
    ...value.sourceLooks, {groupId: 'group-b', lookId: 'look-b', roles: ['style_base', 'appearance']},
  ]};
  await f.service.saveHumanConfirmed(ORG, ACTOR, bound, decision(bound));
  const frozen = await f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId, lookId: 'look-b'});
  expect(frozen).toMatchObject({groupId: 'group-b', baseLookId: 'look-b', appearanceLookId: 'look-b'});
  expect(frozen.animationReferenceLookId).toBeUndefined();
  expect((await f.service.read(ORG, ACTOR, value.profileId)).preferredSourceLookId).toBe('look-a');
});

test('same-account renewal preserves setup, a changed account blocks reuse and retains the saved profile', async () => {
  const f = fixture(), value = input(); const saved = await f.service.saveHumanConfirmed(ORG, ACTOR, value, decision(value));
  f.account.generation++; f.account.tokenVersion++;
  expect((await f.service.resolve(ORG, ACTOR, {connectionId: CONNECTION, name: 'Илья'})).digest).toBe(saved.digest);
  f.account.walletDigest = 'b'.repeat(64);
  const blocked = await f.service.read(ORG, ACTOR, value.profileId);
  expect(blocked).toMatchObject({revision: 1, setupReusable: false, blockers: ['VIDEO_PROFILE_ACCOUNT_CHANGED']});
  await expect(f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId})).rejects.toMatchObject(code('VIDEO_PROFILE_ACCOUNT_CHANGED'));
  expect(f.rows.filter(row => row.kind === 'heygen_person_profile')).toHaveLength(1);
});

test('provisional connection uses the separate authenticated native subject and rechecks its generation', async () => {
  const f = fixture(), value = input(); f.account.walletDigest = 'unverified:local-connection'; f.account.state = 'discovery_required';
  const trusted = {accountDigest: ACCOUNT, accountGeneration: 3};
  const saved = await f.service.saveHumanConfirmed(ORG, ACTOR, value, decision(value));
  expect(saved.setupReusable).toBe(true);
  expect((await f.service.read(ORG, ACTOR, value.profileId)).blockers).toEqual(['VIDEO_PROFILE_ACCOUNT_VERIFICATION_REQUIRED']);
  await expect(f.service.resolve(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId})).rejects.toMatchObject(code('VIDEO_PROFILE_ACCOUNT_UNVERIFIED'));
  expect((await f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId}, trusted)).profileDigest).toBe(saved.digest);
  f.account.generation++;
  await expect(f.service.resolve(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId}, trusted)).rejects.toMatchObject(code('VIDEO_PROFILE_ACCOUNT_UNVERIFIED'));
  expect((await f.service.resolve(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId}, {...trusted, accountGeneration: 4})).digest).toBe(saved.digest);
  await expect(f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId}, {accountDigest: 'b'.repeat(64), accountGeneration: 4})).rejects.toMatchObject(code('VIDEO_PROFILE_ACCOUNT_CHANGED'));
  expect(f.rows.filter(row => row.kind === 'heygen_person_profile')).toHaveLength(1);
});

test('submission fence rejects stale, foreign or mismatched role/account bindings and preserves profile revision', async () => {
  const f = fixture(), value = input(); const saved = await f.service.saveHumanConfirmed(ORG, ACTOR, value, decision(value));
  const frozen = await f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId});
  const fence = {profileId: value.profileId, profileRevision: 1, profileDigest: saved.digest, connectionId: CONNECTION, subjectDigest: ACCOUNT};
  await f.service.assertFrozenInTransaction(f.db, ORG, ACTOR, fence, frozen);
  expect((await f.service.read(ORG, ACTOR, value.profileId)).revision).toBe(1);
  for (const changed of [{profileRevision: 2}, {profileDigest: 'b'.repeat(64)}, {subjectDigest: 'b'.repeat(64)}])
    await expect(f.service.assertFrozenInTransaction(f.db, ORG, ACTOR, {...fence, ...changed}, frozen)).rejects.toMatchObject(code('VIDEO_PROFILE_CHANGED'));
  await expect(f.service.assertFrozenInTransaction(f.db, ORG, 'person-b', fence, frozen)).rejects.toMatchObject(code('VIDEO_PROFILE_CHANGED'));
  await expect(f.service.assertFrozenInTransaction(f.db, ORG, ACTOR, fence, {...frozen, appearanceLookId: 'look-b'})).rejects.toMatchObject(code('VIDEO_PROFILE_CHANGED'));
});

test('CAS preserves immutable old frozen bytes, rejects stale drafts and makes exact decision replay idempotent', async () => {
  const f = fixture(), value = input(), approved = decision(value);
  const initial = await f.service.saveHumanConfirmed(ORG, ACTOR, value, approved);
  expect(await f.service.saveHumanConfirmed(ORG, ACTOR, value, approved)).toEqual(initial);
  const frozen = await f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId});
  const frozenBytes = JSON.stringify(frozen);
  const a = {...value, expectedRevision: 1, preferredSourceLookId: 'look-a2'}, b = {...value, expectedRevision: 1, displayName: 'Ilya'};
  const writes = await Promise.allSettled([f.service.saveHumanConfirmed(ORG, ACTOR, a, decision(a)), f.service.saveHumanConfirmed(ORG, ACTOR, b, decision(b))]);
  expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(f.rows.filter(row => row.kind === 'decision')).toHaveLength(2);
  await expect(f.service.freeze(ORG, ACTOR, {connectionId: CONNECTION, profileId: value.profileId, expectedRevision: 1, expectedDigest: initial.digest})).rejects.toMatchObject(code('VIDEO_PROFILE_CHANGED'));
  expect(JSON.stringify(frozen)).toBe(frozenBytes);
  expect(frozen.baseLookId).toBe('look-a');
});

test('profile and immutable human decision commit together, and public projection excludes private account/raw provider data', async () => {
  const f = fixture(), value = input(), approved = decision(value);
  approved.catalog.avatars[0].name = 'https://private.example/signed-preview?token=secret';
  approved.catalog.avatars[0].preview_image_url = 'https://private.example/raw';
  approved.catalog.voices[0].token = 'PRIVATE_TOKEN';
  const saved = await f.service.saveHumanConfirmed(ORG, ACTOR, value, approved);
  expect(JSON.stringify(saved)).not.toMatch(/private\.example|PRIVATE_TOKEN|accountDigest|walletDigest|observedAccountGeneration/);
  expect(JSON.stringify(saved)).not.toContain(ACCOUNT);
  const rollback = fixture(); rollback.failDecision();
  await expect(rollback.service.saveHumanConfirmed(ORG, ACTOR, value, decision(value))).rejects.toThrow('synthetic decision persistence failure');
  expect(rollback.rows).toEqual([]);
});
