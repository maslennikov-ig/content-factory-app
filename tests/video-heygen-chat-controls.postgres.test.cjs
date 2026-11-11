const {randomUUID} = require('node:crypto');
const {create} = require('./helpers/video-subscription-domain.fixture.cjs');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const LIB = 'libraries/nestjs-libraries/src/';
const DB = process.env.CF_VIDEO_DATABASE_URL;
const integration = DB ? test : test.skip;
const SCRIPT = 'Привет! Приглашаю вас на саммит. Обсудим новые идеи для бизнеса.';
jest.setTimeout(45000);

async function fixture() {
  const f = await create(DB);
  try {
    const connected = await f.connect('heygen', {limits: false});
    const definition = f.provider.runtime.definition.bind(f.provider.runtime);
    f.provider.runtime.definition = name => name === 'heygen' ? {...definition(name), enabled: false,
      identityEndpoint: undefined, schemaDigests: [], ownedAssetReadProfile: 'heygen_private_catalog_v1'} : definition(name);
    await f.db.videoSubscriptionConnection.update({where: {id: connected.connectionId}, data: {state: 'discovery_required', walletDigest: `unverified:${randomUUID()}`}});
    const account = {subjectDigest: 'a'.repeat(64), billingType: 'subscription', plan: 'creator', remaining: '200', resetAt: null};
    const look = (id, name) => ({id, name, ownership: 'owned', state: 'available', selectableForDraft: true,
      groupId: 'owned_group', avatarType: 'photo_avatar', groupType: 'digital_twin', consentStatus: 'accepted', engines: ['avatar_iv'], locales: []});
    const catalog = {scope: 'authenticated_private_account', readOnly: true, renderQualified: false,
      avatars: [look('look_a', 'Студия'), look('look_b', 'Кабинет')],
      voices: [{id: 'owned_voice', name: 'Сохранённый голос', ownership: 'owned', state: 'available', selectableForDraft: true, engines: [], locales: ['ru'], language: 'Russian'}]};
    const mcp = f.provider.mcp;
    mcp.readHeygenAccountV1 = async (_d, _t, guard) => {await guard(); return structuredClone(account);};
    mcp.readHeygenOwnedCatalog = async (_d, _t, guard) => {await guard(); return {catalog: structuredClone(catalog), avatars: [], voices: []};};
    mcp.readHeygenOwnedAvatarGroup = async (_d, _t, input, guard) => {await guard(); return {...input, consentState: 'accepted'};};
    const sends = [];
    mcp.renderHeygenAvatarV2 = async (_d, _t, args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); sends.push(structuredClone(args));
      await hooks.afterResponse({id: `synthetic_${sends.length}`});
      return {id: `synthetic_${sends.length}`};
    };
    const {SocialFactoryRepository} = load(`${LIB}content-intelligence/social-factory/social-factory.repository.ts`);
    const store = new SocialFactoryRepository({model: f.db}, {model: f.db});
    const {HeygenPersonProfileServiceV1} = load(`${LIB}videos/subscriptions/video-heygen-person-profile.service.v1.ts`);
    const profiles = new HeygenPersonProfileServiceV1(store, f.connections);
    f.access.heygenProfiles = profiles; f.subscriptions.heygenProfiles = profiles;
    const {HeygenAutopilotScopeServiceV2} = load(`${LIB}videos/subscriptions/video-heygen-autopilot-scope.v2.ts`);
    const scopes = new HeygenAutopilotScopeServiceV2(store, f.subscriptionRepository);
    const {HeygenChatControlsServiceV1} = load(`${LIB}videos/subscriptions/video-heygen-chat-controls.service.v1.ts`, {
      '../../content-intelligence/social-factory/autonomy/editorial-decision.service': {EditorialDecisionService: class {}},
    });
    const controls = new HeygenChatControlsServiceV1(profiles, f.access, scopes, {});
    const profileInput = {profileId: randomUUID(), expectedRevision: 0, connectionId: connected.connectionId,
      displayName: 'Илья Примеров', aliases: ['Ilya Primerov'], preferredForName: false,
      groupIds: ['owned_group'], preferredGroupId: 'owned_group',
      sourceLooks: catalog.avatars.map(look => ({groupId: look.groupId, lookId: look.id, roles: ['style_base', 'appearance']})),
      preferredSourceLookId: 'look_a', defaultAppearanceLookId: 'look_a', defaultVoice: {voiceId: 'owned_voice', baseline: {speed: 1}}};
    const proposal = await controls.proposeProfile(f.org.id, f.user.id, profileInput);
    const profile = await controls.saveProfile(f.org.id, f.user.id, {profile: profileInput, selectionDigest: proposal.selectionDigest}, 'authenticated_screen_action');
    await f.db.contentPiece.update({where: {id: f.pieceId}, data: {body: SCRIPT, title: 'Приглашение на саммит', language: 'ru-RU',
      brief: {brief: {inputKind: 'thought', facts: [{statement: SCRIPT, evidenceId: 'authored', origin: 'person', verified: true}]}}}});
    const draft = await f.service.prepare(f.org.id, f.user.id, {pieceId: f.pieceId,
      settings: {...f.presenterSettings, locale: 'ru-RU', duration: 20, avatarId: 'look_a', voiceId: 'owned_voice', engine: 'avatar_iv'},
      prepareWithAi: false, scriptPolicy: 'exact', intent: 'Keep the authored invitation exact.'});
    const prepare = (value = {}) => controls.prepareSettings(f.org.id, f.user.id, {draftId: draft.id, version: draft.version,
      connectionId: connected.connectionId, name: 'Ilya Primerov', ...value});
    const approve = d => f.access.preflight(f.org.id, f.user.id, {draftId: d.id, version: d.version,
      access: {kind: 'subscription', connectionId: connected.connectionId}});
    const scopeInput = {id: randomUUID(), connectionId: connected.connectionId, profileId: profile.profileId, profileRevision: profile.revision,
      profileDigest: profile.digest, pieceId: draft.pieceId, sourceRevision: draft.pieceRevision,
      maxJobs: 1, maxExpertCalls: 1, unknownDebitAcknowledged: true, expiresAt: new Date(f.provider.runtime.now().getTime() + 900000).toISOString()};
    return Object.assign(f, {controls, profiles, scopes, profile, profileInput, draft, prepareV2: prepare, approveV2: approve,
      account, catalog, sends, scopeInput, connectionId: connected.connectionId, threadId: randomUUID()});
  } catch (error) {await f.close(); throw error;}
}

