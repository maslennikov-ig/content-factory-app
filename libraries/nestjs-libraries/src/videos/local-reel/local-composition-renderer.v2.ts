import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { FileHandle } from 'node:fs/promises';
import sharp from 'sharp';
import {
  LOCAL_COMPOSITION_ENGINE_V2, LOCAL_COMPOSITION_LIMITS_V2 as limits, LocalCompositionAudioReferenceV2Schema,
  LocalCompositionAudioFactsV2Schema, LocalCompositionBrandReferenceV2Schema, LocalCompositionRasterFactsV2Schema,
  LocalCompositionCaptionReferenceV2Schema, LocalCompositionInputV2Schema, LocalCompositionResultV2Schema,
  LocalCompositionVideoFactsV2Schema, localCompositionDigestV2, localCompositionRenderKeyV2,
  type LocalCompositionAudioReferenceV2, type LocalCompositionAudioFactsV2, type LocalCompositionBrandReferenceV2,
  type LocalCompositionRasterFactsV2, type LocalCompositionCaptionReferenceV2, type LocalCompositionTimedTextV2,
  type LocalCompositionOwnedReferenceV2, type LocalCompositionInputV2, type LocalCompositionResultV2,
  type LocalCompositionOptionsV2, type LocalCompositionConfigV2, type LocalCompositionPortV2,
  type LocalCompositionProgressV2,
} from './local-composition.v2';
import { inspectSubtitleFileV1 } from '../production/video-production-result.v1';
import { assertLocalCompositionCurrentV2 as current, hashLocalCompositionFileV2, localCompositionErrorV2 as refuse,
  localCompositionInsideV2, measureLocalCompositionMp4V2, withPinnedLocalCompositionFileV2 } from './owned-local-assets.v2';

const execute = promisify(execFile);
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
type Scene = LocalCompositionInputV2['scenes'][number];
type SceneCache = {key: string; videoPath: string; audioPath: string; videoSha256: string; audioSha256: string;
  frameCount: number; sourceAudioRetained: boolean; reused: boolean};
type Probe = {streams: Array<{codec_type: string; codec_name: string; width?: number; height?: number; duration?: string;
  sample_rate?: string; channels?: number; avg_frame_rate?: string; nb_read_frames?: string}>; format?: {duration?: string}};

/** Fixed local operations only. External provider generation, arbitrary commands and HTTP assets have no entry here. */
export class LocalCompositionRendererV2 implements LocalCompositionPortV2 {
  private fingerprint?: Promise<string>;
  private readonly running = new Map<string, Promise<LocalCompositionResultV2>>();
  constructor(private readonly config: LocalCompositionConfigV2) {
    const paths = [config.cacheRoot, config.ffmpegExecutable, config.ffprobeExecutable, ...config.allowedAssetRoots, ...(config.fontFile ? [config.fontFile] : [])];
    if (!config.allowedAssetRoots.length || config.allowedAssetRoots.length > 8 || paths.some(p => !isAbsolute(p)) || config.allowedAssetRoots.includes('/') ||
      config.allowedAssetRoots.some(root => resolve(root) === resolve(config.cacheRoot) || localCompositionInsideV2(resolve(root), resolve(config.cacheRoot)))) refuse('SERVER_CONFIG_INVALID');
  }

