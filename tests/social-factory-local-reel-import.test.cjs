const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const sceneProjection=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/local-reel-scenes.v1.ts');
const localStorage=loadTypeScriptModule('libraries/nestjs-libraries/src/upload/local.storage.ts',{
  '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator':{},
  '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher':{},
  '@contentfactory/nestjs-libraries/upload/data.url':{},
  'file-type':{fromBuffer:async()=>({mime:'video/mp4',ext:'mp4'})},
});

const digest = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const servicePath = path.join(__dirname, '../libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/local-reel.service.ts');

// This boundary uses require.resolve for its installed browser. Supply that Node API
// without loading Playwright, a browser, cloud storage or the application's Prisma client.
function loadBoundary(mocks) {
  const code = ts.transpileModule(readFileSync(servicePath, 'utf8'), { fileName: servicePath,
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
  const localRequire = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  localRequire.resolve = name => name === 'playwright' ? '/unit-test/playwright.cjs' : require.resolve(name);
  const module = { exports: {} };
  new Function('exports', 'require', 'module', code)(module.exports, localRequire, module);
  return module.exports;
}

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'cf-reel-import-'));
  const uploadRoot = path.join(root, 'uploads'); await fs.mkdir(uploadRoot);
  const env = { UPLOAD_DIRECTORY: uploadRoot, STORAGE_PROVIDER: 'local', FRONTEND_URL: 'http://127.0.0.1:9999',
    CF_LOCAL_REEL_CHROME: '/unit-test/chrome', CF_LOCAL_REEL_FFMPEG: '/unit-test/ffmpeg', CF_LOCAL_REEL_CACHE_ROOT: path.join(root, 'cache') };
  const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  t.after(async () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } await fs.rm(root, { recursive: true, force: true }); });
  const bytes = Buffer.from('renderer-output-unit-fixture; MP4 decoding is covered by the accepted renderer test');
  const output = path.join(root, 'reel.mp4'); await fs.writeFile(output, bytes);
  const source = { ref: { version: 1, kind: 'adaptation', pieceId: 'owned-piece', adaptationId: 'selected-adaptation', postId: 'selected-post', revision: digest('source-revision') },
    actorId: 'editor', organizationId: 'org-a', title: 'Saved source', text: 'Exact selected saved post', locale: 'ru-RU', contentDigest: digest('Exact selected saved post') };
  const material = { version: 1, sourceArtifact: copy(source.ref), channelId: 'draft-target', platform: 'instagram', format: 'reel', title: 'Selected Reel',
    hook: 'Сохранённый текст', body: source.text, caption: 'Public caption', assets: [
      { id: 'cover', mediaId: 'cover', kind: 'image', mimeType: 'image/png', role: 'visual', provenance: { revision: '1', sourceIds: [] } },
      { id: 'old-video', kind: 'video' }, { id: 'old-subtitles', kind: 'subtitle' } ],
    scenes: [{ index: 0, startSeconds: 0, endSeconds: 2, spokenText: 'Первый точный текст', visualIntent: 'text' },
      { index: 1, startSeconds: 2, endSeconds: 4, spokenText: 'Второй точный текст', visualIntent: 'text' }],
    settings: { retainedSetting: true }, evidence: [{ id: 'evidence', sourceId: 'owned-evidence' }], playbook: { version: '1', sourceDate: '2026-11-03' } };
  const measured = { source: 'mp4_bytes', sha256: digest(bytes), width: 1080, height: 1920, durationSeconds: 4, videoTrackId: 1, audio: false, rotationDegrees: 0 };
  const result = { version: 1, renderKey: digest('render'), absolutePath: output, sha256: digest(bytes), metadata: copy(measured),
    source: { pieceId: source.ref.pieceId, adaptationId: source.ref.adaptationId, revision: source.ref.revision, textSha256: source.contentDigest },
    captions: { source: 'authored_on_screen', speech: false }, reused: false,
    sceneResults: material.scenes.map((s, i) => ({ id: `scene-${s.index}`, contentSha256: digest(s.spokenText), startSeconds: s.startSeconds,
      durationSeconds: s.endSeconds - s.startSeconds, renderedText: { title: i === 0 ? material.hook : '', text: s.spokenText, captions: [] }, reused: false,
      frames: [{ absolutePath: path.join(root, `frame-${i}.png`), sha256: digest(`frame-${i}`), startSeconds: 0, endSeconds: 2 }] })) };
  const counts = { render: 0, upload: 0, save: 0, measure: 0 }; const events = []; const renders = []; const checkpoints = []; const rows = []; const uploads = [];
  let durable = {}, current = true;
  const assertCurrent = async () => { events.push('current'); if (!current) throw new Error('SOURCE_ARTIFACT_STALE'); };
  const media = {
    mediaInWorkspace: async (org, ids) => { events.push('owned-media'); return rows.filter(r => r.organizationId === org && ids.includes(r.id)); },
    saveMultipartFile: async (org, name, url, label) => { counts.save++; events.push('save'); assert.equal(org, 'org-a'); assert.equal(label, 'Selected Reel.mp4');
      // Verified MediaRepository contract: active org+name+path registration is idempotent.
      const existing = rows.find(r => r.organizationId === org && r.name === name && r.path === url && !r.deletedAt);
      if (existing) return existing;
      const row = { id: counts.save === 1 ? 'owned-final-video' : `owned-final-video-${counts.save}`, name, originalName: label, organizationId: org, path: url, deletedAt: null };
      rows.push(row); return row; },
  };
  const { CampaignLocalReelServiceV1 } = loadBoundary({
    './local-reel-scenes.v1':sceneProjection,
    '@nestjs/common': { Injectable: () => target => target },
    '../../../database/prisma/media/media.service': { MediaService: class {} },
    '../../../videos/local-reel/local-reel-renderer.v1': { LocalReelRendererV1: class {
      constructor(config) { assert.deepEqual(config.allowedAssetRoots, [uploadRoot]); }
      async render(input) { counts.render++; events.push('render'); renders.push(copy(input)); if (options.staleAfter === 'render') current = false; return copy(result); }
    } },
    '../../../videos/production/video-production-result.v1': { measureMp4VideoV1: buffer => { counts.measure++; events.push('measure'); assert.deepEqual(buffer, bytes); return copy(measured); } },
    '../../../upload/local.storage': { ...localStorage, LocalStorage: class extends localStorage.LocalStorage {
      async uploadLocalReel(buffer,...args){
        assert.deepEqual(buffer,bytes);
        const receipt=await super.uploadLocalReel(buffer,...args);
        if(!receipt.reused){counts.upload++;events.push('upload');uploads.push(receipt);}
        if(options.staleAfter==='upload')current=false;
        return receipt;
      }
    } },
  });
  const service = new CampaignLocalReelServiceV1(media);
  const run = async (checkpoint = durable, onCheckpoint = async state => { durable = copy(state); checkpoints.push(copy(state)); events.push('checkpoint'); },operationId='owned-operation') =>
    service.produce('org-a', source, material, options.imageIds ?? [], checkpoint, onCheckpoint, assertCurrent,operationId);
  return { root, uploadRoot, source, material, result, measured, rows, uploads, counts, events, renders, checkpoints, run,
    durable: () => copy(durable), setCurrent: value => { current = value; },
    persist: state => { durable = copy(state); checkpoints.push(copy(state)); } };
}

