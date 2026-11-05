const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const owned = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/owned-local-assets.v2.ts');
const {measureMp4VideoV1} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/production/video-production-result.v1.ts');
const digest = b => createHash('sha256').update(b).digest('hex');
let root, asset, bytes;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-composition-owned-v2-'));
  bytes = await fs.readFile(path.join(__dirname, 'fixtures/video-v1/flower.mp4'));
  const file = path.join(root, 'owned.mp4'); await fs.writeFile(file, bytes);
  asset = {absolutePath: file, sha256: digest(bytes), bytes: bytes.length};
});
afterEach(async () => fs.rm(root, {recursive: true, force: true}));

test('pinned streaming/hash plus bounded movie headers match the existing full-file parser exactly', async () => {
  await owned.withPinnedLocalCompositionFileV2(asset, [root], async (file, assertUnchanged) => {
    expect(await owned.hashLocalCompositionFileV2(file, asset.bytes)).toBe(asset.sha256);
    expect(await owned.measureLocalCompositionMp4V2(file, asset.bytes, asset.sha256)).toEqual(measureMp4VideoV1(bytes));
    await assertUnchanged();
  });
});

test('foreign paths, changed hashes and symlinked parents refuse before a consumer reads', async () => {
  const consume = jest.fn();
  await expect(owned.withPinnedLocalCompositionFileV2(asset, [path.join(root, 'other')], consume)).rejects.toBeDefined();
  await expect(owned.withPinnedLocalCompositionFileV2({...asset, sha256: '0'.repeat(64)}, [root], consume)).rejects.toBeDefined();
  await fs.mkdir(path.join(root, 'real')); await fs.rename(asset.absolutePath, path.join(root, 'real/owned.mp4'));
  await fs.symlink(path.join(root, 'real'), path.join(root, 'alias'));
  await expect(owned.withPinnedLocalCompositionFileV2({...asset, absolutePath: path.join(root, 'alias/owned.mp4')}, [root], consume)).rejects.toBeDefined();
  expect(consume).not.toHaveBeenCalled();
});

test('a directory replaced during pinned consumption cannot turn the current-path check into an outside read', async () => {
  const dir = path.join(root, 'date'); await fs.mkdir(dir); await fs.rename(asset.absolutePath, path.join(dir, 'owned.mp4'));
  asset.absolutePath = path.join(dir, 'owned.mp4');
  await expect(owned.withPinnedLocalCompositionFileV2(asset, [root], async (file, assertUnchanged) => {
    await fs.rename(dir, dir + '-original'); await fs.symlink(dir + '-original', dir);
    const first = Buffer.alloc(4); await file.read(first, 0, 4, 0); expect(first).toEqual(bytes.subarray(0, 4));
    await assertUnchanged();
  })).rejects.toBeDefined();
});

test('aborted or stale caller never reaches consumption and exact asset bytes survive refusal', async () => {
  const consume = jest.fn(), controller = new AbortController(); controller.abort();
  await expect(owned.withPinnedLocalCompositionFileV2(asset, [root], consume, {signal: controller.signal})).rejects.toThrow('ABORTED');
  await expect(owned.withPinnedLocalCompositionFileV2(asset, [root], consume, {assertCurrent: async () => {throw Error('STALE_REVISION');}})).rejects.toThrow('STALE_REVISION');
  expect(consume).not.toHaveBeenCalled(); expect(await fs.readFile(asset.absolutePath)).toEqual(bytes);
});
