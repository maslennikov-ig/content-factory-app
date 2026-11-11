const {randomUUID, createHash} = require('node:crypto');
const {mkdtemp, mkdir, writeFile, readFile, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const sharp = require('sharp');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const {createProviderFixture} = require('./helpers/video-subscription-provider-fixture.cjs');
const ROOT = 'libraries/nestjs-libraries/src/videos/';
const native = load(`${ROOT}subscriptions/video-heygen-creative-native.v1.ts`);
const {subscriptionHash} = load(`${ROOT}subscriptions/video-provider-registry.ts`);
const {videoErrorV1} = load(`${ROOT}video-brief.v1.ts`);
const {HEYGEN_STYLE_TOOL_SCHEMAS_V1, parseHeygenStyleReceiptV1} = load(`${ROOT}subscriptions/video-heygen-style.v1.ts`);
const adapterModule = load(`${ROOT}subscriptions/video-heygen-creative-adapter.v1.ts`, {
  './video-connection.service': {VideoConnectionService: class {}}, './video-mcp-client': {VideoMcpClient: class {}},
  './video-heygen-person-profile.service.v1': {HeygenPersonProfileServiceV1: class {}},
  '../../content-intelligence/social-factory/social-factory.repository': {SocialFactoryRepository: class {}},
});
const {HeygenCreativeAdapterV1, heygenCreativeHumanDecisionProofV1, heygenCreativeNativeApprovalProofV1,
  heygenCreativeOriginalRecordingProofV1, heygenCreativeStyleApprovalProofV1} = adapterModule;
const scope = () => ({organizationId: 'org', actorId: 'actor', connectionId: randomUUID(), subjectDigest: 'a'.repeat(64), accountGeneration: 3, setupId: randomUUID()});
const styleArgs = () => ({name: 'Studio source', prompt: 'Use a neutral professional studio and preserve the same person.', avatarId: 'source', avatarGroupId: 'group', aspectRatio: '9:16'});
const speechArgs = () => ({text: 'Привет, [MegaCampus] ждёт вас.\n25% — это не обещание.', voiceId: 'voice', inputType: 'text', speed: 1, language: 'ru', forceRegenerate: false, engine: 'starfish', locale: 'ru-RU'});
const requests = () => [
  {tool: 'create_prompt_avatar', arguments: styleArgs()},
  {tool: 'clone_voice', arguments: {audio: {type: 'asset_id', asset_id: 'owned-audio'}, voiceName: 'My original voice', removeBackgroundNoise: false, language: 'ru'}},
  {tool: 'create_speech', arguments: speechArgs()},
];
const syntheticTools = Object.keys(native.HEYGEN_CREATIVE_TOOL_SCHEMAS_V1).map(name => ({name, inputSchema: {type: 'object', properties: {}}}));
const syntheticPins = Object.fromEntries(syntheticTools.map(tool => [tool.name, subscriptionHash(tool)]));
async function withTransport(run) {
  const f = await createProviderFixture({moduleMocks: {'./video-heygen-creative-native.v1': {...native, HEYGEN_CREATIVE_TOOL_SCHEMAS_V1: syntheticPins}}});
  f.state.tools.heygen = structuredClone(syntheticTools);
  const def = {...f.runtime.definition('heygen'), ownedAssetReadProfile: 'heygen_private_catalog_v1', enabled: false, schemaDigests: []};
  try {await run(f, def, f.issueTokens('heygen').access_token);} finally {await f.close();}
}

test('strict creative union preserves exact plain Russian speech and owned asset roles, rejecting tags, URLs and arbitrary tools', () => {
  expect(native.heygenCreativeMutationV1(requests()[2]).arguments.text).toBe(speechArgs().text);
  const invalid = [
    {tool: 'delete_voice', arguments: {}}, {tool: 'create_speech', arguments: {...speechArgs(), inputType: 'ssml'}},
    {tool: 'create_speech', arguments: {...speechArgs(), forceRegenerate: true}},
    {tool: 'create_speech', arguments: {...speechArgs(), text: 'Hello [warm].'}},
    {tool: 'create_speech', arguments: {...speechArgs(), text: '<speak>Hello</speak>'}},
    {tool: 'create_prompt_avatar', arguments: {...styleArgs(), prompt: 'Сделай студию.'}},
    {tool: 'create_prompt_avatar', arguments: {...styleArgs(), referenceImages: [{type: 'url', url: 'https://unowned.example/image.png'}]}},
    {tool: 'clone_voice', arguments: {...requests()[1].arguments, audio: {type: 'url', url: 'https://unowned.example/audio.wav'}}},
  ];
  for (const request of invalid) expect(() => native.heygenCreativeMutationV1(request)).toThrow();
  expect(() => native.heygenCreativeReadV1({tool: 'get_avatar_creation_status', arguments: {groupId: 'guessed-group'}})).toThrow();
});

test('official prompt-avatar receipt decodes exactly one explicit look/group through strict matching envelopes without inventing a creation job', () => {
  const body = {data: {avatar_item: {id: 'returned-look', group_id: 'returned-group', preview_image_url: 'https://private.example/signed?token=secret'}, avatar_group: {id: 'returned-group'}}};
  const mcp = {content: [{type: 'text', text: JSON.stringify(body)}], structuredContent: body};
  const raw = {kind: 'http', status: 200, body: JSON.stringify({jsonrpc: '2.0', id: 7, result: mcp})};
  const receipt = native.decodeHeygenPromptLookReceiptV1(raw);
  expect(receipt).toEqual({operationId: 'returned-look', childLookIds: ['returned-look'], referenceKind: 'look', groupId: 'returned-group'});
  expect(JSON.stringify(receipt)).not.toMatch(/photar|job|private\.example|secret/);
  const invalid = [
    {id: 'generic-id', group_id: 'returned-group'},
    {data: {avatar_item: {id: 'returned-look'}, avatar_group: {id: 'returned-group'}}},
    {data: {avatar_item: {...body.data.avatar_item, group_id: 'other-group'}, avatar_group: {id: 'returned-group'}}},
    {data: {...body.data, avatar_item: [body.data.avatar_item, body.data.avatar_item, body.data.avatar_item]}},
    {data: {...body.data, operation_id: 'guessed-job'}},
    {...mcp, structuredContent: {data: {...body.data, avatar_item: {...body.data.avatar_item, id: 'conflicting-look'}}}},
  ];
  for (const value of invalid) expect(() => native.decodeHeygenPromptLookReceiptV1(value)).toThrow();
  expect(parseHeygenStyleReceiptV1({operationId: 'legacy-operation', childLookIds: ['legacy-a', 'legacy-b']})).toEqual({operationId: 'legacy-operation', childLookIds: ['legacy-a', 'legacy-b']});
  expect(() => parseHeygenStyleReceiptV1({...receipt, operationId: 'fabricated-job'})).toThrow();
});

test('each actual synthetic HTTP mutation has exactly one guarded send and raw durable receipt before a later guard fails', async () => {
  for (const request of requests()) await withTransport(async (f, def, token) => {
    f.script('heygen', request.tool, {unknown_success_shape: 'retained privately'});
    const events = []; let captured;
    await expect(f.mcp.mutateHeygenCreativeV1(def, token, request, async () => {if (captured) videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);}, {
      beforeDispatch: async () => {expect(f.state.toolCalls).toHaveLength(0); events.push('before');},
      afterResponse: async raw => {captured = raw; events.push('raw');},
    })).rejects.toMatchObject({response: {code: 'VIDEO_REAUTH_REQUIRED'}});
    expect(events).toEqual(['before', 'raw']); expect(f.state.toolCalls).toHaveLength(1);
    expect(f.state.toolCalls[0]).toMatchObject({name: request.tool, args: request.arguments});
    expect(native.heygenCreativeEnvelopeV1(captured)).toEqual({unknown_success_shape: 'retained privately'});
  });
});

