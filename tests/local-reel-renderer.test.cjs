const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, mkdir, symlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { LocalReelRendererV1 } = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-reel-renderer.v1.ts');
const digest = b => createHash('sha256').update(b).digest('hex');
const source = { pieceId: 'owned-piece', revision: digest('revision1'), textSha256: digest('Exact saved post') };
const input = () => ({ organizationId: 'org-a', source, title: 'Техническая проверка', locale: 'ru-RU', scenes: [
  { id: 'opening', durationSeconds: 1, title: 'Локальный Reel', text: 'Технический пример. Без озвучки.', captions: [{ startSeconds: 0, endSeconds: 1, text: 'Авторский текст на экране' }] },
  { id: 'correction', durationSeconds: 1, title: 'Исправление', text: 'Контрольная отметка: ДЕВЯТЬ минут' },
] });
const config = root => ({ cacheRoot: join(root, 'cache'), allowedAssetRoots: [join(root, 'assets')],
  chromiumExecutable: process.env.CF_LOCAL_REEL_CHROME || '/missing/chrome', ffmpegExecutable: process.env.CF_LOCAL_REEL_FFMPEG || '/missing/ffmpeg',
  playwrightModule: process.env.CF_LOCAL_REEL_REAL_RENDER === '1' ? require.resolve('playwright') : undefined });

test('local renderer rejects unsafe server config and invalid source before any execution', async () => {
  assert.throws(() => new LocalReelRendererV1({ ...config('/tmp/local-reel'), cacheRoot: '../client-path' }), /SERVER_CONFIG_INVALID/);
  const renderer = new LocalReelRendererV1(config('/tmp/local-reel'));
  await assert.rejects(renderer.render({ ...input(), source: { ...source, revision: 'stale' } }), /INPUT_INVALID/);
});