integration('approved profile reuses exact voice and chosen base, ordinary clip overrides survive reload without changing defaults', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2({sourceLookId: 'look_b', appearanceLookId: 'look_a', overrides: {voiceSettings: {speed: 1.15, pitch: 0}, fit: 'contain'}});
    expect(d.settings.heygenV2.settings).toMatchObject({sourceLookId: 'look_b', appearanceLookId: 'look_a', voiceId: 'owned_voice', voiceSettings: {locale: 'ru-RU', speed: 1.15}});
    const saved = await f.access.apiRepository.draft(f.org.id, d.id);
    expect(saved.settings).toEqual(d.settings);
    expect((await f.controls.resolveProfile(f.org.id, f.user.id, {connectionId: f.connectionId, name: 'Ilya Primerov'})).defaultVoice.baseline.speed).toBe(1);
    const approval = await f.approveV2(d);
    const row = await f.db.videoAccessPreflight.findUnique({where: {id: approval.id}});
    expect(row.request.recipe.speech).toBe(SCRIPT);
    expect(row.request.recipe.settings.sourceLookId).toBe('look_b');
    expect(row.request.args.voiceSettings.speed).toBe(1.15);
    expect(f.sends).toHaveLength(0);
  } finally {await f.close();}
});

integration('an account glossary survives the targeted edit, reload and native preflight without replacing the voice', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2({sourceLookId: 'look_b', appearanceLookId: 'look_a', overrides: {resolution: '1080p'}});
    const mcp = f.provider.mcp;
    mcp.readHeygenAdvancedOptionsV1 = async (_def, _token, input, guard) => {
      await guard();
      expect(input.subjectDigest).toBe(f.account.subjectDigest);
      if (input.glossaryId && input.glossaryId !== 'owned_terms') return {};
      return {glossaries: [{id: 'owned_terms', name: 'Саммит'}],
        ...(input.glossaryId ? {glossary: {glossaryId: 'owned_terms', owned: true}} : {})};
    };
    const who = [f.org.id, f.user.id];
    expect(await f.controls.advancedOptions(...who, d.id, d.version)).toMatchObject({glossaries: [{id: 'owned_terms'}]});
    await expect(f.controls.saveGlossary(...who, {draftId: d.id, version: d.version, glossaryId: 'foreign_terms'})).rejects.toThrow();
    const saved = await f.controls.saveGlossary(...who, {draftId: d.id, version: d.version, glossaryId: 'owned_terms'});
    expect(saved.brief.script).toBe(SCRIPT);
    expect(saved.settings.heygenV2.settings).toMatchObject({voiceId: 'owned_voice', sourceLookId: 'look_b', resolution: '1080p', brandGlossaryId: 'owned_terms'});
    const approval = await f.approveV2(saved);
    const row = await f.db.videoAccessPreflight.findUnique({where: {id: approval.id}});
    expect(row.request.args).toMatchObject({script: SCRIPT, voiceId: 'owned_voice', brandGlossaryId: 'owned_terms'});
    const cleared = await f.controls.saveGlossary(...who, {draftId: d.id, version: saved.version, glossaryId: null});
    expect(cleared.settings.heygenV2.settings).not.toHaveProperty('brandGlossaryId');
    expect(f.sends).toHaveLength(0);
  } finally {await f.close();}
});