test('schema drift, duplicate tools, endpoint substitution and failed beforeDispatch produce zero mutation sends', async () => {
  for (const mutate of [tools => {tools[0].inputSchema.properties.newField = {type: 'string'};}, tools => tools.push(structuredClone(tools[0]))])
    await withTransport(async (f, def, token) => {
      mutate(f.state.tools.heygen);
      await expect(f.mcp.mutateHeygenCreativeV1(def, token, requests()[0], async () => {}, {beforeDispatch: async () => {}, afterResponse: async () => {}})).rejects.toMatchObject({response: {code: 'VIDEO_SCHEMA_CHANGED'}});
      expect(f.state.toolCalls).toHaveLength(0);
    });
  await withTransport(async (f, def, token) => {
    await expect(f.mcp.mutateHeygenCreativeV1({...def, resource: `${def.resource}/substitution`}, token, requests()[0], async () => {}, {beforeDispatch: async () => {}, afterResponse: async () => {}})).rejects.toThrow();
    await expect(f.mcp.mutateHeygenCreativeV1(def, token, requests()[0], async () => {}, {beforeDispatch: async () => {throw new Error('approval refused');}, afterResponse: async () => {}})).rejects.toThrow();
    expect(f.state.toolCalls).toHaveLength(0);
  });
});

