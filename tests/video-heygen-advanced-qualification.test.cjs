const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const {createProviderFixture} = require('./helpers/video-subscription-provider-fixture.cjs');
const ROOT = 'libraries/nestjs-libraries/src/videos/subscriptions/';
const advanced = load(`${ROOT}video-heygen-advanced-qualification.v1.ts`);
const native = load(`${ROOT}video-heygen-avatar-native.v1.ts`);
const owned = load(`${ROOT}video-heygen-owned-catalog.v1.ts`);
const {subscriptionHash} = load(`${ROOT}video-provider-registry.ts`);
const {
  decodeHeygenAdvancedVoiceQualificationV1: voice,
  decodeHeygenOwnedAssetQualificationV1: asset,
  decodeHeygenOwnedGlossaryQualificationV1: glossary,
  decodeHeygenMattingQualificationV1: matting,
} = advanced;

const voiceRow = (extra = {}) => ({voice_id: 'voice_one', type: 'private', language: 'Russian',
  default_engine: null, available_engines: ['starfish', 'orca', 'elevenlabs'], ...extra});
const voiceInput = (extra = {}) => ({voiceId: 'voice_one', privateVoiceRows: [voiceRow()],
  detail: {voice_id: 'voice_one', status: 'completed'}, ...extra});
const assetRow = (extra = {}) => ({id: 'asset_one', type: 'image', owner: 'account_owner', space_id: 'space_one', ...extra});
const assetInput = (extra = {}) => ({assetId: 'asset_one', accountUsername: 'account_owner',
  privateAssetRows: [assetRow()], detail: assetRow(), ...extra});
const glossaryInput = (extra = {}) => ({glossaryId: 'glossary_one',
  workspaceGlossaryRows: [{brand_glossary_id: 'glossary_one'}],
  detail: {brand_glossary_id: 'glossary_one', terms: [{term: 'Product', pronunciation: 'prod-uct'}]}, ...extra});
const lookInput = (extra = {}) => ({lookId: 'look_one', groupId: 'group_one',
  ownedLookRows: [{id: 'look_one', group_id: 'group_one'}],
  detail: {id: 'look_one', group_id: 'group_one', status: 'completed', avatar_type: 'photo_avatar'}, ...extra});

test('only observed private voice engine mappings qualify; a null saved default remains null', () => {
  const q = voice(voiceInput());
  expect(q.voice).toEqual({voiceId: 'voice_one', owned: true, ready: true,
    engineTypes: ['starfish', 'orca', 'elevenlabs', 'heygen_voice']});
  expect(q.defaultEngine).toBeNull();
  expect(q.voice).not.toHaveProperty('models');
  expect(q.voice).not.toHaveProperty('noAutomaticFallback');
  expect(q.limitations.map(value => value.setting)).toEqual(['voice_model', 'voice_fallback']);
});

test('neither get_voice guesses nor the display name can create engine/model compatibility', () => {
  const q = voice(voiceInput({privateVoiceRows: [voiceRow({available_engines: undefined})], detail: {
    voice_id: 'voice_one', status: 'completed', name: 'ElevenLabs v4', engine_types: ['elevenlabs'],
    available_engines: ['elevenlabs'], models: ['eleven_v4'], noAutomaticFallback: true,
  }}));
  expect(q.voice.engineTypes).toEqual([]);
  expect(q.voice).not.toHaveProperty('models');
  expect(q.voice).not.toHaveProperty('noAutomaticFallback');
  expect(q.limitations.some(value => value.setting === 'voice_engine')).toBe(true);
});

test('an advertised future engine is unavailable until its contract is reviewed', () => {
  const q = voice(voiceInput({privateVoiceRows: [voiceRow({available_engines: ['unreviewed_engine'], default_engine: 'unreviewed_engine'})]}));
  expect(q.voice.engineTypes).toEqual([]);
  expect(q.defaultEngine).toBeNull();
});

test.each([
  {privateVoiceRows: []},
  {privateVoiceRows: [voiceRow({type: 'public'})]},
  {privateVoiceRows: [voiceRow({is_public: true})]},
  {privateVoiceRows: [voiceRow(), voiceRow()]},
  {detail: {voice_id: 'another_voice', status: 'completed'}},
  {detail: {voice_id: 'voice_one', status: 'completed', error: {message: 'private provider text'}}},
])('unowned, ambiguous or inconsistent voice responses fail closed: %j', input => {
  expect(() => voice(voiceInput(input))).toThrow();
});

test.each(['pending', 'processing', 'failed'])('a %s voice has no usable advanced engine qualification', status => {
  const q = voice(voiceInput({detail: {voice_id: 'voice_one', status}}));
  expect(q.voice.ready).toBe(false);
  expect(q.voice.engineTypes).toEqual([]);
});

