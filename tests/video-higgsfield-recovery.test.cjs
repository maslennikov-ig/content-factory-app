const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const base = 'libraries/nestjs-libraries/src/videos/';
const contract = loadTypeScriptModule(base + 'video-provider.v1.ts');
const nest = { Injectable: () => () => {}, Inject: () => () => {}, Optional: () => () => {} };
const { HiggsfieldProviderV1 } = loadTypeScriptModule(base + 'providers/higgsfield.provider.ts', {
  '@nestjs/common': nest, '../video-provider.v1': contract,
});
const pending = ['accepted', 'submitting', 'queued', 'running', 'saving'];
const unexpectedSourceArtifact = () => { throw Error('Unexpected source-artifact operation in legacy recovery fixture'); };
const { VideoJobService } = loadTypeScriptModule(base + 'video-job.service.ts', {
  '@nestjs/common': nest, '@prisma/client': {}, 'openai/helpers/zod': {},
  '../database/prisma/video-generation/video-generation.repository': { VIDEO_PENDING_V1: pending },
  '../openai/ai.usage.service': {}, '../openai/ai.clients': {}, '../openai/ai.provider.config': {},
  '../user/acting.user': { runAsActingUser: (_user, run) => run() },
  './video-credentials.service': {}, './providers/higgsfield.provider': { HiggsfieldProviderV1 },
  './providers/heygen.provider': {}, './video-media.v1': {}, './video-execution.port.v1': {}, './video-composition.provider.v1': {},
  './video-brief.v1': { videoErrorV1: code => { const error = new Error(code); error.getResponse = () => ({ code }); throw error; } },
  // Source-bound preparation is outside these legacy recovery cases; fail closed if entered.
  '../content-intelligence/social-factory/source-artifact.service': { SourceArtifactServiceV1: unexpectedSourceArtifact },
  '../content-intelligence/social-factory/source-artifact.repository': { assertSourceArtifactBindingV1: unexpectedSourceArtifact },
  './video-provider.v1': contract,
});
const credential = { provider: 'higgsfield', apiKey: 'fixture:secret', payer: 'workspace_key', reference: 'fixture-account', maxCostUsd: 5, monthlyBudgetUsd: 20 };
const endpoint = 'https://api.higgsfield.ai/alibaba/wan-3.0/text-to-video';
const body = { prompt: 'A quiet forest.', duration: 5, resolution: '720p', aspect_ratio: '9:16', generate_audio: false, enable_thinking: false };
const request = () => ({ provider: 'higgsfield', endpoint, body: { ...body }, estimate: { usd: 0.25, currency: 'USD', source: 'higgsfield_account_estimate', expiresAt: new Date(Date.now() + 300_000).toISOString() } });
const receipt = { request_id: 'fixture_request', status_url: 'https://api.higgsfield.ai/requests/fixture_request/status', cancel_url: 'https://api.higgsfield.ai/requests/fixture_request/cancel' };
const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const input = submission => ({ settings: { provider: 'higgsfield', model: 'wan-3.0', mode: 'clip', locale: 'ru-RU', duration: 5, resolution: '720p', aspectRatio: '9:16', audio: false, captions: false }, prompt: body.prompt, script: '', references: [], scriptPolicy: 'exact', ...(submission === undefined ? {} : { submission }) });

