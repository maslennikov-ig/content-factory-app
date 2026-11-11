const {randomUUID} = require('node:crypto');
const {create} = require('./helpers/video-subscription-domain.fixture.cjs');
const {assertDisposableDatabaseV1} = require('./helpers/video-domain-v1.fixture.cjs');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/videos/subscriptions/';
const {heygenPersonProfileApprovalDigestV1} = load(`${ROOT}video-heygen-person-profile.v1.ts`);
const {SocialFactoryRepository} = load('libraries/nestjs-libraries/src/content-intelligence/social-factory/social-factory.repository.ts');
const {HeygenChatControlsServiceV1} = load(`${ROOT}video-heygen-chat-controls.service.v1.ts`, {
  '../../content-intelligence/social-factory/autonomy/editorial-decision.service': {EditorialDecisionService: class {}},
});
const {HeygenPersonProfileServiceV1} = load(`${ROOT}video-heygen-person-profile.service.v1.ts`, {
  '../../content-intelligence/social-factory/social-factory.repository': {SocialFactoryRepository},
  './video-connection.service': {VideoConnectionService: class {}},
});
const DB = process.env.CF_VIDEO_DATABASE_URL;
const integration = DB ? test : test.skip;
const gate = () => {let release; const wait = new Promise(resolve => {release = resolve;}); return {wait, release};};
jest.setTimeout(30000);

async function fixture() {
  // Explicit opt-in, loopback and exact disposable database name before any fixture mutation.
  assertDisposableDatabaseV1(DB);
  const f = await create(DB);
  try {
    const connection = await f.connect('heygen', {limits: false});
    const account = await f.db.videoSubscriptionConnection.findUnique({where: {id: connection.connectionId}});
    const store = new SocialFactoryRepository({model: f.db}, {model: f.db});
    const service = new HeygenPersonProfileServiceV1(store, f.connections);
    const input = {profileId: randomUUID(), expectedRevision: 0, connectionId: connection.connectionId, displayName: 'Ilya', aliases: ['Илья'],
      groupIds: ['private-group'], preferredGroupId: 'private-group', sourceLooks: [
        {groupId: 'private-group', lookId: 'private-look', roles: ['style_base', 'appearance']},
        {groupId: 'private-group', lookId: 'other-private-look', roles: ['style_base', 'appearance', 'animation_reference']},
      ], preferredSourceLookId: 'private-look', defaultVoice: {voiceId: 'private-voice', baseline: {locale: 'ru-RU'}}};
    const catalog = {scope: 'authenticated_private_account', readOnly: true, renderQualified: false,
      avatars: input.sourceLooks.map(ref => ({id: ref.lookId, groupId: ref.groupId, name: 'Private look', ownership: 'owned', state: 'unverified',
        selectableForDraft: true, engines: ['avatar_iv'], locales: [], avatarType: 'photo_avatar', groupType: 'photo', consentStatus: null})),
      voices: [{id: 'private-voice', name: 'Private voice', ownership: 'owned', state: 'available', selectableForDraft: true, engines: [], locales: ['ru']}]};
    const decision = value => ({decisionId: randomUUID(), source: 'authenticated_screen_action', accountDigest: account.walletDigest,
      accountGeneration: account.generation, observedAt: '2030-01-01T00:00:00.000Z', catalog,
      approvedDigest: heygenPersonProfileApprovalDigestV1(f.org.id, f.user.id, value, account.walletDigest)});
    const close = async () => {await f.db.socialFactoryRecord.deleteMany({where: {organizationId: {in: f.organizations}}}); await f.close();};
    return Object.assign(f, {store, profiles: service, profileInput: input, decision, account, closeProfiles: close});
  } catch (error) {await f.close(); throw error;}
}

integration('real Postgres: private profile reload, immutable decision and concurrent CAS preserve exactly one approved update', async () => {
  const f = await fixture();
  try {
    const initial = await f.profiles.saveHumanConfirmed(f.org.id, f.user.id, f.profileInput, f.decision(f.profileInput));
    expect((await f.profiles.read(f.org.id, f.user.id, initial.profileId)).digest).toBe(initial.digest);
    await expect(f.profiles.read(f.org.id, f.otherUser.id, initial.profileId)).rejects.toMatchObject({response: {code: 'VIDEO_PROFILE_UNAVAILABLE'}});
    expect((await f.profiles.list(f.org.id, f.otherUser.id)).items).toEqual([]);
    const a = {...f.profileInput, expectedRevision: 1, preferredSourceLookId: 'other-private-look'}, b = {...f.profileInput, expectedRevision: 1, displayName: 'Илья Примеров'};
    const results = await Promise.allSettled([f.profiles.saveHumanConfirmed(f.org.id, f.user.id, a, f.decision(a)), f.profiles.saveHumanConfirmed(f.org.id, f.user.id, b, f.decision(b))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await f.profiles.read(f.org.id, f.user.id, initial.profileId)).revision).toBe(2);
    const decisions = await f.db.socialFactoryRecord.findMany({where: {organizationId: f.org.id, kind: 'decision'}});
    expect(decisions).toHaveLength(2);
    await expect(f.store.put({organizationId: f.org.id, kind: 'decision', id: decisions[0].id, expectedRevision: 1, payload: {forged: true}})).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_IMMUTABLE');
    expect(f.transport.submits).toHaveLength(0);
  } finally {await f.closeProfiles();}
});