integration('owned background selection reaches the frozen request and refuses changed provider bytes on requalification', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2({overrides: {resolution: '1080p'}});
    const media = await f.db.media.create({data: {organizationId: f.org.id, name: 'Background', type: 'image', path: 'fixture-background.png', fileSize: 42}});
    const digest = 'b'.repeat(64);
    let remoteDigest = digest;
    f.controls.creative = {bindOwnedBackgroundImage: async (scope, id) => {
      expect(scope).toMatchObject({organizationId: f.org.id, actorId: f.user.id, connectionId: f.connectionId});
      return {type: 'image', assetId: id, mediaId: media.id, contentDigest: digest};
    }};
    f.service.media.inspectOwnedImage = async path => {
      expect(path).toBe(media.path);
      return {contentDigest: digest};
    };
    f.service.media.inspectRemoteImage = async () => ({contentDigest: remoteDigest});
    f.provider.mcp.readHeygenAdvancedOptionsV1 = async (_def, _token, input, guard, consume) => {
      expect(input.backgroundAssetId).toBe('owned_image');
      await guard();
      await consume({assetId: 'owned_image', url: 'https://resource2.heygen.ai/fixture.png'});
      return {};
    };
    const saved = await f.controls.saveBackground(f.org.id, f.user.id, {draftId: d.id, version: d.version, backgroundAssetId: 'owned_image'});
    const approval = await f.approveV2(saved);
    const frozen = await f.db.videoAccessPreflight.findUnique({where: {id: approval.id}});
    expect(frozen.request.args).toMatchObject({script: SCRIPT, voiceId: 'owned_voice', resolution: '1080p', background: {type: 'image', asset_id: 'owned_image'}});
    remoteDigest = 'c'.repeat(64);
    await expect(f.approveV2(saved)).rejects.toMatchObject({response: {setting: 'background_asset', reason: 'background_asset_content_mismatch'}});
    expect(f.sends).toHaveLength(0);
  } finally {await f.close();}
});

integration('a longer Creator V2 recipe reaches native preflight with 1080p and all output settings preserved',async()=>{
  const f=await fixture();try{
    const prepared=await f.prepareV2({overrides:{durationSeconds:73,resolution:'1080p',aspectRatio:'4:5',captions:'sidecar'}});
    expect(prepared.settings).toMatchObject({duration:73,resolution:'1080p',aspectRatio:'4:5',captions:true});
    const approval=await f.approveV2(prepared);
    const row=await f.db.videoAccessPreflight.findUnique({where:{id:approval.id}});
    expect(row.request).toMatchObject({kind:'heygen-personal-avatar-request/v2',args:{resolution:'1080p',aspectRatio:'4:5',caption:{file_format:'srt'}}});
    expect(row.request.args.caption).not.toHaveProperty('style');
    expect(row.request.recipe.settings.durationSeconds).toBe(73);
    expect(row.request.recipe.speech).toBe(SCRIPT);
    expect(approval).toMatchObject({maximumJobs:1,unknownPrice:true,billing:'personal_subscription'});
    expect(f.sends).toHaveLength(0);
    const original=await f.access.apiRepository.draft(f.org.id,f.draft.id);
    expect(original.settings.heygenV2.settings).toEqual(prepared.settings.heygenV2.settings);
  }finally{await f.close();}
});

