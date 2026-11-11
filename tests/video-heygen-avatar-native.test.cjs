const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const {createProviderFixture} = require('./helpers/video-subscription-provider-fixture.cjs');
const native = load('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-avatar-native.v1.ts');
const {subscriptionHash} = load('libraries/nestjs-libraries/src/videos/subscriptions/video-provider-registry.ts');
const {videoErrorV1} = load('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
const syntheticTools = ['get_current_user', 'create_video_from_avatar', 'get_video'].map(name => ({name, inputSchema: {type: 'object', properties: {}}}));
const syntheticPins = Object.fromEntries(syntheticTools.map(tool => [tool.name, subscriptionHash(tool)]));
const input = () => ({avatarId: 'owned_look', voiceId: 'owned_voice', script: 'Meet me at MegaCampus Summit.\nDo not miss November 20.',
  locale: 'en-US', resolution: '720p', aspectRatio: '9:16', engine: 'avatar_iv', captions: true, title: 'MegaCampus Summit invitation'});
const account = () => ({username: '0123456789abcdef0123456789abcdef', email: 'private-synthetic@example.com', billing_type: 'subscription',
  subscription: {plan: 'creator', credits: {premium_credits: {remaining: 200, resets_at: '2030-12-06T00:00:00Z'}}}, wallet: null, usage_based: null});
const previousSecret = process.env.JWT_SECRET;
beforeAll(() => {process.env.JWT_SECRET = 'heygen-native-test-secret';});
afterAll(() => {if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;});
async function withFixture(run) {
  // Synthetic pins test protocol enforcement; they never approve a live provider schema.
  const f = await createProviderFixture({moduleMocks: {'./video-heygen-avatar-native.v1': {...native, HEYGEN_AVATAR_NATIVE_TOOL_SCHEMAS_V1: syntheticPins}}});
  f.state.tools.heygen = structuredClone(syntheticTools);
  const def = {...f.runtime.definition('heygen'), enabled: false, identityEndpoint: undefined, schemaDigests: [], ownedAssetReadProfile: 'heygen_private_catalog_v1'};
  try {await run(f, def, f.issueTokens('heygen').access_token);} finally {await f.close();}
}
const creates = f => f.state.toolCalls.filter(call => call.name === 'create_video_from_avatar');

test.each(['en-US', 'ru-RU'])('short native proposal preserves exact text and selected %s locale on the reviewed Avatar IV portrait wire', locale => {
  const proposal = {...input(), locale, ...(locale === 'ru-RU' ? {script: 'Привет, я Илья.\nПриглашаю вас на саммит в Дубае.'} : {})};
  const args = native.heygenAvatarArgsV1(proposal);
  expect(args).toEqual({avatarId: 'owned_look', voiceId: 'owned_voice', script: proposal.script, resolution: '720p', aspectRatio: '9:16',
    engine: {type: 'avatar_iv'}, voiceSettings: {locale}, outputFormat: 'mp4', caption: {file_format: 'srt', style: 'default'}, title: input().title});
  expect(native.heygenAvatarArgsV1({...input(), captions: false})).not.toHaveProperty('caption');
  for (const changed of [{locale: 'ru'}, {locale: 'fr-FR'}, {resolution: '1080p'}, {engine: 'avatar_v'}, {aspectRatio: '16:9'}, {audioUrl: 'https://example.com/a.wav'},
    {callbackUrl: 'https://example.com/'}, {script: 'word '.repeat(101)}, {script: 'a'.repeat(1201)}, {avatarId: '../foreign'}])
    expect(() => native.heygenAvatarArgsV1({...input(), ...changed})).toThrow();
  expect(() => native.heygenAvatarWireArgsV1({...args, callbackUrl: 'https://example.com/'})).toThrow();
});

test('Russian trial sends the exact new language and script once while preserving the English request', async () => {
  const english = native.heygenAvatarArgsV1(input()), original = structuredClone(english);
  const russian = native.heygenAvatarArgsV1({...input(), locale: 'ru-RU', script: 'Привет, я Илья. Приглашаю вас в Дубай.'});
  await withFixture(async (f, def, token) => {
    f.script('heygen', 'create_video_from_avatar', {id: 'russian_once'});
    await f.mcp.renderHeygenAvatarV1(def, token, russian, async () => {}, {beforeDispatch: async () => {}, afterResponse: async () => {}});
    expect(creates(f)).toHaveLength(1);
    expect(creates(f)[0].args).toEqual(russian);
    expect(creates(f)[0].args.voiceSettings.locale).toBe('ru-RU');
    expect(english).toEqual(original);
    expect(subscriptionHash(english)).not.toBe(subscriptionHash(russian));
  });
});

test('subscription funding uses an authenticated opaque username digest and never returns email or a price', () => {
  const decoded = native.decodeHeygenAccountV1(account(), 'https://api2.heygen.com');
  expect(decoded).toMatchObject({billingType: 'subscription', plan: 'creator', remaining: '200', resetAt: '2030-12-06T00:00:00.000Z'});
  expect(decoded.subjectDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(decoded)).not.toContain(account().username);
  expect(JSON.stringify(decoded)).not.toContain(account().email);
  expect(decoded).not.toHaveProperty('amount');
  expect(native.decodeHeygenAccountV1({...account(), email: 'changed@example.com'}, 'https://api2.heygen.com').subjectDigest).toBe(decoded.subjectDigest);
  for (const changed of [{billing_type: 'usage_based'}, {username: account().email}, {wallet: {}}, {usage_based: {}},
    {subscription: {plan: 'creator', credits: {premium_credits: {remaining: -1, resets_at: null}}}},
    {subscription: {plan: 'creator', credits: {premium_credits: {remaining: 200, resets_at: 'invalid'}}}}])
    expect(() => native.decodeHeygenAccountV1({...account(), ...changed}, 'https://api2.heygen.com')).toThrow();
});

test('account and video reads use fixed native tools without enabling the generic renderer or price tools', async () => {
  await withFixture(async (f, def, token) => {
    f.script('heygen', 'get_current_user', account());
    const balance = await f.mcp.readHeygenAccountV1(def, token, async () => {});
    expect(balance.remaining).toBe('200');
    f.script('heygen', 'get_video', {id: 'job_owned', status: 'completed', video_url: 'https://cdn.example.com/video.mp4', duration: 20, failure_code: null, failure_message: null});
    expect(await f.mcp.readHeygenVideoV1(def, token, 'job_owned', async () => {})).toEqual({jobId: 'job_owned', state: 'completed', url: 'https://cdn.example.com/video.mp4', actualCost: null, durationSeconds: 20});
    expect(f.state.toolCalls.map(({name, args}) => ({name, args}))).toEqual([{name: 'get_current_user', args: {}}, {name: 'get_video', args: {videoId: 'job_owned'}}]);
    expect(creates(f)).toHaveLength(0); expect(f.state.quotes).toHaveLength(0);
  });
});

test('native schema drift, duplicate inventory and revoked guards stop before any create', async () => {
  for (const mutate of [tools => {tools.find(t => t.name === 'create_video_from_avatar').inputSchema.properties.changed = {type: 'string'};},
    tools => {tools.push(structuredClone(tools[0]));}]) {
    await withFixture(async (f, def, token) => {
      mutate(f.state.tools.heygen);
      await expect(f.mcp.renderHeygenAvatarV1(def, token, native.heygenAvatarArgsV1(input()), async () => {},
        {beforeDispatch: async () => {}, afterResponse: async () => {}})).rejects.toMatchObject({response: {code: 'VIDEO_SCHEMA_CHANGED'}});
      expect(creates(f)).toHaveLength(0);
    });
  }
  await withFixture(async (f, def, token) => {
    await expect(f.mcp.renderHeygenAvatarV1(def, token, native.heygenAvatarArgsV1(input()), async () => videoErrorV1('VIDEO_REAUTH_REQUIRED', 409),
      {beforeDispatch: async () => {}, afterResponse: async () => {}})).rejects.toMatchObject({response: {code: 'VIDEO_REAUTH_REQUIRED'}});
    expect(f.state.toolCalls).toHaveLength(0);
    await expect(f.mcp.readHeygenAccountV1({...def, resource: 'https://foreign.example/mcp'}, token, async () => {})).rejects.toMatchObject({response: {code: 'VIDEO_ACCESS_DENIED'}});
  });
});

test.each(['create_video_from_avatar', 'get_video'])('account preflight rejects %s schema drift before any provider tool call', async name => {
  await withFixture(async (f, def, token) => {
    f.state.tools.heygen.find(tool => tool.name === name).inputSchema.properties.new_setting = {type: 'string'};
    f.script('heygen', 'get_current_user', account());
    await expect(f.mcp.readHeygenAccountV1(def, token, async () => {}))
      .rejects.toMatchObject({response: {code: 'VIDEO_SCHEMA_CHANGED'}});
    expect(f.state.toolCalls).toHaveLength(0); expect(creates(f)).toHaveLength(0);
    expect(f.state.quotes).toHaveLength(0); expect(f.state.polls).toHaveLength(0);
  });
});

test('native discovery accepts a bounded large inventory and unrelated changes without approving extra tools', async () => {
  await withFixture(async (f, def, token) => {
    f.state.tools.heygen.push({name: 'unrelated_mutation', inputSchema: {type: 'object', description: 'x'.repeat(1100 * 1024)}});
    f.script('heygen', 'get_current_user', account());
    expect((await f.mcp.readHeygenAccountV1(def, token, async () => {})).plan).toBe('creator');
    expect(f.state.toolCalls.map(call => call.name)).toEqual(['get_current_user']);
  });
});

test('dispatch is durably marked before the sole create and raw receipt is saved before parsing or a revoked post-send guard', async () => {
  await withFixture(async (f, def, token) => {
    f.script('heygen', 'create_video_from_avatar', {id: 'created_once', unknown_extra: {success: true}});
    const events = []; let captured;
    const guard = async () => {if (captured) videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);};
    await expect(f.mcp.renderHeygenAvatarV1(def, token, native.heygenAvatarArgsV1(input()), guard, {
      beforeDispatch: async () => {expect(creates(f)).toHaveLength(0); events.push('dispatch');},
      afterResponse: async raw => {expect(creates(f)).toHaveLength(1); captured = raw; events.push('receipt');},
    })).rejects.toMatchObject({response: {code: 'VIDEO_REAUTH_REQUIRED'}});
    expect(events).toEqual(['dispatch', 'receipt']); expect(creates(f)).toHaveLength(1);
    expect(captured.kind).toBe('http');
    expect(native.decodeHeygenAvatarReceiptV1(captured)).toEqual({id: 'created_once'});
  });
});

