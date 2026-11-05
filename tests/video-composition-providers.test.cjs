const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const root = 'libraries/nestjs-libraries/src/videos/providers/composition/';
const mocks = { '@nestjs/common': { Injectable: () => () => {} } };
const { HeygenStudioCompositionProviderV1 } = loadTypeScriptModule(root + 'heygen-studio.provider.v1.ts', mocks);
const { HyperframesCompositionProviderV1, estimateHyperframesV1 } = loadTypeScriptModule(root + 'hyperframes.provider.v1.ts', mocks);
const { buildHyperframesBundleV1 } = loadTypeScriptModule(root + 'hyperframes-bundle.v1.ts', mocks);
const { downloadCompositionFileV1 } = loadTypeScriptModule(root + 'composition-http.v1.ts', mocks);
const credential = () => ({ provider: 'heygen', apiKey: 'fixture-secret', payer: 'workspace_key', reference: 'workspace-fixture', maxCostUsd: 5, monthlyBudgetUsd: 100 });
const studioInput = () => ({ route: 'heygen-studio', intentKey: 'composition_1', title: 'Проверенный выпуск', locale: 'ru-RU', durationSeconds: 360, aspectRatio: '16:9', resolution: '1080p', audio: true, captions: true, approvedScript: 'Цена — 2,5 евро.\n\nСрок — 3 ноября.', scenes: [
  { id: 'presenter', kind: 'presenter', durationSeconds: 180, script: 'Цена — 2,5 евро.', avatarId: 'look_1', voiceId: 'voice_1', engine: 'avatar_iv' },
  { id: 'image', kind: 'image', durationSeconds: 180, script: 'Срок — 3 ноября.', mediaUrl: 'https://media.example/owned.png', voiceId: 'voice_1' },
] });
const hyperInput = () => ({ route: 'hyperframes', intentKey: 'composition_2', title: 'Approved briefing', locale: 'en-US', durationSeconds: 360, aspectRatio: '9:16', resolution: '1080p', audio: true, captions: true, approvedScript: 'Price is 2.5 euros.\n\nAvailable in November.', scenes: [
  { id: 'opening', kind: 'image', durationSeconds: 180, script: 'Price is 2.5 euros.', mediaUrl: 'https://media.example/owned.png', audioUrl: 'https://audio.example/opening.mp3', captionCues: [{ startSeconds: 0, endSeconds: 5, text: 'Price is 2.5 euros.' }] },
  { id: 'outro', kind: 'video', durationSeconds: 180, script: 'Available in November.', mediaUrl: 'https://media.example/owned.mp4', retainSourceAudio: true, sourceCaptions: 'burned' },
] });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
async function network(fn, run) {
  const previous = global.fetch; const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, ...init }); return fn(url, init); };
  try { return await run(calls); } finally { global.fetch = previous; }
}
function unzipHtml(base64) {
  return execFileSync('python3', ['-c', 'import sys,io,zipfile; z=zipfile.ZipFile(io.BytesIO(__import__("base64").b64decode(sys.stdin.buffer.read()))); assert z.namelist()==["index.html"]; assert z.testzip() is None; sys.stdout.buffer.write(z.read("index.html"))'], { input: base64, encoding: 'utf8' });
}

test('Studio prepares immutable ordered exact scenes, locale, captions, settings and funding with no call', async () => {
  await network(() => { throw Error('unexpected'); }, async calls => {
    const input = studioInput(); const p = await new HeygenStudioCompositionProviderV1().prepare(input, credential());
    assert.equal(calls.length, 0); assert.equal(p.payer, 'workspace_key'); assert.equal(p.credentialReference, 'workspace-fixture'); assert.equal(p.estimate.usd, null); assert.equal(p.estimate.upperBoundUsd, undefined);
    assert.deepEqual(p.body, { type: 'studio', title: input.title, aspect_ratio: '16:9', resolution: '1080p', caption: { file_format: 'srt', style: 'default' }, scenes: [
      { type: 'avatar_video', input: { type: 'avatar', avatar_id: 'look_1', script: input.scenes[0].script, voice_id: 'voice_1', voice_settings: { locale: 'ru-RU' }, engine: { type: 'avatar_iv' } } },
      { type: 'image', source: { type: 'url', url: input.scenes[1].mediaUrl }, script: input.scenes[1].script, voice_id: 'voice_1', voice_settings: { locale: 'ru-RU' } },
    ] });
    assert.equal(p.body.output_format, undefined); assert.equal(p.body.scenes[1].duration, undefined);
    assert.ok(Object.isFrozen(p.body.scenes[0].input)); assert.ok(Object.isFrozen(p.input.scenes));
    input.scenes[0].script = 'Changed'; assert.equal(p.body.scenes[0].input.script, 'Цена — 2,5 евро.');
  });
});

