const {randomUUID} = require('node:crypto');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/videos/subscriptions/';
const contract = load(`${ROOT}video-heygen-style.v1.ts`);
const {SocialFactoryRepository} = load('libraries/nestjs-libraries/src/content-intelligence/social-factory/social-factory.repository.ts');
const {HeygenStyleServiceV1} = load(`${ROOT}video-heygen-style.service.v1.ts`, {
  '../../content-intelligence/social-factory/social-factory.repository': {SocialFactoryRepository},
  './video-connection.service': {VideoConnectionService: class {}},
  './video-heygen-person-profile.service.v1': {HeygenPersonProfileServiceV1: class {}},
});
const ORG = 'workspace-a', ACTOR = 'person-a', ACCOUNT = 'a'.repeat(64), CONNECTION = randomUUID(), PROFILE = randomUUID();
const PROFILE_DIGEST = 'b'.repeat(64), NOW = new Date('2030-01-01T00:00:00Z');
const code = value => ({response: {code: value}});
const input = (extra = {}) => ({operationId: randomUUID(), connectionId: CONNECTION, profileId: PROFILE,
  expectedProfileRevision: 1, expectedProfileDigest: PROFILE_DIGEST, groupId: 'group-a', baseLookId: 'base-a',
  name: 'Business studio look', prompt: 'Keep the same person. Use a navy suit, neutral studio background and a seated business pose.',
  promptLanguage: 'en', aspectRatio: '9:16', referenceMediaIds: [], ...extra});

/** Real repository transaction/CAS path, isolated in-memory Prisma transport; no provider/database access. */
function fixture() {
  let rows = [], serial = Promise.resolve(), profileRevision = 1;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(part => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('gt' in value) return row[key] != null && row[key] > value.gt;
      if ('has' in value) return row[key]?.includes(value.has);
    }
    return row[key] === value;
  });
  const model = {
    findFirst: async ({where}) => structuredClone(rows.find(row => matches(row, where)) ?? null),
    findMany: async ({where, take}) => structuredClone(rows.filter(row => matches(row, where)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, take)),
    create: async ({data}) => {
      if (rows.some(row => row.organizationId === data.organizationId && row.kind === data.kind && row.id === data.id)) throw {code: 'P2002'};
      const row = {revision: 1, parentId: null, deletedAt: null, invalidatedAt: null, expiresAt: null, sourceIds: [], createdAt: NOW, updatedAt: NOW,
        ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))};
      rows.push(structuredClone(row)); return structuredClone(row);
    },
    updateMany: async ({where, data}) => {
      const selected = rows.filter(row => matches(row, where));
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
  const account = {ownerId: ACTOR, provider: 'heygen', state: 'connected', walletDigest: ACCOUNT, generation: 3};
  const media = new Map(), saved = new Map();
  const repository = {
    member: jest.fn(async (org, actor) => {if (org !== ORG || ![ACTOR, 'person-b'].includes(actor)) throw new Error('not a member');}),
    connection: jest.fn(async (org, actor, id) => {if (org !== ORG || actor !== ACTOR || id !== CONNECTION) throw new Error('not owned'); return structuredClone(account);}),
    db: {media: {findFirst: jest.fn(async ({where}) => media.has(where.id) ? {id: where.id} : null)}},
  };
  const connections = {repository, runtime: {now: () => NOW}, token: jest.fn()};
  const profiles = {freeze: jest.fn(async (org, actor, selection) => {
    if (org !== ORG || actor !== ACTOR || selection.connectionId !== CONNECTION || selection.profileId !== PROFILE ||
      selection.expectedRevision !== profileRevision || selection.expectedDigest !== PROFILE_DIGEST || selection.groupId !== 'group-a' ||
      !['base-a', 'base-b'].includes(selection.lookId)) throw Object.assign(new Error(), code('VIDEO_PROFILE_CHANGED'));
    return {version: 1, profileId: PROFILE, profileRevision, profileDigest: PROFILE_DIGEST, connectionId: CONNECTION,
      groupId: 'group-a', baseLookId: selection.lookId, appearanceLookId: 'original-speaking-look', animationReferenceLookId: 'original-motion-look',
      voiceId: 'approved-voice', generationAuthorized: false, renderQualified: false};
  })};
  const qualification = {accountDigest: ACCOUNT, accountGeneration: 3, schemaDigests: contract.HEYGEN_STYLE_TOOL_SCHEMAS_V1,
    baseLook: {lookId: 'base-a', groupId: 'group-a', ownership: 'owned', imageUsable: true, consent: 'accepted'}, entitlement: 'available', references: []};
  const receipt = {operationId: 'provider-operation-a', childLookIds: ['child-a', 'child-b']};
  const adapter = {
    qualify: jest.fn(async context => ({...structuredClone(qualification), baseLook: {...qualification.baseLook, lookId: context.profile.baseLookId}})),
    create: jest.fn(async (_context, _args, hooks) => {await hooks.beforeDispatch(); await hooks.afterResponse({result: receipt, private_url: 'https://provider.invalid/private?token=redacted'}); return structuredClone(receipt);}),
    decodeReceipt: jest.fn(raw => {if (!raw.result) throw new Error('unknown provider receipt'); return raw.result;}),
    poll: jest.fn(async () => ({...structuredClone(receipt), state: 'completed'})),
    inspectLook: jest.fn(async (_context, lookId) => ({lookId, groupId: 'group-a', ownership: 'owned', state: 'completed', imageUrl: `https://provider.invalid/${lookId}.png?signed=private`})),
    saveOwnedImage: jest.fn(async (_context, _look, key) => {
      if (saved.has(key)) return saved.get(key);
      const image = {mediaId: randomUUID(), mimeType: 'image/png'}; saved.set(key, image); media.set(image.mediaId, image); return image;
    }),
  };
  const authorize = jest.fn(async context => ({decisionId: randomUUID(), scopeId: 'native-current-grant', organizationId: ORG, actorId: ACTOR,
    operationId: context.operationId, requestHash: context.requestHash, connectionId: CONNECTION, accountDigest: ACCOUNT, accountGeneration: 3,
    expiresAt: '2030-01-01T01:00:00Z', funding: 'personal_subscription'}));
  const service = new HeygenStyleServiceV1(store, connections, profiles, adapter);
  return {service, store, connections, profiles, adapter, account, qualification, receipt, media, saved, authorize,
    get rows() {return rows;}, editProfile: () => {profileRevision++;}};
}