test('lost or malformed create response stays one attempt and cleanup never masquerades as its receipt', async () => {
  for (const response of ['lost', 'malformed', 'isError', {}, {id: 'one', video_id: 'another'}]) await withFixture(async (f, def, token) => {
    f.script('heygen', 'create_video_from_avatar', response);
    const beforeDispatch = jest.fn(async () => {}), afterResponse = jest.fn(async () => {});
    await expect(f.mcp.renderHeygenAvatarV1(def, token, native.heygenAvatarArgsV1(input()), async () => {}, {beforeDispatch, afterResponse})).rejects.toThrow();
    expect(creates(f)).toHaveLength(1); expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(afterResponse).toHaveBeenCalledTimes(response === 'lost' ? 0 : 1);
    expect(f.state.polls).toHaveLength(0);
  });
});

test('failed dispatch admission prevents a create, and failed receipt persistence never retries one', async () => {
  await withFixture(async (f, def, token) => {
    await expect(f.mcp.renderHeygenAvatarV1(def, token, native.heygenAvatarArgsV1(input()), async () => {}, {
      beforeDispatch: async () => videoErrorV1('VIDEO_PREFLIGHT_STALE', 409), afterResponse: async () => {},
    })).rejects.toThrow();
    expect(creates(f)).toHaveLength(0);
    f.script('heygen', 'create_video_from_avatar', {id: 'created_once'});
    await expect(f.mcp.renderHeygenAvatarV1(def, token, native.heygenAvatarArgsV1(input()), async () => {}, {
      beforeDispatch: async () => {}, afterResponse: async () => {throw new Error('storage unavailable');},
    })).rejects.toThrow();
    expect(creates(f)).toHaveLength(1);
  });
});