test('lost or malformed mutation response never resends, and fixed reads map only their exact provider role', async () => {
  for (const response of ['lost', 'malformed']) await withTransport(async (f, def, token) => {
    f.script('heygen', 'create_speech', response);
    const beforeDispatch = jest.fn(async () => {}), afterResponse = jest.fn(async () => {});
    await expect(f.mcp.mutateHeygenCreativeV1(def, token, requests()[2], async () => {}, {beforeDispatch, afterResponse})).rejects.toThrow();
    expect(f.state.toolCalls).toHaveLength(1); expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(afterResponse).toHaveBeenCalledTimes(response === 'lost' ? 0 : 1);
  });
  await withTransport(async (f, def, token) => {
    f.script('heygen', 'get_avatar_creation_status', {status: 'processing'});
    expect(await f.mcp.readHeygenCreativeV1(def, token, {tool: 'get_avatar_creation_status', arguments: {photarId: 'actual-provider-role'}}, async () => {})).toEqual({status: 'processing'});
    expect(f.state.toolCalls[0].args).toEqual({photarId: 'actual-provider-role'});
  });
});

function fakeAdapter() {
  const active = scope(), records = new Map(), mediaRows = new Map(); let loseCreateResponse = false;
  const store = {read: jest.fn(async (org, kind, id) => structuredClone(records.get(`${org}:${kind}:${id}`) ?? null)),
    put: jest.fn(async input => {const key = `${input.organizationId}:${input.kind}:${input.id}`; if (records.has(key)) throw new Error('CAS');
      const row = {...input, revision: 1}; records.set(key, structuredClone(row)); return row;})};
  const db = {media: {findFirst: jest.fn(async ({where}) => structuredClone([...mediaRows.values()].find(row => row.id === where.id && row.organizationId === where.organizationId && !row.deletedAt) ?? null)),
    create: jest.fn(async ({data}) => {mediaRows.set(data.id, structuredClone(data)); if (loseCreateResponse) {loseCreateResponse = false; throw new Error('lost registered Media response');} return data;})}};
  const connections = {runtime: {now: () => new Date('2030-01-01T00:00:00Z')}, repository: {db,
    member: jest.fn(async (org, actor) => {if (org !== active.organizationId || !['actor', 'other-actor'].includes(actor)) throw new Error('scope');}),
    connection: jest.fn(async (org, actor, id) => {if (org !== active.organizationId || actor !== active.actorId || id !== active.connectionId) throw new Error('owner'); return {ownerId: actor, provider: 'heygen', generation: active.accountGeneration};}),
    transaction: async work => work(db)}, token: jest.fn(async () => ({token: 'synthetic-not-live', connection: {provider: 'heygen', generation: active.accountGeneration}, assertUsable: async () => {}})), connectable: jest.fn(async () => ({}))};
  const metadata = {mimeType: 'audio/wav', size: 2044, contentDigest: 'b'.repeat(64), container: 'WAVE', codec: 'PCM', durationSeconds: 1, sampleRate: 1000, channels: 1};
  const media = {inspectOwnedAudio: jest.fn(async () => structuredClone(metadata)), referenceDimensions: jest.fn(async () => ({width: 320, height: 240})),
    importImage: jest.fn(async () => ({name: 'native.png', path: 'https://owned-storage.example/native.png', size: 200, mimeType: 'image/png', width: 320, height: 240, contentDigest: 'c'.repeat(64)})),
    importAudio: jest.fn(async () => ({name: 'native.wav', path: 'https://owned-storage.example/native.wav', ...metadata}))};
  const mcp = {readHeygenAccountV1: jest.fn(async () => ({subjectDigest: active.subjectDigest, billingType: 'subscription'})),
    readHeygenCreativeSchemasV1: jest.fn(async () => HEYGEN_STYLE_TOOL_SCHEMAS_V1),
    readHeygenOwnedCatalog: jest.fn(async () => ({catalog: {avatars: [{id: 'source', groupId: 'group', ownership: 'owned', selectableForDraft: true}], voices: []}})),
    readHeygenOwnedAvatarGroup: jest.fn(async () => ({groupId: 'group', consentState: 'accepted'})),
    readHeygenCreativeV1: jest.fn(async () => ({id: 'source', group_id: 'group', status: 'completed', preview_image_url: 'https://provider.example/source.png'})),
    mutateHeygenCreativeV1: jest.fn(async (_def, _token, request, _guard, hooks) => {await hooks.beforeDispatch(); await hooks.afterResponse({raw: 'unknown provider contract'}); return {unknown_id: 'not-guessed'};})};
  const adapter = new HeygenCreativeAdapterV1(connections, mcp, media, store, {read: jest.fn()});
  const context = {...active, accountDigest: active.subjectDigest, operationId: randomUUID(), profile: {baseLookId: 'source', groupId: 'group'}, input: {name: 'Professional studio', referenceMediaIds: []}};
  return {adapter, active, context, store, media, metadata, mediaRows, mcp, connections, loseCreateResponse: () => {loseCreateResponse = true;}};
}