test('owned import preserves the exact selected source, bytes, silent proof and scene digest without mutating its input', async t => {
  const f = await fixture(t); const original = copy(f.material); const ready = await f.run();
  assert.deepEqual(f.counts, { render: 1, upload: 1, save: 1, measure: 1 });
  assert.deepEqual(f.material, original); assert.equal(ready.settings.retainedSetting, true);
  assert.deepEqual(f.renders[0].source, f.result.source); assert.equal(f.renders[0].scenes[1].text, f.material.scenes[1].spokenText);
  assert.deepEqual(ready.assets.map(a => a.id), ['cover', 'owned-final-video']);
  const video = ready.assets[1]; assert.equal(video.url, f.rows[0].path); assert.equal(video.durationSeconds, 4);
  assert.deepEqual(video.videoEvidence.localSilent, { version: 1, renderKey: f.result.renderKey, sourceArtifact: f.source.ref,
    textSha256: digest(f.source.text), sceneTextDigest: digest(JSON.stringify([
      { index: 0, startSeconds: 0, endSeconds: 2, text: 'Первый точный текст' }, { index: 1, startSeconds: 2, endSeconds: 4, text: 'Второй точный текст' },
    ])), speech: false });
  assert.equal(ready.settings.localReel.silent, true); assert.equal(ready.settings.localReel.speech, false);
  assert.equal(ready.settings.localReel.captionSource, 'authored_on_screen');
  assert.deepEqual(ready.settings.localReel.sourceArtifact, f.source.ref);
  assert.ok(!JSON.stringify(ready.settings.localReel).includes(f.root), 'public settings contain hashes, not private frame paths');
  assert.deepEqual(f.checkpoints.map(s => [!!s.rendered, !!s.uploadIntent, !!s.uploaded, !!s.asset]), [[true,false,false,false],[true,true,false,false],[true,true,true,false],[true,true,true,true]]);
  // A completed owned Media import survives removal of disposable local render cache.
  await fs.unlink(f.result.absolutePath);
  const retry = await f.run(); assert.deepEqual(retry, ready); assert.equal(f.counts.render, 1); assert.equal(f.counts.upload, 1); assert.equal(f.counts.save, 1);
});

