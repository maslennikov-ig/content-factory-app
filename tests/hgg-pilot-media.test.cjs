const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const root='libraries/nestjs-libraries/src/videos/';
const code=e=>e?.getResponse?.()?.code;
let tmp,media,bytes,download,videos,oldEnv;
beforeEach(async()=>{
 oldEnv=Object.fromEntries(['FRONTEND_URL','UPLOAD_DIRECTORY','STORAGE_PROVIDER'].map(k=>[k,process.env[k]]));tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hgg-pilot-media-'));
 process.env.FRONTEND_URL='https://owned.invalid';process.env.UPLOAD_DIRECTORY=tmp;process.env.STORAGE_PROVIDER='local';
 bytes=await sharp({create:{width:18,height:32,channels:3,background:'white'}}).png().toBuffer();download=jest.fn(async()=>bytes);
 const storage={uploadFile:jest.fn(async file=>{const name=crypto.createHash('sha256').update(file.buffer).digest('hex')+'.png',relative='2026/01/01/'+name;fs.mkdirSync(path.dirname(path.join(tmp,relative)),{recursive:true});fs.writeFileSync(path.join(tmp,relative),file.buffer);return {originalname:'frame.png',path:'https://owned.invalid/uploads/'+relative};})};
 const {HggPilotMediaV1}=loadTypeScriptModule(root+'hgg-pilot-media.v1.ts',{'./video-media.v1':{downloadVideoAssetV1:download,VideoMediaV1:class{}},'../upload/upload.factory':{UploadFactory:{createStorage:()=>storage}}});
 videos={importVideo:jest.fn(),readOwned:jest.fn(),inspectOwnedVideo:jest.fn()};media=new HggPilotMediaV1(videos);
});
afterEach(()=>{fs.rmSync(tmp,{recursive:true,force:true});for(const[k,v]of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
test('image result is decoded, measured, hashed and read back as owned image without MP4 import',async()=>{
 const file=await media.importResult('https://provider.invalid/image','image');expect(file).toMatchObject({mime:'image/png',width:18,height:32});expect(file.byteSha256).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
 await media.assertOwnedImage(file);expect(videos.importVideo).not.toHaveBeenCalled();
});
test('changed owned bytes fail instead of reusing an accepted frame hash',async()=>{
 const file=await media.importResult('https://provider.invalid/image','image');const target=path.join(tmp,new URL(file.path).pathname.slice('/uploads/'.length));
 fs.writeFileSync(target,await sharp({create:{width:18,height:32,channels:3,background:'black'}}).png().toBuffer());let error;try{await media.assertOwnedImage(file);}catch(e){error=e;}expect(code(error)).toBe('VIDEO_PILOT_OWNED_IMAGE_CHANGED');
});
test('corrupt image or wrong aspect never becomes owned Media-ready metadata',async()=>{
 bytes=Buffer.from('not image bytes');await expect(media.importResult('https://provider.invalid/image','image')).rejects.toThrow();
 bytes=await sharp({create:{width:32,height:18,channels:3,background:'white'}}).png().toBuffer();let error;try{await media.importResult('https://provider.invalid/image','image');}catch(e){error=e;}expect(code(error)).toBe('VIDEO_PILOT_IMAGE_GEOMETRY_INVALID');
});
test('clip uses existing MP4 validation and checks actual 1080p portrait/five-second metadata',async()=>{
 videos.importVideo.mockResolvedValue({name:'video.mp4',path:'https://owned.invalid/video.mp4',size:100});videos.readOwned.mockResolvedValue(Buffer.from('validated by existing MP4 importer fixture'));videos.inspectOwnedVideo.mockResolvedValue({width:1080,height:1920,durationSeconds:5});
 const file=await media.importResult('https://provider.invalid/video','video');expect(file).toMatchObject({mime:'video/mp4',width:1080,height:1920,durationSeconds:5});expect(download).not.toHaveBeenCalled();
 videos.inspectOwnedVideo.mockResolvedValue({width:720,height:1280,durationSeconds:10});let error;try{await media.importResult('https://provider.invalid/video','video');}catch(e){error=e;}expect(code(error)).toBe('VIDEO_PILOT_VIDEO_GEOMETRY_INVALID');
});
test.each([['720p',716,1280],['720p',720,1280],['1080p',1072,1920]])('clip %s preserves measured near-portrait width %i and exact height %i',async(resolution,width,height)=>{
 const original=Buffer.from('already structurally validated MP4 bytes');
 videos.importVideo.mockResolvedValue({name:'video.mp4',path:'https://owned.invalid/video.mp4',size:original.length});
 videos.readOwned.mockResolvedValue(original);videos.inspectOwnedVideo.mockResolvedValue({width,height,durationSeconds:5.042});
 const file=await media.importResult('https://provider.invalid/video','video',resolution);
 expect(file).toMatchObject({mime:'video/mp4',width,height,durationSeconds:5.042,byteSha256:crypto.createHash('sha256').update(original).digest('hex')});
 expect(videos.importVideo).toHaveBeenCalledTimes(1);expect(download).not.toHaveBeenCalled();
});
test.each([
 ['720p',712,1280,5],['720p',728,1280,5],['1080p',1068,1920,5],
 ['720p',1080,1920,5],['720p',1280,720,5],['720p',1280,1280,5],
 ['720p',720,1282,5],['720p',716,1280,6],
])('clip %s rejects wrong geometry or duration %ix%i/%s seconds',async(resolution,width,height,durationSeconds)=>{
 videos.importVideo.mockResolvedValue({name:'video.mp4',path:'https://owned.invalid/video.mp4',size:100});
 videos.readOwned.mockResolvedValue(Buffer.from('already structurally validated MP4 bytes'));videos.inspectOwnedVideo.mockResolvedValue({width,height,durationSeconds});
 let error;try{await media.importResult('https://provider.invalid/video','video',resolution);}catch(e){error=e;}
 expect(code(error)).toBe('VIDEO_PILOT_VIDEO_GEOMETRY_INVALID');
});
