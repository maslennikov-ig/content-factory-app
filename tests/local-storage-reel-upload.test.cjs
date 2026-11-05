'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {createHash}=require('node:crypto');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {LocalStorage,createLocalReelUploadIntentV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/upload/local.storage.ts',{
 '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator':{},
 '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher':{},
 '@contentfactory/nestjs-libraries/upload/data.url':{},
});
// Real file-type inspects this MP4 magic; playback/decoding belongs to renderer proof.
const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(4),Buffer.from('isomiso2'),Buffer.alloc(4096)]);
const digest=value=>createHash('sha256').update(value).digest('hex');
let root,previous;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(tmpdir(),'cf-stable-reel-'));previous=process.env.FRONTEND_URL;process.env.FRONTEND_URL='http://127.0.0.1:9999';});
afterEach(async()=>{
 try{
  const targets=await Promise.all((await fs.readdir('/proc/self/fd')).map(async fd=>{try{return await fs.readlink('/proc/self/fd/'+fd);}catch{return '';}}));
  expect(targets.filter(target=>target===root||target.startsWith(root+path.sep))).toEqual([]);
 }finally{await fs.rm(root,{recursive:true,force:true});if(previous===undefined)delete process.env.FRONTEND_URL;else process.env.FRONTEND_URL=previous;}
});
const fixture=()=>{
 const binding={organizationId:'org-a',operationId:'editorial-one',renderKey:digest('render'),contentSha256:digest(bytes)};
 const intent=createLocalReelUploadIntentV1(binding),storage=new LocalStorage(root),beforeWrite=jest.fn(async()=>{});
 return {binding,intent,storage,beforeWrite,target:path.join(root,intent.target),run:(buffer=bytes)=>storage.uploadLocalReel(buffer,intent,binding,beforeWrite)};
};

test('stable local upload reuses exact bytes/inode across retries and exclusive concurrent creation',async()=>{
 const f=fixture(),results=await Promise.allSettled([f.run(),f.run()]);
 expect(results.some(result=>result.status==='fulfilled')).toBe(true);
 const info=await fs.stat(f.target),replay=await f.run();
 expect(replay.reused).toBe(true);expect((await fs.stat(f.target)).ino).toBe(info.ino);
 expect(await fs.readFile(f.target)).toEqual(bytes);
 expect(replay.path).toBe(process.env.FRONTEND_URL+'/uploads/'+f.intent.target);
 expect(await fs.readdir(path.dirname(f.target))).toEqual([replay.filename]);
});

test('invalid binding, target or buffer is rejected before writing or source callback',async()=>{
 const f=fixture();
 for(const extra of [{organizationId:'org-b'},{operationId:'other'},{renderKey:digest('other')},{contentSha256:digest('other')},{target:'../escape.mp4'}]){
  await expect(f.storage.uploadLocalReel(bytes,{...f.intent,...extra},f.binding,f.beforeWrite)).rejects.toThrow('LOCAL_REEL_UPLOAD_INTENT_INVALID');
 }
 await expect(f.run(Buffer.from('different bytes'))).rejects.toThrow('LOCAL_REEL_UPLOAD_CONTENT_MISMATCH');
 expect(f.beforeWrite).not.toHaveBeenCalled();expect(await fs.readdir(root)).toEqual([]);
});

test('existing partial and wrong bytes are refused without replacement or deletion',async()=>{
 const f=fixture();await fs.mkdir(path.dirname(f.target),{recursive:true});
 for(const old of [bytes.subarray(0,20),Buffer.alloc(bytes.length,1)]){
  await fs.writeFile(f.target,old);
  await expect(f.run()).rejects.toThrow('LOCAL_REEL_UPLOAD_CONTENT_MISMATCH');
  expect(await fs.readFile(f.target)).toEqual(old);
 }
});

test('file, directory and root symlinks never reach outside bytes',async()=>{
 const f=fixture(),outside=path.join(root,'outside');await fs.mkdir(outside);
 const outsideFile=path.join(outside,'preserve.mp4');await fs.writeFile(outsideFile,bytes);
 await fs.mkdir(path.dirname(f.target),{recursive:true});await fs.symlink(outsideFile,f.target);
 await expect(f.run()).rejects.toBeDefined();expect(await fs.readFile(outsideFile)).toEqual(bytes);
 await fs.unlink(f.target);
 const year=f.intent.date.split('/')[0];await fs.rm(path.join(root,year),{recursive:true});await fs.symlink(outside,path.join(root,year));
 await expect(f.run()).rejects.toBeDefined();expect(await fs.readdir(outside)).toEqual(['preserve.mp4']);
 const alias=path.join(root,'linked-root');await fs.symlink(outside,alias);
 await expect(new LocalStorage(alias).uploadLocalReel(bytes,f.intent,f.binding,f.beforeWrite)).rejects.toBeDefined();
 expect(await fs.readdir(outside)).toEqual(['preserve.mp4']);
});

test('currentness is checked before file creation and normal uploadFile keeps its old behavior',async()=>{
 const f=fixture();f.beforeWrite.mockRejectedValueOnce(new Error('SOURCE_ARTIFACT_STALE'));
 await expect(f.run()).rejects.toThrow('SOURCE_ARTIFACT_STALE');
 await expect(fs.stat(f.target)).rejects.toMatchObject({code:'ENOENT'});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZGwAAAABJRU5ErkJggg==','base64');
 const old=await f.storage.uploadFile({buffer:png,mimetype:'image/png',originalname:'old.png'});
 expect(old.mimetype).toBe('image/png');expect(old.filename).toMatch(/^[a-f0-9]+\.png$/);
 const relative=new URL(old.path).pathname.slice('/uploads/'.length);
 expect(await fs.readFile(path.join(root,relative))).toEqual(png);
});