test('receipts support explicit unambiguous direct, MCP and HTTP/SSE IDs without inventing success', () => {
  const result = {content: [{type: 'text', text: JSON.stringify({video_id: 'owned_job'})}]};
  const rpc = {jsonrpc: '2.0', id: 1, result};
  for (const raw of [{id: 'owned_job'}, result, rpc, {kind: 'http', status: 200, body: JSON.stringify(rpc)},
    {kind: 'http', status: 200, body: `event: message\ndata: ${JSON.stringify(rpc)}\n\n`}])
    expect(native.decodeHeygenAvatarReceiptV1(raw)).toEqual({id: 'owned_job'});
  for (const raw of [{id: '../unsafe'}, {id: 'a', video_id: 'b'}, {success: false, id: 'a'}, {isError: true, ...result},
    {kind: 'http', status: 500, body: JSON.stringify(rpc)}, {kind: 'http', status: 200, body: 'invalid'}])
    expect(() => native.decodeHeygenAvatarReceiptV1(raw)).toThrow();
});

test('explicit owned-voice rejection requires matching non-retryable evidence without any provider job ID or unknown code', () => {
  const payload = {error: true, status_code: 403, retryable: false, error_code: 'voice_not_usable',
    message: 'Synthetic voice failed to process.', doc_url: 'https://developers.heygen.com/docs/errors'};
  const mcp = (structured = payload, text = structured) => ({isError: true, structuredContent: structured, content: [{type: 'text', text: JSON.stringify(text)}]});
  const http = result => ({kind: 'http', status: 200, body: JSON.stringify({jsonrpc: '2.0', id: 1, result})});
  expect(native.decodeHeygenAvatarRejectionV1(http(mcp()))).toEqual({code: 'VIDEO_OWNED_VOICE_UNUSABLE', providerCode: 'voice_not_usable', retryable: false});
  for (const raw of [
    http(mcp(payload, {...payload, retryable: true})), http(mcp({...payload, error_code: 'unknown_refusal'})),
    http(mcp({...payload, retryable: true})), http(mcp({...payload, id: 'possibly_created_job'})),
    http(mcp({...payload, video_id: 'possibly_created_job'})), http({...mcp(), video_id: 'possibly_created_job'}),
    http({...mcp(), id: 'possibly_created_job'}), http({...mcp(), isError: false}),
    {...http(mcp()), status: 403}, {kind: 'http', status: 200, body: '{invalid'},
  ]) expect(native.decodeHeygenAvatarRejectionV1(raw)).toBeNull();
});

