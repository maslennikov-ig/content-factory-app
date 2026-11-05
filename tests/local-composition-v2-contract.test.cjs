const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const c = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-composition.v2.ts');
const sha = 'a'.repeat(64), other = 'b'.repeat(64);
const source = {pieceId: 'piece', revision: sha, textSha256: sha};
const asset = () => ({organizationId: 'org', mediaId: 'media', absolutePath: '/owned/media.mp4', sha256: sha, bytes: 123});
const metadata = () => ({source: 'mp4_bytes', sha256: sha, width: 720, height: 1280, durationSeconds: 5,
  videoTrackId: 1, audio: true, rotationDegrees: 0});
const input = () => ({version: 2, engineVersion: c.LOCAL_COMPOSITION_ENGINE_V2, organizationId: 'org', productionRevisionId: 'revision',
  manifestDigest: sha, approvedSettingsDigest: sha, source, settings: {width: 1080, height: 1920, fps: 30, fit: 'contain_pad', transition: 'hard_cut', captions: 'none'},
  scenes: [{id: 'scene1', durationSeconds: 5, video: {...asset(), metadata: metadata()}, sourceAudio: 'retain_source'}]});
const audio = () => ({...asset(), mimeType: 'audio/wav', metadata: {source: 'local_audio_probe', sha256: sha, durationSeconds: 4, sampleRate: 48000, channels: 1}});

test('strict internal input admits bounded owned media and explicit already-owned audio; rejects model/filter/funding parameters', () => {
  const value = input(); value.narration = {asset: audio(), mode: 'replace', gain: 1, offsetSeconds: 0};
  value.music = {asset: audio(), fit: 'trim_to_edit', gain: 0.15, offsetSeconds: 0};
  expect(c.LocalCompositionInputV2Schema.parse(value)).toEqual(value);
  for (const extra of [{filter: 'arbitrary'}, {apiKey: 'not-permitted'}, {payer: 'included'}, {use_unlim: true}])
    expect(c.LocalCompositionInputV2Schema.safeParse({...value, ...extra}).success).toBe(false);
});

test('ownership, file hashes, resource bounds, fixed settings and narration timing are enforced', () => {
  const mutate = [v => v.scenes[0].video.organizationId = 'foreign', v => v.scenes[0].video.absolutePath = 'https://remote/media.mp4',
    v => v.scenes[0].video.sha256 = other, v => v.scenes[0].video.bytes = 1024 * 1024 * 1024 + 1,
    v => v.settings.fit = 'crop', v => v.settings.fps = 60, v => v.scenes[0].video.metadata.durationSeconds = 601,
    v => v.scenes.push({...v.scenes[0]}), v => v.narration = {asset: {...audio(), metadata: {...audio().metadata, durationSeconds: 6}}, mode: 'mix', gain: 1, offsetSeconds: 0}];
  for (const change of mutate) {const value = input(); change(value); expect(c.LocalCompositionInputV2Schema.safeParse(value).success).toBe(false);}
});

test('render identity binds exact order, hashes, approved settings, source and engine/toolchain, independent of object key ordering', () => {
  const value = input(); value.scenes.push({...value.scenes[0], id: 'scene2'});
  const key = c.localCompositionRenderKeyV2(value, sha);
  expect(c.localCompositionRenderKeyV2(Object.fromEntries(Object.entries(value).reverse()), sha)).toBe(key);
  for (const change of [v => v.scenes.reverse(), v => v.approvedSettingsDigest = other, v => v.source = {...source, revision: other},
    v => {v.scenes[0].video.sha256 = other; v.scenes[0].video.metadata.sha256 = other;}]) {
    const next = structuredClone(value); change(next); expect(c.localCompositionRenderKeyV2(next, sha)).not.toBe(key);
  }
  expect(c.localCompositionRenderKeyV2(value, other)).not.toBe(key);
  expect(() => c.localCompositionRenderKeyV2({...value, engineVersion: 'old-engine'}, sha)).toThrow();
});

test('replaced narration cannot reuse old burned speech-caption provenance', () => {
  const value = input(); value.settings.captions = 'retain_source';
  expect(c.LocalCompositionInputV2Schema.safeParse(value).success).toBe(false);
  value.scenes[0].sourceCaptions = {kind: 'provider_confirmed', mediaSha256: sha, evidenceSha256: sha, sourceJobIds: ['completed-source']};
  expect(c.LocalCompositionInputV2Schema.safeParse(value).success).toBe(true);
  value.narration = {asset: audio(), mode: 'replace', gain: 1, offsetSeconds: 0};
  expect(c.LocalCompositionInputV2Schema.safeParse(value).success).toBe(false);
});

