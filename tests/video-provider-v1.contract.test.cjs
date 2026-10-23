const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const root = 'libraries/nestjs-libraries/src/videos/providers/';
const mocks = { '@nestjs/common': { Injectable: () => () => {} } };
const { HiggsfieldProviderV1 } = loadTypeScriptModule(root + 'higgsfield.provider.ts', mocks);
const { HeygenProviderV1 } = loadTypeScriptModule(root + 'heygen.provider.ts', mocks);
const credential = (provider) => ({ provider, apiKey: provider === 'higgsfield' ? 'key:secret' : 'secret', payer: 'workspace_key', reference: 'test-config', maxCostUsd: 5, monthlyBudgetUsd: 10 });
const clip = (model = 'wan-3.0') => ({ settings: { provider: 'higgsfield', model, mode: 'clip', locale: 'ja-JP', duration: 5, aspectRatio: '9:16', ...(model === 'wan-3.0' ? { resolution: '720p' } : {}), audio: false, captions: false }, prompt: 'Product rotates gently.', script: '', references: [], scriptPolicy: 'exact' });
const presenter = () => ({ settings: { provider: 'heygen', model: 'heygen-avatar', mode: 'presenter', locale: 'es-ES', duration: 30, aspectRatio: '9:16', resolution: '720p', audio: true, captions: true, avatarId: 'look_1', voiceId: 'voice_1', engine: 'avatar_iv' }, prompt: '', script: 'El 22 de octubre no subirá el precio de 2,5 euros.', references: [], scriptPolicy: 'exact' });
const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
async function network(fn, operation) {
  const old = global.fetch; const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, ...init }); return fn(url, init, calls); };
  try { return await operation(calls); } finally { global.fetch = old; }
}
function assets(url) {
  if (url.includes('/voices')) return json({ data: [{ voice_id: 'voice_1', name: 'Spanish', language: 'Spanish', type: 'public', support_locale: true, available_engines: ['starfish'] }], has_more: false });
  return json({ data: [{ id: 'look_1', name: 'Stock', avatar_type: 'studio_avatar', supported_api_engines: ['avatar_iii', 'avatar_iv'] }], has_more: false });
}

test('Wan exact account quote uses same immutable explicit JSON as paid submit', async () => {
  const provider = new HiggsfieldProviderV1();
  await network((url) => url.includes('/estimate/') ? json({ usd: '0.123', credits: '2' }) : json({ request_id: 'req_1', status_url: 'https://api.higgsfield.ai/requests/req_1/status', cancel_url: 'https://api.higgsfield.ai/requests/req_1/cancel' }), async calls => {
    const input = clip(); const prepared = await provider.prepare(input, credential('higgsfield'));
    assert.equal(calls.length, 1); assert.match(calls[0].url, /\/estimate\/alibaba\/wan-3\.0\/text-to-video$/);
    assert.deepEqual(prepared.body, { prompt: input.prompt, duration: 5, resolution: '720p', aspect_ratio: '9:16', generate_audio: false, enable_thinking: false });
    assert.equal(prepared.estimate.usd, 0.123); assert.equal(prepared.estimate.upperBoundUsd, undefined);
    assert.ok(Object.isFrozen(prepared.body)); input.prompt = 'changed';
    const receipt = await provider.submit(prepared, 'intent-1', credential('higgsfield'));
    assert.equal(receipt.id, 'req_1'); assert.equal(calls.length, 2);
    assert.equal(calls[0].body, calls[1].body); assert.equal(calls[1].headers['Idempotency-Key'], 'intent-1');
    assert.equal(calls[1].headers.Authorization, 'Key key:secret'); assert.equal(calls[1].redirect, 'error');
  });
});

