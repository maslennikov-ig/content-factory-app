import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,dirname,resolve} from 'node:path';
import {LOCAL_COMPOSITION_LIMITS_V2,type LocalCompositionOptionsV2} from '../../../videos/local-reel/local-composition.v2';

const fail=():never=>{throw new Error('LOCAL_COMPOSITION_OWNED_ASSET_UNAVAILABLE');};
const dirFlags=constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW;
async function pinned(path:string){
 let dir=await open('/',dirFlags);
 try{
  for(const part of dirname(path).split('/').filter(Boolean)){const next=await open(`/proc/self/fd/${dir.fd}/${part}`,dirFlags);await dir.close();dir=next;}
  return await open(`/proc/self/fd/${dir.fd}/${basename(path)}`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 }finally{await dir.close();}
}
/** Only a server-resolved live owned row reaches here. Never download a Media URL. */
export async function localCompositionOwnedReferenceV2(org:string,row:{id:string;path:string},root:string,frontendUrl:string,options?:LocalCompositionOptionsV2){
 if(process.platform!=='linux')return fail();
 const url=new URL(row.path),base=new URL(frontendUrl);
 if(url.origin!==base.origin||url.username||url.password||url.search||url.hash||!/^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.(mp4|mp3|m4a|wav|png|jpe?g|srt|vtt)$/i.test(url.pathname))return fail();
 const absolutePath=resolve(root,url.pathname.slice('/uploads/'.length));
 const check=async()=>{if(options?.signal?.aborted)throw new Error('LOCAL_COMPOSITION_ABORTED');await options?.assertCurrent?.();};
 await check();const file=await pinned(absolutePath);
 try{
  const initial=await file.stat();if(!initial.isFile()||initial.nlink!==1||initial.size<1||initial.size>LOCAL_COMPOSITION_LIMITS_V2.maxAssetBytes)return fail();
  const hash=createHash('sha256'),chunk=Buffer.alloc(1024*1024);let at=0,last=Date.now();
  while(at<initial.size){
   if(options?.signal?.aborted)throw new Error('LOCAL_COMPOSITION_ABORTED');
   if(Date.now()-last>=LOCAL_COMPOSITION_LIMITS_V2.heartbeatMs){await check();last=Date.now();}
   const read=await file.read(chunk,0,Math.min(chunk.length,initial.size-at),at);if(!read.bytesRead)return fail();
   hash.update(chunk.subarray(0,read.bytesRead));at+=read.bytesRead;
  }
  const current=await pinned(absolutePath);
  try{for(const info of [await file.stat(),await current.stat()])if(!info.isFile()||info.nlink!==1||info.ino!==initial.ino||info.dev!==initial.dev||info.size!==initial.size||info.mtimeMs!==initial.mtimeMs||info.ctimeMs!==initial.ctimeMs)return fail();}finally{await current.close();}
  await check();return {organizationId:org,mediaId:row.id,absolutePath,bytes:initial.size,sha256:hash.digest('hex')};
 }finally{await file.close();}
}