async function network(handler, run) {
  const old = global.fetch; const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, ...init }); return handler(url, init, calls); };
  try { return await run(calls); } finally { global.fetch = old; }
}
function fixture(overrides = {}) {
  const row = { id: 'job', organizationId: 'org', userId: 'user', state: 'accepted', provider: 'higgsfield', model: 'wan-3.0', payer: 'workspace_key', credentialReference: 'fixture-account',
    request: request(), idempotencyKey: 'one-generation-intent', createdAt: new Date(), submitAttempts: 0, pollAttempts: 0, saveAttempts: 0, runCycle: 0, receipt: null,
    costUsd: null, reservedUsd: 5, storedFile: null, resultMediaId: null, ...overrides };
  const writes = []; const imports = []; const finished = [];
  let lease = null;
  const repository = {
    job: async () => structuredClone(row),
    claim: async (_org, _id, owner) => { if (lease) return false; lease = owner; return true; },
    release: async () => { lease = null; },
    write: async (_org, _id, owner, data) => {
      assert.equal(owner, lease); writes.push(structuredClone(data));
      for (const [key, value] of Object.entries(data)) row[key] = value?.increment === undefined ? structuredClone(value) : row[key] + value.increment;
    },
    finishUsage: async () => {},
    attachResult: async () => { row.state = 'completed'; row.resultMediaId = 'owned'; },
  };
  const credentials = { resolvePinned: async () => credential, admissionConfig: async () => ({}) };
  const usage = { beginAiOperationWithConfig: async () => ({ id: 'usage', finish: async success => finished.push(success), voidUnstarted: async () => {} }) };
  const media = { importVideo: async url => { imports.push(url); return { name: 'owned.mp4', path: 'https://owned.example/owned.mp4', size: 100 }; } };
  return { row, writes, imports, finished, restart: () => new VideoJobService(repository, credentials, usage, new HiggsfieldProviderV1(), {}, media, {}),
    step: async () => new VideoJobService(repository, credentials, usage, new HiggsfieldProviderV1(), {}, media, {}).runStep('org', 'job') };
}

test('Higgsfield freezes webhook/retention with the prepared payload and sends the documented query/header', async () => {
  await network(url => url.includes('/estimate/') ? json({ usd: '0.25' }) : json({ ...receipt, expires_after: 3600 }), async calls => {
    const submission = { webhookUrl: 'https://app.example/higgsfield?token=opaque', expiresAfterSeconds: 3600 };
    const p = new HiggsfieldProviderV1(); const prepared = await p.prepare(input(submission), credential);
    assert.deepEqual(prepared.submission, submission); assert.ok(Object.isFrozen(prepared.submission));
    submission.webhookUrl = 'https://other.example/changed';
    const accepted = await p.submit(prepared, 'intent', credential);
    assert.equal(new URL(calls[1].url).searchParams.get('hf_webhook'), 'https://app.example/higgsfield?token=opaque');
    assert.equal(calls[1].headers['Hf-Expires-After'], '3600');
    assert.equal(calls[1].body, calls[0].body); assert.equal(accepted.expiresAfterSeconds, 3600);
    assert.equal(prepared.estimate.upperBoundUsd, undefined);
  });
});

test('invalid Higgsfield webhook/retention options stop before estimates or paid requests', async () => {
  await network(() => { throw Error('Unexpected network'); }, async calls => {
    for (const submission of [{ webhookUrl: 'http://app.example/hook' }, { webhookUrl: null }, { expiresAfterSeconds: 3599 }, { expiresAfterSeconds: 604801 }, { expiresAfterSeconds: '3600' }, { Authorization: 'unsafe' }]) {
      const p = new HiggsfieldProviderV1();
      await assert.rejects(p.prepare(input(submission), credential));
      await assert.rejects(p.submit({ ...request(), submission }, 'intent', credential));
    }
    assert.equal(calls.length, 0);
  });
});

test('one immediate replay uses the durable endpoint/body/webhook/retention/key and keeps quote separate from actual cost', async () => {
  for (const submission of [undefined, { webhookUrl: 'https://app.example/hook?destination=a', expiresAfterSeconds: 3600 }]) {
    const f = fixture(); if (submission) f.row.request.submission = submission;
    await network((_url, _init, calls) => { if (calls.length === 1) throw Error('Lost response'); return json(receipt); }, async calls => {
      assert.deepEqual(await f.step(), { state: 'queued', done: false }); assert.equal(calls.length, 2);
      assert.equal(calls[0].url, calls[1].url); assert.equal(calls[0].body, calls[1].body); assert.deepEqual(calls[0].headers, calls[1].headers);
      assert.equal(f.row.submitAttempts, 2); assert.equal(f.row.receipt.id, receipt.request_id);
      const recovery = f.row.request.submitRecovery;
      assert.equal(recovery.idempotencyKey, f.row.idempotencyKey); assert.match(recovery.requestDigest, /^[0-9a-f]{64}$/);
      assert.equal(Date.parse(recovery.replayUntil) - f.row.submittedAt.getTime(), 60_000);
      assert.equal(f.row.costUsd, null); assert.equal(f.row.reservedUsd, 5);
    });
  }
});

