const {randomUUID} = require('node:crypto');
const {create, FIXTURE_CDN} = require('./helpers/video-subscription-domain.fixture.cjs');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const {videoErrorV1, validateVideoGroundingV1} = load('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
const {decodeHeygenAvatarReceiptV1} = load('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-avatar-native.v1.ts');
const DB = process.env.CF_VIDEO_DATABASE_URL;
const integration = DB ? test : test.skip;
const SCRIPT = 'Join me at MegaCampus Summit. Meet ambitious founders, exchange ideas, and discover the next step for your business. I look forward to seeing you there.';
const voiceRejectionResponse = () => {
  const payload = {error: true, status_code: 403, retryable: false, error_code: 'voice_not_usable',
    message: 'PRIVATE_SYNTHETIC_PROVIDER_DIAGNOSTIC: This voice failed to process.', doc_url: 'https://developers.heygen.com/docs/errors'};
  return {kind: 'http', status: 200, body: JSON.stringify({jsonrpc: '2.0', id: 1,
    result: {isError: true, structuredContent: payload, content: [{type: 'text', text: JSON.stringify(payload)}]}})};
};
jest.setTimeout(30000);

/** Real disposable PostgreSQL, services and owned MP4 storage; only provider/account responses are synthetic. */
async function fixture() {
  const f = await create(DB);
  try {
    const connected = await f.connect('heygen', {limits: false});
    const originalDefinition = f.provider.runtime.definition.bind(f.provider.runtime);
    f.provider.runtime.definition = name => name === 'heygen'
      ? {...originalDefinition(name), enabled: false, identityEndpoint: undefined, schemaDigests: [], ownedAssetReadProfile: 'heygen_private_catalog_v1'}
      : originalDefinition(name);
    await f.db.videoSubscriptionConnection.update({where: {id: connected.connectionId},
      data: {state: 'discovery_required', walletDigest: `unverified:${randomUUID()}`}});
    const native = {
      connectionId: connected.connectionId, creates: 0,
      account: {subjectDigest: 'a'.repeat(64), billingType: 'subscription', plan: 'creator', remaining: '200', resetAt: '2030-12-06T00:00:00.000Z'},
      avatar: {id: 'owned_photo_look', groupId: 'owned_photo_group', name: 'Owned speaker', ownership: 'owned', selectableForDraft: true,
        state: 'available', engines: ['avatar_iv'], locales: [], avatarType: 'photo_avatar'},
      voice: {id: 'owned_voice', name: 'Owned multilingual voice', ownership: 'owned', state: 'available', locales: ['ru'], engines: []},
      consentState: 'accepted', resultId: 'synthetic_native_video',
    };
    const mcp = f.provider.mcp;
    mcp.readHeygenAccountV1 = jest.fn(async (_def, _token, guard) => {await guard(); return structuredClone(native.account);});
    mcp.readHeygenOwnedCatalog = jest.fn(async (_def, _token, guard) => {
      await guard(); return {catalog: {scope: 'authenticated_private_account', readOnly: true, renderQualified: false,
        avatars: [structuredClone(native.avatar)], voices: [structuredClone(native.voice)]}, avatars: [], voices: []};
    });
    mcp.readHeygenOwnedAvatarGroup = jest.fn(async (_def, _token, selected, guard) => {
      await guard(); return {avatarId: selected.avatarId, groupId: selected.groupId, consentState: native.consentState};
    });
    const receipt = () => ({kind: 'http', status: 200, body: JSON.stringify({jsonrpc: '2.0', id: 1,
      result: {content: [{type: 'text', text: JSON.stringify({id: native.resultId})}]}})});
    mcp.renderHeygenAvatarV1 = jest.fn(async (_def, _token, args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); native.creates++;
      expect(args.script).toBe(SCRIPT); expect(args.engine).toEqual({type: 'avatar_iv'});
      await hooks.afterResponse(receipt());
      return {id: native.resultId};
    });
    mcp.readHeygenVideoV1 = jest.fn(async (_def, _token, id, guard) => {
      await guard(); expect(id).toBe(native.resultId);
      return {jobId: id, state: 'completed', url: FIXTURE_CDN, actualCost: null, durationSeconds: 20};
    });
    await f.db.contentPiece.update({where: {id: f.pieceId}, data: {title: 'MegaCampus Summit invitation', body: SCRIPT,
      language: 'en-US', brief: {brief: {inputKind: 'thought', facts: [{statement: SCRIPT, evidenceId: 'authored-invitation', origin: 'person', verified: true}]}}}});
    const settings = {...f.presenterSettings, locale: 'en-US', duration: 20, avatarId: native.avatar.id, voiceId: native.voice.id, engine: 'avatar_iv'};
    const prepare = () => f.service.prepare(f.org.id, f.user.id, {pieceId: f.pieceId, settings, prepareWithAi: false, scriptPolicy: 'exact', intent: 'Use the exact authored invitation.'});
    const draft = await prepare();
    const preflight = (selected = draft, org = f.org.id, actor = f.user.id) => f.access.preflight(org, actor,
      {draftId: selected.id, version: selected.version, access: {kind: 'subscription', connectionId: native.connectionId}});
    const launch = (approval, intentId = randomUUID()) => f.access.launch(f.org.id, f.user.id, {preflightId: approval.id, intentId});
    return Object.assign(f, {native, mcp, draft, settings, receipt, prepareNative: prepare, preflightNative: preflight, launchNative: launch});
  } catch (error) {await f.close(); throw error;}
}