for (const phase of ['rendered', 'uploadIntent', 'uploaded', 'asset']) test(`retry of a durably saved ${phase} checkpoint reuses completed work`, async t => {
  const f = await fixture(t); let failed = false;
  await assert.rejects(f.run({}, async state => { f.persist(state); if (!failed && state[phase]) { failed = true; throw new Error('CHECKPOINT_ACK_LOST'); } }), /CHECKPOINT_ACK_LOST/);
  await f.run(); assert.equal(f.counts.render, 1); assert.equal(f.counts.upload, 1); assert.equal(f.counts.save, 1); assert.equal(f.rows.length, 1);
});

test('lost uploaded checkpoint reuses the same real file and registers one Media',async t=>{
 const f=await fixture(t);let failed=false;
 await assert.rejects(f.run({},async state=>{
  if(state.uploaded&&!failed){failed=true;throw Error('CHECKPOINT_NOT_SAVED');}
  f.persist(state);
 }),/CHECKPOINT_NOT_SAVED/);
 const intent=f.durable().uploadIntent,target=path.join(f.uploadRoot,intent.target);
 const before=await fs.stat(target),bytes=await fs.readFile(target);
 assert.equal(f.durable().uploaded,undefined);assert.equal(f.counts.upload,1);assert.equal(f.rows.length,0);
 await f.run();
 assert.equal((await fs.stat(target)).ino,before.ino);assert.deepEqual(await fs.readFile(target),bytes);
 assert.equal(f.counts.render,1);assert.equal(f.counts.upload,1);assert.equal(f.rows.length,1);
 assert.equal(f.durable().uploaded.path,process.env.FRONTEND_URL+'/uploads/'+intent.target);
});

test('intent persistence failure writes zero files and a stale source at the intent boundary blocks bytes',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.run({},async state=>{if(state.uploadIntent)throw Error('INTENT_NOT_SAVED');f.persist(state);}),/INTENT_NOT_SAVED/);
 assert.deepEqual(await fs.readdir(f.uploadRoot),[]);assert.equal(f.counts.upload,0);
 await assert.rejects(f.run(f.durable(),async state=>{f.persist(state);if(state.uploadIntent)f.setCurrent(false);}),/SOURCE_ARTIFACT_STALE/);
 assert.equal(f.counts.upload,0);assert.equal(f.rows.length,0);
});