test('all three Higgsfield image routes use image_url and no array; Kling preserves reference framing', async () => {
  for (const model of ['wan-3.0', 'kling-3.0-standard', 'kling-3.0-pro']) {
    await network(() => json({ usd: '0.3' }), async calls => {
      const input = clip(model); input.references = [{ id: 'owned', url: 'https://media.example/image.jpg', width: 720, height: 1280 }];
      const p = await new HiggsfieldProviderV1().prepare(input, credential('higgsfield'));
      assert.match(p.endpoint, /\/image-to-video$/); assert.equal(p.body.image_url, input.references[0].url);
      assert.equal(p.body.references, undefined); assert.equal(calls.length, 1);
      if (model !== 'wan-3.0') { assert.equal(p.body.aspect_ratio, undefined); assert.equal(p.body.resolution, undefined); assert.equal(p.body.sound, 'off'); }
    });
  }
});

test('invalid Higgsfield combinations stop before any request', async () => {
  await network(() => { throw Error('unexpected'); }, async calls => {
    const cases = [x => x.settings.duration = 31, x => x.settings.captions = true, x => x.settings.locale = 'bad_locale', x => x.references = [{ id: '1', url: 'http://media.example/a' }], x => x.references = [{}, {}]];
    for (const mutate of cases) { const input = clip(); mutate(input); await assert.rejects(new HiggsfieldProviderV1().prepare(input, credential('higgsfield'))); }
    const kling = clip('kling-3.0-pro'); kling.references = [{ id: 'owned', url: 'https://media.example/a', width: 1920, height: 1080 }];
    await assert.rejects(new HiggsfieldProviderV1().prepare(kling, credential('higgsfield')), /video_reference_aspect_mismatch/);
    assert.equal(calls.length, 0);
  });
});

test('lost submit is one network call; provider-specific uncertainty and retryability survive', async () => {
  for (const [provider, request, retryable] of [
    [new HiggsfieldProviderV1(), { provider: 'higgsfield', endpoint: 'https://api.higgsfield.ai/alibaba/wan-3.0/text-to-video', body: { prompt: 'A', duration: 5, resolution: '720p', aspect_ratio: '9:16', generate_audio: false, enable_thinking: false } }, true],
    [new HeygenProviderV1(), { provider: 'heygen', endpoint: 'https://api.heygen.com/v3/videos', body: { type: 'avatar', avatar_id: 'a', voice_id: 'v', script: 'Do not change 2.5.', voice_settings: { locale: 'en-US' }, engine: { type: 'avatar_iv' }, resolution: '720p', aspect_ratio: '9:16', output_format: 'mp4' } }, false],
  ]) await network(() => { throw Error('secret prompt key'); }, async calls => {
    await assert.rejects(provider.submit(request, 'intent-1', credential(provider.id)), error => error.code === 'video_provider_transport' && error.uncertain === true && error.retryable === retryable && !error.message.includes('secret'));
    assert.equal(calls.length, 1);
  });
});

test('Higgsfield schema and paid request guards reject arbitrary restored endpoint/body', async () => {
  await network(() => { throw Error(); }, async calls => {
    const provider = new HiggsfieldProviderV1();
    for (const request of [{ provider: 'higgsfield', endpoint: 'https://evil.example', body: {} }, { provider: 'higgsfield', endpoint: 'https://api.higgsfield.ai/alibaba/wan-3.0/text-to-video', body: { prompt: 'A', duration: 5, callback_url: 'https://evil.example' } }]) await assert.rejects(provider.submit(request, 'intent', credential('higgsfield')));
    assert.equal(calls.length, 0);
  });
});

test('HeyGen v3 script, locale, explicit engine and caption fields come from validated public assets', async () => {
  await network(assets, async calls => {
    const input = presenter(); const p = await new HeygenProviderV1().prepare(input, credential('heygen'));
    assert.equal(calls.length, 2); assert.ok(calls.every(c => c.method === 'GET'));
    assert.equal(p.endpoint, 'https://api.heygen.com/v3/videos'); assert.equal(p.body.type, 'avatar');
    assert.equal(p.body.script, input.script); assert.deepEqual(p.body.engine, { type: 'avatar_iv' });
    assert.deepEqual(p.body.voice_settings, { locale: 'es-ES' }); assert.deepEqual(p.body.caption, { file_format: 'srt', style: 'default' });
    assert.equal(p.body.duration, undefined); assert.equal(p.body.config, undefined);
    assert.equal(p.estimate.usd, 2.415); assert.equal(p.estimate.upperBoundUsd, undefined);
    assert.match(p.estimate.source, /target-duration-only-not-a-hard-cap/);
    assert.ok(Object.isFrozen(p.body.engine));
  });
});