test('base A versus B maps exact camelCase source/destination and keeps immutable lineage and owned image previews', async () => {
  const f = fixture(), a = input(), b = input({baseLookId: 'base-b'});
  const prepared = await f.service.prepare(ORG, ACTOR, a);
  expect(prepared).toMatchObject({state: 'prepared', attempted: false, baseLookId: 'base-a', resultKind: 'image', completedCount: 0});
  expect(f.adapter.create).not.toHaveBeenCalled();
  const first = await f.service.submit(ORG, ACTOR, a.operationId, f.authorize);
  await f.service.prepare(ORG, ACTOR, b); const second = await f.service.submit(ORG, ACTOR, b.operationId, f.authorize);
  expect(f.adapter.create.mock.calls.map(call => call[1])).toEqual([
    {name: a.name, prompt: a.prompt, avatarId: 'base-a', avatarGroupId: 'group-a', aspectRatio: '9:16'},
    {name: b.name, prompt: b.prompt, avatarId: 'base-b', avatarGroupId: 'group-a', aspectRatio: '9:16'},
  ]);
  for (const result of [first, second]) expect(result).toMatchObject({state: 'completed', completedCount: 2, failedCount: 0, actualCost: null,
    children: [{lookId: 'child-a', state: 'saved', mimeType: 'image/png'}, {lookId: 'child-b', state: 'saved', mimeType: 'image/png'}]});
  const durable = f.rows.find(row => row.id === a.operationId).payload;
  expect(durable.context.profile).toMatchObject({baseLookId: 'base-a', appearanceLookId: 'original-speaking-look', voiceId: 'approved-voice'});
  expect(durable.attempt.rawResponseHash).toMatch(/^[a-f0-9]{64}$/); expect(durable.attempt.receipt).toEqual(f.receipt);
  expect(JSON.stringify(first)).not.toMatch(/provider\.invalid|private_url|signed=|accountDigest|native-current-grant|\.mp4/);
  const chosen = await f.service.selectOwnedPreview(ORG, ACTOR, a.operationId, {lookId: 'child-b', expectedRevision: first.revision});
  expect(chosen.selection).toMatchObject({lookId: 'child-b', mediaId: first.children[1].mediaId});
  expect((await f.service.read(ORG, ACTOR, a.operationId)).selection).toEqual(chosen.selection);
  expect(await f.service.freezeSelectedAppearance(ORG, ACTOR, a.operationId, {revision: chosen.revision, requestHash: chosen.requestHash})).toMatchObject({
    profileId: PROFILE, profileRevision: 1, baseLookId: 'base-a', groupId: 'group-a', appearanceLookId: 'child-b',
    operationId: a.operationId, mediaId: chosen.selection.mediaId, generationAuthorized: false});
  const lineage = await f.service.freezeAppearance(ORG, ACTOR, a.operationId);
  expect(lineage.lineageDigest).toMatch(/^[a-f0-9]{64}$/);
  expect((await f.service.freezeAppearance(ORG, ACTOR, a.operationId, 'child-a')).lineageDigest).not.toBe(lineage.lineageDigest);
  expect(f.rows.find(row => row.id === a.operationId).payload.context.profile.appearanceLookId).toBe('original-speaking-look');
  await expect(f.service.freezeAppearance(ORG, 'person-b', a.operationId, 'child-a')).rejects.toMatchObject(code('VIDEO_STYLE_OPERATION_UNAVAILABLE'));
  await expect(f.service.freezeAppearance(ORG, ACTOR, a.operationId, 'base-a')).rejects.toMatchObject(code('VIDEO_STYLE_SELECTION_INVALID'));
  await expect(f.service.selectOwnedPreview(ORG, ACTOR, a.operationId, {lookId: 'child-a', expectedRevision: first.revision})).rejects.toMatchObject(code('VIDEO_STYLE_OPERATION_CHANGED'));
  expect(f.connections.token).not.toHaveBeenCalled();
});