test('saved upload intent cannot be rebound to another org, operation, render, hash or path',async t=>{
 const f=await fixture(t);let failed=false;
 await assert.rejects(f.run({},async state=>{f.persist(state);if(state.uploadIntent&&!failed){failed=true;throw Error('INTENT_ACK_LOST');}}),/INTENT_ACK_LOST/);
 const state=f.durable();
 for(const extra of [{organizationId:'other-org'},{operationId:'other-operation'},{renderKey:digest('other-render')},{contentSha256:digest('other-bytes')},{target:'../outside.mp4'}]){
  await assert.rejects(f.run({...state,uploadIntent:{...state.uploadIntent,...extra}}),/LOCAL_REEL_UPLOAD_INTENT_INVALID/);
 }
 await assert.rejects(f.run(state,undefined,'another-operation'),/LOCAL_REEL_UPLOAD_INTENT_INVALID/);
 assert.equal(f.counts.upload,0);assert.equal(f.rows.length,0);
});

test('legacy uploaded and completed checkpoints remain usable without an upload intent',async t=>{
 const f=await fixture(t);await f.run();const legacy=f.durable();delete legacy.uploadIntent;delete legacy.asset;
 await f.run(legacy);assert.equal(f.rows.length,1);assert.equal(f.counts.upload,1);
 const completed=f.durable();delete completed.uploadIntent;await fs.unlink(f.result.absolutePath);
 await f.run(completed);assert.equal(f.rows.length,1);assert.equal(f.counts.upload,1);
});

test('a durably uploaded intent rechecks its actual bytes before creating Media',async t=>{
 const f=await fixture(t);let failed=false;
 await assert.rejects(f.run({},async state=>{f.persist(state);if(state.uploaded&&!failed){failed=true;throw Error('UPLOADED_ACK_LOST');}}),/UPLOADED_ACK_LOST/);
 const target=path.join(f.uploadRoot,f.durable().uploadIntent.target);await fs.writeFile(target,'partial');
 await assert.rejects(f.run(),/LOCAL_REEL_UPLOAD_CONTENT_MISMATCH/);
 assert.equal(await fs.readFile(target,'utf8'),'partial');assert.equal(f.rows.length,0);assert.equal(f.counts.upload,1);
});

test('lost asset checkpoint retries the same upload registration without duplicating owned Media', async t => {
  const f = await fixture(t); let failed = false;
  await assert.rejects(f.run({}, async state => {
    if (state.asset && !failed) { failed = true; throw new Error('CHECKPOINT_NOT_SAVED'); }
    f.persist(state);
  }), /CHECKPOINT_NOT_SAVED/);
  assert.equal(f.rows.length, 1); assert.equal(f.durable().asset, undefined);
  await f.run(); assert.equal(f.counts.render, 1); assert.equal(f.counts.upload, 1); assert.equal(f.rows.length, 1);
});

for (const phase of ['before', 'render', 'upload']) test(`source becoming stale ${phase} prevents the next irreversible boundary`, async t => {
  const f = await fixture(t, { staleAfter: phase }); if (phase === 'before') f.setCurrent(false);
  await assert.rejects(f.run(), /SOURCE_ARTIFACT_STALE/);
  assert.equal(f.counts.upload, phase === 'upload' ? 1 : 0); assert.equal(f.counts.save, 0);
  if (phase === 'before') assert.equal(f.counts.render, 0);
});

test('foreign owned image and foreign upload origin cannot reach the renderer or importer', async t => {
  const f = await fixture(t, { imageIds: ['foreign-image'] });
  f.rows.push({ id: 'foreign-image', organizationId: 'org-b', path: 'http://127.0.0.1:9999/uploads/2026/11/04/abc.png' });
  await assert.rejects(f.run(), /LOCAL_REEL_IMAGE_UNAVAILABLE/);
  f.rows[0].organizationId = 'org-a'; f.rows[0].path = 'https://foreign.example/uploads/2026/11/04/abc.png';
  await assert.rejects(f.run(), /LOCAL_REEL_IMAGE_UNAVAILABLE/);
  assert.equal(f.counts.render, 0); assert.equal(f.counts.upload, 0);
});