test('Studio submit auth and receipt, then captioned finished output; actual cost remains unknown', async () => {
  const provider = new HeygenStudioCompositionProviderV1(); const p = await provider.prepare(studioInput(), credential());
  await network((_url, init) => init.method === 'POST' ? json({ data: { video_id: 'video_1' } }) : json({ data: { id: 'video_1', status: 'completed', video_url: 'https://files.heygen.ai/plain.mp4', captioned_video_url: 'https://files.heygen.ai/captioned.mp4', subtitle_url: 'https://files.heygen.ai/caption.srt', duration: 359.3, cost: 100 } }), async calls => {
    const receipt = await provider.submit(p, credential()); const result = await provider.poll(receipt, credential());
    assert.equal(calls.length, 2); assert.equal(calls[0].url, 'https://api.heygen.com/v3/videos'); assert.equal(calls[0].headers['X-Api-Key'], 'fixture-secret'); assert.equal(calls[0].headers['Idempotency-Key'], 'composition_1'); assert.equal(calls[0].body, JSON.stringify(p.body)); assert.equal(calls[0].redirect, 'error'); assert.ok(calls[0].signal);
    assert.equal(result.state, 'succeeded'); assert.equal(result.url, 'https://files.heygen.ai/captioned.mp4'); assert.equal(result.durationSeconds, 359.3); assert.equal(result.costUsd, undefined);
  });
});

test('both paid creates preserve uncertainty on lost/malformed/oversized response with exactly one call and no replay', async () => {
  for (const [provider, input] of [[new HeygenStudioCompositionProviderV1(), studioInput()], [new HyperframesCompositionProviderV1(), hyperInput()]]) {
    const p = await provider.prepare(input, credential());
    for (const response of [() => { throw Error('secret prompt'); }, () => json({ data: {} }), () => json({ data: [] }), () => new Response('invalid json'), () => json({ data: { video_id: '../invalid', render_id: '../invalid' } }), () => new Response('x'.repeat(1024 * 1024 + 1))]) {
      await network(response, async calls => {
        await assert.rejects(provider.submit(p, credential()), e => e.uncertain === true && e.retryable === false && !e.message.includes('secret'));
        assert.equal(calls.length, 1);
      });
    }
    for (const [status, uncertain] of [[400, false], [429, false], [409, true], [503, true]]) await network(() => json({ secret: 'private' }, status), async calls => {
      await assert.rejects(provider.submit(p, credential()), e => e.uncertain === uncertain && e.retryable === false);
      assert.equal(calls.length, 1);
    });
  }
});

test('restored payload or payer/reference/endpoint changes cannot reach the paid endpoint', async () => {
  for (const [provider, input] of [[new HeygenStudioCompositionProviderV1(), studioInput()], [new HyperframesCompositionProviderV1(), hyperInput()]]) {
    const p = await provider.prepare(input, credential());
    await network(() => { throw Error('unexpected'); }, async calls => {
      for (const changed of [ { ...p, endpoint: 'https://evil.example/generate' }, { ...p, body: { ...p.body, title: 'Changed' } }, { ...p, intentKey: 'new-intent' }, { ...p, captions: !p.captions }, { ...p, input: { ...p.input, approvedScript: 'Changed' } } ]) await assert.rejects(provider.submit(changed, credential()));
      await assert.rejects(provider.submit(p, { ...credential(), reference: 'another-account' }));
      await assert.rejects(provider.submit(p, { ...credential(), payer: 'included' })); assert.equal(calls.length, 0);
    });
  }
});

