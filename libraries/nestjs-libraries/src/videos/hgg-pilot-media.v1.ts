import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';
import { fromBuffer } from 'file-type';
import { UploadFactory } from '../upload/upload.factory';
import { downloadVideoAssetV1, VideoMediaV1 } from './video-media.v1';
import { videoErrorV1 } from './video-brief.v1';
const LIMIT=20*1024*1024;
export interface HggPilotStoredFileV1 {name:string;path:string;size:number;mime:string;width:number;height:number;byteSha256:string;durationSeconds?:number}
@Injectable()
export class HggPilotMediaV1 {
 private readonly storage=UploadFactory.createStorage();
 constructor(readonly videos:VideoMediaV1){}
 private async imageInfo(bytes:Buffer){
  try{
  const kind=await fromBuffer(bytes);if(!kind || !['image/jpeg','image/png','image/webp'].includes(kind.mime))return videoErrorV1('VIDEO_PILOT_RESULT_NOT_IMAGE',409);
  const image=sharp(bytes,{limitInputPixels:40000000,animated:false});const metadata=await image.metadata();
  if((metadata.pages||1)!==1 || !metadata.width || !metadata.height)return videoErrorV1('VIDEO_PILOT_IMAGE_INVALID',409);
  await image.raw().toBuffer();
  return {mime:kind.mime,extension:kind.ext,width:metadata.width,height:metadata.height,byteSha256:createHash('sha256').update(bytes).digest('hex')};
  }catch(e){if((e as any)?.getResponse?.()?.code)throw e;return videoErrorV1('VIDEO_PILOT_IMAGE_INVALID',409);}
 }
 async importResult(url:string,kind:'image'|'video',resolution:'720p'|'1080p'='1080p'):Promise<HggPilotStoredFileV1>{
  if(kind==='video'){
   const file=await this.videos.importVideo(url);const bytes=await this.videos.readOwned(file.path);const metadata=await this.videos.inspectOwnedVideo(file.path);
   const width=resolution==='720p'?720:1080,height=resolution==='720p'?1280:1920;
   // Allow bounded near-portrait widths while retaining the exact resolution height.
   if(!metadata.width || !metadata.height || Math.abs(metadata.durationSeconds-5)>0.75 || Math.abs(metadata.width-width)>width*0.01 || metadata.height!==height)return videoErrorV1('VIDEO_PILOT_VIDEO_GEOMETRY_INVALID',409);
   return {...file,mime:'video/mp4',width:metadata.width,height:metadata.height,durationSeconds:metadata.durationSeconds,byteSha256:createHash('sha256').update(bytes).digest('hex')};
  }
  const bytes=await downloadVideoAssetV1(url,LIMIT);const info=await this.imageInfo(bytes);
  if(Math.abs(info.width/info.height-9/16)>0.02)return videoErrorV1('VIDEO_PILOT_IMAGE_GEOMETRY_INVALID',409);
  const file=await this.storage.uploadFile({buffer:bytes,originalname:`frame.${info.extension}`,mimetype:info.mime,size:bytes.length} as Express.Multer.File);
  const stored={name:String(file.originalname),path:String(file.path),size:bytes.length,mime:info.mime,width:info.width,height:info.height,byteSha256:info.byteSha256};
  await this.assertOwnedImage(stored);return stored;
 }
 async assertOwnedImage(file:HggPilotStoredFileV1){
  let bytes:Buffer;
  if((process.env.STORAGE_PROVIDER||'local')!=='local')bytes=await downloadVideoAssetV1(file.path,LIMIT);
  else{
   const url=new URL(file.path),base=new URL(process.env.FRONTEND_URL!);
   if(url.origin!==base.origin || url.username || url.password || url.search || url.hash || !/^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.(?:png|jpe?g|webp)$/.test(url.pathname))return videoErrorV1('VIDEO_PILOT_OWNED_IMAGE_UNAVAILABLE',409);
   const root=resolve(process.env.UPLOAD_DIRECTORY!),target=resolve(root,url.pathname.slice('/uploads/'.length));
   if(!target.startsWith(root+sep) || (await stat(target)).size>LIMIT)return videoErrorV1('VIDEO_PILOT_OWNED_IMAGE_UNAVAILABLE',409);
   bytes=await readFile(target);if(bytes.length>LIMIT)return videoErrorV1('VIDEO_PILOT_RESULT_TOO_LARGE',409);
  }
  const info=await this.imageInfo(bytes);
  if(info.byteSha256!==file.byteSha256 || info.width!==file.width || info.height!==file.height || info.mime!==file.mime)return videoErrorV1('VIDEO_PILOT_OWNED_IMAGE_CHANGED',409);
  return info;
 }
}