test('an owned image symlink outside the configured upload root is rejected', async t => {
  const f = await fixture(t, { imageIds: ['linked-image'] }); const folder = path.join(f.uploadRoot, '2026/11/04'); await fs.mkdir(folder, { recursive: true });
  const outside = path.join(f.root, 'outside.png'); await fs.writeFile(outside, 'foreign-private'); await fs.symlink(outside, path.join(folder, 'abc.png'));
  f.rows.push({ id: 'linked-image', organizationId: 'org-a', path: 'http://127.0.0.1:9999/uploads/2026/11/04/abc.png' });
  await assert.rejects(f.run(), /LOCAL_REEL_IMAGE_UNAVAILABLE/); assert.equal(f.counts.render, 0);
});

for (const mismatch of ['hash', 'audio', 'dimensions', 'duration']) test(`import rejects ${mismatch} instead of creating owned Media`, async t => {
  const f = await fixture(t);
  if (mismatch === 'hash') f.result.sha256 = '0'.repeat(64);
  if (mismatch === 'audio') f.measured.audio = true;
  if (mismatch === 'dimensions') f.measured.width = 1920;
  if (mismatch === 'duration') f.measured.durationSeconds = 91;
  await assert.rejects(f.run(), /LOCAL_REEL_MEASURED_RESULT_INVALID/); assert.equal(f.counts.upload, 0); assert.equal(f.counts.save, 0);
});

test('owned Media disappearing after a completed checkpoint cannot be returned as ready', async t => {
  const f = await fixture(t); await f.run(); f.rows.length = 0;
  await assert.rejects(f.run(), /LOCAL_REEL_MEDIA_UNAVAILABLE/); assert.equal(f.counts.upload, 1); assert.equal(f.counts.save, 1);
});

test('cached renderer metadata cannot override the measured MP4 dimensions/duration/silence', async t => {
  const f = await fixture(t); f.result.metadata = { ...f.result.metadata, width: 640, durationSeconds: 900, audio: true };
  await assert.rejects(f.run(), /LOCAL_REEL_.*(?:INVALID|MISMATCH)/); assert.equal(f.counts.upload, 0); assert.equal(f.counts.save, 0);
});

test('resuming an uploaded checkpoint verifies metadata before registering owned Media', async t => {
  const f = await fixture(t);
  const rendered = copy(f.result); rendered.metadata = { ...rendered.metadata, width: 640, durationSeconds: 900, audio: true };
  const uploaded = { name: 'already-uploaded.mp4', path: 'http://127.0.0.1:9999/uploads/2026/11/04/abc1.mp4' };
  await assert.rejects(f.run({ rendered, uploaded }), /LOCAL_REEL_.*(?:INVALID|MISMATCH)/);
  assert.equal(f.counts.render, 0); assert.equal(f.counts.upload, 0); assert.equal(f.counts.save, 0);
});

test('a resumed render from another source must not be relabelled as the selected source', async t => {
  const f = await fixture(t); f.result.source.revision = digest('different-source');
  await assert.rejects(f.run({ rendered: f.result }), /LOCAL_REEL_.*(?:INVALID|MISMATCH|SOURCE)/); assert.equal(f.counts.upload, 0);
});

test('scene proof must describe rendered text, never an edited storyboard absent from the cached file', async t => {
  const f = await fixture(t); f.result.sceneResults[1].renderedText.text = 'An older text actually visible in the file';
  await assert.rejects(f.run({ rendered: f.result }), /LOCAL_REEL_.*(?:INVALID|MISMATCH|SCENE)/); assert.equal(f.counts.upload, 0);
});


