const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderFixture, codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');

const settings = (model = 'wan-3.0') => ({provider: 'higgsfield', model, mode: 'clip', locale: 'ru', duration: 5, aspectRatio: '9:16', resolution: '720p', audio: false, captions: false});
const brief = {prompt: 'Масса 12,5 кг. Продукт не содержит сахар.', script: '', scriptPolicy: 'exact'};
const withFixture = async run => {
  const f = await createProviderFixture();
  try { return await run(f, f.runtime.definition('higgsfield'), f.issueTokens('higgsfield').access_token); }
  finally { await f.close(); }
};

test('synthetic Higgsfield OAuth-authorized MCP quote and submit use exact Wan/Kling arguments over HTTP', async () => {
  for (const model of ['wan-3.0', 'kling-3.0']) await withFixture(async (f, def, token) => {
    const references = model === 'kling-3.0' ? [{id: 'owned-reference', url: 'https://93.184.216.34/owned-reference.png'}] : [];
    const request = await f.higgsfield.prepare(def, token, settings(model), brief, references);
    assert.equal(f.state.submits.length, 0); assert.equal(f.state.quotes.length, 1);
    assert.equal(request.quote.unit, 'higgsfield_credit'); assert.equal(request.quote.amount, '0.125');
    assert.equal(request.quote.upperBound, null); assert.equal(request.quote.source, 'provider_quote');
    assert.equal(request.schemaDigest, def.schemaDigests[0]);
    assert.deepEqual(request.args, {model, prompt: brief.prompt, duration: 5, aspect_ratio: '9:16', resolution: '720p', locale: 'ru', audio: false,
      ...(references.length ? {image_url: references[0].url} : {}), get_cost: false});
    assert.deepEqual(f.state.quotes[0].args, {...request.args, get_cost: true});
    const receipt = await f.higgsfield.submit(def, token, request);
    assert.equal(f.state.submits.length, 1); assert.deepEqual(f.state.submits[0].args, request.args);
    const status = await f.higgsfield.poll(def, token, receipt);
    assert.equal(status.state, 'completed'); assert.equal(status.jobId, receipt.id); assert.equal(status.actualCost, null);
    assert.deepEqual(f.state.polls[0].args, {job_id: receipt.id, timeout_seconds: 1});
    assert.ok(f.state.egress.every(call => new URL(call.url).origin === f.origin));
  });
});

test('Higgsfield unknown schema or unsupported option makes zero quotes/submits', async () => {
  await withFixture(async (f, def, token) => {
    f.state.tools.higgsfield[0].inputSchema.properties.model.enum.push('unreviewed');
    await assert.rejects(f.higgsfield.prepare(def, token, settings(), brief, []), e => codeOf(e) === 'VIDEO_SCHEMA_UNSUPPORTED');
    assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
  });
  for (const override of [{model: 'unknown'}, {duration: 30}, {audio: true}, {captions: true}, {resolution: '4k'}, {aspectRatio: '1:1'}]) await withFixture(async (f, def, token) => {
    await assert.rejects(f.higgsfield.prepare(def, token, {...settings(), ...override}, brief, []), e => codeOf(e) === 'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE');
    assert.equal(f.state.quotes.length, 0); assert.equal(f.state.submits.length, 0);
  });
});

test('Higgsfield missing, expired, wrong-unit, generating or malformed quote is unavailable without submit', async () => {
  for (const response of [
    {}, {kind: 'quote', unit: 'USD', credits: '0.125'}, {kind: 'quote', unit: 'higgsfield_credit', credits: 0.125},
    {kind: 'quote', unit: 'higgsfield_credit', credits: '0.125', expires_at: '2000-01-01T00:00:00.000Z'},
    {kind: 'quote', unit: 'higgsfield_credit', credits: '0.125', job_id: 'unexpected-generation'}, 'malformed', 'isError',
  ]) await withFixture(async (f, def, token) => {
    f.script('higgsfield', 'generate_clip', response);
    await assert.rejects(f.higgsfield.prepare(def, token, settings(), brief, []));
    assert.equal(f.state.submits.length, 0);
  });
});

test('Higgsfield lost/malformed/error submit response has exactly one HTTP mutation and no hidden retry', async () => {
  for (const response of ['lost', 'malformed', 'isError', {}, {job_id: '../foreign'}]) await withFixture(async (f, def, token) => {
    const request = await f.higgsfield.prepare(def, token, settings(), brief, []);
    f.script('higgsfield', 'generate_clip', response);
    await assert.rejects(f.higgsfield.submit(def, token, request));
    assert.equal(f.state.submits.length, 1); assert.equal(f.state.quotes.length, 1);
    assert.equal(f.state.polls.length, 0);
  });
});

test('Higgsfield charge evidence must match receipt job ID and credit unit', async () => {
  await withFixture(async (f, def, token) => {
    const request = await f.higgsfield.prepare(def, token, settings(), brief, []);
    const receipt = await f.higgsfield.submit(def, token, request);
    f.state.confirmedCharge = '0.123456';
    assert.equal((await f.higgsfield.poll(def, token, receipt)).actualCost, '0.123456');
    for (const charge of [{job_id: 'other', unit: 'higgsfield_credit', amount: '0.1'}, {job_id: receipt.id, unit: 'USD', amount: '0.1'}]) {
      f.script('higgsfield', 'jobs_wait', {job_id: receipt.id, status: 'completed', video_url: 'https://93.184.216.34/video.mp4', charge});
      assert.equal((await f.higgsfield.poll(def, token, receipt)).actualCost, null);
    }
  });
});

test('Higgsfield malformed status and missing completed file never become success', async () => {
  for (const status of [{job_id: 'job', status: 'made_up'}, {job_id: 'job', status: 'completed'}, 'isError']) await withFixture(async (f, def, token) => {
    f.script('higgsfield', 'jobs_wait', status);
    await assert.rejects(f.higgsfield.poll(def, token, {id: 'job'}));
    assert.equal(f.state.submits.length, 0);
  });
});
