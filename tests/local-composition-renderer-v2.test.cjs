const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const cp = require('node:child_process');
const {promisify} = require('node:util');
const sharp = require('sharp');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
let diagnostic;
const instrumented = function (...args) {return cp.execFile(...args);};
instrumented[promisify.custom] = async (...args) => {
  try {const result = await promisify(cp.execFile)(...args); if (args[1].includes('-count_frames')) diagnostic = {countFramesProbe: result.stdout}; return result;}
  catch (error) {diagnostic = {command: args[0], args: args[1], stderr: error.stderr}; throw error;}
};
const {LocalCompositionRendererV2} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-composition-renderer.v2.ts', {
  'node:child_process': {execFile: instrumented},
});
const c = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-composition.v2.ts');
const digest = b => createHash('sha256').update(b).digest('hex');
const bin = process.env.CF_LOCAL_COMPOSITION_TEST_FFMPEG, probe = process.env.CF_LOCAL_COMPOSITION_TEST_FFPROBE;
let root, config, renderer, flower, blue, red, tone;
const native = p => /\.exe$/i.test(fss.realpathSync(bin)) ? cp.execFileSync('wslpath', ['-w', p], {encoding: 'utf8'}).trim().replace(/\\/g, '/') : p;
const run = args => cp.execFileSync(bin, ['-v', 'error', '-nostdin', ...args], {timeout: 60000, maxBuffer: 1024 * 1024});
const frameHash = (file, frame) => {
  const hash = run(['-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', native(file), '-an', '-vf', `select='eq(n,${frame})'`,
    '-fps_mode', 'passthrough', '-f', 'framehash', '-hash', 'sha256', 'pipe:1']).toString().split(/\r?\n/).find(line => /^0,/.test(line))?.split(',').pop().trim();
  if (!/^[a-f0-9]{64}$/.test(hash ?? '')) throw Error('Decoded frame hash was not returned'); return hash;
};
async function ref(file, mediaId) {const bytes = await fs.readFile(file); return {organizationId: 'synthetic-org', mediaId, absolutePath: file, sha256: digest(bytes), bytes: bytes.length};}
async function video(file, id) {const asset = await ref(file, id); return {...asset, metadata: await renderer.inspectVideo(asset)};}
function input() {return {version: 2, engineVersion: c.LOCAL_COMPOSITION_ENGINE_V2, organizationId: 'synthetic-org', productionRevisionId: 'saved-revision',
  manifestDigest: 'a'.repeat(64), approvedSettingsDigest: 'b'.repeat(64), source: {pieceId: 'saved-piece', revision: 'c'.repeat(64), textSha256: 'd'.repeat(64)},
  settings: {width: 1920, height: 1080, fps: 30, fit: 'contain_pad', transition: 'hard_cut', captions: 'none'},
  scenes: [{id: 'opening', durationSeconds: 1, video: flower, sourceAudio: 'retain_source'}, {id: 'closing', durationSeconds: 1, video: blue, sourceAudio: 'retain_source'}]};}