test('actual application ts-node compilation renders four silent text scenes without browser helper captures', {
  skip: process.env.CF_LOCAL_REEL_RUNTIME_RENDER !== '1', timeout: 90000,
}, async () => {
  // Launched with the real runtime's loader order and compiler options, not loadTypeScriptModule's ES2021 override.
  const runtime = process[Symbol.for('ts-node.register.instance')];
  const ts = require('typescript');
  assert.ok(runtime, 'Launch with ts-node/register/transpile-only, then tsconfig-paths/register and reflect-metadata');
  assert.equal(runtime.config.options.target, ts.ScriptTarget.ES2015);
  assert.equal(runtime.config.options.importHelpers, true);
  assert.equal(runtime.config.options.module, ts.ModuleKind.CommonJS);
  assert.deepEqual(JSON.parse(process.env.TS_NODE_COMPILER_OPTIONS), {module: 'commonjs'});
  const receipt = JSON.parse(await readFile(process.env.CF_LOCAL_REEL_RUNTIME_RECEIPT, 'utf8'));
  for (const file of ['tsconfig.json', 'tsconfig.base.json']) assert.equal(digest(await readFile(file)), receipt.sourceHashes[file]);
  const { LocalReelRendererV1: RuntimeRenderer } = require(resolve('libraries/nestjs-libraries/src/videos/local-reel/local-reel-renderer.v1.ts'));
  const root = await mkdtemp(join(process.env.CF_LOCAL_REEL_PROOF_ROOT || tmpdir(), 'cf-reel-runtime-'));
  console.log('Runtime physical proof dir:', root);
  await mkdir(join(root, 'assets'));
  const texts = ['Выберите задачу', 'Сохраните исходный материал', 'Проверьте готовый результат', 'Контрольная отметка: ДЕВЯТЬ минут'];
  const input = {organizationId: 'technical-runtime-org', source: {pieceId: 'technical-runtime-source', revision: digest('technical-runtime-revision'), textSha256: digest(texts.join('\n'))},
    title: 'Техническая проверка компиляции', locale: 'ru-RU', scenes: texts.map((text, index) => ({id: `scene-${index}`, durationSeconds: 2,
      ...(index === 0 ? {title: 'Технический Reel · без озвучки'} : {}), text}))};
  const result = await new RuntimeRenderer({...config(root), playwrightModule: receipt.playwrightModule}).render(input);
  assert.equal(result.metadata.width, 1080); assert.equal(result.metadata.height, 1920); assert.equal(result.metadata.durationSeconds, 8); assert.equal(result.metadata.audio, false);
  assert.equal(result.sha256, digest(await readFile(result.absolutePath))); assert.equal(result.reused, false);
  assert.equal(result.sceneResults.length, 4); assert.ok(result.sceneResults.every(s => !s.reused && s.frames.length === 1));
  assert.deepEqual(result.sceneResults.map(s => s.renderedText.text), texts);
  const ffmpeg = process.env.CF_LOCAL_REEL_FFMPEG;
  const native = p => /\.exe$/i.test(require('node:fs').realpathSync(ffmpeg)) ? execFileSync('wslpath', ['-w', p], {encoding: 'utf8'}).trim() : p;
  const probe = JSON.parse(execFileSync(process.env.CF_LOCAL_REEL_FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', native(result.absolutePath)], {encoding: 'utf8'}));
  assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_name, 'h264'); assert.equal(probe.streams[0].r_frame_rate, '30/1'); assert.equal(probe.streams[0].nb_frames, '240');
  const decoded = [];
  for (let i = 0; i < 4; i++) {
    const path = join(root, `decoded-scene-${i}.png`);
    execFileSync(ffmpeg, ['-v', 'error', '-ss', String(i * 2 + 0.5), '-i', native(result.absolutePath), '-frames:v', '1', '-y', native(path)]);
    decoded.push({path, sha256: digest(await readFile(path))});
  }
  assert.equal(new Set(decoded.map(frame => frame.sha256)).size, 4);
  const evidence = {runtime: {project: process.env.TS_NODE_PROJECT, compilerOptions: JSON.parse(process.env.TS_NODE_COMPILER_OPTIONS), target: 'ES2015', importHelpers: true}, root, input, result, probe, decoded};
  await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
  if (process.env.CF_LOCAL_REEL_RUNTIME_EVIDENCE) await writeFile(process.env.CF_LOCAL_REEL_RUNTIME_EVIDENCE, JSON.stringify(evidence, null, 2));
});

test('real silent Reel, exact retry, correction-only rerender, tenant isolation and owned images', {
  skip: process.env.CF_LOCAL_REEL_REAL_RENDER !== '1', timeout: 180000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'cf-local-reel-'));
  await mkdir(join(root, 'assets'));
  const renderer = new LocalReelRendererV1(config(root));
  const original = input();
  const first = await renderer.render(original);
  assert.equal(first.metadata.width, 1080); assert.equal(first.metadata.height, 1920);
  assert.equal(first.metadata.durationSeconds, 2); assert.equal(first.metadata.audio, false);
  assert.equal(first.sha256, digest(await readFile(first.absolutePath)));
  assert.equal(first.captions.speech, false); assert.deepEqual(first.source, source);
  const retry = await renderer.render(original);
  assert.equal(retry.reused, true); assert.equal(retry.absolutePath, first.absolutePath);
  const revised = input(); revised.source = { ...source, revision: digest('revision2'), textSha256: digest('Edited saved post') };
  revised.title = 'Обновлённое название исходного поста';
  revised.scenes[1].text = 'Контрольная отметка: ДЕСЯТЬ минут';
  const second = await renderer.render(revised);
  assert.equal(second.sceneResults[0].reused, true); assert.equal(second.sceneResults[1].reused, false);
  assert.equal(second.sceneResults[0].frames[0].sha256, first.sceneResults[0].frames[0].sha256);
  assert.notEqual(second.sceneResults[1].frames[0].sha256, first.sceneResults[1].frames[0].sha256);
  const other = await renderer.render({ ...original, organizationId: 'org-b' });
  assert.notEqual(other.absolutePath, first.absolutePath); assert.ok(other.sceneResults.every(s => !s.reused));
  const safe = { ...input(), scenes: [{ id: 'literal', durationSeconds: 1, title: '<script>x</script>', text: 'Русский текст 中文 <img src="https://forbidden.invalid/">' }] };
  await renderer.render(safe);
  await assert.rejects(renderer.render({ ...input(), scenes: [{ id: 'long', durationSeconds: 1, text: 'Длинная строка 中文 '.repeat(260) }] }), /TEXT_OVERFLOW/);
  const image = join(root, 'assets', 'owned.png'); await writeFile(image, await readFile(first.sceneResults[0].frames[0].absolutePath));
  const imageInput = { ...input(), scenes: [{ id: 'photo', durationSeconds: 1, image: { assetId: 'image1', absolutePath: image, sha256: digest(await readFile(image)) } }] };
  const withImage = await renderer.render(imageInput); assert.equal(withImage.metadata.audio, false);
  await assert.rejects(renderer.render({ ...imageInput, scenes: [{ ...imageInput.scenes[0], image: { ...imageInput.scenes[0].image, sha256: '0'.repeat(64) } }] }), /DIGEST_MISMATCH/);
  const outside = join(root, 'outside.png'); await writeFile(outside, await readFile(image));
  const link = join(root, 'assets', 'link.png'); await symlink(outside, link);
  await assert.rejects(renderer.render({ ...imageInput, scenes: [{ ...imageInput.scenes[0], image: { ...imageInput.scenes[0].image, absolutePath: link } }] }), /OUTSIDE_OWNED_ROOT/);
  // Broken accepted files must not be reused; an exact retry repairs from intact scene assets.
  await writeFile(first.absolutePath, 'incomplete');
  const repaired = await renderer.render(original); assert.equal(repaired.reused, false); assert.ok(repaired.sceneResults.every(s => s.reused));
  const ffmpeg = process.env.CF_LOCAL_REEL_FFMPEG;
  const native = p => /\.exe$/i.test(require('node:fs').realpathSync(ffmpeg)) ? execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim() : p;
  const pixels = at => digest(execFileSync(ffmpeg, ['-v', 'error', '-ss', at, '-i', native(repaired.absolutePath), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 8 * 1024 * 1024 }));
  assert.notEqual(pixels('0.1'), pixels('1.5'), 'actual decoded MP4 scenes have distinct pixels');
  const evidence = { root, original: repaired, revised: second, image: withImage };
  if (process.env.CF_LOCAL_REEL_EVIDENCE) await writeFile(process.env.CF_LOCAL_REEL_EVIDENCE, JSON.stringify(evidence, null, 2));
  console.log('Real render evidence retained:', root);
});