test('native account/catalog/group/image reads establish owned metadata but never infer feature entitlement or output contracts', async () => {
  const f = fakeAdapter();
  expect(await f.adapter.styleAdapter.currentAccount(f.active.organizationId, f.active.actorId, f.active.connectionId)).toEqual({accountDigest: f.active.subjectDigest, accountGeneration: 3});
  expect(await f.adapter.readProfileCatalog(f.active.organizationId, f.active.actorId, f.active.connectionId)).toMatchObject({accountDigest: f.active.subjectDigest,
    accountGeneration: 3, catalog: {avatars: [{id: 'source', groupId: 'group'}]}});
  const qualified = await f.adapter.styleAdapter.qualify(f.context);
  expect(qualified).toMatchObject({entitlement: 'unknown', baseLook: {lookId: 'source', groupId: 'group', imageUsable: true, consent: 'accepted'}});
  expect(f.media.referenceDimensions).toHaveBeenCalledWith('https://provider.example/source.png');
  expect(await f.adapter.voiceAdapter.qualifyOperation(f.active, 'create_speech')).toMatchObject({entitlement: 'unknown', receiptContract: 'unknown'});
  expect(() => f.adapter.styleAdapter.decodeReceipt({id: 'maybe-a-look', status: 'completed'})).toThrow();
  expect(f.adapter.voiceAdapter.decodeCloneReceipt).toBeUndefined(); expect(f.adapter.voiceAdapter.decodeSpeechReceipt).toBeUndefined();
  expect(f.mcp.mutateHeygenCreativeV1).not.toHaveBeenCalled();
});