test('English instructions and strict qualified fields reject guessed API, prompt/model and foreign references before any effect', async () => {
  const f = fixture();
  for (const value of [input({prompt: 'Сделай деловой фон'}), input({avatar_id: 'guess'}), input({model: 'image-model'}), input({referenceMediaIds: [randomUUID()]})])
    await expect(f.service.prepare(ORG, ACTOR, value)).rejects.toThrow();
  const reference = randomUUID(); f.media.set(reference, {}); f.qualification.references = [{mediaId: reference, assetId: 'existing-owned-image-asset'}];
  const value = input({referenceMediaIds: [reference]}); await f.service.prepare(ORG, ACTOR, value);
  await f.service.submit(ORG, ACTOR, value.operationId, f.authorize);
  expect(f.adapter.create.mock.calls[0][1]).toMatchObject({referenceImages: [{type: 'asset_id', asset_id: 'existing-owned-image-asset'}]});
  expect(f.rows[0].payload.references).toEqual(f.qualification.references);
});

test('unknown entitlement, schema drift and missing current native funding authority remain concrete blockers', async () => {
  const f = fixture(), value = input(); f.qualification.entitlement = 'unknown';
  expect(await f.service.prepare(ORG, ACTOR, value)).toMatchObject({blockers: ['VIDEO_STYLE_ENTITLEMENT_UNKNOWN']});
  expect(await f.service.submit(ORG, ACTOR, value.operationId, f.authorize)).toMatchObject({attempted: false, blockers: ['VIDEO_STYLE_ENTITLEMENT_UNKNOWN']});
  expect(f.authorize).not.toHaveBeenCalled(); expect(f.adapter.create).not.toHaveBeenCalled();
  f.qualification.entitlement = 'available'; f.qualification.schemaDigests = {...contract.HEYGEN_STYLE_TOOL_SCHEMAS_V1, create_prompt_avatar: 'c'.repeat(64)};
  expect(await f.service.submit(ORG, ACTOR, value.operationId, f.authorize)).toMatchObject({attempted: false, blockers: ['VIDEO_STYLE_SCHEMA_CHANGED']});
  f.qualification.schemaDigests = contract.HEYGEN_STYLE_TOOL_SCHEMAS_V1;
  await expect(f.service.submit(ORG, ACTOR, value.operationId)).rejects.toMatchObject(code('VIDEO_STYLE_AUTHORITY_REQUIRED'));
  const forged = async context => ({...await f.authorize(context), requestHash: 'd'.repeat(64)});
  await expect(f.service.submit(ORG, ACTOR, value.operationId, forged)).rejects.toMatchObject(code('VIDEO_STYLE_AUTHORITY_REQUIRED'));
  expect(f.rows[0].payload.attempt).toBeUndefined();
});