integration('real Postgres: a non-UUID native call saves one UUID decision and replays only that exact profile', async () => {
  const f = await fixture();
  try {
    const profile = {...f.profileInput, preferredForName: false};
    const controls = new HeygenChatControlsServiceV1(f.profiles,
      {connections: {runtime: {now: () => new Date('2030-01-01T00:00:00.000Z')}}}, {}, {}, {});
    controls.observed = async () => ({accountDigest: f.account.walletDigest, accountGeneration: f.account.generation,
      catalog: f.decision(profile).catalog});
    const proposal = await controls.proposeProfile(f.org.id, f.user.id, profile);
    const input = {profile, selectionDigest: proposal.selectionDigest};
    const callId = 'call_profile_approved_opaque_123';
    const first = await controls.saveProfile(f.org.id, f.user.id, input, 'confirmed_chat_action', callId);
    expect(first).toMatchObject({profileId: profile.profileId, revision: 1, setupReusable: true, generationAuthorized: false});
    expect(first.humanDecision.decisionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await controls.saveProfile(f.org.id, f.user.id, input, 'confirmed_chat_action', callId)).toEqual(first);
    expect(await f.db.socialFactoryRecord.count({where: {organizationId: f.org.id, kind: 'decision'}})).toBe(1);
    expect(await f.db.socialFactoryRecord.count({where: {organizationId: f.org.id, kind: 'heygen_person_profile'}})).toBe(1);
    expect((await f.profiles.read(f.org.id, f.user.id, profile.profileId)).humanDecision).toEqual(first.humanDecision);
    await expect(controls.saveProfile(f.org.id, f.otherUser.id, input, 'confirmed_chat_action', callId)).rejects.toThrow();
    expect(f.transport.submits).toHaveLength(0);
  } finally {await f.closeProfiles();}
});

integration('real Postgres: decision write failure rolls back the profile in the same transaction', async () => {
  const f = await fixture();
  try {
    const run = f.store.transact.bind(f.store);
    f.store.transact = work => run(async tx => {
      const put = tx.put.bind(tx);
      tx.put = input => input.kind === 'decision' ? Promise.reject(new Error('synthetic immutable receipt failure')) : put(input);
      return work(tx);
    });
    await expect(f.profiles.saveHumanConfirmed(f.org.id, f.user.id, f.profileInput, f.decision(f.profileInput))).rejects.toThrow('synthetic immutable receipt failure');
    expect(await f.db.socialFactoryRecord.count({where: {organizationId: f.org.id, kind: {in: ['heygen_person_profile', 'decision']}}})).toBe(0);
  } finally {await f.closeProfiles();}
});

integration('real Postgres: submit fence holds the profile row until commit and rejects the old frozen revision afterward', async () => {
  const f = await fixture(), locked = gate(), proceed = gate(); let admission, editing;
  try {
    const initial = await f.profiles.saveHumanConfirmed(f.org.id, f.user.id, f.profileInput, f.decision(f.profileInput));
    const frozen = await f.profiles.freeze(f.org.id, f.user.id, {connectionId: f.profileInput.connectionId, profileId: initial.profileId});
    const fence = {profileId: initial.profileId, profileRevision: initial.revision, profileDigest: initial.digest,
      connectionId: f.profileInput.connectionId, subjectDigest: f.account.walletDigest};
    admission = f.db.$transaction(async tx => {
      await f.profiles.assertFrozenInTransaction(tx, f.org.id, f.user.id, fence, frozen);
      locked.release(); await proceed.wait;
    }, {isolationLevel: 'Serializable', timeout: 10000});
    await Promise.race([locked.wait, admission.then(() => {throw new Error('Profile transaction completed without acquiring its fence');})]);
    const update = {...f.profileInput, expectedRevision: 1, preferredSourceLookId: 'other-private-look'};
    let completed = false;
    editing = f.profiles.saveHumanConfirmed(f.org.id, f.user.id, update, f.decision(update)).then(value => {completed = true; return value;});
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(completed).toBe(false);
    proceed.release(); await admission; await editing;
    await expect(f.db.$transaction(tx => f.profiles.assertFrozenInTransaction(tx, f.org.id, f.user.id, fence, frozen))).rejects.toMatchObject({response: {code: 'VIDEO_PROFILE_CHANGED'}});
  } finally {
    proceed.release(); await admission?.catch(() => {}); await editing?.catch(() => {}); await f.closeProfiles();
  }
});
