const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {create, FIXTURE_CDN} = require('./helpers/video-subscription-domain.fixture.cjs');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const LIB = 'libraries/nestjs-libraries/src/';
const native = load(`${LIB}videos/subscriptions/video-heygen-avatar-native.v1.ts`);
const DB = process.env.CF_VIDEO_DATABASE_URL;
const integration = DB ? test : test.skip;
const SUBTITLE_URL = 'https://93.184.216.34/native-captions.srt?private=signed-provider-link';
const SRT = Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nПривет!\n\n2\n00:00:01,000 --> 00:00:02,000\nДо встречи.\n', 'utf8');
jest.setTimeout(45000);

test('native status preserves validated HTTPS sidecar privately and retains MP4 on malformed subtitle URLs', () => {
  const status = {id: 'owned_result', status: 'completed', video_url: FIXTURE_CDN, duration: 20};
  expect(native.decodeHeygenVideoV1({...status, subtitle_url: SUBTITLE_URL}, status.id)).toMatchObject({url: FIXTURE_CDN, subtitleUrl: SUBTITLE_URL});
  for (const url of ['http://example.com/sub.srt', 'https://user:pass@example.com/sub.srt', 'https://example.com/sub.srt#fragment', {}, 'x'.repeat(8193)]) {
    const result = native.decodeHeygenVideoV1({...status, subtitle_url: url}, status.id);
    expect(result).toMatchObject({state: 'completed', url: FIXTURE_CDN, subtitleError: 'VIDEO_PROVIDER_SUBTITLE_INVALID'});
    expect(result).not.toHaveProperty('subtitleUrl');
  }
});