integration('one bounded V2 scope dispatches once and concurrent/replayed launch shares its durable job', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2(), approval = await f.approveV2(d);
    await f.controls.authorizeScope(f.org.id, f.user.id, f.threadId, f.scopeInput, 'actual-human-confirmation');
    const launch = () => f.controls.launchScoped(f.org.id, f.user.id, f.threadId, f.scopeInput.id, approval.id);
    const jobs = await Promise.all([launch(), launch()]);
    expect(jobs[0].id).toBe(jobs[1].id);
    await f.subscriptions.runStep(f.org.id, jobs[0].id);
    expect(f.sends).toHaveLength(1);
    await launch();
    expect(f.sends).toHaveLength(1);
    const scope = await f.scopes.read(f.org.id, f.user.id, f.threadId, f.scopeInput.id, f.provider.runtime.now());
    expect(scope.claims).toHaveLength(1);
    await expect(f.controls.launchScoped(f.org.id, f.user.id, 'other-chat', f.scopeInput.id, approval.id)).rejects.toThrow();
  } finally {await f.close();}
});

integration('changed source/profile and foreign actor refuse before a provider effect', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2();
    await expect(f.controls.listProfiles(f.org.id, f.otherUser.id, f.connectionId)).rejects.toThrow();
    const change = {...f.profileInput, expectedRevision: 1, displayName: 'Илья Примеров — ведущий'};
    const proposed = await f.controls.proposeProfile(f.org.id, f.user.id, change);
    await f.controls.saveProfile(f.org.id, f.user.id, {profile: change, selectionDigest: proposed.selectionDigest}, 'authenticated_screen_action');
    await expect(f.approveV2(d)).rejects.toMatchObject({response: {code: 'VIDEO_PROFILE_CHANGED'}});
    expect(f.sends).toHaveLength(0);
  } finally {await f.close();}
});

integration('new settings invalidate approval and source changes block the already admitted V2 worker', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2(), approval = await f.approveV2(d);
    const changed = await f.controls.prepareSettings(f.org.id, f.user.id, {draftId: d.id, version: d.version,
      connectionId: f.connectionId, profileId: f.profile.profileId, overrides: {voiceSettings: {speed: 1.1}}});
    await expect(f.access.launch(f.org.id, f.user.id, {preflightId: approval.id, intentId: randomUUID()})).rejects.toThrow();
    const fresh = await f.approveV2(changed);
    const job = await f.access.launch(f.org.id, f.user.id, {preflightId: fresh.id, intentId: randomUUID()});
    await f.db.contentPiece.update({where: {id: f.pieceId}, data: {body: SCRIPT + ' Изменено.'}});
    await f.subscriptions.runStep(f.org.id, job.id);
    expect(f.sends).toHaveLength(0);
    const retained = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(retained.submitAttempts).toBe(0);
  } finally {await f.close();}
});


integration('Stop blocks an admitted scoped job before the physical provider dispatch and retains its history', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2(), approval = await f.approveV2(d);
    await f.controls.authorizeScope(f.org.id, f.user.id, f.threadId, f.scopeInput, 'actual-human-confirmation');
    const job = await f.controls.launchScoped(f.org.id, f.user.id, f.threadId, f.scopeInput.id, approval.id);
    await f.scopes.stop(f.org.id, f.user.id, f.threadId, f.scopeInput.id, f.provider.runtime.now());
    await f.subscriptions.runStep(f.org.id, job.id);
    const retained = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(retained.submitAttempts).toBe(0);
    expect(f.sends).toHaveLength(0);
    expect(retained.errorCode).toBe('VIDEO_AUTOPILOT_SCOPE_STOPPED');
    await expect(f.controls.launchScoped(f.org.id, f.user.id, f.threadId, f.scopeInput.id, approval.id)).rejects.toThrow();
  } finally {await f.close();}
});