test.each(['audio', 'image'])('owned %s asset metadata cannot invent a local Media/content mapping', type => {
  const q = asset(assetInput({privateAssetRows: [assetRow({type})], detail: assetRow({type,
    media_id: 'media_one', content_digest: 'a'.repeat(64), origin: 'original_recording_selected_by_person'})}));
  expect(q).toMatchObject({assetId: 'asset_one', owned: true, type, renderQualified: false,
    limitation: {setting: type === 'audio' ? 'audio_asset' : 'background_asset', reason: 'local_media_asset_binding_unverified'}});
  expect(q).not.toHaveProperty('url');
  expect(q).not.toHaveProperty('owner');
});

test.each([
  {privateAssetRows: []},
  {privateAssetRows: [assetRow(), assetRow()]},
  {accountUsername: 'different_owner'},
  {detail: assetRow({ownership: 'foreign'})},
  {detail: assetRow({owner: 'another_owner'})},
  {detail: assetRow({space_id: 'another_space'})},
  {detail: assetRow({type: 'audio'})},
  {detail: assetRow({id: 'another_asset'})},
])('foreign or mismatched asset metadata is refused: %j', input => {
  expect(() => asset(assetInput(input))).toThrow();
});

test('only a selected glossary present in the current workspace and matching detail qualifies', () => {
  expect(glossary(glossaryInput())).toEqual({glossaryId: 'glossary_one', owned: true});
  expect(JSON.stringify(glossary(glossaryInput()))).not.toContain('prod-uct');
});

test.each([
  {workspaceGlossaryRows: []},
  {workspaceGlossaryRows: [{brand_glossary_id: 'glossary_one', ownership: 'foreign'}]},
  {workspaceGlossaryRows: [{brand_glossary_id: 'glossary_one'}, {brand_glossary_id: 'glossary_one'}]},
  {detail: {brand_glossary_id: 'another_glossary', terms: []}},
  {detail: {brand_glossary_id: 'glossary_one', terms: 'unreviewed shape'}},
])('a glossary ID or stale/malformed detail alone cannot prove workspace ownership: %j', input => {
  expect(() => glossary(glossaryInput(input))).toThrow();
});

test.each(['photo_avatar', 'digital_twin', 'studio_avatar'])('%s and guessed flags do not prove trained matting', avatar_type => {
  const q = matting(lookInput({detail: {id: 'look_one', group_id: 'group_one', status: 'completed', avatar_type,
    matting: true, supports_matting: true, created_at: 2000000000}}));
  expect(q).toMatchObject({lookId: 'look_one', matting: 'unknown',
    limitation: {setting: 'matting', reason: 'trained_matting_not_observed'}});
});

test('a failed sibling look does not invalidate a valid selected look observation', () => {
  const input = lookInput();
  const result = matting({...input, ownedLookRows: [...input.ownedLookRows,
    {id: 'other_look', group_id: 'group_one', status: 'failed', error: {message: 'private failure'}}]});
  expect(result).toMatchObject({lookId: 'look_one', matting: 'unknown'});
  expect(JSON.stringify(result)).not.toContain('private failure');
});

test.each([
  {ownedLookRows: []},
  {ownedLookRows: [{id: 'look_one', group_id: 'group_one', ownership: 'public'}]},
  {groupId: 'different_group'},
  {detail: {id: 'another_look', group_id: 'group_one', status: 'completed', avatar_type: 'photo_avatar'}},
])('matting observations remain bound to the exact owned look and group: %j', input => {
  expect(() => matting(lookInput(input))).toThrow();
});

const username = '1'.repeat(32);
const account = {username, billing_type: 'subscription', wallet: null, usage_based: null,
  subscription: {plan: 'creator', credits: {premium_credits: {remaining: '10', resets_at: null}}}};