test('replay rejection cannot prove that the earlier ambiguous paid submit was free or unaccepted', async () => {
  for (const status of [401, 422, 429, 503]) {
    const f = fixture();
    await network((_url, _init, calls) => { if (calls.length === 1) throw Error('Lost accepted response'); return json({ detail: 'private text' }, status); }, async calls => {
      assert.deepEqual(await f.step(), { state: 'uncertain', done: true }); assert.equal(calls.length, 2);
      assert.equal(f.row.costUsd, null); assert.equal(f.row.reservedUsd, 5); assert.equal(f.row.finishedAt, undefined);
      assert.equal(f.row.errorCode, `video_provider_http_${status}`);
      await f.restart().runStep('org', 'job'); assert.equal(calls.length, 2);
    });
  }
});

test('changed persisted endpoint, JSON, webhook, retention, key or deadline prevents a paid replay', async () => {
  const mutations = [
    row => { row.request.endpoint = endpoint.replace('text-to-video', 'image-to-video'); },
    row => { row.request.body.prompt = 'Another intent'; },
    row => { row.request.body.image_url = null; },
    row => { row.request.submission.webhookUrl = 'https://app.example/other'; },
    row => { row.request.submission.expiresAfterSeconds = 7200; },
    row => { row.idempotencyKey = 'different-intent'; },
    row => { row.model = 'hyperframes'; },
    row => { delete row.request.submitRecovery; },
    row => { row.request.submitRecovery.replayUntil = new Date(Date.now() + 600_000).toISOString(); },
  ];
  for (const mutate of mutations) {
    const f = fixture(); f.row.request.submission = { webhookUrl: 'https://app.example/hook', expiresAfterSeconds: 3600 };
    await network(() => { mutate(f.row); throw Error('Lost response'); }, async calls => {
      assert.deepEqual(await f.step(), { state: 'uncertain', done: true }); assert.equal(calls.length, 1);
      assert.equal(f.row.errorCode, 'VIDEO_SUBMIT_REPLAY_MISMATCH'); assert.equal(f.row.costUsd, null); assert.equal(f.row.submitAttempts, 1);
    });
  }
});

test('jsonb object ordering alone preserves replay identity', async () => {
  const f = fixture();
  await network((_url, _init, calls) => {
    if (calls.length === 1) { f.row.request.body = Object.fromEntries(Object.entries(f.row.request.body).reverse()); throw Error('Lost response'); }
    return json(receipt);
  }, async calls => { assert.equal((await f.step()).state, 'queued'); assert.equal(calls.length, 2); assert.deepEqual(JSON.parse(calls[0].body), JSON.parse(calls[1].body)); });
});

test('the local persisted replay deadline is not extended after a delayed ambiguous response', async () => {
  const f = fixture(); const oldNow = Date.now; let now = oldNow(); Date.now = () => now;
  try {
    await network(() => { now += 60_001; throw Error('Delayed response'); }, async calls => {
      assert.deepEqual(await f.step(), { state: 'uncertain', done: true }); assert.equal(calls.length, 1);
      assert.equal(f.row.errorCode, 'VIDEO_SUBMIT_REPLAY_EXPIRED'); assert.equal(f.row.submitAttempts, 1);
    });
  } finally { Date.now = oldNow; }
});