test('result is a measured local file and ordered lineage, never an invented provider job or speech caption assertion', () => {
  const value = input(), result = {version: 2, engineVersion: c.LOCAL_COMPOSITION_ENGINE_V2, organizationId: 'org', productionRevisionId: 'revision',
    manifestDigest: sha, approvedSettingsDigest: sha, source, settings: value.settings, renderKey: c.localCompositionRenderKeyV2(value, sha), toolchainDigest: sha,
    absolutePath: '/private/render.mp4', sha256: sha, bytes: 123, metadata: {...metadata(), width: 1080, height: 1920},
    scenes: [{id: 'scene1', sceneKey: sha, mediaId: 'media', sourceSha256: sha, startFrame: 0, frameCount: 150, sourceDurationSeconds: 5, sourceAudioRetained: true, upscaled: true, reused: false}],
    audio: {sourceAudioRetained: true, mixPolicy: 'fixed_gains/v1', speechAlignment: 'unverified'},
    captions: {kind: 'none', sourceJobIds: [], speechAlignment: 'unverified'}, textRendering: {physicalBurn: false, cueCount: 0, screenTitleCount: 0, speechCaptionCount: 0}, screenCopy: {kind: 'not_authored_by_compositor', speech: false}, reused: false};
  expect(c.LocalCompositionResultV2Schema.parse(result)).toEqual(result);
  for (const change of [r => r.scenes[0].startFrame = 1, r => r.sha256 = other, r => r.captions.speechAlignment = 'verified',
    r => r.screenCopy.speech = true, r => r.providerJobId = 'fake', r => r.costUsd = 0]) {
    const next = structuredClone(result); change(next); expect(c.LocalCompositionResultV2Schema.safeParse(next).success).toBe(false);
  }
});


test('long final descriptor covers120 owned5-second scenes without changing paid V1/PersonalV2 contracts', () => {
  const {VideoProductionLocalManifestV3Schema} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/production/video-production.local.v3.ts');
  const manifest = {version: 3, kind: 'local_owned_composition', source, title: 'Saved long edit', locale: 'en',
    funding: {kind: 'local_compute', scope: 'final_only'}, settings: {...input().settings, width: 1920, height: 1080},
    scenes: Array.from({length: 120}, (_, i) => ({id: 'scene'+i, mediaId: 'media'+i, durationSeconds: 5, sourceAudio: 'retain_source'}))};
  expect(VideoProductionLocalManifestV3Schema.parse(manifest).scenes).toHaveLength(120);
  expect(VideoProductionLocalManifestV3Schema.safeParse({...manifest, durationSeconds: 600, provider: 'heygen', apiKey: 'fake'}).success).toBe(false);
  const internal = input(); internal.settings = manifest.settings; internal.scenes = manifest.scenes.map(s => ({id: s.id, durationSeconds: 5, sourceAudio: s.sourceAudio, video: {...asset(), mediaId: s.mediaId, metadata: metadata()}}));
  expect(c.LocalCompositionInputV2Schema.parse(internal).scenes).toHaveLength(120);
  internal.scenes.push({...internal.scenes[0], id: 'too-long'});
  expect(c.LocalCompositionInputV2Schema.safeParse(internal).success).toBe(false);
});

test('typed authored captions and brand carry physical input facts separately from independent alignment', () => {
  const value = input(); value.settings.captions = 'authored_timed_text';
  const cues = [{startSeconds: 0, endSeconds: 4, text: 'Exact authored words', role: 'speech_caption'}];
  value.timedText = {origin: 'authored_timed_text', cues, cuesSha256: c.localCompositionDigestV2(cues)};
  value.brand = {asset: {...asset(), mimeType: 'image/png'}, metadata: {source: 'owned_raster_probe', sha256: sha, width: 200, height: 100, format: 'png'}, position: 'top_right'};
  expect(c.LocalCompositionInputV2Schema.safeParse(value).success).toBe(true);
  expect(value.timedText.alignment).toBeUndefined();
  value.timedText.alignment = {kind: 'server_evidence', evidenceId: 'bound-server-receipt', evidenceSha256: sha, audioSha256: sha, transcriptSha256: sha, cuesSha256: other};
  expect(c.LocalCompositionInputV2Schema.safeParse(value).success).toBe(false);
});


test('authored titles coexist with an owned caption track without changing its file provenance', () => {
  const value = input(); value.settings.captions = 'authored_timed_text';
  const speech = [{startSeconds: 0, endSeconds: 4, text: 'Actual supplied caption', role: 'speech_caption'}];
  const titles = [{startSeconds: 0, endSeconds: 3, text: 'Separate authored title', role: 'screen_title'}];
  value.timedText = {origin: 'owned_subtitle_file', sourceMediaId: 'caption-media', sourceAssetSha256: other, cues: speech, cuesSha256: c.localCompositionDigestV2(speech)};
  value.screenTitles = {origin: 'authored_timed_text', cues: titles, cuesSha256: c.localCompositionDigestV2(titles)};
  const parsed = c.LocalCompositionInputV2Schema.parse(value);
  expect(parsed.timedText.sourceAssetSha256).toBe(other); expect(parsed.screenTitles.cuesSha256).not.toBe(parsed.timedText.cuesSha256);
  const {VideoProductionLocalManifestV3Schema} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/production/video-production.local.v3.ts');
  expect(VideoProductionLocalManifestV3Schema.safeParse({version: 3, kind: 'local_owned_composition', source, title: 'Title plus captions', locale: 'en', funding: {kind: 'local_compute', scope: 'final_only'}, settings: value.settings, scenes: [{id: 'scene1', mediaId: 'video-media', durationSeconds: 5, sourceAudio: 'retain_source'}], timedText: {origin: 'owned_subtitle_file', mediaId: 'caption-media', role: 'speech_caption'}, screenTitles: titles}).success).toBe(true);
});