test('HeyGen unsupported locale or unavailable engine never submits', async () => {
  for (const mutate of [x => x.settings.locale = 'ja-JP', x => x.settings.voiceId = 'private_cloned', x => x.settings.engine = 'avatar_v']) {
    await network(assets, async calls => {
      const input = presenter(); mutate(input);
      await assert.rejects(new HeygenProviderV1().prepare(input, credential('heygen')));
      assert.ok(calls.every(c => c.method === 'GET'));
    });
  }
});

test('HeyGen pagination does not silently omit later available account assets or loop forever', async () => {
  await network(url => {
    if (url.includes('/voices') && !url.includes('token=')) return json({ data: [], has_more: true, next_token: 'next token' });
    return assets(url);
  }, async calls => {
    const result = await new HeygenProviderV1().listAssets(credential('heygen'));
    assert.equal(result.voices[0].id, 'voice_1'); assert.equal(calls.length, 3); assert.match(calls[1].url, /token=next%20token/);
  });
  await network(() => json({ data: [], has_more: true, next_token: 'again' }), async calls => {
    await assert.rejects(new HeygenProviderV1().listAssets(credential('heygen')), /video_invalid_asset_cursor/); assert.equal(calls.length, 2);
  });
});

test('receipt URLs cannot send credentials to another host/path/redirect', async () => {
  await network(() => { throw Error('unexpected'); }, async calls => {
    for (const url of ['https://evil.example/requests/r/status', 'https://api.higgsfield.ai/requests/other/status', 'https://api.higgsfield.ai/requests/r/status?redirect=evil', 'https://api.higgsfield.ai@evil.example/requests/r/status']) await assert.rejects(new HiggsfieldProviderV1().poll({ id: 'r', statusUrl: url }, credential('higgsfield')));
    await assert.rejects(new HeygenProviderV1().poll({ id: '../r', statusUrl: 'https://api.heygen.com/v3/videos/r' }, credential('heygen')));
    assert.equal(calls.length, 0);
  });
});

test('provider lifecycle and reported duration are normalized; missing cost remains unknown', async () => {
  await network(() => json({ request_id: 'r', status: 'nsfw', error: 'secret' }), async () => {
    assert.deepEqual(await new HiggsfieldProviderV1().poll({ id: 'r', statusUrl: 'https://api.higgsfield.ai/requests/r/status' }, credential('higgsfield')), { state: 'failed', errorCode: 'video_provider_moderated' });
  });
  await network(() => json({ data: { id: 'v', status: 'completed', video_url: 'https://files.heygen.ai/file.mp4', duration: 31.6 } }), async () => {
    const result = await new HeygenProviderV1().poll({ id: 'v', statusUrl: 'https://api.heygen.com/v3/videos/v' }, credential('heygen'));
    assert.equal(result.state, 'succeeded'); assert.equal(result.duration, 31.6); assert.equal(result.costUsd, undefined); assert.equal(result.resolution, undefined);
  });
});

test('HeyGen v3 creation unwraps the documented data envelope and preserves the paid receipt', async () => {
  const provider = new HeygenProviderV1();
  const request = {provider: 'heygen', endpoint: 'https://api.heygen.com/v3/videos', body: {
    type: 'avatar', avatar_id: 'a', voice_id: 'v', script: 'Exact confirmed script.',
    voice_settings: {locale: 'en-US'}, engine: {type: 'avatar_iii'},
    resolution: '720p', aspect_ratio: '9:16', output_format: 'mp4',
  }};
  await network(() => json({data: {video_id: 'v_abc123def456'}}), async calls => {
    assert.deepEqual(await provider.submit(request, 'intent-1', credential('heygen')), {
      id: 'v_abc123def456', statusUrl: 'https://api.heygen.com/v3/videos/v_abc123def456',
    });
    assert.equal(calls.length, 1);
  });
  for (const body of [{video_id: 'flat-invalid'}, {data: null}, {data: []}]) {
    await network(() => json(body), async calls => {
      await assert.rejects(provider.submit(request, 'intent-1', credential('heygen')),
        error => error.code === 'video_invalid_submit_receipt' && error.uncertain && !error.retryable);
      assert.equal(calls.length, 1);
    });
  }
});