integration('native preflight preserves unknown price and observed credits without enabling generic generation or changing limits', async () => {
  const f = await fixture(); try {
    const approval = await f.preflightNative();
    expect(approval.quote).toMatchObject({amount: null, upperBound: null, source: 'unavailable', unit: 'heygen_credit'});
    expect(approval.remaining).toBe('200'); expect(approval.perMonth).toBeNull();
    expect(approval).toMatchObject({unknownPrice: true, providerBillingCap: false, maximumJobs: 1, billing: 'personal_subscription'});
    expect(approval.brief.script).toBe(SCRIPT); expect(f.transport.textCalls).toHaveLength(0);
    const connection = await f.db.videoSubscriptionConnection.findUnique({where: {id: f.native.connectionId}});
    expect(connection).toMatchObject({state: 'discovery_required', perJob: null, perMonth: null});
    expect(f.provider.runtime.definition('heygen').enabled).toBe(false); expect(f.native.creates).toBe(0);
  } finally {await f.close();}
});

integration('native preflight rejects foreign actor, workspace, missing grant, stale source, unaccepted consent and failed selected avatar', async () => {
  const f = await fixture(); try {
    await expect(f.preflightNative(f.draft, f.org.id, f.otherUser.id)).rejects.toMatchObject({response: {code: 'VIDEO_ACCESS_DENIED'}});
    await expect(f.preflightNative(f.draft, f.otherOrg.id, f.user.id)).rejects.toThrow();
    await f.db.videoSubscriptionGrant.update({where: {connectionId_organizationId: {connectionId: f.native.connectionId, organizationId: f.org.id}}, data: {enabled: false}});
    await expect(f.preflightNative()).rejects.toMatchObject({response: {code: 'VIDEO_REAUTH_REQUIRED'}});
    await f.db.videoSubscriptionGrant.update({where: {connectionId_organizationId: {connectionId: f.native.connectionId, organizationId: f.org.id}}, data: {enabled: true}});
    f.native.consentState = 'pending';
    await expect(f.preflightNative()).rejects.toMatchObject({response: {code: 'VIDEO_AVATAR_CONSENT_UNVERIFIED'}});
    f.native.consentState = 'accepted'; f.native.avatar.state = 'failed';
    await expect(f.preflightNative()).rejects.toMatchObject({response: {code: 'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE'}});
    f.native.avatar.state = 'available';
    await f.db.contentPiece.update({where: {id: f.pieceId}, data: {body: `${SCRIPT} Edited source.`}});
    await expect(f.preflightNative()).rejects.toMatchObject({response: {code: 'VIDEO_SOURCE_CHANGED'}});
    expect(f.native.creates).toBe(0); expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(0);
  } finally {await f.close();}
});