test('actor/workspace isolation and changed account/generation protect admission and recovery without changing old bytes', async () => {
  const f = fixture(), value = input(); const saved = await f.service.prepare(ORG, ACTOR, value), bytes = JSON.stringify(f.rows[0].payload.context);
  await expect(f.service.read(ORG, 'person-b', value.operationId)).rejects.toMatchObject(code('VIDEO_STYLE_OPERATION_UNAVAILABLE'));
  expect(await f.service.list(ORG, 'person-b')).toEqual([]);
  await expect(f.service.read('workspace-b', ACTOR, value.operationId)).rejects.toThrow();
  f.account.generation++;
  await expect(f.service.submit(ORG, ACTOR, value.operationId, f.authorize)).rejects.toMatchObject(code('VIDEO_STYLE_ACCOUNT_CHANGED'));
  f.account.generation--; f.account.walletDigest = 'c'.repeat(64);
  await expect(f.service.submit(ORG, ACTOR, value.operationId, f.authorize)).rejects.toMatchObject(code('VIDEO_STYLE_ACCOUNT_CHANGED'));
  expect(JSON.stringify(f.rows[0].payload.context)).toBe(bytes); expect((await f.service.read(ORG, ACTOR, value.operationId)).requestHash).toBe(saved.requestHash);
  expect(f.adapter.create).not.toHaveBeenCalled();
});

test('lost mutation response is durable uncertainty and concurrent submit/recovery never creates again', async () => {
  const f = fixture(), value = input(); await f.service.prepare(ORG, ACTOR, value);
  f.adapter.create.mockImplementation(async (_context, _args, hooks) => {await hooks.beforeDispatch(); throw new Error('lost transport response');});
  const results = await Promise.all([f.service.submit(ORG, ACTOR, value.operationId, f.authorize), f.service.submit(ORG, ACTOR, value.operationId, f.authorize)]);
  expect(results.some(result => result.state === 'uncertain')).toBe(true);
  expect(await f.service.recover(ORG, ACTOR, value.operationId)).toMatchObject({state: 'uncertain', attempted: true, blockers: ['VIDEO_STYLE_RECEIPT_UNKNOWN']});
  await f.service.submit(ORG, ACTOR, value.operationId, f.authorize); await f.service.recover(ORG, ACTOR, value.operationId);
  expect(f.adapter.create).toHaveBeenCalledTimes(1); expect(f.adapter.poll).not.toHaveBeenCalled();
});

test('captured raw response recovers parsing failure; recovery survives profile edit and same-account renewal', async () => {
  const f = fixture(), value = input(); await f.service.prepare(ORG, ACTOR, value);
  f.adapter.create.mockImplementation(async (_context, _args, hooks) => {await hooks.beforeDispatch(); await hooks.afterResponse({result: f.receipt}); throw new Error('SDK decoder lost response');});
  expect(await f.service.submit(ORG, ACTOR, value.operationId, f.authorize)).toMatchObject({state: 'uncertain'});
  f.editProfile(); f.account.generation++;
  const result = await f.service.recover(ORG, ACTOR, value.operationId);
  expect(result).toMatchObject({state: 'completed', completedCount: 2, profileRevision: 1});
  expect(f.adapter.create).toHaveBeenCalledTimes(1); expect(f.adapter.decodeReceipt).toHaveBeenCalledTimes(1);
  expect(f.rows[0].payload.context.profile.baseLookId).toBe('base-a');
  f.account.walletDigest = 'c'.repeat(64);
  await expect(f.service.selectOwnedPreview(ORG, ACTOR, value.operationId, {lookId: 'child-a', expectedRevision: result.revision})).rejects.toMatchObject(code('VIDEO_STYLE_ACCOUNT_CHANGED'));
});