test('an explicit owned background selection imports and reopens one scoped Media copy without calling a provider mutation', async () => {
  const f = fakeAdapter();
  const url = 'https://resource2.heygen.ai/background.png?private=1';
  f.media.inspectOwnedImage = jest.fn(async () => ({contentDigest: 'c'.repeat(64)}));
  f.mcp.readHeygenAdvancedOptionsV1 = jest.fn(async (_def, _token, input, guard, consume) => {
    expect(input).toEqual({subjectDigest: f.active.subjectDigest, backgroundAssetId: 'image-a'});
    await guard();
    await consume({assetId: 'image-a', name: 'My background', url});
    await guard();
  });
  const [first, again] = await Promise.all([
    f.adapter.bindOwnedBackgroundImage(f.active, 'image-a'),
    f.adapter.bindOwnedBackgroundImage(f.active, 'image-a'),
  ]);
  expect(first).toEqual({type: 'image', assetId: 'image-a', mediaId: again.mediaId, contentDigest: 'c'.repeat(64)});
  expect(f.mediaRows.get(first.mediaId)).toMatchObject({organizationId: f.active.organizationId, type: 'image'});
  expect(f.media.importImage).toHaveBeenCalledTimes(1);
  expect(f.media.importImage).toHaveBeenCalledWith(url, 'https://resource2.heygen.ai');
  expect(f.mcp.mutateHeygenCreativeV1).not.toHaveBeenCalled();
  f.media.inspectOwnedImage.mockResolvedValueOnce({contentDigest: 'a'.repeat(64)});
  await expect(f.adapter.bindOwnedBackgroundImage(f.active, 'image-a'))
    .rejects.toMatchObject({response: {code: 'VIDEO_CREATIVE_MEDIA_BINDING_INVALID'}});
  await expect(f.adapter.bindOwnedBackgroundImage({...f.active, actorId: 'other-actor'}, 'image-a')).rejects.toThrow();
  expect(f.media.importImage).toHaveBeenCalledTimes(1);
});

test('look-resource recovery reads only the exact returned owned look; foreign group/unknown state cannot be saved or resubmitted', async () => {
  const f = fakeAdapter(), receipt = native.decodeHeygenPromptLookReceiptV1({data: {avatar_item: {id: 'child', group_id: 'group'}, avatar_group: {id: 'group'}}});
  f.mcp.readHeygenOwnedCatalog.mockResolvedValue({catalog: {avatars: [{id: 'child', groupId: 'group', ownership: 'owned'}]}});
  f.mcp.readHeygenCreativeV1.mockResolvedValue({id: 'child', group_id: 'group', status: 'processing'});
  expect(await f.adapter.styleAdapter.poll(f.context, receipt)).toEqual({...receipt, state: 'running'});
  f.mcp.readHeygenCreativeV1.mockResolvedValue({id: 'child', group_id: 'group', status: 'completed', preview_image_url: 'https://provider.example/child.png'});
  expect(await f.adapter.styleAdapter.poll(f.context, receipt)).toEqual({...receipt, state: 'completed'});
  expect(f.media.referenceDimensions).toHaveBeenCalledWith('https://provider.example/child.png');
  for (const call of f.mcp.readHeygenCreativeV1.mock.calls) expect(call[2]).toEqual({tool: 'get_avatar_look', arguments: {lookId: 'child'}});
  const reads = f.mcp.readHeygenCreativeV1.mock.calls.length;
  await expect(f.adapter.styleAdapter.poll(f.context, {...receipt, groupId: 'foreign-group'})).rejects.toMatchObject({response: {code: 'VIDEO_STYLE_CHILD_INVALID'}});
  await expect(f.adapter.styleAdapter.poll(f.context, {operationId: 'legacy-operation', childLookIds: ['child']})).rejects.toMatchObject({response: {code: 'VIDEO_STYLE_STATUS_CONTRACT_UNQUALIFIED'}});
  expect(f.mcp.readHeygenCreativeV1).toHaveBeenCalledTimes(reads);
  f.mcp.readHeygenCreativeV1.mockResolvedValue({id: 'child', group_id: 'foreign-group', status: 'completed', preview_image_url: 'https://provider.example/foreign.png'});
  await expect(f.adapter.styleAdapter.poll(f.context, receipt)).rejects.toMatchObject({response: {code: 'VIDEO_STYLE_LOOK_RESPONSE_INVALID'}});
  f.mcp.readHeygenCreativeV1.mockResolvedValue({id: 'child', group_id: 'group', status: 'unrecognized'});
  await expect(f.adapter.styleAdapter.poll(f.context, receipt)).rejects.toMatchObject({response: {code: 'VIDEO_STYLE_LOOK_RESPONSE_INVALID'}});
  await expect(f.adapter.styleAdapter.saveOwnedImage(f.context, {lookId: 'child', groupId: 'foreign-group', ownership: 'owned', state: 'completed', imageUrl: 'https://provider.example/foreign.png'}, 'child-key')).rejects.toMatchObject({response: {code: 'VIDEO_STYLE_CHILD_INVALID'}});
  expect(f.mcp.mutateHeygenCreativeV1).not.toHaveBeenCalled(); expect(f.media.importImage).not.toHaveBeenCalled();
});