integration.each([['one preflight', true], ['different preflights', false]])('concurrent launches from %s admit only one native job per saved draft version', async (_scenario, samePreflight) => {
  const f = await fixture(); try {
    const a = await f.preflightNative(), b = samePreflight ? a : await f.preflightNative();
    const admitted = await Promise.all([f.launchNative(a), f.launchNative(b)]);
    expect(new Set(admitted.map(job => job.id)).size).toBe(1);
    const replay = await Promise.all([f.launchNative(a), f.launchNative(a)]);
    expect(replay.every(job => job.id === admitted[0].id)).toBe(true);
    const newest = await f.preflightNative();
    expect((await f.launchNative(newest)).id).toBe(admitted[0].id);
    const row = await f.db.videoSubscriptionJob.findUnique({where: {id: admitted[0].id}});
    expect(row.reserved.toFixed()).toBe('200'); expect(row.actualCost).toBeNull(); expect(row.submitAttempts).toBe(0);
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(1); expect(f.native.creates).toBe(0);
  } finally {await f.close();}
});

integration('native execution persists one raw HTTP receipt before decode and saves a real owned Media result through existing storage', async () => {
  const f = await fixture(); try {
    const approval = await f.preflightNative(), job = await f.launchNative(approval);
    f.mcp.renderHeygenAvatarV1.mockImplementation(async (_def, _token, _args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); f.native.creates++;
      const marked = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
      expect(marked.state).toBe('submitting'); expect(marked.submitAttempts).toBe(1);
      await hooks.afterResponse(f.receipt());
      const durable = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
      expect(durable.receipt.raw).toEqual(f.receipt()); expect(durable.receipt.id).toBeUndefined();
      expect(durable.receipt.submitAttemptId).toBe(durable.snapshot.submitAttempt.id);
      return decodeHeygenAvatarReceiptV1(durable.receipt.raw);
    });
    const result = await f.runSubscriptionToTerminal(job.id);
    expect(result.state).toBe('completed'); expect(f.native.creates).toBe(1);
    expect(result.cost).toMatchObject({amount: null, unit: 'heygen_credit', certainty: 'unknown'});
    const row = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(row.submitAttempts).toBe(1); expect(row.receipt.id).toBe(f.native.resultId); expect(row.resultMediaId).toBe(result.result.id);
    const media = await f.db.media.findUnique({where: {id: row.resultMediaId}});
    expect(media.organizationId).toBe(f.org.id); expect(media.type).toBe('video'); expect(media.originalName).toContain('Owned speaker');
    expect((await f.access.download(f.org.id, f.user.id, job.id)).bytes).toEqual(f.mp4);
    expect((await f.access.get(f.org.id, f.user.id, job.id)).result.id).toBe(media.id);
    await f.subscriptions.runStep(f.org.id, job.id); expect(f.native.creates).toBe(1);
    expect(f.provider.state.submits).toHaveLength(0); expect(f.transport.submits).toHaveLength(0);
  } finally {await f.close();}
});

integration('lost native response remains uncertain across replay and restart without another create or another draft admission', async () => {
  const f = await fixture(); try {
    const approval = await f.preflightNative(), job = await f.launchNative(approval);
    f.mcp.renderHeygenAvatarV1.mockImplementation(async (_def, _token, _args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); f.native.creates++;
      throw new Error('Synthetic transport lost after dispatch');
    });
    expect((await f.subscriptions.runStep(f.org.id, job.id)).state).toBe('submission_unknown');
    expect((await f.launchNative(approval)).id).toBe(job.id);
    expect((await f.launchNative(await f.preflightNative())).id).toBe(job.id);
    const uncertain = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(uncertain.state).toBe('submission_unknown'); expect(uncertain.submitAttempts).toBe(1);
    expect(uncertain.actualCost).toBeNull(); expect(uncertain.reserved.toFixed()).toBe('200');
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id, state: 'canceled'}})).toBe(0);
    f.restartSubscriptions();
    expect(await f.subscriptions.runStep(f.org.id, job.id)).toMatchObject({state: 'submission_unknown', done: true});
    expect(f.native.creates).toBe(1);
    const second = await f.prepareNative(), secondApproval = await f.preflightNative(second);
    await expect(f.launchNative(secondApproval)).rejects.toMatchObject({response: {code: 'VIDEO_PERSONAL_ACCOUNT_BUSY'}});
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(1);
  } finally {await f.close();}
});

