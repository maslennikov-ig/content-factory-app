const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const {LocalCompositionRendererV2} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-composition-renderer.v2.ts');
const {authoredCaptionFileV1} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/production/video-production-result.v1.ts');
const c = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-composition.v2.ts');
const digest = b => createHash('sha256').update(b).digest('hex');
let root, config, renderer;
beforeEach(async () => {root = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-composition-probes-v2-'));
  config = {cacheRoot: path.join(root, 'cache'), allowedAssetRoots: [path.join(root, 'assets')], ffmpegExecutable: process.execPath, ffprobeExecutable: process.execPath};
  await fs.mkdir(config.allowedAssetRoots[0]); renderer = new LocalCompositionRendererV2(config);
});
afterEach(async () => fs.rm(root, {recursive: true, force: true}));
async function ref(bytes, mimeType, name = 'asset') {const file = path.join(root, 'assets', name); await fs.writeFile(file, bytes);
  return {organizationId: 'org', mediaId: name, absolutePath: file, sha256: digest(bytes), bytes: bytes.length, mimeType};}

test('validated owned VTT returns literal authored words and distinct byte/cue lineage without claiming alignment', async () => {
  const original = [{startSeconds: 0, endSeconds: 1, text: 'R&D <room> stays exact'}], authored = authoredCaptionFileV1(original, 2);
  const asset = await ref(authored.bytes, 'text/vtt');
  const result = await renderer.inspectCaptions(asset, 2, 'speech_caption');
  expect(result.cues).toEqual(original.map(c => ({...c, role: 'speech_caption'})));
  expect(result.sourceAssetSha256).toBe(asset.sha256); expect(result.cuesSha256).toBe(c.localCompositionDigestV2(result.cues));
  expect(result.alignment).toBeUndefined();
});

test('SVG bytes cannot reach an image decoder through a forged PNG MIME', async () => {
  const decode = jest.fn(() => {throw Error('Decoder must not be reached');});
  const {LocalCompositionRendererV2: Guarded} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-composition-renderer.v2.ts', {sharp: {__esModule: true, default: decode}});
  const asset = await ref(Buffer.from('<svg><image href="https://outside.invalid/image"/></svg>'), 'image/png');
  await expect(new Guarded(config).inspectBrand(asset)).rejects.toThrow('BRAND_FORMAT_UNSUPPORTED'); expect(decode).not.toHaveBeenCalled();
});

test('an animation-declaring PNG is refused before a decoder can allocate its frames', async () => {
  const decode = jest.fn(() => {throw Error('Decoder must not be reached');});
  const {LocalCompositionRendererV2: Guarded} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-composition-renderer.v2.ts', {sharp: {__esModule: true, default: decode}});
  const signature = Buffer.from([137,80,78,71,13,10,26,10]), chunk = Buffer.alloc(20); chunk.writeUInt32BE(8); chunk.write('acTL',4);
  const asset = await ref(Buffer.concat([signature, chunk]), 'image/png');
  await expect(new Guarded(config).inspectBrand(asset)).rejects.toThrow('BRAND_FORMAT_UNSUPPORTED'); expect(decode).not.toHaveBeenCalled();
});

test('the local audio probe denies network protocols before demuxing and uses fixed bounded decode parameters', async () => {
  const wav = Buffer.alloc(44 + 48000 * 2 * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22); wav.writeUInt32LE(48000,24); wav.writeUInt32LE(192000,28); wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
  const asset = await ref(wav, 'audio/wav');
  const calls = jest.spyOn(renderer, 'run').mockImplementation(async (_bin, args) => {
    expect(args.indexOf('-protocol_whitelist')).toBeGreaterThan(-1); expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file,pipe');
    if (args.includes('-of')) return JSON.stringify({streams: [{codec_type: 'audio', sample_rate: '48000', channels: 2, duration: '1'}], format: {duration: '1'}});
    expect(args[args.indexOf('-f')+1]).toBe('wav'); expect(args[args.indexOf('-t')+1]).toBe('600.05');
    await fs.writeFile(args.at(-1), wav); return '';
  });
  const result = await renderer.inspectAudio(asset); expect(result.durationSeconds).toBe(1); expect(calls).toHaveBeenCalledTimes(3);
});

test('different-input concurrent renders refuse before starting a second encoder, and public asset roots cannot hold private cache', async () => {
  expect(() => new LocalCompositionRendererV2({...config, cacheRoot: path.join(root, 'assets/cache')})).toThrow('SERVER_CONFIG_INVALID');
  const bytes = await fs.readFile(path.join(__dirname, 'fixtures/video-v1/flower.mp4'));
  const {measureMp4VideoV1} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/production/video-production-result.v1.ts');
  const video = {...await ref(bytes, 'video/mp4'), metadata: measureMp4VideoV1(bytes)}; delete video.mimeType;
  const input = {version: 2, engineVersion: c.LOCAL_COMPOSITION_ENGINE_V2, organizationId: 'org', productionRevisionId: 'revision', manifestDigest: 'a'.repeat(64),
    approvedSettingsDigest: 'b'.repeat(64), source: {pieceId: 'piece', revision: 'c'.repeat(64), textSha256: 'd'.repeat(64)},
    settings: {width: 1920, height: 1080, fps: 30, fit: 'contain_pad', transition: 'hard_cut', captions: 'none'},
    scenes: [{id: 'scene', durationSeconds: 1, video, sourceAudio: 'silent'}]};
  let release, enter; const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {enter = resolve;});
  const work = jest.spyOn(renderer, 'renderOwned').mockImplementation(() => {enter(); return gate;});
  const first = renderer.render(input); await started;
  try {await expect(renderer.render({...input, manifestDigest: 'e'.repeat(64)})).rejects.toThrow('RENDER_BUSY'); expect(work).toHaveBeenCalledTimes(1);}
  finally {release({}); await first;}
});