test('persisted JSON object-key reordering preserves hashes while approved array order stays strict', async () => {
  const reorder = v => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reorder(v[k])])) : v;
  for (const [provider, input] of [[new HeygenStudioCompositionProviderV1(), studioInput()], [new HyperframesCompositionProviderV1(), hyperInput()]]) {
    const p = reorder(JSON.parse(JSON.stringify(await provider.prepare(input, credential()))));
    await network(() => json({ data: { video_id: 'v_1', render_id: 'hfr_1' } }), async calls => {
      assert.ok((await provider.submit(p, credential())).id); assert.equal(calls.length, 1);
    });
    const reversed = { ...p, body: { ...p.body, ...(p.body.scenes ? { scenes: [...p.body.scenes].reverse() } : { title: 'tampered' }) } };
    await network(() => { throw Error(); }, async calls => { await assert.rejects(provider.submit(reversed, credential())); assert.equal(calls.length, 0); });
  }
});

test('invalid scene/settings/script/media combinations reject before network and preserve explicit capabilities', async () => {
  await network(() => { throw Error('unexpected'); }, async calls => {
    const mutate = [i => i.approvedScript += 'rewrite', i => i.scenes[0].engine = undefined, i => i.scenes[1].voiceId = undefined, i => i.scenes[1].mediaUrl = 'http://media.example/image.png', i => i.scenes[1].mediaUrl = 'https://127.0.0.1/x', i => i.scenes[1].mediaUrl = 'https://localhost/x', i => i.scenes[1].mediaUrl = 'https://user:secret@media.example/x', i => i.locale = 'bad_locale', i => i.durationSeconds = 601, i => i.audio = false, i => i.scenes[1].kind = 'video', i => i.scenes[1].title = 'Unsupported overlay', i => i.scenes[1].durationSeconds = 0, i => i.scenes[1].id = 'presenter'];
    for (const change of mutate) { const input = studioInput(); change(input); await assert.rejects(new HeygenStudioCompositionProviderV1().prepare(input, credential())); }
    const hfMutate = [i => i.resolution = '720p', i => i.scenes[0].audioUrl = undefined, i => i.scenes[0].captionCues[0].text = 'Invented', i => i.scenes[0].captionCues[0].endSeconds = 181, i => i.scenes[1].retainSourceAudio = false, i => i.captions = false];
    for (const change of hfMutate) { const input = hyperInput(); change(input); await assert.rejects(new HyperframesCompositionProviderV1().prepare(input, credential())); }
    assert.equal(calls.length, 0);
  });
});

test('ordered existing clips retain speech without paid speech regeneration or source substitution', async () => {
  const input = studioInput(); input.captions = false; input.scenes = input.scenes.map((s, i) => ({ id: s.id, kind: 'video', durationSeconds: s.durationSeconds, script: s.script, mediaUrl: `https://media.example/approved-${i}.mp4`, retainSourceAudio: true, sourceCaptions: 'burned' }));
  const p = await new HeygenStudioCompositionProviderV1().prepare(input, credential());
  assert.equal(p.body.caption, undefined);
  assert.deepEqual(p.body.scenes, input.scenes.map(s => ({ type: 'video', source: { type: 'url', url: s.mediaUrl }, playback: { mute: false, volume: 1 } })));
  assert.equal(p.input.approvedScript, input.approvedScript);
});

test('Studio supports faceless image/video TTS and explicit silent duration/audio settings', async () => {
  const input = studioInput(); input.scenes = [input.scenes[1]]; input.durationSeconds = 180; input.approvedScript = input.scenes[0].script;
  assert.equal((await new HeygenStudioCompositionProviderV1().prepare(input, credential())).body.scenes[0].type, 'image');
  input.captions = false; input.scenes[0].kind = 'video'; input.scenes[0].playback = 'fit_to_scene';
  assert.deepEqual((await new HeygenStudioCompositionProviderV1().prepare(input, credential())).body.scenes[0].playback, { mode: 'fit_to_scene', mute: true });
  input.scenes[0] = { id: 'silent', kind: 'image', script: '', durationSeconds: 180, mediaUrl: 'https://media.example/owned.png' }; input.approvedScript = ''; input.audio = false;
  assert.equal((await new HeygenStudioCompositionProviderV1().prepare(input, credential())).body.scenes[0].duration, 180);
});