test('video download header preserves Unicode title with a stable ASCII fallback and encodes header metacharacters', async () => {
  const policies = load('apps/backend/src/services/auth/permissions/permissions.ability.ts');
  const exceptions = load('apps/backend/src/services/auth/permissions/permission.exception.class.ts');
  const {VideoAccessController} = load('apps/backend/src/api/routes/video-access.controller.ts', {
    '@contentfactory/nestjs-libraries/videos/video-access.service': {VideoAccessService: class {}},
    '@contentfactory/backend/services/auth/permissions/permissions.ability': policies,
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': exceptions,
  });
  const id = '11111111-1111-4111-8111-111111111111';
  const bytes = Buffer.from('owned-bytes');
  for (const name of [`video-${id}.mp4`, 'Приглашение на саммит.mp4', 'Клип "Встреча" (2026) O\'Brien*.mp4', 'unsafe\r\nInjected: value.mp4']) {
    const access = {download: jest.fn(async () => ({name, bytes}))};
    const controller = new VideoAccessController(access), headers = {};
    let downloaded;
    await controller.download({id: 'org'}, {id: 'actor'}, id, {setHeader: (key, value) => {headers[key] = value;}, send: value => {downloaded = value;}});
    expect(access.download).toHaveBeenCalledWith('org', 'actor', id);
    const header = headers['Content-Disposition'];
    expect(header).toMatch(new RegExp(`^attachment; filename="video-${id}\\.mp4"`));
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    expect(downloaded).toBe(bytes);
    if (name === `video-${id}.mp4`) expect(header).toBe(`attachment; filename="${name}"`);
    else {
      const extended = header.split("filename*=UTF-8''")[1];
      expect(decodeURIComponent(extended)).toBe(name);
      expect(extended).not.toMatch(/['()*\r\n]/);
    }
  }
});

/** Actual V2 admission, PostgreSQL, byte validation and local owned storage; only provider/network is synthetic. */
async function fixture(captions = 'sidecar') {
  const f = await create(DB);
  try {
    const connected = await f.connect('heygen', {limits: false});
    const definition = f.provider.runtime.definition.bind(f.provider.runtime);
    f.provider.runtime.definition = name => name === 'heygen' ? {...definition(name), enabled: false,
      identityEndpoint: undefined, schemaDigests: [], ownedAssetReadProfile: 'heygen_private_catalog_v1'} : definition(name);
    await f.db.videoSubscriptionConnection.update({where: {id: connected.connectionId}, data: {state: 'discovery_required', walletDigest: `unverified:${randomUUID()}`}});
    const account = {subjectDigest: 'a'.repeat(64), billingType: 'subscription', plan: 'creator', remaining: '200', resetAt: null};
    const look = {id: 'owned_look', name: 'Studio', ownership: 'owned', state: 'available', selectableForDraft: true,
      groupId: 'owned_group', avatarType: 'photo_avatar', groupType: 'digital_twin', consentStatus: 'accepted', engines: ['avatar_iv'], locales: []};
    const voice = {id: 'owned_voice', name: 'Owned voice', ownership: 'owned', state: 'available', selectableForDraft: true, engines: [], locales: ['ru'], language: 'Russian'};
    const mcp = f.provider.mcp;
    mcp.readHeygenAccountV1 = async (_d, _t, guard) => {await guard(); return structuredClone(account);};
    mcp.readHeygenOwnedCatalog = async (_d, _t, guard) => {await guard(); return {catalog: {scope: 'authenticated_private_account', readOnly: true,
      renderQualified: false, avatars: [look], voices: [voice]}, avatars: [], voices: []};};
    mcp.readHeygenOwnedAvatarGroup = async (_d, _t, input, guard) => {await guard(); return {...input, consentState: 'accepted'};};
    const sends = [];
    mcp.renderHeygenAvatarV2 = async (_d, _t, args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); sends.push(structuredClone(args));
      await hooks.afterResponse({id: 'synthetic_native_subtitle'}); return {id: 'synthetic_native_subtitle'};
    };
    const status = {id: 'synthetic_native_subtitle', status: 'completed', video_url: FIXTURE_CDN, subtitle_url: SUBTITLE_URL, duration: 20};
    mcp.readHeygenVideoV1 = jest.fn(async (_d, _t, id, guard) => {await guard(); return native.decodeHeygenVideoV1(status, id);});
    const {SocialFactoryRepository} = load(`${LIB}content-intelligence/social-factory/social-factory.repository.ts`);
    const store = new SocialFactoryRepository({model: f.db}, {model: f.db});
    const {HeygenPersonProfileServiceV1} = load(`${LIB}videos/subscriptions/video-heygen-person-profile.service.v1.ts`);
    const profiles = new HeygenPersonProfileServiceV1(store, f.connections);
    f.access.heygenProfiles = profiles; f.subscriptions.heygenProfiles = profiles;
    const {HeygenChatControlsServiceV1} = load(`${LIB}videos/subscriptions/video-heygen-chat-controls.service.v1.ts`, {
      '../../content-intelligence/social-factory/autonomy/editorial-decision.service': {EditorialDecisionService: class {}},
    });
    const controls = new HeygenChatControlsServiceV1(profiles, f.access, {}, {});
    const profileInput = {profileId: randomUUID(), expectedRevision: 0, connectionId: connected.connectionId,
      displayName: 'Synthetic Person', aliases: [], preferredForName: false, groupIds: ['owned_group'], preferredGroupId: 'owned_group',
      sourceLooks: [{groupId: look.groupId, lookId: look.id, roles: ['style_base', 'appearance']}],
      preferredSourceLookId: look.id, defaultAppearanceLookId: look.id, defaultVoice: {voiceId: voice.id, baseline: {speed: 1}}};
    const proposed = await controls.proposeProfile(f.org.id, f.user.id, profileInput);
    const profile = await controls.saveProfile(f.org.id, f.user.id, {profile: profileInput, selectionDigest: proposed.selectionDigest}, 'authenticated_screen_action');
    const script = 'Привет! До встречи.';
    await f.db.contentPiece.update({where: {id: f.pieceId}, data: {body: script, title: 'Synthetic subtitle test', language: 'ru-RU',
      brief: {brief: {inputKind: 'thought', facts: [{statement: script, evidenceId: 'authored', origin: 'person', verified: true}]}}}});
    const initial = await f.service.prepare(f.org.id, f.user.id, {pieceId: f.pieceId,
      settings: {...f.presenterSettings, locale: 'ru-RU', duration: 20, avatarId: look.id, voiceId: voice.id, engine: 'avatar_iv'},
      prepareWithAi: false, scriptPolicy: 'exact', intent: 'Keep exact speech.'});
    const draft = await controls.prepareSettings(f.org.id, f.user.id, {draftId: initial.id, version: initial.version,
      connectionId: connected.connectionId, profileId: profile.profileId, overrides: {captions,title:'Проверочное приглашение — ведущий'}});
    const approval = await f.access.preflight(f.org.id, f.user.id, {draftId: draft.id, version: draft.version, access: {kind: 'subscription', connectionId: connected.connectionId}});
    const job = await f.access.launch(f.org.id, f.user.id, {preflightId: approval.id, intentId: randomUUID()});
    const transportFetch = f.transport.fetch;
    const downloads = {count: 0, bytes: SRT, fail: false};
    f.transport.fetch = async (value, options) => {
      if (String(value) === SUBTITLE_URL) {
        downloads.count++;
        return downloads.fail ? new Response(null, {status: 503}) : new Response(downloads.bytes, {headers: {'content-type': 'text/plain'}});
      }
      return transportFetch(value, options);
    };
    return Object.assign(f, {job, sends, status, downloads, mcp});
  } catch (error) {await f.close(); throw error;}
}

integration.each(['sidecar', 'burned'])('%s stores actual validated subtitle bytes as job-owned Media and denies foreign/corrupt downloads', async captions => {
  const f = await fixture(captions); try {
    const result = await f.runSubscriptionToTerminal(f.job.id);
    expect(result.state).toBe('completed'); expect(f.sends).toHaveLength(1);
    const video = await f.access.download(f.org.id, f.user.id, f.job.id);
    expect(video.name).toBe(result.result.name); expect(video.bytes).toEqual(f.mp4);
    // Old route projections retain their historical generic artifact names, even with a display name in Media.
    for (const kind of ['api', 'manual', 'subscription-v1']) {
      const legacy = Object.create(f.access.constructor.prototype);
      legacy.get = async () => ({state: 'completed', access: {kind}, result: result.result});
      legacy.repository = {db: {videoSubscriptionJob: {findFirst: async () => null}}};
      legacy.media = f.service.media;
      expect((await legacy.download(f.org.id, f.user.id, f.job.id)).name).toBe(`video-${f.job.id}.mp4`);
    }
    expect(result.result.name).toBe('Проверочное приглашение — ведущий.mp4');
    expect(result.subtitles).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('signed-provider-link');
    const subtitle = result.subtitles[0];
    expect(subtitle).toMatchObject({id: subtitle.mediaId, mimeType: 'application/x-subrip'});
    const file = await f.access.downloadSubtitle(f.org.id, f.user.id, f.job.id, subtitle.id);
    expect(file.bytes).toEqual(SRT); expect(file.mimeType).toBe('application/x-subrip'); expect(file.name).toMatch(/\.srt$/);
    const row = await f.db.videoSubscriptionJob.findUnique({where: {id: f.job.id}});
    expect(row.storedFile.subtitle).toMatchObject({mediaId: subtitle.id, cueCount: 2, source: 'provider_subtitle_file'});
    expect(await f.db.media.count({where: {organizationId: f.org.id, type: 'subtitle'}})).toBe(1);
    await expect(f.access.downloadSubtitle(f.org.id, f.otherUser.id, f.job.id, subtitle.id)).rejects.toThrow();
    await expect(f.access.downloadSubtitle(f.otherOrg.id, f.user.id, f.job.id, subtitle.id)).rejects.toThrow();
    await expect(f.access.downloadSubtitle(f.org.id, f.user.id, randomUUID(), subtitle.id)).rejects.toThrow();
    await expect(f.access.downloadSubtitle(f.org.id, f.user.id, f.job.id, randomUUID())).rejects.toThrow();
    await f.subscriptions.runStep(f.org.id, f.job.id);
    expect(f.sends).toHaveLength(1); expect(f.downloads.count).toBe(1);
    const subtitlePath = path.join(process.env.UPLOAD_DIRECTORY, new URL(subtitle.path).pathname.slice('/uploads/'.length));
    fs.writeFileSync(subtitlePath, 'changed bytes');
    await expect(f.access.downloadSubtitle(f.org.id, f.user.id, f.job.id, subtitle.id)).rejects.toMatchObject({response: {code: 'VIDEO_OWNED_FILE_UNAVAILABLE'}});
  } finally {await f.close();}
});

integration('invalid timed cues preserve MP4 and retry-save completes without downloading MP4 or rendering again', async () => {
  const f = await fixture(); try {
    f.downloads.bytes = Buffer.from('1\n00:00:00,000 --> 01:00:00,000\nBeyond the actual duration.\n');
    const failed = await f.runSubscriptionToTerminal(f.job.id);
    expect(failed).toMatchObject({state: 'save_failed', errorCode: 'VIDEO_SUBTITLES_INVALID', subtitles: []});
    expect(failed.result.type).toBe('video');
    expect((await f.access.download(f.org.id, f.user.id, f.job.id)).bytes).toEqual(f.mp4);
    const first = await f.db.videoSubscriptionJob.findUnique({where: {id: f.job.id}});
    expect((await f.service.media.readOwned(first.storedFile.path))).toEqual(f.mp4);
    expect(await f.db.media.count({where: {organizationId: f.org.id, type: 'subtitle'}})).toBe(0);
    // The old link keeps serving malformed bytes; recovery must read the same receipt for its new artifact URL.
    const refreshedUrl = 'https://93.184.216.34/refreshed-native-captions.srt';
    f.status.subtitle_url = refreshedUrl;
    const transportFetch = f.transport.fetch;
    f.transport.fetch = (url, options) => String(url) === refreshedUrl ? Promise.resolve(new Response(SRT)) : transportFetch(url, options);
    await Promise.allSettled([f.access.action(f.org.id, f.user.id, f.job.id, 'retry-save'), f.access.action(f.org.id, f.user.id, f.job.id, 'retry-save')]);
    const recovered = await f.runSubscriptionToTerminal(f.job.id);
    expect(recovered.state).toBe('completed'); expect(recovered.result.id).toBe(first.resultMediaId);
    expect(f.sends).toHaveLength(1); expect(f.transport.downloads).toHaveLength(1);
    expect(await f.db.media.count({where: {organizationId: f.org.id, type: 'video'}})).toBe(1);
    expect(await f.db.media.count({where: {organizationId: f.org.id, type: 'subtitle'}})).toBe(1);
  } finally {await f.close();}
});

integration('subtitle Media transaction rollback retains owned subtitle file for save-only replay', async () => {
  const f = await fixture(); try {
    await f.subscriptions.runStep(f.org.id, f.job.id); await f.subscriptions.runStep(f.org.id, f.job.id);
    const transaction = f.subscriptionRepository.transaction.bind(f.subscriptionRepository);
    let fail = true;
    f.subscriptionRepository.transaction = fn => transaction(async tx => {
      const result = await fn(tx);
      if (fail && await tx.media.count({where: {organizationId: f.org.id, type: 'subtitle'}})) {fail = false; throw new Error('Synthetic rollback after caption Media create');}
      return result;
    });
    const failed = await f.subscriptions.runStep(f.org.id, f.job.id);
    expect(failed.state).toBe('save_failed');
    const captured = await f.db.videoSubscriptionJob.findUnique({where: {id: f.job.id}});
    expect(captured.resultMediaId).toBeTruthy(); expect(captured.storedFile.subtitle.path).toBeTruthy();
    expect(captured.storedFile.subtitle.mediaId).toBeUndefined();
    expect(await f.db.media.count({where: {organizationId: f.org.id, type: 'subtitle'}})).toBe(0);
    f.downloads.fail = true;
    await f.access.action(f.org.id, f.user.id, f.job.id, 'retry-save');
    const result = await f.runSubscriptionToTerminal(f.job.id);
    expect(result.state).toBe('completed'); expect(result.result.id).toBe(captured.resultMediaId);
    expect(f.downloads.count).toBe(1); expect(f.sends).toHaveLength(1);
    expect(await f.db.media.count({where: {organizationId: f.org.id, type: 'subtitle'}})).toBe(1);
  } finally {await f.close();}
});

integration('unsafe provider sidecar and download failures retain video for later save-only recovery', async () => {
  const f = await fixture(); try {
    f.status.subtitle_url = 'http://127.0.0.1/private.srt';
    const unsafe = await f.runSubscriptionToTerminal(f.job.id);
    expect(unsafe).toMatchObject({state: 'save_failed', errorCode: 'VIDEO_PROVIDER_SUBTITLE_INVALID'});
    expect(unsafe.result.type).toBe('video'); expect(f.downloads.count).toBe(0);
    f.status.subtitle_url = SUBTITLE_URL;
    f.downloads.fail = true;
    await f.access.action(f.org.id, f.user.id, f.job.id, 'retry-save');
    expect((await f.runSubscriptionToTerminal(f.job.id)).state).toBe('save_failed');
    f.downloads.fail = false;
    await f.access.action(f.org.id, f.user.id, f.job.id, 'retry-save');
    const result = await f.runSubscriptionToTerminal(f.job.id);
    expect(result.state).toBe('completed'); expect(f.sends).toHaveLength(1); expect(f.transport.downloads).toHaveLength(1);
  } finally {await f.close();}
});