test('unknown raw receipt is retained without guessed IDs, fallback or retry', async () => {
  const f = fixture(), value = input(); await f.service.prepare(ORG, ACTOR, value);
  f.adapter.create.mockImplementation(async (_context, _args, hooks) => {await hooks.beforeDispatch(); await hooks.afterResponse({unexpected: 'no operation ID'}); throw new Error('unknown receipt');});
  await f.service.submit(ORG, ACTOR, value.operationId, f.authorize);
  const result = await f.service.recover(ORG, ACTOR, value.operationId);
  expect(result).toMatchObject({state: 'uncertain', completedCount: 0, children: [], blockers: ['VIDEO_STYLE_RECEIPT_UNKNOWN']});
  expect(f.rows[0].payload.attempt.rawResponse).toEqual({unexpected: 'no operation ID'}); expect(f.adapter.create).toHaveBeenCalledTimes(1);
});

test('actual partial children and failed image saving recover individually from the same effect, never video-only saving', async () => {
  const f = fixture(), value = input(); await f.service.prepare(ORG, ACTOR, value);
  const save = f.adapter.saveOwnedImage.getMockImplementation(); let fail = true;
  f.adapter.saveOwnedImage.mockImplementation(async (context, look, key) => {if (look.lookId === 'child-b' && fail) throw new Error('temporary storage failure'); return save(context, look, key);});
  const partial = await f.service.submit(ORG, ACTOR, value.operationId, f.authorize);
  expect(partial).toMatchObject({state: 'partial', completedCount: 1, children: [{state: 'saved'}, {state: 'save_pending', blocker: 'VIDEO_STYLE_IMAGE_SAVE_PENDING'}]});
  expect(f.rows[0].payload.children[1].imageUrl).toContain('child-b.png');
  const reads = f.adapter.inspectLook.mock.calls.length; fail = false;
  f.adapter.poll.mockRejectedValueOnce(new Error('temporary provider read failure'));
  const recovered = await f.service.recover(ORG, ACTOR, value.operationId);
  expect(recovered).toMatchObject({state: 'completed', completedCount: 2}); expect(f.adapter.inspectLook).toHaveBeenCalledTimes(reads);
  expect(f.adapter.create).toHaveBeenCalledTimes(1); expect(f.adapter.saveOwnedImage.mock.calls.filter(call => call[1].lookId === 'child-a')).toHaveLength(1);
  expect(f.adapter.saveOwnedImage.mock.calls.filter(call => call[1].lookId === 'child-b').map(call => call[2])).toEqual([`heygen-style:${value.operationId}:child-b`, `heygen-style:${value.operationId}:child-b`]);
});

test('each actual child is checked for group/ownership; refusal stays bounded and actual result counts remain honest', async () => {
  const f = fixture(), value = input(); await f.service.prepare(ORG, ACTOR, value);
  f.adapter.inspectLook.mockImplementation(async (_context, lookId) => lookId === 'child-a'
    ? {lookId, groupId: 'group-a', ownership: 'owned', state: 'failed'}
    : {lookId, groupId: 'foreign-group', ownership: 'owned', state: 'completed', imageUrl: 'https://provider.invalid/other.png'});
  const result = await f.service.submit(ORG, ACTOR, value.operationId, f.authorize);
  expect(result).toMatchObject({state: 'collecting', completedCount: 0, failedCount: 1,
    children: [{lookId: 'child-a', state: 'failed'}, {lookId: 'child-b', blocker: 'VIDEO_STYLE_CHILD_INVALID'}]});
  expect(f.adapter.saveOwnedImage).not.toHaveBeenCalled();
  const g = fixture(), single = input(); g.receipt.childLookIds = ['child-a'];
  await g.service.prepare(ORG, ACTOR, single); expect(await g.service.submit(ORG, ACTOR, single.operationId, g.authorize)).toMatchObject({completedCount: 1, children: [{lookId: 'child-a'}]});
});