integration('fresh native preflight retries a proven unsent refusal while old approval replays stay retired and unsent', async () => {
  const f = await fixture(); try {
    const originalApproval = await f.preflightNative(), original = await f.launchNative(originalApproval);
    f.mcp.renderHeygenAvatarV1.mockImplementationOnce(async () => videoErrorV1('VIDEO_SCHEMA_CHANGED', 409));
    expect((await f.subscriptions.runStep(f.org.id, original.id)).state).toBe('access_unavailable');
    const refused = await f.db.videoSubscriptionJob.findUnique({where: {id: original.id}});
    expect(refused.submitAttempts).toBe(0); expect(refused.receipt).toBeNull(); expect(f.native.creates).toBe(0);
    expect((await f.launchNative(originalApproval)).id).toBe(original.id);
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(1);
    const freshApproval = await f.preflightNative(), replacement = await f.launchNative(freshApproval);
    expect(replacement.id).not.toBe(original.id); expect(replacement.state).toBe('accepted');
    const retired = await f.db.videoSubscriptionJob.findUnique({where: {id: original.id}});
    expect(retired.state).toBe('canceled'); expect(retired.submitAttempts).toBe(0); expect(retired.receipt).toBeNull();
    expect(retired.actualCost.toFixed()).toBe('0'); expect(retired.reserved.toFixed()).toBe('0'); expect(retired.costCertainty).toBe('not_submitted');
    expect((await f.launchNative(originalApproval)).id).toBe(original.id);
    expect(await f.subscriptions.runStep(f.org.id, original.id)).toMatchObject({state: 'canceled', done: true});
    expect(f.native.creates).toBe(0);
    expect((await f.subscriptions.runStep(f.org.id, replacement.id)).state).toBe('queued');
    expect(f.native.creates).toBe(1);
    const anotherApproval = await f.preflightNative();
    expect((await f.launchNative(anotherApproval)).id).toBe(replacement.id);
    expect((await f.launchNative(freshApproval)).id).toBe(replacement.id);
    expect((await f.launchNative(originalApproval)).id).toBe(original.id);
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(2);
    const active = await f.db.videoSubscriptionJob.findUnique({where: {id: replacement.id}});
    expect(active.submitAttempts).toBe(1); expect(active.receipt.id).toBe(f.native.resultId);
    expect(f.native.creates).toBe(1);
  } finally {await f.close();}
});

integration('consumed native alias approval keeps its original job after an unsent refusal and a fresh replacement', async () => {
  const f = await fixture(); try {
    const a = await f.preflightNative(), b = await f.preflightNative();
    const intentA = randomUUID(), intentB = randomUUID();
    const original = await f.launchNative(a, intentA);
    expect((await f.launchNative(b, intentB)).id).toBe(original.id);
    f.mcp.renderHeygenAvatarV1.mockImplementationOnce(async () => videoErrorV1('VIDEO_SCHEMA_CHANGED', 409));
    expect((await f.subscriptions.runStep(f.org.id, original.id)).state).toBe('access_unavailable');
    expect((await f.launchNative(b, intentB)).id).toBe(original.id);
    expect((await f.launchNative(b)).id).toBe(original.id);
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(1);
    expect(f.native.creates).toBe(0);
    const c = await f.preflightNative(), replacement = await f.launchNative(c);
    expect(replacement.id).not.toBe(original.id);
    expect((await f.launchNative(b, intentB)).id).toBe(original.id);
    expect((await f.launchNative(b)).id).toBe(original.id);
    expect((await f.launchNative(a, intentA)).id).toBe(original.id);
    expect((await f.subscriptions.runStep(f.org.id, replacement.id)).state).toBe('queued');
    expect(f.native.creates).toBe(1);
    // Previously consumed aliases remain read replays even after their approval expires.
    f.provider.advance(300001);
    expect((await f.launchNative(b, intentB)).id).toBe(original.id);
    expect((await f.launchNative(b)).id).toBe(original.id);
    expect((await f.launchNative(c)).id).toBe(replacement.id);
    const retired = await f.db.videoSubscriptionJob.findUnique({where: {id: original.id}});
    expect(retired.state).toBe('canceled'); expect(retired.submitAttempts).toBe(0); expect(retired.costCertainty).toBe('not_submitted');
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(2); expect(f.native.creates).toBe(1);
  } finally {await f.close();}
});