test('saved silent scene literals render exact screen text and derive an honest script without another primary call',async t=>{
 const f=await fixture(t),texts=['Выберите задачу','Проверьте один результат','Сохраните вывод','Контрольная отметка: ДЕВЯТЬ минут'];
 f.material.scenes=texts.map((text,index)=>({index:index+1,startSeconds:index*2,endSeconds:(index+1)*2,spokenText:'',visualIntent:`На экране${index===3?' точная строка':''}: «${text}».`}));
 f.material.playbook={version:'social-editorial/v1',sourceDate:'2026-11-03'};f.material.evidence=[];f.material.cta='';f.material.ctaSurface='none';f.material.assets=[{...f.material.assets[0],role:'cover',width:1080,height:1920}];
 f.material.script='План экрана. Готовые файлы карусели, обложки и MP4 не созданы: в этом чате нет инструмента для их сборки и сохранения.';
 f.material.pieceId='original-native-cover-piece';f.material.derivationId='original-native-cover-variant';
 f.measured.durationSeconds=8;f.result.metadata.durationSeconds=8;
 f.result.sceneResults=f.material.scenes.map((scene,index)=>({id:`scene-${scene.index}`,contentSha256:digest(texts[index]),startSeconds:scene.startSeconds,durationSeconds:2,renderedText:{title:index===0?f.material.hook:'',text:texts[index],captions:[]},reused:false,frames:[{absolutePath:'/unit-test/frame',sha256:digest(`f${index}`),startSeconds:0,endSeconds:2}]}));
 const original=copy(f.material),ready=await f.run();
 assert.deepEqual(f.material,original);assert.deepEqual(f.renders[0].scenes.map(scene=>scene.text),texts);assert.deepEqual(ready.scenes.map(scene=>scene.screenText),texts);assert.ok(ready.scenes.every(scene=>scene.spokenText===''));
 assert.equal(ready.script,texts.join('\n\n'));assert.doesNotMatch(ready.script,/не созданы|нет инструмента/);assert.equal(ready.settings.localReel.scriptKind,'on_screen_text');assert.equal(ready.settings.localReel.speech,false);
 assert.equal(ready.settings.localReelSceneText.originalScriptSha256,digest(original.script));assert.equal(ready.settings.localReelSceneText.sourcePieceId,original.pieceId);
 assert.deepEqual(ready.sourceArtifact,original.sourceArtifact);assert.equal(ready.assets[0].id,'cover');assert.equal(ready.assets[1].videoEvidence.captions.burned,'unverified');
 const {inspectEditorialMaterial}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/playbooks/editorial-material-inspection.v1.ts');
 assert.equal(inspectEditorialMaterial('instagram','reel',ready).complete,true,'verified silent frames do not require invented speech or subtitles');
 const changed=copy(ready);changed.scenes[3].screenText='Changed after rendering';assert.equal(inspectEditorialMaterial('instagram','reel',changed).complete,false);
 const unverified=copy(ready);delete unverified.assets[1].videoEvidence.localSilent;assert.equal(inspectEditorialMaterial('instagram','reel',unverified).complete,false,'narrated/unknown video contract stays strict');

 await f.run();assert.equal(f.counts.render,1);assert.equal(f.counts.upload,1);assert.equal(f.counts.save,1);
});

for(const visualIntent of ['Покажите красивый фон','На экране: «Первая» и «Вторая».','На экране: произвольная инструкция без кавычек'])test(`missing or ambiguous screen copy is a known input blocker before render: ${visualIntent}`,async t=>{
 const f=await fixture(t);f.material.scenes[0].spokenText='';f.material.scenes[0].visualIntent=visualIntent;await assert.rejects(f.run(),/LOCAL_REEL_SCREEN_TEXT_(?:REQUIRED|AMBIGUOUS)/);assert.equal(f.counts.render,0);assert.equal(f.counts.upload,0);assert.equal(f.counts.save,0);
});

test('typed screen text cannot conflict with an explicit saved screen literal',async t=>{
 const f=await fixture(t);f.material.scenes[0].screenText='New invented copy';f.material.scenes[0].visualIntent='На экране: «Original saved copy».';
 await assert.rejects(f.run(),/LOCAL_REEL_SCREEN_TEXT_CONFLICT/);assert.equal(f.counts.render,0);
});