test('stale profile or edited immutable preparation refuses before claim and paid dispatch', async () => {
  const f = fixture(), value = input(); await f.service.prepare(ORG, ACTOR, value);
  await expect(f.service.prepare(ORG, ACTOR, {...value, baseLookId: 'base-b'})).rejects.toMatchObject(code('VIDEO_STYLE_OPERATION_CHANGED'));
  f.editProfile(); await expect(f.service.submit(ORG, ACTOR, value.operationId, f.authorize)).rejects.toMatchObject(code('VIDEO_PROFILE_CHANGED'));
  expect(f.rows[0].payload.attempt).toBeUndefined(); expect(f.adapter.create).not.toHaveBeenCalled();
});

test('provisional native connection uses trusted subject context without rewriting global wallet/eligibility', async () => {
  const f = fixture(), value = input();
  f.account.walletDigest = 'unverified:discovery-subject'; f.account.state = 'discovery_required';
  await expect(f.service.prepare(ORG, ACTOR, value)).rejects.toMatchObject(code('VIDEO_STYLE_ACCOUNT_UNVERIFIED'));
  f.adapter.currentAccount = jest.fn(async () => ({accountDigest: ACCOUNT, accountGeneration: f.account.generation}));
  await f.service.prepare(ORG, ACTOR, value);
  expect(f.profiles.freeze.mock.calls.every(call => call[3]?.accountDigest === ACCOUNT && call[3]?.accountGeneration === 3)).toBe(true);
  const result = await f.service.submit(ORG, ACTOR, value.operationId, f.authorize);
  expect(result).toMatchObject({state: 'completed', completedCount: 2});
  expect(f.rows[0].payload.context.accountDigest).toBe(ACCOUNT);
  expect(f.account).toMatchObject({walletDigest: 'unverified:discovery-subject', state: 'discovery_required'});
  f.adapter.currentAccount.mockResolvedValue({accountDigest: 'c'.repeat(64), accountGeneration: 3});
  await expect(f.service.selectOwnedPreview(ORG, ACTOR, value.operationId, {lookId: 'child-a', expectedRevision: result.revision})).rejects.toMatchObject(code('VIDEO_STYLE_ACCOUNT_CHANGED'));
  f.adapter.currentAccount.mockResolvedValue({accountDigest: ACCOUNT, accountGeneration: 2});
  await expect(f.service.prepare(ORG, ACTOR, input())).rejects.toMatchObject(code('VIDEO_STYLE_ACCOUNT_UNVERIFIED'));
  expect(f.adapter.create).toHaveBeenCalledTimes(1);
});

test('image save response loss reuses the same native Media key and saved image on recovery', async () => {
  const f = fixture(), value = input(); f.receipt.childLookIds = ['child-a']; await f.service.prepare(ORG, ACTOR, value);
  const save = f.adapter.saveOwnedImage.getMockImplementation(); let lost = true;
  f.adapter.saveOwnedImage.mockImplementation(async (context, look, key) => {
    const image = await save(context, look, key);
    if (lost) {lost = false; throw new Error('Media saved, response lost');}
    return image;
  });
  expect(await f.service.submit(ORG, ACTOR, value.operationId, f.authorize)).toMatchObject({state: 'collecting', completedCount: 0});
  expect(f.saved.size).toBe(1);
  const original = [...f.saved.values()][0];
  const recovered = await f.service.recover(ORG, ACTOR, value.operationId);
  expect(recovered).toMatchObject({state: 'completed', completedCount: 1, children: [{mediaId: original.mediaId}]});
  expect(f.saved.size).toBe(1); expect(f.adapter.create).toHaveBeenCalledTimes(1); expect(f.adapter.saveOwnedImage).toHaveBeenCalledTimes(2);
});