(process.env.CF_LOCAL_COMPOSITION_REAL_RENDER === '1' ? describe : describe.skip)('actual configured local compositor', () => {
beforeAll(async () => {
  if (!bin || !probe || !process.env.CF_LOCAL_COMPOSITION_TEST_FONT) throw Error('Real composition needs explicit test binary/font configuration');
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-composition-render-v2-'));
  const assets = path.join(root, 'assets'); await fs.mkdir(assets);
  config = {cacheRoot: path.join(root, 'cache'), allowedAssetRoots: [assets], ffmpegExecutable: bin, ffprobeExecutable: probe,
    fontFile: process.env.CF_LOCAL_COMPOSITION_TEST_FONT};
  renderer = new LocalCompositionRendererV2(config);
  const original = path.join(assets, 'flower.mp4'); await fs.copyFile(path.join(__dirname, 'fixtures/video-v1/flower.mp4'), original);
  flower = await video(original, 'owned-flower');
  for (const color of ['blue', 'red']) {
    const target = path.join(assets, color + '.mp4');
    run(['-f', 'lavfi', '-i', `color=c=${color}:s=960x540:r=30`, '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '1',
      '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', native(target)]);
    const asset = await video(target, 'owned-' + color); if (color === 'blue') blue = asset; else red = asset;
  }
  const sound = path.join(assets, 'tone.wav'); run(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1.5', '-c:a', 'pcm_s16le', '-y', native(sound)]);
  const soundRef = {...await ref(sound, 'owned-test-audio'), mimeType: 'audio/wav'}; tone = {...soundRef, metadata: await renderer.inspectAudio(soundRef)};
}, 90000);
afterAll(async () => {if (root) await fs.rm(root, {recursive: true, force: true});});
afterEach(() => {if (diagnostic) {process.stderr.write(JSON.stringify(diagnostic) + '\n'); diagnostic = undefined;}});

test('real MP4 composition measures duration/audio, replaces just one scene and recovers an interrupted import without encoding again', async () => {
  const firstInput = input(), first = await renderer.render(firstInput);
  expect(first.metadata).toMatchObject({width: 1920, height: 1080, durationSeconds: 2, audio: true});
  expect(first.scenes.map(s => [s.startFrame, s.frameCount, s.reused])).toEqual([[0, 30, false], [30, 30, false]]);
  expect(first.scenes.every(s => s.upscaled)).toBe(true);
  expect(first.sha256).toBe(digest(await fs.readFile(first.absolutePath)));
  const tenant = path.join(config.cacheRoot, digest('synthetic-org'));
  expect(frameHash(first.absolutePath, 29)).toBe(frameHash(path.join(tenant, 'scene-' + first.scenes[0].sceneKey, 'video.mp4'), 29));
  expect(frameHash(first.absolutePath, 30)).toBe(frameHash(path.join(tenant, 'scene-' + first.scenes[1].sceneKey, 'video.mp4'), 0));
  await expect(renderer.withPinnedResult(first, async () => {throw Error('SIMULATED_SAVE_INTERRUPTION');})).rejects.toThrow('SIMULATED_SAVE_INTERRUPTION');
  const reloaded = new LocalCompositionRendererV2(config), encodes = jest.spyOn(reloaded, 'run');
  const recovered = await reloaded.render(firstInput); expect(recovered.reused).toBe(true); expect(encodes).not.toHaveBeenCalled();
  const next = input(); next.scenes[1].video = red; next.manifestDigest = 'e'.repeat(64);
  const changed = await reloaded.render(next);
  expect(changed.scenes.map(s => s.reused)).toEqual([true, false]);
  expect(changed.scenes[0].sceneKey).toBe(first.scenes[0].sceneKey); expect(changed.renderKey).not.toBe(first.renderKey);
  expect(await fs.readFile(first.absolutePath)).toEqual(await fs.readFile(recovered.absolutePath));
  const copied = path.join(root, 'import-copy.mp4');
  await renderer.withPinnedResult(first, async (file, assertUnchanged) => {const buffer = Buffer.alloc(first.bytes); await file.read(buffer, 0, buffer.length, 0);
    expect(digest(buffer)).toBe(first.sha256); await assertUnchanged(); await fs.writeFile(copied, buffer);});
  expect(digest(await fs.readFile(copied))).toBe(first.sha256);
}, 180000);

test('owned narration/music, readable authored title/caption and raster brand are physically rendered without inventing speech alignment', async () => {
  const value = input(), logo = path.join(root, 'assets/brand.png');
  await sharp({create: {width: 120, height: 60, channels: 4, background: {r: 240, g: 20, b: 20, alpha: 1}}}).png().toFile(logo);
  const brand = {...await ref(logo, 'owned-brand'), mimeType: 'image/png'};
  value.brand = {asset: brand, metadata: await renderer.inspectBrand(brand), position: 'top_right'};
  value.narration = {asset: tone, mode: 'replace', gain: 1, offsetSeconds: 0};
  value.music = {asset: {...tone, mediaId: 'owned-music'}, gain: 0.15, offsetSeconds: 0, fit: 'trim_to_edit'};
  const captions = [{startSeconds: 0, endSeconds: 1.5, text: 'Exact caption — без выдуманного согласования', role: 'speech_caption'}];
  const titles = [{startSeconds: 0, endSeconds: 1.5, text: 'Saved title', role: 'screen_title'}];
  value.settings.captions = 'authored_timed_text'; value.timedText = {origin: 'authored_timed_text', cues: captions, cuesSha256: c.localCompositionDigestV2(captions)};
  value.screenTitles = {origin: 'authored_timed_text', cues: titles, cuesSha256: c.localCompositionDigestV2(titles)};
  const result = await renderer.render(value);
  expect(result.metadata.audio).toBe(true); expect(result.audio.sourceAudioRetained).toBe(false);
  expect(result.textRendering).toMatchObject({physicalBurn: true, cueCount: 2, screenTitleCount: 1, speechCaptionCount: 1});
  expect(result.textRendering.alignment).toBeUndefined(); expect(result.captions.sourceJobIds).toEqual([]);
  expect(result.captions).toMatchObject({kind: 'authored_timed_text', speechAlignment: 'unverified'});
  expect(result.brand).toMatchObject({mediaId: 'owned-brand', physicallyRendered: true});
  const png = cp.execFileSync(bin, ['-v', 'error', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', native(result.absolutePath), '-ss', '0.5', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], {timeout: 30000, maxBuffer: 8 * 1024 * 1024});
  const pixel = await sharp(png).extract({left: 1920 - 48 - 60, top: 78, width: 1, height: 1}).removeAlpha().raw().toBuffer();
  expect(pixel[0]).toBeGreaterThan(180); expect(pixel[0]).toBeGreaterThan(pixel[1] * 3);
  const verified = await renderer.verifyResult(result); expect(verified.sha256).toBe(result.sha256);
}, 180000);

test('foreign/current-byte mismatches and aborted callers refuse without losing accepted files', async () => {
  const value = input(), accepted = await renderer.render(value);
  await expect(renderer.verifyResult({...accepted, organizationId: 'foreign'})).rejects.toThrow('RESULT_SCOPE_MISMATCH');
  const bad = structuredClone(value); bad.scenes[0].video.sha256 = '0'.repeat(64); bad.scenes[0].video.metadata.sha256 = '0'.repeat(64);
  await expect(renderer.render(bad)).rejects.toThrow('ASSET_DIGEST_MISMATCH');
  const controller = new AbortController(); controller.abort();
  await expect(renderer.render(value, {signal: controller.signal})).rejects.toThrow('ABORTED');
  expect(digest(await fs.readFile(accepted.absolutePath))).toBe(accepted.sha256);
}, 90000);

test('120 five-second owned scenes produce a measured ten-minute file with durable scene reuse and bounded progress', async () => {
  const value = input(); value.productionRevisionId = 'long-synthetic-revision'; value.manifestDigest = 'f'.repeat(64);
  value.scenes = Array.from({length: 120}, (_, index) => ({id: 'long-' + index, durationSeconds: 5, video: flower, sourceAudio: 'silent'}));
  const progress = [], result = await renderer.render(value, {onProgress: async status => {progress.push({...status});}});
  expect(result.metadata).toMatchObject({width: 1920, height: 1080, durationSeconds: 600, audio: false});
  expect(result.scenes.reduce((sum, scene) => sum + scene.frameCount, 0)).toBe(18000);
  expect(result.scenes.slice(1).every(scene => scene.reused)).toBe(true);
  expect(result.bytes).toBeLessThanOrEqual(c.LOCAL_COMPOSITION_LIMITS_V2.maxOutputBytes);
  expect(progress.some(status => status.stage === 'scene' && status.completedScenes === 120)).toBe(true);
  expect(progress.some(status => status.stage === 'ready')).toBe(true);
  await renderer.withPinnedResult(result, async (_file, assertUnchanged) => {await assertUnchanged();});
}, 600000);

test('aborting the owned encoder stops file production and does not touch accepted outputs', async () => {
  const target = path.join(root, 'aborted.wav'), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    await expect(renderer.run(bin, ['-v', 'error', '-nostdin', '-re', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
      '-t', '3', '-c:a', 'pcm_s16le', '-y', native(target)], {signal: controller.signal})).rejects.toThrow('ABORTED');
    const size = await fs.stat(target).then(s => s.size).catch(() => -1);
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(await fs.stat(target).then(s => s.size).catch(() => -1)).toBe(size);
  } finally {clearTimeout(timer);}
}, 10000);

test('tampered cached provenance is refused before encoding even when the saved MP4 and input key are unchanged', async () => {
  const value = input(), result = await renderer.render(value), receipt = path.join(path.dirname(result.absolutePath), 'receipt.json');
  const saved = await fs.readFile(receipt, 'utf8'), calls = jest.spyOn(renderer, 'run');
  for (const mutate of [r => r.source.revision = '0'.repeat(64), r => r.approvedSettingsDigest = '0'.repeat(64),
    r => r.scenes[0].mediaId = 'foreign-asset', r => r.scenes[0].sourceAudioRetained = false, r => r.scenes[0].sceneKey = '0'.repeat(64)]) {
    const changed = JSON.parse(saved); mutate(changed); await fs.writeFile(receipt, JSON.stringify(changed)); calls.mockClear();
    try {await expect(renderer.render(value)).rejects.toThrow('CACHE_PROVENANCE_MISMATCH'); expect(calls).not.toHaveBeenCalled();}
    finally {await fs.writeFile(receipt, saved);}
  }
  expect(digest(await fs.readFile(result.absolutePath))).toBe(result.sha256);
}, 90000);
});