test('JSON booleans/objects cannot forge human or native approval; exact registered proof survives server schema parsing', async () => {
  const f = fakeAdapter(), proof = {decisionId: randomUUID(), organizationId: 'org', actorId: 'actor', source: 'confirmed_chat_action', approvedDigest: 'c'.repeat(64), at: '2030-01-01T00:00:00.000Z'};
  expect(await f.adapter.voiceAdapter.verifyHumanDecision(f.active, proof, proof.approvedDigest)).toBe(false);
  const trusted = heygenCreativeHumanDecisionProofV1(proof);
  expect(await f.adapter.voiceAdapter.verifyHumanDecision(f.active, JSON.parse(JSON.stringify(trusted)), proof.approvedDigest)).toBe(true);
  expect(await f.adapter.voiceAdapter.verifyHumanDecision({...f.active, actorId: 'other'}, trusted, proof.approvedDigest)).toBe(false);
  const operation = {operationId: randomUUID(), requestHash: 'd'.repeat(64)};
  await expect(f.adapter.voiceAdapter.assertNativeApproval(f.active, operation, {...f.active, ...operation, humanApproved: true})).rejects.toThrow();
  const nativeProof = heygenCreativeNativeApprovalProofV1(f.active, {...operation, decisionId: randomUUID(), expiresAt: '2030-01-01T00:05:00.000Z'});
  await expect(f.adapter.voiceAdapter.assertNativeApproval(f.active, operation, nativeProof)).resolves.toBeUndefined();
  await expect(f.adapter.voiceAdapter.assertNativeApproval(f.active, {...operation, requestHash: 'e'.repeat(64)}, nativeProof)).rejects.toThrow();
});

test('style authority binds exact actor/account/arguments and is consumed once even when the successful response shape is unknown', async () => {
  const f = fakeAdapter(), args = styleArgs(), requestHash = 'd'.repeat(64), context = {...f.context, args, requestHash};
  const approval = {decisionId: randomUUID(), scopeId: 'exact-native-fingerprint', organizationId: 'org', actorId: 'actor', operationId: context.operationId,
    requestHash, connectionId: f.active.connectionId, accountDigest: f.active.subjectDigest, accountGeneration: 3, expiresAt: '2030-01-01T00:05:00.000Z', funding: 'personal_subscription'};
  await expect(f.adapter.authorizeStyle(context, approval)).rejects.toThrow();
  await f.adapter.authorizeStyle(context, heygenCreativeStyleApprovalProofV1(approval));
  const hooks = {beforeDispatch: jest.fn(async () => {}), afterResponse: jest.fn(async () => {})};
  await expect(f.adapter.styleAdapter.create(context, {...args, avatarId: 'another-source'}, hooks)).rejects.toThrow();
  expect(f.mcp.mutateHeygenCreativeV1).not.toHaveBeenCalled();
  await expect(f.adapter.styleAdapter.create(context, args, hooks)).rejects.toMatchObject({response: {code: 'VIDEO_STYLE_RECEIPT_CONTRACT_UNQUALIFIED'}});
  expect(hooks.afterResponse).toHaveBeenCalledTimes(1); expect(f.mcp.mutateHeygenCreativeV1).toHaveBeenCalledTimes(1);
  await expect(f.adapter.styleAdapter.create(context, args, hooks)).rejects.toThrow();
  expect(f.mcp.mutateHeygenCreativeV1).toHaveBeenCalledTimes(1);
});