integration('expired 24-hour accepted native job remains proven unsent and permits a fresh approval replacement', async () => {
  const f = await fixture(); try {
    const oldApproval = await f.preflightNative(), original = await f.launchNative(oldApproval);
    await f.db.videoSubscriptionJob.update({where: {id: original.id}, data: {createdAt: new Date(f.provider.runtime.now().getTime() - 25 * 3600000)}});
    expect((await f.subscriptions.runStep(f.org.id, original.id)).state).toBe('access_unavailable');
    const expired = await f.db.videoSubscriptionJob.findUnique({where: {id: original.id}});
    expect(expired.submitAttempts).toBe(0); expect(expired.receipt).toBeNull(); expect(f.native.creates).toBe(0);
    expect((await f.launchNative(oldApproval)).id).toBe(original.id);
    const fresh = await f.preflightNative(), replacement = await f.launchNative(fresh);
    expect(replacement.id).not.toBe(original.id); expect(replacement.state).toBe('accepted');
    const retired = await f.db.videoSubscriptionJob.findUnique({where: {id: original.id}});
    expect(retired.state).toBe('canceled'); expect(retired.submitAttempts).toBe(0); expect(retired.actualCost.toFixed()).toBe('0');
    expect(retired.costCertainty).toBe('not_submitted');
    expect((await f.subscriptions.runStep(f.org.id, replacement.id)).state).toBe('queued');
    expect((await f.launchNative(oldApproval)).id).toBe(original.id);
    expect((await f.launchNative(await f.preflightNative())).id).toBe(replacement.id);
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(2); expect(f.native.creates).toBe(1);
  } finally {await f.close();}
});

integration('durable native response recovers its exact ID after a post-response failure without repeating create', async () => {
  const f = await fixture(); try {
    const job = await f.launchNative(await f.preflightNative());
    f.mcp.renderHeygenAvatarV1.mockImplementation(async (_def, _token, _args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); f.native.creates++;
      await hooks.afterResponse(f.receipt());
      videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
    });
    expect((await f.subscriptions.runStep(f.org.id, job.id)).state).toBe('queued');
    const row = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(row.receipt.id).toBe(f.native.resultId); expect(row.receipt.raw).toEqual(f.receipt());
    f.restartSubscriptions();
    expect((await f.runSubscriptionToTerminal(job.id)).state).toBe('completed'); expect(f.native.creates).toBe(1);
  } finally {await f.close();}
});

integration('native receipt recovery accepts a rotated grant only for the same authenticated account and retries saving the same video', async () => {
  const f = await fixture(); try {
    const job = await f.launchNative(await f.preflightNative());
    await f.subscriptions.runStep(f.org.id, job.id);
    await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: {state: 'reauth_required'}});
    const rotated = await f.db.videoSubscriptionConnection.update({where: {id: f.native.connectionId},
      data: {generation: {increment: 1}, tokenVersion: {increment: 1}}});
    f.native.account.subjectDigest = 'b'.repeat(64);
    await expect(f.access.action(f.org.id, f.user.id, job.id, 'resume')).rejects.toMatchObject({response: {code: 'VIDEO_CONNECTION_CHANGED'}});
    expect((await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}})).generation).not.toBe(rotated.generation);
    f.native.account.subjectDigest = 'a'.repeat(64);
    expect((await f.access.action(f.org.id, f.user.id, job.id, 'resume')).state).toBe('queued');
    const recovered = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(recovered.generation).toBe(rotated.generation); expect(recovered.snapshot.nativeRecovery.tokenVersion).toBe(rotated.tokenVersion);
    await f.subscriptions.runStep(f.org.id, job.id);
    f.transport.downloadFailures = 2;
    expect((await f.subscriptions.runStep(f.org.id, job.id)).state).toBe('save_failed');
    expect((await f.access.action(f.org.id, f.user.id, job.id, 'retry-save')).state).toBe('saving');
    expect((await f.runSubscriptionToTerminal(job.id)).state).toBe('completed');
    expect(f.native.creates).toBe(1); expect(f.mcp.readHeygenVideoV1.mock.calls.every(call => call[2] === f.native.resultId)).toBe(true);
  } finally {await f.close();}
});

