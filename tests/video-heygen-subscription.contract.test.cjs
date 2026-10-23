const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderFixture, codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');

const settings = () => ({provider: 'heygen', model: 'heygen-avatar', mode: 'presenter', locale: 'ru', duration: 15, aspectRatio: '9:16', resolution: '720p', audio: true, captions: true, engine: 'avatar_iii', avatarId: 'fixture_avatar', voiceId: 'fixture_voice_ru'});
const brief = {prompt: '', script: 'Запуск 22.10.2026. Масса 12,5 кг. Продукт не содержит сахар.\nНе обещайте лечение.', scriptPolicy: 'exact'};
const withFixture = async run => {
  const f = await createProviderFixture();
  try { return await run(f, f.runtime.definition('heygen'), f.issueTokens('heygen').access_token); }
  finally { await f.close(); }
};

test('synthetic HeyGen exact-script MCP keeps dates/numbers/negations, explicit renderer, voice/locale and captions', async () => {
  await withFixture(async (f, def, token) => {
    const request = await f.heygen.prepare(def, token, settings(), brief, []);
    assert.equal(f.state.submits.length, 0); assert.equal(f.state.quotes.length, 1);
    assert.deepEqual(request.args, {script: brief.script, engine: 'avatar_iii', avatar_id: 'fixture_avatar', voice_id: 'fixture_voice_ru', locale: 'ru', aspect_ratio: '9:16', resolution: '720p', captions: true});
    assert.deepEqual(f.state.quotes[0].args, request.args); assert.equal(request.args.duration, undefined);
    assert.equal(request.quote.unit, 'heygen_credit'); assert.equal(request.quote.amount, '0.125'); assert.equal(request.quote.upperBound, null);
    const receipt = await f.heygen.submit(def, token, request);
    assert.match(receipt.id, /^fixture_heygen_/); assert.deepEqual(f.state.submits[0].args, request.args);
    const status = await f.heygen.poll(def, token, receipt);
    assert.equal(status.jobId, receipt.id); assert.equal(status.state, 'completed'); assert.equal(status.actualCost, null);
    assert.deepEqual(f.state.polls[0].args, {video_id: receipt.id});
    assert.ok(f.state.rpc.every(call => call.method !== 'create_video_agent'));
  });
});

test('HeyGen unknown trial eligibility, API key requirement and unavailable asset fail without video generation', async () => {
  for (const eligibility of ['unknown', 'unlimited', null]) await withFixture(async (f, def, token) => {
    f.state.eligibility = eligibility;
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []), e => codeOf(e) === 'VIDEO_SUBSCRIPTION_TRIAL_UNVERIFIED');
    assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
  });
  await withFixture(async (f, def, token) => {
    f.script('heygen', 'list_avatars', {error: 'api_key_required'});
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []), e => codeOf(e) === 'VIDEO_SUBSCRIPTION_API_KEY_REQUIRED');
    assert.equal(f.state.submits.length, 0);
  });
  for (const override of [{voiceId: 'foreign_voice'}, {avatarId: 'foreign_avatar'}, {locale: 'ja-JP'}]) await withFixture(async (f, def, token) => {
    await assert.rejects(f.heygen.prepare(def, token, {...settings(), ...override}, brief, []), e => codeOf(e) === 'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE');
    assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
  });
});

test('HeyGen implicit/unknown renderer, non-exact script or unsupported settings cannot be submitted', async () => {
  for (const override of [{engine: undefined}, {engine: 'avatar_v'}, {audio: false}, {resolution: '4k'}, {mode: 'clip'}]) await withFixture(async (f, def, token) => {
    await assert.rejects(f.heygen.prepare(def, token, {...settings(), ...override}, brief, []));
    assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
  });
  await withFixture(async (f, def, token) => {
    await assert.rejects(f.heygen.prepare(def, token, settings(), {...brief, scriptPolicy: 'creative'}, []));
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, [{id: 'image'}]));
    assert.equal(f.state.submits.length, 0);
  });
});

test('HeyGen unreviewed/missing quote schema and unknown/expired price never borrow API USD prices', async () => {
  await withFixture(async (f, def, token) => {
    f.state.tools.heygen = f.state.tools.heygen.filter(t => t.name !== 'quote_video');
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []), e => codeOf(e) === 'VIDEO_SCHEMA_UNSUPPORTED');
    assert.equal(f.state.submits.length, 0);
  });
  for (const response of [{}, {kind: 'quote', unit: 'USD', credits: '1'}, {kind: 'quote', unit: 'heygen_credit', credits: null}, {kind: 'quote', unit: 'heygen_credit', credits: '0.1', expires_at: '2000-01-01T00:00:00Z'}, 'malformed', 'isError']) await withFixture(async (f, def, token) => {
    f.script('heygen', 'quote_video', response);
    await assert.rejects(f.heygen.prepare(def, token, settings(), brief, []));
    assert.equal(f.state.submits.length, 0);
  });
});

test('HeyGen lost/malformed/failed create response is one mutation; data receipt envelope is checked', async () => {
  for (const response of ['lost', 'malformed', 'isError', {}, {data: {video_id: '../unsafe'}}]) await withFixture(async (f, def, token) => {
    const request = await f.heygen.prepare(def, token, settings(), brief, []);
    f.script('heygen', 'create_video', response);
    await assert.rejects(f.heygen.submit(def, token, request));
    assert.equal(f.state.submits.length, 1); assert.equal(f.state.polls.length, 0);
  });
});

test('HeyGen completed data envelope preserves only same-job/same-unit charge and result URL', async () => {
  await withFixture(async (f, def, token) => {
    const request = await f.heygen.prepare(def, token, settings(), brief, []);
    const receipt = await f.heygen.submit(def, token, request); f.state.confirmedCharge = '0.100001';
    assert.equal((await f.heygen.poll(def, token, receipt)).actualCost, '0.100001');
    f.script('heygen', 'get_video', {data: {job_id: receipt.id, status: 'completed', video_url: 'https://93.184.216.34/a.mp4', charge: {job_id: receipt.id, unit: 'USD', amount: '1'}}});
    assert.equal((await f.heygen.poll(def, token, receipt)).actualCost, null);
    f.script('heygen', 'get_video', {data: {job_id: receipt.id, status: 'completed'}});
    await assert.rejects(f.heygen.poll(def, token, receipt));
  });
});