test('Hyperframes authors a real deterministic ZIP with escaped facts, exact timing, media, captions and safe CSP', async () => {
  const provider = new HyperframesCompositionProviderV1(); const input = hyperInput(); input.title = '<script>private & factual</script>'; input.scenes[0].title = input.title;
  const p = await provider.prepare(input, credential()); const again = await provider.prepare(input, credential());
  assert.deepEqual(p.body, again.body); assert.equal(p.estimate.usd, 0.9); assert.equal(p.estimate.upperBoundUsd, undefined); assert.match(p.estimate.source, /account-unverified;not-hard-cap/);
  assert.equal(p.body.project.type, 'base64'); assert.equal(p.body.project.media_type, 'application/zip'); assert.equal(p.body.fps, 30); assert.equal(p.body.format, 'mp4'); assert.equal(p.body.aspect_ratio, '9:16');
  const html = unzipHtml(p.body.project.data);
  assert.match(html, /data-composition-id="main" data-no-timeline/); assert.match(html, /data-duration="360" data-width="1080" data-height="1920"/); assert.match(html, /data-start="180" data-duration="180"/);
  assert.match(html, /&lt;script&gt;private &amp; factual&lt;\/script&gt;/); assert.doesNotMatch(html, /<script|setTimeout|currentTime|autoplay|onerror=/); assert.match(html, /Content-Security-Policy/); assert.match(html, /media-src &#39;self&#39; https:\/\/audio.example https:\/\/media.example/);
  assert.match(html, /<audio[^>]+data-start="0" data-duration="180"/); assert.match(html, /data-has-audio="true" data-volume="1"/); assert.match(html, /Price is 2.5 euros\./);
  assert.equal(estimateHyperframesV1(60, '1080p').usd, 0.15); assert.throws(() => estimateHyperframesV1(60, '720p'));
});

test('Hyperframes returns external receipt and finished MP4 through bounded single status calls', async () => {
  const provider = new HyperframesCompositionProviderV1(); const p = await provider.prepare(hyperInput(), credential());
  await network((_url, init) => init.method === 'POST' ? json({ data: { render_id: 'hfr_1' } }, 202) : json({ data: { render_id: 'hfr_1', status: 'completed', format: 'mp4', video_url: 'https://files.heygen.ai/finished.mp4', duration: 360, resolution: '1080p', cost_usd: 0.9 } }), async calls => {
    const r = await provider.submit(p, credential()); assert.equal(r.statusUrl, 'https://api.heygen.com/v3/hyperframes/renders/hfr_1');
    const s = await provider.poll(r, credential()); assert.deepEqual(s, { state: 'succeeded', url: 'https://files.heygen.ai/finished.mp4', durationSeconds: 360, resolution: '1080p' }); assert.equal(calls.length, 2);
  });
});

test('status URLs and IDs cannot redirect credentials; unsupported/malformed status and missing caption files remain errors', async () => {
  for (const [provider, route, path, idKey, statuses] of [[new HeygenStudioCompositionProviderV1(), 'heygen-studio', '/v3/videos', 'id', ['pending', 'processing']], [new HyperframesCompositionProviderV1(), 'hyperframes', '/v3/hyperframes/renders', 'render_id', ['queued', 'rendering']]]) {
    const r = { version: 1, route, id: 'receipt_1', statusUrl: `https://api.heygen.com${path}/receipt_1`, payer: 'workspace_key', credentialReference: 'workspace-fixture', captions: true };
    await network(() => { throw Error(); }, async calls => { await assert.rejects(provider.poll({ ...r, statusUrl: 'https://evil.example/receipt_1' }, credential())); assert.equal(calls.length, 0); });
    for (const [index, status] of statuses.entries()) await network(() => json({ data: { [idKey]: r.id, status } }), async () => { assert.equal((await provider.poll(r, credential())).state, index === 0 ? 'queued' : 'running'); });
    await network(() => json({ data: { [idKey]: r.id, status: 'failed', failure_message: 'private secret' } }), async () => assert.deepEqual(await provider.poll(r, credential()), { state: 'failed', errorCode: 'video_composition_provider_failed' }));
    for (const data of [{ [idKey]: 'other', status: 'completed' }, { [idKey]: r.id, status: 'imagined' }, { [idKey]: r.id, status: 'completed', video_url: 'https://files.heygen.ai/plain.mp4' }]) await network(() => json({ data }), async () => assert.rejects(provider.poll(r, credential())));
  }
});

test('Hyperframes preserves approved ambient clip audio without inventing narration or captions', async () => {
  const input = hyperInput(); input.captions = false; input.durationSeconds = 360;
  input.scenes = [{ id: 'ambient', kind: 'video', durationSeconds: 360, script: '', mediaUrl: 'https://media.example/ambient.mp4', retainSourceAudio: true }]; input.approvedScript = '';
  const p = await new HyperframesCompositionProviderV1().prepare(input, credential());
  const html = unzipHtml(p.body.project.data);
  assert.match(html, /data-has-audio="true" data-volume="1"/); assert.doesNotMatch(html, /<audio|class="clip caption"/);
});

test('pinned receipt reads continue after spend policy is disabled; new paid work stays blocked', async () => {
  for (const [provider, input, idKey, pending] of [[new HeygenStudioCompositionProviderV1(), studioInput(), 'id', 'pending'], [new HyperframesCompositionProviderV1(), hyperInput(), 'render_id', 'queued']]) {
    const p = await provider.prepare(input, credential());
    const disabled = { ...credential(), maxCostUsd: 0, monthlyBudgetUsd: 0 };
    await network((_url, init) => init.method === 'POST' ? json({ data: { video_id: 'receipt_1', render_id: 'receipt_1' } }) : json({ data: { [idKey]: 'receipt_1', status: pending } }), async calls => {
      const receipt = await provider.submit(p, credential());
      assert.equal((await provider.poll(receipt, disabled)).state, 'queued');
      await assert.rejects(provider.submit(p, disabled)); await assert.rejects(provider.prepare(input, disabled));
      assert.equal(calls.length, 2);
    });
  }
});

test('bounded download forwards no key, verifies MP4 signature, host allowlist, redirects and streamed size', async () => {
  const bytes = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
  await network(() => new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } }), async calls => {
    assert.equal((await downloadCompositionFileV1('https://files.heygen.ai/out.mp4', ['files.heygen.ai'], 20)).byteLength, 16);
    assert.equal(calls[0].headers, undefined); assert.equal(calls[0].redirect, 'error');
    await assert.rejects(downloadCompositionFileV1('https://evil.example/file', ['files.heygen.ai'], 20)); assert.equal(calls.length, 1);
  });
  for (const [body, headers] of [[bytes, { 'Content-Type': 'video/mp4', 'Content-Length': '100' }], [Buffer.from('untrusted html'), { 'Content-Type': 'text/html' }], [Buffer.from('x'.repeat(21)), { 'Content-Type': 'video/mp4' }]]) await network(() => new Response(body, { headers }), async () => assert.rejects(downloadCompositionFileV1('https://files.heygen.ai/out.mp4', ['files.heygen.ai'], 20)));
});