integration('context-only source edit preserves the source revision and fact text while retaining unselected mandatory facts', async () => {
  const f = await fixture(); try {
    const sourceFacts = [
      {statement: 'The archived summit ran in 2024 with 120 speakers.', evidenceId: 'archived-dates', origin: 'person', verified: true},
      {statement: SCRIPT, evidenceId: 'current-invitation', origin: 'person', verified: true},
      {statement: 'Historical speakers are background material.', evidenceId: 'archived-speakers', origin: 'person', verified: true},
    ];
    await f.db.contentPiece.update({where: {id: f.pieceId}, data: {body: sourceFacts.map(fact => fact.statement).join('\n'),
      brief: {brief: {inputKind: 'thought', facts: sourceFacts}}}});
    const draft = await f.prepareNative();
    // Establish an additional mandatory claim through the existing full-brief editor.
    const selected = await f.service.updateDraft(f.org.id, f.user.id, draft.id, {version: draft.version,
      brief: {...draft.brief, facts: draft.brief.facts.map((fact, index) => index === 1 ? {...fact, policy: 'must_include'} : fact)}});
    const before = await f.db.videoPromptDraft.findUnique({where: {id: selected.id}});
    const sourceBefore = await f.db.contentPiece.findUnique({where: {id: f.pieceId}});
    const edited = await f.service.updateDraft(f.org.id, f.user.id, selected.id, {version: selected.version,
      script: SCRIPT, contextOnlySourceIds: [selected.brief.facts[0].sourceId]});
    const after = await f.db.videoPromptDraft.findUnique({where: {id: selected.id}});
    expect(edited.version).toBe(selected.version + 1); expect(edited.brief.script).toBe(SCRIPT);
    expect(after.pieceRevision).toBe(before.pieceRevision); expect(after.pieceId).toBe(before.pieceId);
    expect(edited.brief.sourceLocale).toBe(selected.brief.sourceLocale);
    expect(edited.brief.facts.map(({text, sourceId}) => ({text, sourceId}))).toEqual(selected.brief.facts.map(({text, sourceId}) => ({text, sourceId})));
    expect(edited.brief.facts.map(fact => fact.policy)).toEqual(['context_only', 'must_include', 'context_only']);
    expect(() => validateVideoGroundingV1(edited.brief, edited.settings)).not.toThrow();
    expect(await f.db.contentPiece.findUnique({where: {id: f.pieceId}})).toEqual(sourceBefore);
    expect(f.mcp.readHeygenAccountV1).not.toHaveBeenCalled(); expect(f.mcp.renderHeygenAvatarV1).not.toHaveBeenCalled();
    expect(f.native.creates).toBe(0); expect(f.transport.textCalls).toHaveLength(0); expect(f.transport.submits).toHaveLength(0);
  } finally {await f.close();}
});

integration('context-only source edit rejects unknown or duplicate IDs and simultaneous full brief without a write or provider effects', async () => {
  const f = await fixture(); try {
    const before = await f.db.videoPromptDraft.findUnique({where: {id: f.draft.id}});
    const sourceId = f.draft.brief.facts[0].sourceId;
    for (const [patch, code] of [
      [{contextOnlySourceIds: ['missing-source-id']}, 'VIDEO_FACT_SOURCE_CHANGED'],
      [{contextOnlySourceIds: [sourceId, sourceId]}, 'VIDEO_FACT_SOURCE_CHANGED'],
      [{contextOnlySourceIds: [sourceId], brief: f.draft.brief}, 'VIDEO_INVALID_INPUT'],
    ]) {
      await expect(f.service.updateDraft(f.org.id, f.user.id, f.draft.id, {version: f.draft.version, ...patch}))
        .rejects.toMatchObject({response: {code}});
      expect(await f.db.videoPromptDraft.findUnique({where: {id: f.draft.id}})).toEqual(before);
    }
    expect(f.mcp.readHeygenAccountV1).not.toHaveBeenCalled(); expect(f.mcp.renderHeygenAvatarV1).not.toHaveBeenCalled();
    expect(f.native.creates).toBe(0); expect(f.transport.textCalls).toHaveLength(0); expect(f.transport.submits).toHaveLength(0);
  } finally {await f.close();}
});