const page = (items, token) => ({items, has_more: !!token, ...(token ? {next_token: token} : {})});
async function withAdvancedFixture(run, currentVoiceSchema = false) {
  const tools = ['get_current_user', 'list_avatar_groups', ...Object.keys(advanced.HEYGEN_ADVANCED_TOOL_SCHEMAS_V1)]
    .map(name => ({name, inputSchema: {type: 'object', properties: {}}}));
  const pins = Object.fromEntries(tools.map(tool => [tool.name, subscriptionHash(tool)]));
  const voiceV2 = {name: 'list_voices', inputSchema: {type: 'object', properties: {type: {enum: ['private', 'public'], default: 'private'}}}};
  const f = await createProviderFixture({moduleMocks: {
    './video-heygen-avatar-native.v1': {...native, HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1: {...native.HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1,
      get_current_user: pins.get_current_user}},
    './video-heygen-advanced-qualification.v1': {...advanced, HEYGEN_ADVANCED_TOOL_SCHEMAS_V1: pins,
      HEYGEN_PRIVATE_VOICE_LIST_SCHEMA_V2: subscriptionHash(voiceV2)},
    './video-heygen-owned-catalog.v1': {...owned, HEYGEN_OWNED_AVATAR_GROUP_READ_SCHEMAS_V1: pins},
  }});
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'fixture-account-digest';
  try {
    f.state.tools.heygen = currentVoiceSchema ? tools.map(tool => tool.name === 'list_voices' ? voiceV2 : tool) : tools;
    const def = {...f.runtime.definition('heygen'), ownedAssetReadProfile: 'heygen_private_catalog_v1'};
    const subjectDigest = native.decodeHeygenAccountV1(account, def.issuer).subjectDigest;
    f.script('heygen', 'get_current_user', account);
    return await run(f, def, f.issueTokens('heygen').access_token, subjectDigest);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous;
    await f.close();
  }
}

test('real scoped transport lists fixed private options and qualifies the exact selected voice, glossary and image', async () => {
  await withAdvancedFixture(async (f, def, token, subjectDigest) => {
    const url = 'https://resource2.heygen.ai/private.png?sig=SECRET';
    const image = assetRow({owner: username, name: 'Owned image', url: null});
    f.script('heygen', 'list_voices', page([], 'voices-next'), page([voiceRow()]));
    f.script('heygen', 'get_voice', voiceInput().detail);
    f.script('heygen', 'list_brand_glossaries', page([{brand_glossary_id: 'glossary_one', name: 'Owned glossary'}]));
    f.script('heygen', 'get_brand_glossary', glossaryInput().detail);
    f.script('heygen', 'list_assets', page([image, assetRow({id: 'foreign', name: 'Foreign image', url})]));
    f.script('heygen', 'get_asset', {...image, url});
    f.script('heygen', 'list_avatar_looks', page(lookInput().ownedLookRows));
    f.script('heygen', 'get_avatar_look', lookInput().detail);
    const guard = jest.fn(async () => {}), consume = jest.fn(async () => {});
    const result = await f.mcp.readHeygenAdvancedOptionsV1(def, token, {subjectDigest,
      voiceId: 'voice_one', includeGlossaries: true, glossaryId: 'glossary_one', includeAssets: true,
      backgroundAssetId: 'asset_one', appearance: {lookId: 'look_one', groupId: 'group_one'}}, guard, consume);
    expect(result).toMatchObject({voice: {defaultEngine: null, voice: {voiceId: 'voice_one'}},
      glossaries: [{id: 'glossary_one', name: 'Owned glossary'}], glossary: {glossaryId: 'glossary_one', owned: true},
      assets: [{id: 'asset_one', name: 'Owned image', type: 'image', renderQualified: false}],
      matting: {lookId: 'look_one', matting: 'unknown'}});
    expect(JSON.stringify(result)).not.toMatch(/SECRET|prod-uct|Foreign image/);
    expect(consume).toHaveBeenCalledWith({assetId: 'asset_one', name: 'Owned image', url});
    expect(f.state.toolCalls.map(({name, args}) => ({name, args}))).toEqual([
      {name: 'get_current_user', args: {}},
      {name: 'list_voices', args: {type: 'private', limit: 100}},
      {name: 'list_voices', args: {type: 'private', limit: 100, token: 'voices-next'}},
      {name: 'get_voice', args: {voiceId: 'voice_one'}},
      {name: 'list_brand_glossaries', args: {limit: 100}},
      {name: 'get_brand_glossary', args: {brandGlossaryId: 'glossary_one'}},
      {name: 'list_assets', args: {username, limit: 100}},
      {name: 'get_asset', args: {assetId: 'asset_one'}},
      {name: 'list_avatar_looks', args: {ownership: 'private', groupId: 'group_one', limit: 50}},
      {name: 'get_avatar_look', args: {lookId: 'look_one'}},
    ]);
    expect(guard.mock.calls.length).toBeGreaterThan(f.state.toolCalls.length);
    expect(f.state.submits).toHaveLength(0);
  });
});