// Opt-in browser regression: no browser dependency/download is added to the ordinary Node suite.
// CF_VIDEO_COMPOSITION_BROWSER_REGRESSION=1 CF_VIDEO_COMPOSITION_PLAYWRIGHT_MODULE=/path/to/playwright
// Engine sources inspected at heygen-com/hyperframes a5a61213320c523875633a94ef96097456269136:
// engine videoFrameTransport.ts (same-origin frames), frameCapture.ts (SVG Image.decode),
// producer htmlCompiler.ts (localized audio/video sources).
test('Hyperframes CSP allows engine frame/poster and localized media decoding while blocking unapproved resources', {
  skip: process.env.CF_VIDEO_COMPOSITION_BROWSER_REGRESSION !== '1', timeout: 30_000,
}, async () => {
  const { createServer } = require('node:http');
  const { once } = require('node:events');
  const { chromium } = require(process.env.CF_VIDEO_COMPOSITION_PLAYWRIGHT_MODULE || 'playwright');
  // A valid 1x1 PNG; actual browser image decoding, not an HTML/CSP string assertion.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1E0AAAAASUVORK5CYII=', 'base64');
  const sourceText = '</title><script id="source-injection">globalThis.__compositionSourceExecuted=true</script><title>';
  const bundle = buildHyperframesBundleV1({ title: sourceText, locale: 'en-US', width: 1920, height: 1080,
    scenes: [{ id: 'source', durationSeconds: 1, title: sourceText, media: { type: 'video', url: 'https://media.example/owned.mp4' } }] });
  const baseline = bundle.html.replace(/img-src[^;]*/, 'img-src https://media.example').replace(/media-src[^;]*/, 'media-src https://media.example');
  // Small native codec fixture, used only in this opt-in local browser check.
  const mp4 = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:d=0.2:r=5', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1']);
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url.startsWith('/localized.mp4')) { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': mp4.length }); res.end(mp4); return; }
    if (req.url.startsWith('/__hyperframes_video_frames__/')) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(png); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(req.url === '/before.html' ? baseline : bundle.html);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route('https://media.example/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
    let blockedOriginRequests = 0;
    await page.route('https://unapproved.example/**', route => { blockedOriginRequests++; return route.fulfill({ status: 200, contentType: 'image/png', body: png }); });
    await page.addInitScript(() => {
      globalThis.__compositionCspViolations = [];
      document.addEventListener('securitypolicyviolation', e => globalThis.__compositionCspViolations.push({ directive: e.effectiveDirective, uri: e.blockedURI }));
    });
    const decodeEngineResources = () => page.evaluate(async () => {
      const decode = async src => {
        const image = new Image(); image.src = src;
        try { await image.decode(); return { decoded: true, width: image.naturalWidth, height: image.naturalHeight }; }
        catch { return { decoded: false }; }
      };
      const decodeMedia = kind => new Promise(resolve => {
        const media = document.createElement(kind); media.preload = 'auto'; media.muted = true;
        const timer = setTimeout(() => resolve({ decoded: false }), 2000);
        media.onloadeddata = () => { clearTimeout(timer); resolve({ decoded: media.readyState >= 2, ...(kind === 'video' ? { width: media.videoWidth, height: media.videoHeight } : {}) }); };
        media.onerror = () => { clearTimeout(timer); resolve({ decoded: false }); };
        media.src = `${location.origin}/localized.mp4?kind=${kind}`; document.body.append(media); media.load();
      });
      // Same native operations used by the engine's transport and metadata-hint code.
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"/>';
      const poster = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      document.querySelector('video').poster = poster;
      return {
        frame: await decode(`${location.origin}/__hyperframes_video_frames__/fixture/0`),
        poster: await decode(poster),
        approved: await decode('https://media.example/approved.png'),
        audio: await decodeMedia('audio'), video: await decodeMedia('video'),
      };
    });
    // Reproduce the original failure with the former emitted policy as a control.
    await page.goto(origin + '/before.html');
    const before = await decodeEngineResources();
    assert.equal(before.frame.decoded, false); assert.equal(before.poster.decoded, false); assert.equal(before.approved.decoded, true); assert.equal(before.audio.decoded, false); assert.equal(before.video.decoded, false);
    await page.goto(origin + '/fixed.html');
    const fixed = await decodeEngineResources();
    assert.deepEqual(fixed, { frame: { decoded: true, width: 1, height: 1 }, poster: { decoded: true, width: 12, height: 8 }, approved: { decoded: true, width: 1, height: 1 }, audio: { decoded: true }, video: { decoded: true, width: 16, height: 16 } });
    const denied = await page.evaluate(async () => {
      const unapproved = new Image(); unapproved.src = 'https://unapproved.example/untrusted.png';
      let decoded; try { await unapproved.decode(); decoded = true; } catch { decoded = false; }
      const audio = document.createElement('audio');
      const audioDecoded = await new Promise(resolve => { audio.onloadeddata = () => resolve(true); audio.onerror = () => resolve(false); audio.src = 'https://unapproved.example/untrusted.mp4'; audio.load(); });
      globalThis.__compositionTrustedInlineRan = false; globalThis.__compositionExternalScriptRan = false; globalThis.__compositionDataScriptRan = false; globalThis.__compositionEvalRan = false;
      const script = document.createElement('script'); script.textContent = 'globalThis.__compositionTrustedInlineRan=true;try{eval("globalThis.__compositionEvalRan=true")}catch{}'; document.body.append(script);
      const externalScript = document.createElement('script'); externalScript.src = 'https://unapproved.example/untrusted.js'; document.body.append(externalScript);
      const dataScript = document.createElement('script'); dataScript.src = 'data:text/javascript,globalThis.__compositionDataScriptRan=true'; document.body.append(dataScript);
      const iframe = document.createElement('iframe'); iframe.src = `${location.origin}/forbidden-frame`; document.body.append(iframe);
      await new Promise(resolve => setTimeout(resolve, 50));
      return { decoded, audioDecoded, inlineRan: globalThis.__compositionTrustedInlineRan, dataScriptRan: globalThis.__compositionDataScriptRan, evalRan: globalThis.__compositionEvalRan, sourceExecuted: globalThis.__compositionSourceExecuted===true, sourceScriptCount: document.querySelectorAll('#source-injection').length, sourceText: document.title, violations: globalThis.__compositionCspViolations };
    });
    assert.equal(denied.decoded, false); assert.equal(denied.audioDecoded, false); assert.equal(denied.inlineRan, true); assert.equal(denied.dataScriptRan, false); assert.equal(denied.evalRan, false); assert.equal(denied.sourceExecuted, false); assert.equal(denied.sourceScriptCount, 0); assert.equal(denied.sourceText, sourceText); assert.equal(blockedOriginRequests, 0);
    assert.ok(denied.violations.some(v => v.directive === 'img-src' && v.uri.startsWith('https://unapproved.example/')));
    assert.ok(denied.violations.some(v => v.directive === 'media-src' && v.uri.startsWith('https://unapproved.example/')));
    assert.ok(denied.violations.some(v => v.directive === 'script-src-elem' && v.uri.startsWith('https://unapproved.example/')));
    assert.ok(denied.violations.some(v => v.directive === 'script-src-elem' && v.uri === 'data'));
    assert.ok(denied.violations.some(v => v.directive === 'script-src' && v.uri === 'eval'));
    assert.ok(denied.violations.some(v => v.directive === 'frame-src'));
    assert.ok(requests.includes('/__hyperframes_video_frames__/fixture/0')); assert.ok(!requests.includes('/forbidden-frame'));
    console.log('Browser resource decode: frame=1x1, poster=12x8, approved remote=1x1, localized audio=decoded, localized video=16x16; trusted inline runtime allowed; source text escaped; unapproved image/media/external/data/eval scripts/frame blocked.');
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
});