  private async toolchain() {
    return this.fingerprint ??= Promise.all([this.config.ffmpegExecutable, this.config.ffprobeExecutable, ...(this.config.fontFile ? [this.config.fontFile] : [])]
      .map(async p => {const resolved = await realpath(p), info = await stat(resolved); return {path: resolved, size: info.size, mtime: info.mtimeMs};}))
      .then(files => localCompositionDigestV2({engine: LOCAL_COMPOSITION_ENGINE_V2, files}));
  }
  private async native(file: string, binary: string) {
    return process.platform === 'linux' && /\.exe$/i.test(await realpath(binary))
      ? (await execute('wslpath', ['-w', file], {timeout: 5000, maxBuffer: 16384})).stdout.trim().replace(/\\/g, '/') : file;
  }
  private async tenant(org: string) {
    await mkdir(this.config.cacheRoot, {recursive: true, mode: 0o700});
    const cache = resolve(this.config.cacheRoot), info = await stat(cache);
    if (await realpath(cache) !== cache || (info.mode & 0o077) !== 0 || process.getuid && info.uid !== process.getuid()) refuse('CACHE_PRIVATE_ROOT_REQUIRED');
    const tenant = join(cache, digest(org)); await mkdir(tenant, {recursive: true, mode: 0o700});
    const owner = await stat(tenant);
    if (await realpath(tenant) !== tenant || (owner.mode & 0o077) !== 0 || process.getuid && owner.uid !== process.getuid()) refuse('CACHE_PATH_INVALID');
    return tenant;
  }
  private async run(binary: string, args: string[], options?: LocalCompositionOptionsV2) {
    await current(options);
    try {const result = await execute(binary, args, {timeout: limits.timeoutMs, maxBuffer: 2 * 1024 * 1024, signal: options?.signal});
      await current(options); return result.stdout;
    } catch (error) {await current(options); refuse('ENCODER_OR_PROBE_FAILED');}
  }
  private async guarded<T>(progress: () => LocalCompositionProgressV2, options: LocalCompositionOptionsV2 | undefined,
    work: (checked: LocalCompositionOptionsV2) => Promise<T>): Promise<T> {
    const abort = new AbortController(); let failure: unknown, pending: Promise<void> | undefined;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(limits.timeoutMs), ...(options?.signal ? [options.signal] : [])]);
    const pulse = (): Promise<void> => pending ??= (async () => {
      try {await current(options); await options?.onProgress?.(progress());}
      catch (error) {failure = error; abort.abort();} finally {pending = undefined;}
    })();
    await pulse(); if (failure) throw failure;
    const timer = setInterval(() => void pulse(), limits.heartbeatMs); timer.unref();
    try {const result = await work({...options, signal}); await pulse(); if (failure) throw failure; await current({...options, signal}); return result;}
    catch (error) {if (failure) throw failure; throw error;}
    finally {clearInterval(timer); await pending;}
  }
  private async probe(path: string, format: string, options?: LocalCompositionOptionsV2, count = false): Promise<Probe> {
    const value = await this.run(this.config.ffprobeExecutable, ['-v', 'error', '-max_alloc', '268435456', '-threads', '2',
      '-protocol_whitelist', 'file,pipe', '-f', format, ...(count ? ['-count_frames'] : []),
      '-show_entries', 'stream=codec_type,codec_name,width,height,duration,sample_rate,channels,avg_frame_rate,nb_read_frames:format=duration',
      '-of', 'json', await this.native(path, this.config.ffprobeExecutable)], options);
    try {const result = JSON.parse(value!); if (!Array.isArray(result.streams) || result.streams.length > 8) refuse('PROBE_UNAVAILABLE'); return result;}
    catch {return refuse('PROBE_UNAVAILABLE');}
  }
  private async copy(asset: LocalCompositionOwnedReferenceV2, target: string, options?: LocalCompositionOptionsV2): Promise<string> {
    return withPinnedLocalCompositionFileV2<string>(asset, this.config.allowedAssetRoots, async (source, assertUnchanged) => {
      const output = await open(target, 'wx', 0o600), hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
      try {
        for (let offset = 0; offset < asset.bytes;) {
          const got = await source.read(buffer, 0, Math.min(buffer.length, asset.bytes - offset), offset);
          if (!got.bytesRead) refuse('ASSET_CHANGED');
          const piece = buffer.subarray(0, got.bytesRead); hash.update(piece); await output.writeFile(piece); offset += got.bytesRead;
        }
        await output.sync(); if (hash.digest('hex') !== asset.sha256) refuse('ASSET_CHANGED'); await assertUnchanged();
      } finally {await output.close();}
      return target;
    }, options);
  }

  async inspectVideo(asset: LocalCompositionOwnedReferenceV2, options?: LocalCompositionOptionsV2) {
    return this.guarded(() => ({stage: 'inspect', completedScenes: 0, totalScenes: 0}), options, checked => this.inspectVideoUnchecked(asset, checked));
  }
  private async inspectVideoUnchecked(asset: LocalCompositionOwnedReferenceV2, options?: LocalCompositionOptionsV2) {
    return withPinnedLocalCompositionFileV2(asset, this.config.allowedAssetRoots, async file =>
      LocalCompositionVideoFactsV2Schema.parse(await measureLocalCompositionMp4V2(file, asset.bytes, asset.sha256)), options);
  }
  async inspectBrand(raw: LocalCompositionBrandReferenceV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionRasterFactsV2> {
    return this.guarded(() => ({stage: 'inspect', completedScenes: 0, totalScenes: 0}), options, checked => this.inspectBrandUnchecked(raw, checked));
  }
  private async inspectBrandUnchecked(raw: LocalCompositionBrandReferenceV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionRasterFactsV2> {
    const asset = LocalCompositionBrandReferenceV2Schema.parse(raw);
    return withPinnedLocalCompositionFileV2(asset, this.config.allowedAssetRoots, async file => {
      const buffer = Buffer.alloc(asset.bytes); let at = 0;
      while (at < buffer.length) {const read = await file.read(buffer, at, buffer.length - at, at); if (!read.bytesRead) refuse('ASSET_CHANGED'); at += read.bytesRead;}
      if (!(buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)) refuse('BRAND_FORMAT_UNSUPPORTED');
      if (buffer[0] === 137) for (let offset = 8; offset + 12 <= buffer.length;) {
        const length = buffer.readUInt32BE(offset);
        if (offset + length + 12 > buffer.length || buffer.toString('ascii', offset + 4, offset + 8) === 'acTL') refuse('BRAND_FORMAT_UNSUPPORTED');
        offset += length + 12;
      }
      const info = await sharp(buffer, {limitInputPixels: 40_000_000}).metadata();
      if (!['png', 'jpeg'].includes(info.format!) || (info.pages ?? 1) > 1 || info.width! * info.height! > 40_000_000 ||
        asset.mimeType !== 'image/' + info.format) refuse('BRAND_FORMAT_UNSUPPORTED');
      return LocalCompositionRasterFactsV2Schema.parse({source: 'owned_raster_probe', sha256: asset.sha256, width: info.width, height: info.height, format: info.format});
    }, options);
  }
  async inspectCaptions(raw: LocalCompositionCaptionReferenceV2, durationSeconds: number, role: 'speech_caption' | 'screen_title', options?: LocalCompositionOptionsV2): Promise<LocalCompositionTimedTextV2> {
    return this.guarded(() => ({stage: 'inspect', completedScenes: 0, totalScenes: 0}), options, checked => this.inspectCaptionsUnchecked(raw, durationSeconds, role, checked));
  }
  private async inspectCaptionsUnchecked(raw: LocalCompositionCaptionReferenceV2, durationSeconds: number, role: 'speech_caption' | 'screen_title', options?: LocalCompositionOptionsV2): Promise<LocalCompositionTimedTextV2> {
    const asset = LocalCompositionCaptionReferenceV2Schema.parse(raw);
    if (!['speech_caption', 'screen_title'].includes(role) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600) refuse('CUES_INVALID');
    return withPinnedLocalCompositionFileV2(asset, this.config.allowedAssetRoots, async file => {
      const bytes = Buffer.alloc(asset.bytes); let at = 0;
      while (at < bytes.length) {const read = await file.read(bytes, at, bytes.length - at, at); if (!read.bytesRead) refuse('ASSET_CHANGED'); at += read.bytesRead;}
      const checked = inspectSubtitleFileV1(bytes, durationSeconds); if (checked.mimeType !== asset.mimeType) refuse('CAPTION_FORMAT_MISMATCH');
      const stamp = (text: string) => text.replace(',', '.').split(':').map(Number).reduce((n, part) => n * 60 + part, 0);
      const cues = bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).flatMap(block => {
        if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(block)) return [];
        const lines = block.split('\n'), index = lines.findIndex(line => line.includes('-->'));
        const match = /^(\S+)\s+-->\s+(\S+)/.exec(lines[index]); if (!match) return refuse('CUES_INVALID');
        const text = lines.slice(index + 1).join('\n').trim().replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        return [{startSeconds: stamp(match[1]), endSeconds: stamp(match[2]), text, role}];
      });
      return {origin: 'owned_subtitle_file', sourceMediaId: asset.mediaId, sourceAssetSha256: asset.sha256, cues, cuesSha256: localCompositionDigestV2(cues)};
    }, options);
  }

  async inspectAudio(raw: LocalCompositionAudioReferenceV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionAudioFactsV2> {
    return this.guarded(() => ({stage: 'inspect', completedScenes: 0, totalScenes: 0}), options, checked => this.inspectAudioUnchecked(raw, checked));
  }
  private async inspectAudioUnchecked(raw: LocalCompositionAudioReferenceV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionAudioFactsV2> {
    const asset = LocalCompositionAudioReferenceV2Schema.parse(raw), root = await this.tenant(asset.organizationId);
    const target = await this.audioDirectory(asset);
    const work = await mkdtemp(join(root, '.audio-'));
    try {
      const path = await this.copy(asset, join(work, 'source'), options), format = asset.mimeType === 'audio/wav' ? 'wav' : asset.mimeType === 'audio/mpeg' ? 'mp3' : 'mov';
      const cached = await this.audioCached(asset, target, options); if (cached) return cached.facts;
      const probe = await this.probe(path, format, options), streams = probe.streams.filter(s => s.codec_type === 'audio');
      if (streams.length !== 1 || probe.streams.some(s => s.codec_type === 'video')) refuse('AUDIO_FORMAT_UNSUPPORTED');
      const decoded = join(work, 'audio.wav');
      await this.run(this.config.ffmpegExecutable, ['-v', 'error', '-nostdin', '-max_alloc', '268435456', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-f', format,
        '-i', await this.native(path, this.config.ffmpegExecutable), '-map', '0:a:0', '-vn', '-af', 'aresample=48000,asetpts=PTS-STARTPTS', '-t', '600.05',
        '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-fs', String(128 * 1024 * 1024), '-y', await this.native(decoded, this.config.ffmpegExecutable)], options);
      const measured = await this.probe(decoded, 'wav', options), duration = Number(measured.streams.find(s => s.codec_type === 'audio')?.duration ?? measured.format?.duration);
      const facts = LocalCompositionAudioFactsV2Schema.parse({source: 'local_audio_probe', sha256: asset.sha256,
        durationSeconds: duration, sampleRate: Number(streams[0].sample_rate), channels: streams[0].channels});
      const file = await open(decoded, 'r'); let pcmSha256: string; const bytes = (await file.stat()).size;
      try {pcmSha256 = await hashLocalCompositionFileV2(file, bytes, options);} finally {await file.close();}
      await rm(path); await writeFile(join(work, 'audio.json'), JSON.stringify({facts, pcmSha256: pcmSha256!, bytes}), {mode: 0o600}); await current(options);
      try {await rename(work, target);} catch {const winner = await this.audioCached(asset, target, options); if (winner) return winner.facts; refuse('AUDIO_CACHE_CONFLICT');}
      return facts;
    } finally {await rm(work, {recursive: true, force: true});}
  }
  private async audioDirectory(asset: LocalCompositionAudioReferenceV2) {
    return join(await this.tenant(asset.organizationId), 'audio-' + localCompositionDigestV2({sha256: asset.sha256, bytes: asset.bytes, mime: asset.mimeType, toolchain: await this.toolchain()}));
  }
  private async audioCached(asset: LocalCompositionAudioReferenceV2, directory: string, options?: LocalCompositionOptionsV2) {
    try {
      const info = await stat(join(directory, 'audio.json')); if (!info.isFile() || info.size > 65536) return null;
      const saved = JSON.parse(await readFile(join(directory, 'audio.json'), 'utf8')), facts = LocalCompositionAudioFactsV2Schema.parse(saved.facts);
      if (facts.sha256 !== asset.sha256 || !Number.isSafeInteger(saved.bytes) || saved.bytes > 128 * 1024 * 1024) return null;
      const path = join(directory, 'audio.wav');
      await withPinnedLocalCompositionFileV2({absolutePath: path, sha256: saved.pcmSha256, bytes: saved.bytes}, [directory], async () => {}, options);
      return {facts, path};
    } catch {await current(options); return null;}
  }

  async withPinnedResult<T>(raw: LocalCompositionResultV2, consume: (file: FileHandle, assertUnchanged: () => Promise<void>) => Promise<T>, options?: LocalCompositionOptionsV2): Promise<T> {
    const result = LocalCompositionResultV2Schema.parse(raw), root = await this.tenant(result.organizationId);
    if (result.absolutePath !== join(root, result.renderKey, 'final.mp4') || result.toolchainDigest !== await this.toolchain()) refuse('RESULT_SCOPE_MISMATCH');
    return withPinnedLocalCompositionFileV2({absolutePath: result.absolutePath, sha256: result.sha256, bytes: result.bytes}, [root], async (file, assertUnchanged) => {
      const facts = await measureLocalCompositionMp4V2(file, result.bytes, result.sha256);
      if (localCompositionDigestV2(facts) !== localCompositionDigestV2(result.metadata)) refuse('RESULT_METADATA_CHANGED');
      return consume(file, assertUnchanged);
    }, options);
  }
  async verifyResult(raw: LocalCompositionResultV2, options?: LocalCompositionOptionsV2) {
    const result = LocalCompositionResultV2Schema.parse(raw);
    return this.withPinnedResult(result, async (_file, assertUnchanged) => {await assertUnchanged(); return result;}, options);
  }

  async render(raw: LocalCompositionInputV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionResultV2> {
    const input = LocalCompositionInputV2Schema.parse(JSON.parse(JSON.stringify(raw)));
    const toolchain = await this.toolchain(), key = localCompositionRenderKeyV2(input, toolchain);
    await current(options);
    const ongoing = this.running.get(key); if (ongoing) {const result = await ongoing; await current(options); return result;}
    if (this.running.size) refuse('RENDER_BUSY');
    const operation = this.renderOwned(input, key, toolchain, options); this.running.set(key, operation);
    try {return await operation;} finally {this.running.delete(key);}
  }

  private async cached(directory: string, input: LocalCompositionInputV2, key: string, options?: LocalCompositionOptionsV2) {
    try {const directoryInfo = await stat(directory); if (!directoryInfo.isDirectory() || await realpath(directory) !== directory) refuse('CACHE_INVALID');}
    catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error;}
    try {
      const info = await stat(join(directory, 'receipt.json')); if (!info.isFile() || info.size > 2 * 1024 * 1024) refuse('CACHE_INVALID');
      const result = LocalCompositionResultV2Schema.parse(JSON.parse(await readFile(join(directory, 'receipt.json'), 'utf8')));
      const {absolutePath, bytes, metadata, sha256, renderKey, toolchainDigest, reused, scenes, ...identity} = result;
      const expected = this.inputIdentity(input, result.toolchainDigest);
      if (result.renderKey !== key || localCompositionRenderKeyV2(input, result.toolchainDigest) !== key ||
        localCompositionDigestV2({...identity, scenes: scenes.map(({reused, ...scene}) => scene)}) !== localCompositionDigestV2(expected) ||
        metadata.audio !== !!(expected.audio.sourceAudioRetained || expected.audio.narration || expected.audio.music)) refuse('CACHE_PROVENANCE_MISMATCH');
      await this.verifyResult(result, options);
      return {...result, reused: true, scenes: result.scenes.map(s => ({...s, reused: true}))};
    } catch (error) {await current(options); if ((error as Error).message === 'LOCAL_COMPOSITION_CACHE_PROVENANCE_MISMATCH') throw error; return refuse('CACHE_INVALID');}
  }
  private sceneKey(scene: Scene, input: LocalCompositionInputV2, toolchain: string) {
    return localCompositionDigestV2({engine: LOCAL_COMPOSITION_ENGINE_V2, toolchain, sha256: scene.video.sha256,
      metadata: scene.video.metadata, frameCount: Math.round(scene.durationSeconds * 30), sourceAudio: scene.sourceAudio,
      width: input.settings.width, height: input.settings.height, fps: 30});
  }
  private inputIdentity(input: LocalCompositionInputV2, toolchain: string) {
    const allCues = [...(input.timedText?.cues ?? []), ...(input.screenTitles?.cues ?? [])], titles = allCues.filter(c => c.role === 'screen_title'), speech = allCues.filter(c => c.role === 'speech_caption');
    const retained = input.scenes.map(s => s.sourceAudio === 'retain_source' && s.video.metadata.audio && input.narration?.mode !== 'replace');
    const kind = input.settings.captions === 'retain_source' ? 'retained_source' : speech.length ? 'authored_timed_text' : 'none';
    let at = 0;
    return {version: 2, engineVersion: LOCAL_COMPOSITION_ENGINE_V2, organizationId: input.organizationId, productionRevisionId: input.productionRevisionId,
      manifestDigest: input.manifestDigest, approvedSettingsDigest: input.approvedSettingsDigest, source: input.source, settings: input.settings,
      scenes: input.scenes.map((s, index) => {const start = at, frames = Math.round(s.durationSeconds * 30); at += frames;
        return {id: s.id, sceneKey: this.sceneKey(s, input, toolchain), mediaId: s.video.mediaId, sourceSha256: s.video.sha256, startFrame: start,
          frameCount: frames, sourceDurationSeconds: s.video.metadata.durationSeconds, sourceAudioRetained: retained[index],
          upscaled: Math.min(input.settings.width / s.video.metadata.width, input.settings.height / s.video.metadata.height) > 1};}),
      audio: {sourceAudioRetained: retained.some(Boolean), ...(input.narration ? {narration: {mediaId: input.narration.asset.mediaId,
        sha256: input.narration.asset.sha256, metadata: input.narration.asset.metadata, mode: input.narration.mode, gain: 1, offsetSeconds: 0}} : {}),
        ...(input.music ? {music: {mediaId: input.music.asset.mediaId, sha256: input.music.asset.sha256, metadata: input.music.asset.metadata, gain: 0.15, offsetSeconds: 0}} : {}),
        mixPolicy: 'fixed_gains/v1', speechAlignment: 'unverified'},
      captions: {kind, sourceJobIds: input.settings.captions === 'retain_source' ? [...new Set(input.scenes.flatMap(s => s.sourceCaptions?.sourceJobIds ?? []))] : [], speechAlignment: 'unverified',
        ...(kind === 'retained_source' ? {evidenceSha256: localCompositionDigestV2(input.scenes.map(s => s.sourceCaptions))} : {})},
      textRendering: {physicalBurn: allCues.length > 0, cueCount: allCues.length, screenTitleCount: titles.length, speechCaptionCount: speech.length,
        ...(allCues.length ? {cuesSha256: localCompositionDigestV2(allCues)} : {}), ...(titles.length ? {screenTitlesSha256: localCompositionDigestV2(titles)} : {}),
        ...(speech.length ? {speechCaptionsSha256: localCompositionDigestV2(speech)} : {}), ...(input.timedText?.alignment ? {alignment: input.timedText.alignment} : {}),
        ...(input.timedText?.sourceMediaId ? {captionSource: {mediaId: input.timedText.sourceMediaId, sha256: input.timedText.sourceAssetSha256, originalCuesSha256: input.timedText.cuesSha256}} : {})},
      screenCopy: {kind: titles.length ? 'authored_timed_text' : 'not_authored_by_compositor', speech: false},
      ...(input.brand ? {brand: {mediaId: input.brand.asset.mediaId, sha256: input.brand.asset.sha256, position: 'top_right', physicallyRendered: true}} : {})};
  }

  private async normalize(scene: Scene, input: LocalCompositionInputV2, root: string, toolchain: string, options?: LocalCompositionOptionsV2): Promise<SceneCache> {
    const frameCount = Math.round(scene.durationSeconds * 30), duration = frameCount / 30;
    const key = this.sceneKey(scene, input, toolchain);
    const target = join(root, 'scene-' + key);
    const cached = async (): Promise<SceneCache | null> => {
      try {
        const saved = JSON.parse(await readFile(join(target, 'scene.json'), 'utf8')) as SceneCache;
        if (saved.key !== key || saved.frameCount !== frameCount || saved.videoPath !== join(target, 'video.mp4') || saved.audioPath !== join(target, 'audio.wav')) return null;
        for (const [path, sha256] of [[saved.videoPath, saved.videoSha256], [saved.audioPath, saved.audioSha256]]) {
          const info = await stat(path); await withPinnedLocalCompositionFileV2({absolutePath: path, sha256, bytes: info.size}, [root], async () => {}, options);
        }
        return {...saved, reused: true};
      } catch {await current(options); return null;}
    };
    const existing = await cached(); if (existing) return existing;
    const work = await mkdtemp(join(root, '.scene-'));
    try {
      const source = await this.copy(scene.video, join(work, 'source.mp4'), options), video = join(work, 'video.mp4'), audio = join(work, 'audio.wav');
      const sourceProbe = await this.probe(source, 'mov', options);
      if (sourceProbe.streams.filter(s => s.codec_type === 'video').length !== 1) refuse('VIDEO_STREAM_UNSUPPORTED');
      const nativeSource = await this.native(source, this.config.ffmpegExecutable);
      const vf = `fps=30,scale=${input.settings.width}:${input.settings.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${input.settings.width}:${input.settings.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS`;
      await this.run(this.config.ffmpegExecutable, ['-v', 'error', '-nostdin', '-max_alloc', '268435456', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-f', 'mov', '-i', nativeSource,
        '-map', '0:v:0', '-vf', vf, '-r', '30', '-fps_mode', 'cfr', '-frames:v', String(frameCount), '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '20',
        '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-map_metadata', '-1', '-metadata:s:v:0', 'rotate=0', '-movflags', '+faststart', '-fs', String(limits.maxOutputBytes), '-y', await this.native(video, this.config.ffmpegExecutable)], options);
      const retain = scene.sourceAudio === 'retain_source' && scene.video.metadata.audio;
      const audioInput = retain ? ['-protocol_whitelist', 'file,pipe', '-f', 'mov', '-i', nativeSource, '-map', '0:a:0']
        : ['-protocol_whitelist', 'file,pipe', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
      await this.run(this.config.ffmpegExecutable, ['-v', 'error', '-nostdin', '-threads', '1', ...audioInput, '-af', `aresample=48000,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS`,
        '-t', String(duration), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-y', await this.native(audio, this.config.ffmpegExecutable)], options);
      const checked = await this.probe(video, 'mov', options, true), stream = checked.streams.find(s => s.codec_type === 'video');
      if (Number(stream?.nb_read_frames) !== frameCount || stream?.avg_frame_rate !== '30/1') refuse('SCENE_FRAME_MISMATCH');
      const hashFile = async (path: string) => {const file = await open(path, 'r'); try {return await hashLocalCompositionFileV2(file, (await file.stat()).size, options);} finally {await file.close();}};
      const result: SceneCache = {key, videoPath: join(target, 'video.mp4'), audioPath: join(target, 'audio.wav'), videoSha256: await hashFile(video),
        audioSha256: await hashFile(audio), frameCount, sourceAudioRetained: retain, reused: false};
      await rm(source); await writeFile(join(work, 'scene.json'), JSON.stringify(result), {mode: 0o600}); await current(options);
      try {await rename(work, target);} catch {const winner = await cached(); if (winner) return winner; refuse('SCENE_CACHE_CONFLICT');}
      return result;
    } finally {await rm(work, {recursive: true, force: true});}
  }

  private async compose(input: LocalCompositionInputV2, video: string, sourceAudio: string, output: string, duration: number, work: string, options?: LocalCompositionOptionsV2) {
    const binary = this.config.ffmpegExecutable, native = (p: string) => this.native(p, binary);
    const args = ['-v', 'error', '-nostdin', '-max_alloc', '268435456', '-filter_complex_threads', '1', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-f', 'mov', '-i', await native(video),
      '-threads', '1', '-protocol_whitelist', 'file,pipe', '-f', 'wav', '-i', await native(sourceAudio)];
    const filters: string[] = [], audio: string[] = []; let next = 2;
    const hasSource = input.narration?.mode !== 'replace' && input.scenes.some(s => s.sourceAudio === 'retain_source' && s.video.metadata.audio);
    if (hasSource) {filters.push(`[1:a]volume=${input.narration ? 0.25 : 1},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[src]`); audio.push('[src]');}
    for (const [kind, track] of [['narration', input.narration], ['music', input.music]] as const) if (track) {
      const {metadata: expected, ...reference} = track.asset;
      const cached = await this.audioCached(reference, await this.audioDirectory(reference), options);
      if (!cached || localCompositionDigestV2(cached.facts) !== localCompositionDigestV2(expected)) refuse('AUDIO_FACTS_CHANGED');
      if (kind === 'narration' && cached.facts.durationSeconds > duration + 0.0001) refuse('NARRATION_EXCEEDS_EDIT');
      args.push('-threads', '1', '-protocol_whitelist', 'file,pipe', '-f', 'wav', '-i', await native(cached.path));
      filters.push(`[${next}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${kind === 'narration' ? 1 : 0.15},apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[${kind}]`);
      audio.push('[' + kind + ']'); next++;
    }
    let visual = '[0:v]'; let encodedVisual = false;
    if (input.brand) {
      const path = await this.copy(input.brand.asset, join(work, 'brand.source'), options), brand = join(work, 'brand.png');
      await sharp(await readFile(path), {limitInputPixels: 40_000_000}).rotate().resize({width: 220, height: 120, fit: 'inside', withoutEnlargement: true}).png().toFile(brand);
      args.push('-threads', '1', '-protocol_whitelist', 'file,pipe', '-loop', '1', '-f', 'image2', '-i', await native(brand));
      filters.push(`${visual}[${next}:v]overlay=x=W-w-48:y=48:shortest=1[brand]`); visual = '[brand]'; encodedVisual = true;
    }
    const cues = [...(input.timedText?.cues ?? []), ...(input.screenTitles?.cues ?? [])];
    if (cues.length) {
      if (!this.config.fontFile) refuse('FONT_CONFIG_REQUIRED');
      const font = join(work, 'font.ttf'); await writeFile(font, await readFile(this.config.fontFile!), {mode: 0o600});
      const filterPath = async (p: string) => {const name = await native(p); if (/[:'\r\n]/.test(name)) refuse('FILTER_PATH_UNSUPPORTED'); return `'${name}'`;};
      for (let index = 0; index < cues.length; index++) {
        const cue = cues[index], size = cue.role === 'screen_title' ? 64 : 50, max = Math.floor((input.settings.width - 160) / (size * 0.62));
        const lines: string[] = []; let line = '';
        for (const word of cue.text.split(/\s+/)) {if (line && line.length + word.length + 1 > max) {lines.push(line); line = word;} else line += (line ? ' ' : '') + word;}
        if (line) lines.push(line);
        if (lines.length > 4 || lines.some(value => value.length > max)) refuse('TEXT_LAYOUT_UNAVAILABLE');
        const text = lines.join('\n'), escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const measured = await sharp({text: {text: escaped, font: `DejaVu Sans ${size}`, fontfile: this.config.fontFile, rgba: true}}).metadata();
        if (!measured.width || measured.width > input.settings.width - 128 || !measured.height || measured.height > input.settings.height * 0.4) refuse('TEXT_LAYOUT_UNAVAILABLE');
        const textPath = join(work, 'text-' + index + '.txt'); await writeFile(textPath, text, {mode: 0o600});
        filters.push(`${visual}drawtext=fontfile=${await filterPath(font)}:textfile=${await filterPath(textPath)}:expansion=none:fontsize=${size}:fontcolor=white:borderw=2:bordercolor=black:box=1:boxcolor=black@0.7:boxborderw=16:x=(w-text_w)/2:y=${cue.role === 'screen_title' ? 'h*0.18' : 'h-text_h-96'}:line_spacing=10:enable='gte(t,${cue.startSeconds})*lt(t,${cue.endSeconds})'[text${index}]`);
        visual = `[text${index}]`; encodedVisual = true;
      }
    }
    if (audio.length) filters.push(`${audio.join('')}amix=inputs=${audio.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0,apad,atrim=duration=${duration}[mixed]`);
    if (filters.length) {
      const script = join(work, 'filters.txt'); await writeFile(script, filters.join(';\n'), {mode: 0o600}); args.push('-filter_complex_script', await native(script));
    }
    args.push('-map', encodedVisual ? visual : '0:v:0');
    if (audio.length) args.push('-map', '[mixed]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'); else args.push('-an');
    args.push(...(encodedVisual ? ['-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '20', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy']),
      '-t', String(duration), '-map_metadata', '-1', '-movflags', '+faststart', '-fs', String(limits.maxOutputBytes), '-y', await native(output));
    await this.run(binary, args, options);
  }

  private async renderOwned(input: LocalCompositionInputV2, key: string, toolchain: string, options?: LocalCompositionOptionsV2): Promise<LocalCompositionResultV2> {
    const progress: LocalCompositionProgressV2 = {stage: 'inspect', completedScenes: 0, totalScenes: input.scenes.length, renderKey: key};
    return this.guarded(() => progress, options, async checked => {
      const root = await this.tenant(input.organizationId), target = join(root, key), work = await mkdtemp(join(root, '.render-'));
      try {
        // Even cache hits revalidate current owned bytes; a stale declared hash is never a reuse permission.
        for (const scene of input.scenes) {
          const facts = await this.inspectVideoUnchecked(scene.video, checked);
          if (localCompositionDigestV2(facts) !== localCompositionDigestV2(scene.video.metadata)) refuse('VIDEO_FACTS_CHANGED');
        }
        for (const track of [input.narration?.asset, input.music?.asset].filter(Boolean)) {
          const {metadata: expected, ...reference} = track!;
          const facts = await this.inspectAudioUnchecked(reference, checked);
          if (localCompositionDigestV2(facts) !== localCompositionDigestV2(track!.metadata)) refuse('AUDIO_FACTS_CHANGED');
        }
        if (input.brand && localCompositionDigestV2(await this.inspectBrandUnchecked(input.brand.asset, checked)) !== localCompositionDigestV2(input.brand.metadata)) refuse('BRAND_FACTS_CHANGED');
        const cached = await this.cached(target, input, key, checked);
        if (cached) return cached;
        const normalized: SceneCache[] = [];
        for (const scene of input.scenes) {
          progress.stage = 'scene'; progress.sceneId = scene.id;
          normalized.push(await this.normalize(scene, input, root, toolchain, checked));
          progress.completedScenes++; await checked.onProgress?.({...progress});
        }
        progress.stage = 'compose'; delete progress.sceneId;
        const videoList = join(work, 'video.txt'), audioList = join(work, 'audio.txt');
        const line = async (p: string) => `file '${(await this.native(p, this.config.ffmpegExecutable)).replace(/'/g, "'\\''")}'\n`;
        await writeFile(videoList, (await Promise.all(normalized.map(s => line(s.videoPath)))).join(''));
        await writeFile(audioList, (await Promise.all(normalized.map(s => line(s.audioPath)))).join(''));
        const joined = join(work, 'joined.mp4'), sourceAudio = join(work, 'source.wav');
        await this.run(this.config.ffmpegExecutable, ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-f', 'concat', '-safe', '0',
          '-i', await this.native(videoList, this.config.ffmpegExecutable), '-map', '0:v:0', '-c', 'copy', '-an', '-map_metadata', '-1', '-y', await this.native(joined, this.config.ffmpegExecutable)], checked);
        await this.run(this.config.ffmpegExecutable, ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-f', 'concat', '-safe', '0',
          '-i', await this.native(audioList, this.config.ffmpegExecutable), '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-y', await this.native(sourceAudio, this.config.ffmpegExecutable)], checked);
        const duration = normalized.reduce((sum, scene) => sum + scene.frameCount, 0) / 30;
        const output = join(work, 'final.mp4');
        await this.compose(input, joined, sourceAudio, output, duration, work, checked);
        progress.stage = 'verify';
        const outputInfo = await stat(output); if (!outputInfo.isFile() || outputInfo.size > limits.maxOutputBytes) refuse('OUTPUT_LIMIT');
        const handle = await open(output, 'r'); let sha256: string, metadata: LocalCompositionResultV2['metadata'];
        try {sha256 = await hashLocalCompositionFileV2(handle, outputInfo.size, checked); metadata = await measureLocalCompositionMp4V2(handle, outputInfo.size, sha256);}
        finally {await handle.close();}
        const probe = await this.probe(output, 'mov', checked, true), video = probe.streams.filter(s => s.codec_type === 'video');
        const frameCount = normalized.reduce((sum, s) => sum + s.frameCount, 0);
        if (video.length !== 1 || video[0].codec_name !== 'h264' || video[0].avg_frame_rate !== '30/1' || Number(video[0].nb_read_frames) !== frameCount) refuse('OUTPUT_FRAME_MISMATCH');
        const retained = input.scenes.map(s => s.sourceAudio === 'retain_source' && s.video.metadata.audio && input.narration?.mode !== 'replace');
        const allCues = [...(input.timedText?.cues ?? []), ...(input.screenTitles?.cues ?? [])];
        const titles = allCues.filter(c => c.role === 'screen_title'), speech = allCues.filter(c => c.role === 'speech_caption');
        const jobIds = input.settings.captions === 'retain_source' ? [...new Set(input.scenes.flatMap(s => s.sourceCaptions?.sourceJobIds ?? []))] : [];
        const captionKind = input.settings.captions === 'retain_source' ? 'retained_source' : speech.length ? 'authored_timed_text' : 'none';
        let at = 0;
        const result = LocalCompositionResultV2Schema.parse({version: 2, engineVersion: LOCAL_COMPOSITION_ENGINE_V2,
          organizationId: input.organizationId, productionRevisionId: input.productionRevisionId, manifestDigest: input.manifestDigest,
          approvedSettingsDigest: input.approvedSettingsDigest, source: input.source, settings: input.settings, renderKey: key, toolchainDigest: toolchain,
          absolutePath: join(target, 'final.mp4'), sha256: sha256!, bytes: outputInfo.size, metadata: metadata!,
          scenes: input.scenes.map((scene, index) => {const start = at, one = normalized[index]; at += one.frameCount;
            return {id: scene.id, sceneKey: one.key, mediaId: scene.video.mediaId, sourceSha256: scene.video.sha256, startFrame: start,
              frameCount: one.frameCount, sourceDurationSeconds: scene.video.metadata.durationSeconds, sourceAudioRetained: retained[index],
              upscaled: Math.min(input.settings.width / scene.video.metadata.width, input.settings.height / scene.video.metadata.height) > 1, reused: one.reused};}),
          audio: {sourceAudioRetained: retained.some(Boolean), ...(input.narration ? {narration: {mediaId: input.narration.asset.mediaId,
            sha256: input.narration.asset.sha256, metadata: input.narration.asset.metadata, mode: input.narration.mode, gain: 1, offsetSeconds: 0}} : {}),
            ...(input.music ? {music: {mediaId: input.music.asset.mediaId, sha256: input.music.asset.sha256, metadata: input.music.asset.metadata, gain: 0.15, offsetSeconds: 0}} : {}),
            mixPolicy: 'fixed_gains/v1', speechAlignment: 'unverified'},
          captions: {kind: captionKind, sourceJobIds: jobIds, speechAlignment: 'unverified',
            ...(captionKind === 'retained_source' ? {evidenceSha256: localCompositionDigestV2(input.scenes.map(s => s.sourceCaptions))} : {})},
          textRendering: {physicalBurn: allCues.length > 0, cueCount: allCues.length, screenTitleCount: titles.length, speechCaptionCount: speech.length,
            ...(allCues.length ? {cuesSha256: localCompositionDigestV2(allCues)} : {}), ...(titles.length ? {screenTitlesSha256: localCompositionDigestV2(titles)} : {}),
            ...(speech.length ? {speechCaptionsSha256: localCompositionDigestV2(speech)} : {}), ...(input.timedText?.alignment ? {alignment: input.timedText.alignment} : {}),
            ...(input.timedText?.sourceMediaId ? {captionSource: {mediaId: input.timedText.sourceMediaId, sha256: input.timedText.sourceAssetSha256, originalCuesSha256: input.timedText.cuesSha256}} : {})},
          screenCopy: {kind: titles.length ? 'authored_timed_text' : 'not_authored_by_compositor', speech: false},
          ...(input.brand ? {brand: {mediaId: input.brand.asset.mediaId, sha256: input.brand.asset.sha256, position: 'top_right', physicallyRendered: true}} : {}), reused: false});
        await current(checked); await writeFile(join(work, 'receipt.json'), JSON.stringify(result), {mode: 0o600});
        try {await rename(work, target);} catch {const winner = await this.cached(target, input, key, checked); if (winner) return winner; refuse('CACHE_CONFLICT');}
        progress.stage = 'ready'; return await this.verifyResult(result, checked);
      } finally {await rm(work, {recursive: true, force: true});}
    });
  }
}