test('human-selected original declaration is actor/account bound, measures the same bytes and never infers speech quality', async () => {
  const f = fakeAdapter(), mediaId = randomUUID(); f.mediaRows.set(mediaId, {id: mediaId, organizationId: 'org', name: 'original.wav', path: 'owned-path', type: 'audio'});
  const inspected = await f.adapter.inspectAccessibleAudio(f.active, mediaId);
  expect(inspected).not.toHaveProperty('origin'); expect(inspected.quality).toMatchObject({speech: 'unknown', speakers: 'unknown'});
  await expect(f.adapter.voiceAdapter.readOwnedAudio(f.active, mediaId)).rejects.toThrow();
  const source = {...f.active, mediaId, contentDigest: inspected.contentDigest, decisionId: randomUUID(), approvedDigest: 'd'.repeat(64), at: '2030-01-01T00:00:00.000Z'};
  await expect(f.adapter.registerOriginalRecording(f.active, mediaId, source)).rejects.toThrow();
  const declared = await f.adapter.registerOriginalRecording(f.active, mediaId, heygenCreativeOriginalRecordingProofV1(source));
  expect(declared).toEqual({...inspected, origin: 'original_recording_selected_by_person'});
  expect(await f.adapter.voiceAdapter.readOwnedAudio(f.active, mediaId)).toEqual(declared);
  await expect(f.adapter.voiceAdapter.readOwnedAudio({...f.active, actorId: 'other-actor'}, mediaId)).rejects.toThrow();
  f.metadata.contentDigest = 'f'.repeat(64);
  await expect(f.adapter.voiceAdapter.readOwnedAudio(f.active, mediaId)).rejects.toThrow();
});

test('lost Media registration reuses the durable upload and deterministic ID; generated audio cannot become a declared original', async () => {
  const f = fakeAdapter(), look = {lookId: 'child', groupId: 'group', ownership: 'owned', state: 'completed', imageUrl: 'https://provider.example/child.png'};
  f.loseCreateResponse();
  await expect(f.adapter.styleAdapter.saveOwnedImage(f.context, look, 'same-look-key')).rejects.toThrow('lost registered Media response');
  const saved = await f.adapter.styleAdapter.saveOwnedImage(f.context, look, 'same-look-key');
  expect(f.media.importImage).toHaveBeenCalledTimes(1); expect(saved.mimeType).toBe('image/png');
  expect(f.mediaRows.get(saved.mediaId)).toMatchObject({type: 'image', fileSize: 200, originalName: 'HeyGen Professional studio.png'});
  const audition = await f.adapter.voiceAdapter.importSpeechResult(f.active, {resultRef: 'https://provider.example/speech.wav'}, randomUUID());
  expect(f.mediaRows.get(audition.mediaId).type).toBe('audio'); expect(audition.origin).toBe('generated_preview');
  const proof = heygenCreativeOriginalRecordingProofV1({...f.active, mediaId: audition.mediaId, contentDigest: audition.contentDigest, decisionId: randomUUID(), approvedDigest: 'd'.repeat(64), at: '2030-01-01T00:00:00.000Z'});
  await expect(f.adapter.registerOriginalRecording(f.active, audition.mediaId, proof)).rejects.toMatchObject({response: {code: 'VIDEO_VOICE_ORIGINAL_REQUIRED'}});
});