test('wrong account, repeated pages and unlisted glossary fail before private resource details', async () => {
  await withAdvancedFixture(async (f, def, token) => {
    await expect(f.mcp.readHeygenAdvancedOptionsV1(def, token, {subjectDigest: '2'.repeat(64), includeAssets: true}, async () => {}))
      .rejects.toMatchObject({response: {code: 'VIDEO_CONNECTION_CHANGED'}});
    expect(f.state.toolCalls.map(call => call.name)).toEqual(['get_current_user']);
  });
  await withAdvancedFixture(async (f, def, token, subjectDigest) => {
    f.script('heygen', 'list_brand_glossaries', page([], 'repeat'), page([], 'repeat'));
    await expect(f.mcp.readHeygenAdvancedOptionsV1(def, token, {subjectDigest, glossaryId: 'unknown'}, async () => {}))
      .rejects.toMatchObject({response: {code: 'VIDEO_CATALOG_INCOMPLETE'}});
    expect(f.state.toolCalls.map(call => call.name)).toEqual(['get_current_user', 'list_brand_glossaries', 'list_brand_glossaries']);
  });
  await withAdvancedFixture(async (f, def, token, subjectDigest) => {
    f.script('heygen', 'list_brand_glossaries', page([{brand_glossary_id: 'another'}]));
    await expect(f.mcp.readHeygenAdvancedOptionsV1(def, token, {subjectDigest, glossaryId: 'unknown'}, async () => {}))
      .rejects.toMatchObject({response: {code: 'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE'}});
    expect(f.state.toolCalls.map(call => call.name)).toEqual(['get_current_user', 'list_brand_glossaries']);
  });
});

test('the reviewed newer private voice list schema keeps advanced and existing private catalog reads operational', async () => {
  await withAdvancedFixture(async (f, def, token, subjectDigest) => {
    const row = {voice_id: 'voice_one', mode: 'instant', status: 'ACTIVE', available_engines: ['elevenlabs']};
    f.script('heygen', 'list_voices', page([row]), page([row]));
    f.script('heygen', 'get_voice', {voice_id: 'voice_one', mode: 'instant', status: 'ACTIVE'});
    f.script('heygen', 'list_avatar_groups', page([{id: 'group_one', status: 'completed', consent_status: 'accepted'}]));
    f.script('heygen', 'list_avatar_looks', page(lookInput().ownedLookRows));
    const guard = async () => {};
    const advancedResult = await f.mcp.readHeygenAdvancedOptionsV1(def, token, {subjectDigest, voiceId: 'voice_one'}, guard);
    expect(advancedResult.voice.voice).toEqual({voiceId: 'voice_one', owned: true, ready: true, engineTypes: []});
    const existingResult = await f.mcp.readHeygenOwnedCatalog(def, token, guard);
    expect(existingResult.catalog.voices).toMatchObject([{id: 'voice_one', ownership: 'owned'}]);
    expect(f.state.toolCalls.filter(call => call.name === 'list_voices').map(call => call.args)).toEqual([
      {type: 'private', limit: 100}, {type: 'private', limit: 100},
    ]);
  }, true);
});

test('advanced browsing retains valid glossary and asset categories while refusing a stale voice or unsupported matting schema', async () => {
  await withAdvancedFixture(async (f, def, token, subjectDigest) => {
    f.state.tools.heygen = f.state.tools.heygen.filter(tool => tool.name !== 'get_avatar_look');
    f.script('heygen', 'list_voices', page([voiceRow({voice_id: 'another_voice'})]));
    f.script('heygen', 'list_brand_glossaries', page([{brand_glossary_id: 'glossary_one'}]));
    f.script('heygen', 'list_assets', page([assetRow({owner: username})]));
    const result = await f.mcp.readHeygenAdvancedOptionsV1(def, token, {subjectDigest, browse: true, voiceId: 'voice_one',
      includeAssets: true, includeGlossaries: true, appearance: {lookId: 'look_one', groupId: 'group_one'}}, async () => {});
    expect(result).toMatchObject({glossaries: [{id: 'glossary_one'}], assets: [{id: 'asset_one'}], unavailable: ['voice', 'matting']});
    expect(f.state.toolCalls.map(call => call.name)).toEqual(['get_current_user', 'list_voices', 'list_brand_glossaries', 'list_assets']);
  });
});

test.each([null, 'https://unrelated.example/private.png', 'isError'])('an owned image without a supported detail download never enters the Media path: %s', async url => {
  await withAdvancedFixture(async (f, def, token, subjectDigest) => {
    const image = assetRow({owner: username, url});
    f.script('heygen', 'list_assets', page([image]));
    f.script('heygen', 'get_asset', url === 'isError' ? 'isError' : image);
    const consume = jest.fn();
    await expect(f.mcp.readHeygenAdvancedOptionsV1(def, token, {subjectDigest, backgroundAssetId: 'asset_one'}, async () => {}, consume))
      .rejects.toMatchObject({response: {code: 'VIDEO_HEYGEN_BACKGROUND_DOWNLOAD_UNAVAILABLE'}});
    expect(consume).not.toHaveBeenCalled();
  });
});