// Full official OSS pipeline, task-private dependencies only; never used by product execution.
// Enable with CF_VIDEO_COMPOSITION_ENGINE_REGRESSION=1 plus the absolute official producer
// dist/index.js path in CF_VIDEO_COMPOSITION_HYPERFRAMES_MODULE and installed Chrome in
// CF_VIDEO_COMPOSITION_CHROME. FFmpeg/ffprobe must already be available.
test('authored bundle runs through full official Hyperframes runtime, capture and MP4 encoding', {
  skip: process.env.CF_VIDEO_COMPOSITION_ENGINE_REGRESSION !== '1', timeout: 60_000,
}, async () => {
  const { mkdtemp, mkdir, writeFile, cp, rm } = require('node:fs/promises');
  const { tmpdir } = require('node:os'); const { join } = require('node:path'); const { pathToFileURL } = require('node:url');
  const { createHash } = require('node:crypto');
  assert.ok(process.env.CF_VIDEO_COMPOSITION_HYPERFRAMES_MODULE); assert.ok(process.env.CF_VIDEO_COMPOSITION_CHROME);
  const taskDir = await mkdtemp(join(tmpdir(), 'cf-hyperframes-engine-regression-'));
  const previousCache = process.env.HYPERFRAMES_CACHE_DIR; const previousFonts = process.env.HYPERFRAMES_FONT_CACHE_DIR;
  process.env.HYPERFRAMES_CACHE_DIR = join(taskDir, 'cache'); process.env.HYPERFRAMES_FONT_CACHE_DIR = join(taskDir, 'fonts');
  let server, session;
  try {
    // Public font assets may be seeded from an existing read-only cache to keep this run offline.
    if (process.env.CF_VIDEO_COMPOSITION_FONT_CACHE) await cp(process.env.CF_VIDEO_COMPOSITION_FONT_CACHE, process.env.HYPERFRAMES_FONT_CACHE_DIR, { recursive: true });
    const engine = await import(pathToFileURL(process.env.CF_VIDEO_COMPOSITION_HYPERFRAMES_MODULE).href);
    const config = engine.resolveConfig({ chromePath: process.env.CF_VIDEO_COMPOSITION_CHROME, browserGpuMode: 'software', forceScreenshot: true,
      enableBrowserPool: false, playerReadyTimeout: 3000, pageNavigationTimeout: 5000 });
    const sourceText = '</title><script id="source-injection">globalThis.__compositionSourceExecuted=true</script><title>';
    const bundle = buildHyperframesBundleV1({ title: sourceText, locale: 'en-US', width: 1920, height: 1080,
      scenes: [{ id: 'first', durationSeconds: 0.5, title: sourceText }, { id: 'second', durationSeconds: 0.5, title: 'Second approved scene' }] });
    const project = join(taskDir, 'project'); await mkdir(project); await writeFile(join(project, 'index.html'), bundle.html);
    const output = join(taskDir, 'finished.mp4'); const phases = new Set();
    const logger = { debug() {}, info() {}, warn() {}, error() {} };
    const job = engine.createRenderJob({ fps: 5, quality: 'draft', format: 'mp4', workers: 1, strictness: 'strict',
      maxRenderMs: 20000, producerConfig: config, logger });
    await engine.executeRenderJob(job, project, output, current => phases.add(current.status), AbortSignal.timeout(30000));
    assert.equal(job.status, 'complete'); assert.ok(phases.has('rendering')); assert.ok(phases.has('encoding')); assert.ok(phases.has('assembling'));
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames', '-show_entries', 'format=duration', '-of', 'json', output], { encoding: 'utf8' }));
    assert.equal(probe.streams[0].codec_name, 'h264'); assert.equal(probe.streams[0].width, 1920); assert.equal(probe.streams[0].height, 1080);
    assert.equal(probe.streams[0].nb_frames, '5'); assert.equal(Number(probe.format.duration), 1);
    const frameHash = at => createHash('sha256').update(execFileSync('ffmpeg', ['-v', 'error', '-ss', at, '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 8 * 1024 * 1024 })).digest('hex');
    assert.notEqual(frameHash('0.1'), frameHash('0.8'), 'ordered scenes must change actual rendered pixels');
    // Inspect source containment in a second real official runtime/capture session, not a stub.
    server = await engine.createFileServer({ projectDir: project, fps: { num: 5, den: 1 }, log: logger });
    session = await engine.createCaptureSession(server.url, join(taskDir, 'inspection-frames'), { width: 1920, height: 1080, fps: { num: 5, den: 1 }, format: 'png' }, null, config);
    await engine.initializeSession(session);
    const runtime = await session.page.evaluate(() => ({ ready: typeof window.__hf?.seek === 'function', duration: window.__hf?.duration,
      sourceExecuted: globalThis.__compositionSourceExecuted === true, sourceScriptCount: document.querySelectorAll('#source-injection').length,
      title: document.title, heading: document.querySelector('h1')?.textContent }));
    assert.deepEqual(runtime, { ready: true, duration: 1, sourceExecuted: false, sourceScriptCount: 0, title: sourceText, heading: sourceText });
    console.log('Official Hyperframes full pipeline: runtime ready, source facts remain literal, ordered scenes captured, h264 MP4 1920x1080 / 5 frames / 1s.');
  } finally {
    if (session) await (await import(pathToFileURL(process.env.CF_VIDEO_COMPOSITION_HYPERFRAMES_MODULE).href)).closeCaptureSession(session);
    server?.close();
    if (previousCache === undefined) delete process.env.HYPERFRAMES_CACHE_DIR; else process.env.HYPERFRAMES_CACHE_DIR = previousCache;
    if (previousFonts === undefined) delete process.env.HYPERFRAMES_FONT_CACHE_DIR; else process.env.HYPERFRAMES_FONT_CACHE_DIR = previousFonts;
    await rm(taskDir, { recursive: true, force: true });
  }
});