test('an interrupted legacy submission stays uncertain after restart and never invents recovery metadata', async () => {
  const f = fixture({ state: 'submitting', submitAttempts: 1, submittedAt: new Date() });
  await network(() => { throw Error('Unexpected paid replay'); }, async calls => {
    assert.deepEqual(await f.step(), { state: 'uncertain', done: true }); await f.restart().runStep('org', 'job');
    assert.equal(calls.length, 0); assert.equal(f.row.request.submitRecovery, undefined); assert.equal(f.row.costUsd, null);
  });
});

test('Higgsfield status keeps provider deletion time without treating a quote or unrelated charge field as actual cost', async () => {
  const expiresAt = '2027-01-01T10:00:00.000Z';
  await network(() => json({ request_id: receipt.request_id, status: 'completed', video: { url: 'https://cdn.example/file.mp4' }, expires_at: expiresAt, usd: '0.25', cost_usd: '0.25' }), async () => {
    const status = await new HiggsfieldProviderV1().poll({ id: receipt.request_id, statusUrl: receipt.status_url }, credential);
    assert.equal(status.expiresAt, expiresAt); assert.equal(status.costUsd, undefined);
  });
});

test('an expired saved URL refreshes the same receipt and imports its still-available fresh output', async () => {
  const f = fixture({ state: 'saving', receipt: { id: receipt.request_id, statusUrl: receipt.status_url }, providerResult: { state: 'succeeded', url: 'https://cdn.example/old.mp4', expiresAt: '2000-01-01T00:00:00Z' } });
  await network(() => json({ request_id: receipt.request_id, status: 'completed', video: { url: 'https://cdn.example/fresh.mp4' }, expires_at: new Date(Date.now() + 60_000).toISOString() }), async calls => {
    assert.deepEqual(await f.step(), { state: 'completed', done: true }); assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET');
    assert.deepEqual(f.imports, ['https://cdn.example/fresh.mp4']); assert.equal(f.row.submitAttempts, 0);
  });
});

test('expired fresh provider output records a save failure without downloading or regenerating it', async () => {
  const f = fixture({ state: 'saving', saveAttempts: 1, receipt: { id: receipt.request_id, statusUrl: receipt.status_url }, providerResult: { state: 'succeeded', url: 'https://cdn.example/old.mp4' } });
  await network(() => json({ request_id: receipt.request_id, status: 'completed', expires_at: '2000-01-01T00:00:00Z' }), async calls => {
    assert.deepEqual(await f.step(), { state: 'save_failed', done: true }); assert.equal(calls.length, 1);
    assert.equal(f.row.errorCode, 'VIDEO_PROVIDER_RESULT_EXPIRED'); assert.deepEqual(f.imports, []); assert.equal(f.row.costUsd, null);
  });
});

test('a refreshed receipt that is not complete never falls back to the previous result URL', async () => {
  const f = fixture({ state: 'saving', saveAttempts: 1, receipt: { id: receipt.request_id, statusUrl: receipt.status_url }, providerResult: { state: 'succeeded', url: 'https://cdn.example/old.mp4' } });
  await network(() => json({ request_id: receipt.request_id, status: 'queued' }), async calls => {
    assert.deepEqual(await f.step(), { state: 'save_failed', done: true }); assert.equal(calls.length, 1);
    assert.equal(f.row.errorCode, 'VIDEO_PROVIDER_RESULT_MISSING'); assert.deepEqual(f.imports, []);
  });
});

test('already-owned bytes attach after provider expiry without another provider call', async () => {
  const f = fixture({ state: 'saving', storedFile: { name: 'owned.mp4', path: 'https://owned.example/file.mp4', size: 100 }, providerResult: { expiresAt: '2000-01-01T00:00:00Z' } });
  await network(() => { throw Error('Unexpected provider call'); }, async calls => { assert.equal((await f.step()).state, 'completed'); assert.equal(calls.length, 0); assert.deepEqual(f.imports, []); });
});
