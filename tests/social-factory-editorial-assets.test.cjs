const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const path = 'libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/assets/editorial-assets.v1.ts';
let uploads = [];
const storage = { async uploadFile(file) { uploads.push(file); return { originalname: `saved-${uploads.length}.png`, path: `https://media.example/${uploads.length}.png` }; } };
const { renderEditorialArtworkV1, EditorialAssetsV1 } = loadTypeScriptModule(path, {
  '@nestjs/common': { Injectable: () => () => {} },
  '../../../../database/prisma/media/media.service': { MediaService: class {} },
  '../../../../upload/upload.factory': { UploadFactory: { createStorage: () => storage } },
  '../../../../videos/video-media.v1': { downloadVideoAssetV1: async () => { throw Error('unexpected network'); } },
});
const frame = { title: 'Как подготовить план & не потерять детали', body: 'Начните с вопросов аудитории. Проверьте факты до публикации.', footer: 'Пример · 1' };
const artwork = (kind, frames) => ({ kind, frames, background: '#ffffff', foreground: '#111111' });

test('real readable PNGs are produced for carousel, Story and cover', async () => {
  for (const [kind, frames, width, height] of [['carousel', [frame, {...frame, title: 'Второй слайд'}], 1080, 1350], ['story', [frame], 1080, 1920], ['cover', [frame], 1280, 720]]) {
    const buffers = await renderEditorialArtworkV1(artwork(kind, frames));
    assert.equal(buffers.length, frames.length);
    for (const bytes of buffers) { const info = await sharp(bytes).metadata(); assert.equal(info.format, 'png'); assert.equal(info.width, width); assert.equal(info.height, height); const stats = await sharp(bytes).stats(); assert.ok(stats.channels[0].min < 200, 'image contains visible ink'); }
  }
});
test('invalid contrast, count and overflow fail before saving any assets', async () => {
  uploads = [];
  const service = new EditorialAssetsV1({ saveFile: async () => { throw Error('unexpected'); } });
  for (const input of [artwork('carousel', [frame]), {...artwork('story', [frame]), foreground: '#eeeeee'}, artwork('cover', [{title:'Z '.repeat(80), body:'W '.repeat(300)}])]) await assert.rejects(service.create('org', input));
  assert.equal(uploads.length, 0);
});
test('saved media are tenant-scoped and partial failure reports prior results', async () => {
  uploads = [];
  const writes = [];
  const service = new EditorialAssetsV1({ saveFile: async (...args) => { writes.push(args); if (writes.length === 2) throw Error('db unavailable'); return {id:'m1',path:args[2]}; } });
  await assert.rejects(service.create('tenant-a', artwork('carousel', [frame, frame])), error => error.message === 'editorial_artwork_save_incomplete' && error.saved.length === 1 && error.saved[0].id === 'm1' && error.unregistered.path.endsWith('/2.png'));
  assert.equal(writes[0][0], 'tenant-a'); assert.equal(uploads.length, 2);
});

test('owned approved image is incorporated; foreign or deleted media cannot be read', async () => {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-owned-')); const dir = path.join(root,'2026','01','02'); await fs.mkdir(dir,{recursive:true});
  const imagePath=path.join(dir,'abc123.png'); await sharp({create:{width:80,height:80,channels:3,background:'#ff0000'}}).png().toFile(imagePath);
  const oldDir=process.env.UPLOAD_DIRECTORY, oldFront=process.env.FRONTEND_URL, oldProvider=process.env.STORAGE_PROVIDER;
  process.env.UPLOAD_DIRECTORY=root; process.env.FRONTEND_URL='https://factory.example'; process.env.STORAGE_PROVIDER='local'; uploads=[];
  try {
    const media={ mediaInWorkspace: async (org, ids) => org==='tenant-a' && ids[0]==='owned' ? [{id:'owned',path:'https://factory.example/uploads/2026/01/02/abc123.png'}] : [], saveFile: async (...args)=>({id:'result',path:args[2]})};
    const service=new EditorialAssetsV1(media); const input=artwork('story',[{...frame,imageMediaId:'owned'}]);
    await assert.rejects(service.create('tenant-b', input),/image_unavailable/); assert.equal(uploads.length,0);
    await service.create('tenant-a',input); assert.equal(uploads.length,1);
    const pixel=await sharp(uploads[0].buffer).extract({left:400,top:1600,width:1,height:1}).raw().toBuffer(); assert.ok(pixel[0]>240 && pixel[1]<20 && pixel[2]<20);
  } finally { for (const [key,value] of [['UPLOAD_DIRECTORY',oldDir],['FRONTEND_URL',oldFront],['STORAGE_PROVIDER',oldProvider]]) if(value===undefined) delete process.env[key]; else process.env[key]=value; await fs.rm(root,{recursive:true,force:true}); }
});
test('portrait video cover renders in vertical native dimensions',async()=>{const [bytes]=await renderEditorialArtworkV1({...artwork('cover',[frame]),coverAspect:'portrait'});const meta=await sharp(bytes).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1920);});
