const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Readable}=require('node:stream');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const base='libraries/nestjs-libraries/src/upload/';
const {openDiskUploadV1}=loadTypeScriptModule(base+'disk.upload.v1.ts');
const {LocalStorage}=loadTypeScriptModule(base+'local.storage.ts');
const videoPrefix=fs.readFileSync(path.join(__dirname,'fixtures/video-v1/flower.mp4')).subarray(0,4100);
const pngPrefix=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581840000000049454e44ae426082','hex');
let directory;
beforeEach(async()=>{directory=await fsp.mkdtemp(path.join(os.tmpdir(),'cf-disk-upload-'));});
afterEach(async()=>{await fsp.rm(directory,{recursive:true,force:true});});
async function disk(prefix=videoPrefix,size=prefix.length){const file=path.join(directory,'receipt');await fsp.writeFile(file,prefix,{mode:0o600});await fsp.truncate(file,size);return{path:file,size,originalname:'../../claimed.svg',mimetype:'text/html'};}
function r2(send){class S3Client{middlewareStack={add:()=>{}};send=send;}class PutObjectCommand{constructor(input){this.input=input;}}const {CloudflareStorage}=loadTypeScriptModule(base+'cloudflare.storage.ts',{'@aws-sdk/client-s3':{S3Client,PutObjectCommand,DeleteObjectCommand:class{}}});return new CloudflareStorage('synthetic','synthetic','synthetic','auto','synthetic-bucket','https://media.invalid');}

test('local disk upload streams a real32MiB file in bounded chunks, preserves source and publishes sniffed MP4',async()=>{
 const input=await disk(videoPrefix,32*1024*1024);const root=path.join(directory,'uploads');await fsp.mkdir(root);const original=process.env.FRONTEND_URL;process.env.FRONTEND_URL='https://app.invalid';
 const bufferAlloc=jest.spyOn(Buffer,'alloc');const bufferConcat=jest.spyOn(Buffer,'concat');
 try{
  const result=await new LocalStorage(root).uploadFileFromDiskV1(input);
  expect(result.mimetype).toBe('video/mp4');expect(result.filename).toMatch(/^[a-f0-9]{32}\.mp4$/);expect(result).not.toHaveProperty('buffer');
  const output=path.join(root,new URL(result.path).pathname.slice('/uploads/'.length));expect((await fsp.stat(output)).size).toBe(input.size);expect((await fsp.stat(input.path)).size).toBe(input.size);
  expect(bufferAlloc.mock.calls.every(([size])=>size<=64*1024)).toBe(true);expect(bufferConcat.mock.calls.every(([,length])=>!length||length<=64*1024)).toBe(true);
  const content=await fsp.open(output);try{const prefix=Buffer.alloc(32);await content.read(prefix,0,32,0);expect(prefix).toEqual(videoPrefix.subarray(0,32));}finally{await content.close();}
 }finally{bufferAlloc.mockRestore();bufferConcat.mockRestore();if(original===undefined)delete process.env.FRONTEND_URL;else process.env.FRONTEND_URL=original;}
});

test('R2 receives Readable, exact ContentLength and sniffed MIME without a video Buffer',async()=>{
 const input=await disk(videoPrefix,16*1024*1024+7);let seen;
 const storage=r2(async command=>{seen=command.input;expect(seen.Body).toBeInstanceOf(Readable);expect(Buffer.isBuffer(seen.Body)).toBe(false);let bytes=0;for await(const chunk of seen.Body){bytes+=chunk.length;expect(chunk.length).toBeLessThanOrEqual(64*1024);}expect(bytes).toBe(input.size);});
 const result=await storage.uploadFileFromDiskV1(input);expect(seen).toMatchObject({ContentLength:input.size,ContentType:'video/mp4'});expect(result.mimetype).toBe('video/mp4');expect(result).not.toHaveProperty('buffer');expect(fs.existsSync(input.path)).toBe(true);
});

test('type is sniffed instead of trusting filename/MIME, and image ceiling is enforced before upload',async()=>{
 const input=await disk(pngPrefix);const source=await openDiskUploadV1(input);expect(source.mimetype).toBe('image/png');expect(source.extension).toBe('png');await source.close();
 await fsp.truncate(input.path,10*1024*1024+1);const send=jest.fn();await expect(r2(send).uploadFileFromDiskV1({...input,size:10*1024*1024+1})).rejects.toThrow('DISK_UPLOAD_SIZE_LIMIT');expect(send).not.toHaveBeenCalled();
});

test('declared size mismatch, symlink and non-image/video content are rejected without deleting receipt',async()=>{
 const input=await disk();await expect(openDiskUploadV1({...input,size:input.size+1})).rejects.toThrow('DISK_UPLOAD_FILE_INVALID');
 const link=path.join(directory,'link');await fsp.symlink(input.path,link);await expect(openDiskUploadV1({...input,path:link})).rejects.toThrow();
 await fsp.writeFile(input.path,'<svg><script>alert(1)</script></svg>');await expect(openDiskUploadV1({...input,size:(await fsp.stat(input.path)).size})).rejects.toThrow('Unsupported file type.');expect(fs.existsSync(input.path)).toBe(true);
});

test('source mutation during R2 transfer rejects the receipt and keeps caller cleanup ownership',async()=>{
 const input=await disk(videoPrefix,1024*1024);const storage=r2(async command=>{let first=true;for await(const chunk of command.input.Body){if(first){first=false;await fsp.appendFile(input.path,'changed');}}});
 await expect(storage.uploadFileFromDiskV1(input)).rejects.toThrow('DISK_UPLOAD_FILE_CHANGED');expect(fs.existsSync(input.path)).toBe(true);
});

test('local upload refuses a symlinked destination date directory and leaves foreign data unchanged',async()=>{
 const input=await disk();const root=path.join(directory,'uploads'),foreign=path.join(directory,'foreign');await fsp.mkdir(root);await fsp.mkdir(foreign);const year=new Date().getUTCFullYear();await fsp.symlink(foreign,path.join(root,String(year)));
 await expect(new LocalStorage(root).uploadFileFromDiskV1(input)).rejects.toThrow();expect(await fsp.readdir(foreign)).toEqual([]);expect(fs.existsSync(input.path)).toBe(true);
});