integration('explicit owned-voice rejection is actionable after one dispatch and retains raw receipt, attempt, reservation and unknown cost', async () => {
  const f = await fixture(); try {
    const approval = await f.preflightNative(), job = await f.launchNative(approval);
    f.mcp.renderHeygenAvatarV1.mockImplementation(async (_def, _token, _args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); f.native.creates++;
      await hooks.afterResponse(voiceRejectionResponse());
      videoErrorV1('VIDEO_PROVIDER_TOOL_ERROR', 409);
    });
    expect(await f.subscriptions.runStep(f.org.id, job.id)).toEqual({state: 'access_unavailable', done: true});
    const row = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(row.errorCode).toBe('VIDEO_OWNED_VOICE_UNUSABLE'); expect(row.submitAttempts).toBe(1);
    expect(row.actualCost).toBeNull(); expect(row.costCertainty).toBe('unknown'); expect(row.reserved.toFixed()).toBe('200');
    expect(row.receipt.raw).toEqual(voiceRejectionResponse()); expect(row.receipt.id).toBeUndefined();
    expect(row.receipt.submitAttemptId).toBe(row.snapshot.submitAttempt.id); expect(row.resultMediaId).toBeNull();
    expect(row.providerResult).toEqual({rejection: {code: 'VIDEO_OWNED_VOICE_UNUSABLE', providerCode: 'voice_not_usable', retryable: false}});
    const view = await f.access.get(f.org.id, f.user.id, job.id);
    expect(view.actionRequired).toMatchObject({kind: 'replace_owned_voice', providerCode: 'voice_not_usable', retryable: false});
    expect(view.actionRequired.message).toContain('Do not retry'); expect(view.actionRequired.message).toContain('switch to API');
    expect(JSON.stringify(view)).not.toContain('PRIVATE_SYNTHETIC_PROVIDER_DIAGNOSTIC');
    expect((await f.launchNative(approval)).id).toBe(job.id);
    expect((await f.launchNative(await f.preflightNative())).id).toBe(job.id);
    await f.subscriptions.runStep(f.org.id, job.id);
    expect(f.native.creates).toBe(1); expect(f.mcp.readHeygenVideoV1).not.toHaveBeenCalled();
    expect(await f.db.videoSubscriptionJob.count({where: {organizationId: f.org.id}})).toBe(1);
    expect(f.provider.state.submits).toHaveLength(0); expect(f.transport.submits).toHaveLength(0);
  } finally {await f.close();}
});

integration('explicit owned-voice rejection recovers an existing uncertain raw receipt locally without any provider call', async () => {
  const f = await fixture(); try {
    const job = await f.launchNative(await f.preflightNative());
    f.mcp.renderHeygenAvatarV1.mockImplementation(async (_def, _token, _args, guard, hooks) => {
      await guard(); await hooks.beforeDispatch(); f.native.creates++;
      await hooks.afterResponse(voiceRejectionResponse());
      videoErrorV1('VIDEO_PROVIDER_TOOL_ERROR', 409);
    });
    await f.subscriptions.runStep(f.org.id, job.id);
    const {Prisma} = require('@prisma/client');
    await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: {state: 'submission_unknown', errorCode: 'VIDEO_PROVIDER_RECEIPT_INVALID', providerResult: Prisma.DbNull}});
    const before = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    for (const method of ['readHeygenAccountV1', 'readHeygenOwnedCatalog', 'readHeygenOwnedAvatarGroup', 'renderHeygenAvatarV1', 'readHeygenVideoV1']) f.mcp[method].mockClear();
    f.restartSubscriptions();
    expect(await f.subscriptions.runStep(f.org.id, job.id)).toEqual({state: 'access_unavailable', done: true});
    const after = await f.db.videoSubscriptionJob.findUnique({where: {id: job.id}});
    expect(after.errorCode).toBe('VIDEO_OWNED_VOICE_UNUSABLE'); expect(after.receipt).toEqual(before.receipt);
    expect(after.submitAttempts).toBe(1); expect(after.actualCost).toBeNull(); expect(after.reserved.toFixed()).toBe('200');
    expect(after.providerResult).toEqual({rejection: {code: 'VIDEO_OWNED_VOICE_UNUSABLE', providerCode: 'voice_not_usable', retryable: false}});
    for (const method of ['readHeygenAccountV1', 'readHeygenOwnedCatalog', 'readHeygenOwnedAvatarGroup', 'renderHeygenAvatarV1', 'readHeygenVideoV1']) expect(f.mcp[method]).not.toHaveBeenCalled();
    expect(f.native.creates).toBe(1);
  } finally {await f.close();}
});