test('flat HeyGen statuses require the exact receipt, explicit completion and a result URL; cost stays unknown', () => {
  for (const [status, state] of [['queued', 'queued'], ['pending', 'queued'], ['processing', 'running'], ['completed', 'completed'], ['failed', 'failed'], ['canceled', 'canceled']]) {
    const decoded = native.decodeHeygenVideoV1({id: 'owned_job', status, video_url: 'https://cdn.example.com/video.mp4', charge: {amount: '5'}}, 'owned_job');
    expect(decoded.state).toBe(state); expect(decoded.actualCost).toBeNull();
  }
  for (const raw of [{id: 'foreign_job', status: 'completed', video_url: 'https://cdn.example.com/video.mp4'}, {id: 'owned_job', status: 'completed'},
    {id: 'owned_job', status: 'succeeded'}, {id: 'owned_job', status: '__proto__'}, {id: 'owned_job', status: 'toString'},
    {id: 'owned_job', status: 'completed', video_url: 'https://cdn.example.com/video.mp4', failure_code: 'failed'},
    {id: 'owned_job', status: 'completed', video_url: 'http://cdn.example.com/video.mp4'}, {id: 'owned_job', status: 'completed', error: 'failed'}])
    expect(() => native.decodeHeygenVideoV1(raw, 'owned_job')).toThrow();
});