function wav() {
  const bytes = Buffer.alloc(44 + 16000); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(16000, 40); return bytes;
}
test('actual PNG/WAV inspection measures image dimensions and audio duration without modifying original bytes or accepting an MP4 disguise', async () => {
  const media = load(`${ROOT}video-media.v1.ts`), audio = wav(), image = await sharp({create: {width: 19, height: 23, channels: 3, background: 'white'}}).png().toBuffer();
  expect(await media.inspectCreativeImageBytesV1(image)).toMatchObject({mimeType: 'image/png', width: 19, height: 23, size: image.length});
  expect(await media.inspectCreativeAudioBytesV1(audio)).toMatchObject({mimeType: 'audio/wav', durationSeconds: 1, sampleRate: 8000, channels: 1, contentDigest: createHash('sha256').update(audio).digest('hex')});
  await expect(media.inspectCreativeAudioBytesV1(image)).rejects.toThrow(); await expect(media.inspectCreativeImageBytesV1(audio)).rejects.toThrow();
  const root = await mkdtemp(join(tmpdir(), 'cf-owned-audio-')), before = {UPLOAD_DIRECTORY: process.env.UPLOAD_DIRECTORY, FRONTEND_URL: process.env.FRONTEND_URL, STORAGE_PROVIDER: process.env.STORAGE_PROVIDER};
  try {
    process.env.UPLOAD_DIRECTORY = root; process.env.FRONTEND_URL = 'http://127.0.0.1:4477'; process.env.STORAGE_PROVIDER = 'local';
    await mkdir(join(root, '2030/01/01'), {recursive: true}); const file = join(root, '2030/01/01/abcdef.wav'); await writeFile(file, audio);
    await writeFile(join(root, '2030/01/01/abc123.png'), image);
    const instance = new media.VideoMediaV1();
    expect(await instance.inspectOwnedImage('http://127.0.0.1:4477/uploads/2030/01/01/abc123.png')).toMatchObject({
      contentDigest: createHash('sha256').update(image).digest('hex'), width: 19, height: 23,
    });
    await expect(instance.inspectOwnedImage('https://unowned.example/uploads/2030/01/01/abc123.png')).rejects.toThrow();
    expect(await instance.inspectOwnedAudio('http://127.0.0.1:4477/uploads/2030/01/01/abcdef.wav')).toMatchObject({durationSeconds: 1});
    expect(await readFile(file)).toEqual(audio);
    const {LocalStorage} = load('libraries/nestjs-libraries/src/upload/local.storage.ts');
    const uploaded = await new LocalStorage(root).uploadFile({buffer: audio, size: audio.length, originalname: 'original.wav', mimetype: 'audio/wav'});
    expect(uploaded.mimetype).toBe('audio/vnd.wave');
    const storedPath = new URL(uploaded.path).pathname.slice('/uploads/'.length);
    expect(await readFile(join(root, storedPath))).toEqual(audio);
    expect(await instance.inspectOwnedAudio(uploaded.path)).toMatchObject({mimeType: 'audio/wav', durationSeconds: 1});
    await expect(instance.inspectOwnedAudio('https://unowned.example/audio.wav')).rejects.toThrow();
  } finally {
    for (const [key, value] of Object.entries(before)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    await rm(root, {recursive: true, force: true});
  }
});

test('Cloudflare upload accepts the same actual WAV alias and sends unchanged bytes with detected content type', async () => {
  const sent = [], bytes = wav();
  class S3Client {middlewareStack = {add() {}}; async send(command) {sent.push(command.input);}}
  class PutObjectCommand {constructor(input) {this.input = input;}}
  const {CloudflareStorage} = load('libraries/nestjs-libraries/src/upload/cloudflare.storage.ts', {
    '@aws-sdk/client-s3': {S3Client, PutObjectCommand, DeleteObjectCommand: class {}},
  });
  const storage = new CloudflareStorage('synthetic-account', 'synthetic-key', 'synthetic-secret', 'auto', 'fixture', 'https://owned-storage.example');
  const result = await storage.uploadFile({buffer: bytes, size: bytes.length, originalname: 'original.wav', mimetype: 'audio/wav'});
  expect(sent).toHaveLength(1); expect(sent[0]).toMatchObject({ContentType: 'audio/vnd.wave', Body: bytes});
  expect(result.path).toMatch(/\.wav$/); expect(result.buffer).toEqual(bytes);
});