integration('lost V2 submit response recovers the saved exact receipt without a second generation', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2(), approval = await f.approveV2(d);
    const job = await f.access.launch(f.org.id, f.user.id, {preflightId: approval.id, intentId: randomUUID()});
    f.provider.mcp.renderHeygenAvatarV2 = async (_d, _t, args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); f.sends.push(structuredClone(args));
      await hooks.afterResponse({id: 'synthetic_retained_v2'});
      throw new Error('Synthetic lost response after durable receipt');
    };
    await f.subscriptions.runStep(f.org.id, job.id);
    await f.subscriptions.runStep(f.org.id, job.id);
    const retained = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(f.sends).toHaveLength(1);
    expect(retained.submitAttempts).toBe(1);
    expect(retained.receipt.id).toBe('synthetic_retained_v2');
    expect(retained.request.recipe.speech).toBe(SCRIPT);
    expect(f.sends[0].script).toBe(SCRIPT);
  } finally {await f.close();}
});

integration('scope quotas and expert attempts use real CAS; foreign reads and API fallback are refused', async () => {
  const f = await fixture(); try {
    const d = await f.prepareV2(), approval = await f.approveV2(d);
    await expect(f.access.attach(f.org.id, f.user.id, {draftId: d.id, version: d.version, mediaId: randomUUID()}))
      .rejects.toMatchObject({response: {code: 'VIDEO_HEYGEN_PERSONAL_ROUTE_REQUIRED'}});
    await expect(f.access.preflight(f.org.id, f.user.id, {draftId: d.id, version: d.version, access: {kind: 'api', payer: 'workspace_key'}}))
      .rejects.toMatchObject({response: {code: 'VIDEO_HEYGEN_PERSONAL_ROUTE_REQUIRED'}});
    await expect(f.service.readDraft(f.org.id, d.id, f.otherUser.id)).rejects.toThrow();
    await f.controls.authorizeScope(f.org.id, f.user.id, f.threadId, f.scopeInput, 'actual-human-confirmation');
    await Promise.all([f.scopes.claimExpertAttempt(f.org.id, f.user.id, f.threadId, f.scopeInput.id, 'expert-one', f.provider.runtime.now()),
      f.scopes.claimExpertAttempt(f.org.id, f.user.id, f.threadId, f.scopeInput.id, 'expert-one', f.provider.runtime.now())]);
    await expect(f.scopes.claimExpertAttempt(f.org.id, f.user.id, f.threadId, f.scopeInput.id, 'expert-two', f.provider.runtime.now())).rejects.toThrow();
    const row = await f.db.videoAccessPreflight.findUnique({where: {id: approval.id}}), b = row.request.recipe.binding;
    const expected = {preflightId: approval.id, recipeHash: row.request.recipe.recipeHash, subjectDigest: b.subjectDigest,
      connectionId: b.connectionId, profileId: b.profileId, profileRevision: b.profileRevision, profileDigest: b.profileDigest,
      pieceId: b.sourcePin.pieceId, sourceRevision: b.sourcePin.sourceRevision, approvalExpiresAt: approval.expiresAt};
    const results = await Promise.allSettled([f.scopes.claim(f.org.id, f.user.id, f.threadId, f.scopeInput.id, expected, f.provider.runtime.now()),
      f.scopes.claim(f.org.id, f.user.id, f.threadId, f.scopeInput.id, {...expected, preflightId: randomUUID()}, f.provider.runtime.now())]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const scope = await f.scopes.read(f.org.id, f.user.id, f.threadId, f.scopeInput.id, f.provider.runtime.now());
    expect(scope.claims).toHaveLength(1); expect(scope.expertAttempts).toEqual(['expert-one']);
    const job = await f.access.launch(f.org.id, f.user.id, {preflightId: approval.id, intentId: randomUUID()});
    await expect(f.access.get(f.org.id, f.otherUser.id, job.id)).rejects.toThrow();
    expect((await f.access.list(f.org.id, f.otherUser.id)).some(value => value.id === job.id)).toBe(false);
  } finally {await f.close();}
});