test('cancel acceptance has no JSON and actual state is checked separately', async () => {
  await network((_url, init) => init.method === 'POST' ? { ok: true, status: 202, json: () => { throw Error('must not parse'); } } : json({ request_id: 'r', status: 'queued' }), async calls => {
    const state = await new HiggsfieldProviderV1().cancel({ id: 'r', cancelUrl: 'https://api.higgsfield.ai/requests/r/cancel', statusUrl: 'https://api.higgsfield.ai/requests/r/status' }, credential('higgsfield'));
    assert.equal(state.state, 'queued'); assert.equal(calls.length, 2);
  });
});

test('provider HTTP rejection, throttle and 5xx never trigger a hidden submit retry', async () => {
  const provider = new HiggsfieldProviderV1();
  const p = { provider: 'higgsfield', endpoint: 'https://api.higgsfield.ai/alibaba/wan-3.0/text-to-video', body: { prompt: 'A', duration: 5, resolution: '720p', aspect_ratio: '9:16', generate_audio: false, enable_thinking: false } };
  for (const [status, uncertain, retryable] of [[422, false, false], [429, false, true], [503, true, true]]) {
    await network(() => json({ detail: 'secret private prompt' }, status), async calls => {
      await assert.rejects(provider.submit(p, 'same-intent', credential('higgsfield')), error => error.code === `video_provider_http_${status}` && error.uncertain === uncertain && error.retryable === retryable);
      assert.equal(calls.length, 1);
    });
  }
  await network(() => json({ request_id: 'r', status_url: 'https://evil.example', cancel_url: 'https://evil.example' }), async () => {
    await assert.rejects(provider.submit(p, 'same-intent', credential('higgsfield')), error => error.code === 'video_invalid_submit_receipt' && error.uncertain);
  });
});

test('HeyGen unavailable speech engines or unsupported avatar renderer cause zero video submits', async () => {
  for (const scenario of ['no-speech-engines', 'unknown-speech-engine', 'unsupported-avatar-renderer']) {
    await network(async url => {
      const data = await assets(url).json();
      if (url.includes('/voices')) {
        if (scenario === 'no-speech-engines') data.data[0].available_engines = [];
        if (scenario === 'unknown-speech-engine') data.data[0].available_engines = ['unrecognized-engine'];
      } else if (scenario === 'unsupported-avatar-renderer') data.data[0].supported_api_engines = ['avatar_iii'];
      return json(data);
    }, async calls => {
      await assert.rejects(new HeygenProviderV1().prepare(presenter(), credential('heygen')), /video_presenter_asset_unavailable/);
      assert.ok(calls.every(call => call.method === 'GET'));
      assert.equal(calls.filter(call => call.method === 'POST' && call.url === 'https://api.heygen.com/v3/videos').length, 0);
    });
  }
});

test('HeyGen speech engine metadata remains distinct from the selected avatar renderer', async () => {
  await network(assets, async () => {
    const provider = new HeygenProviderV1();
    const catalog = await provider.listAssets(credential('heygen'));
    assert.deepEqual(catalog.voices[0].speechEngines, ['starfish']);
    assert.deepEqual(catalog.avatars[0].engines, ['avatar_iii', 'avatar_iv']);
    const prepared = await provider.prepare(presenter(), credential('heygen'));
    assert.deepEqual(prepared.body.engine, { type: 'avatar_iv' });
    assert.equal(prepared.body.voice_settings.engine_settings, undefined);
  });
});
