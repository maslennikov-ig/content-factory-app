import {constants} from 'node:fs';
import {link, mkdir, open, unlink, type FileHandle} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {LOCAL_COMPOSITION_LIMITS_V2} from '../videos/local-reel/local-composition.v2';

export type LocalCompositionUploadBindingV2={organizationId:string;operationId:string;renderKey:string;contentSha256:string};
export type LocalCompositionUploadIntentV2=LocalCompositionUploadBindingV2&{version:2;date:string;target:string;staging:string};
export type LocalCompositionUploadStageV2={dev:number;ino:number};
const fail=(reason:string):never=>{throw new Error('LOCAL_COMPOSITION_UPLOAD_'+reason);};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const valid=(binding:LocalCompositionUploadBindingV2)=>binding&&[binding.organizationId,binding.operationId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v))&&
 [binding.renderKey,binding.contentSha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v));
const filename=(binding:LocalCompositionUploadBindingV2,date:string)=>hash(JSON.stringify([2,binding.organizationId,binding.operationId,binding.renderKey,binding.contentSha256,date]))+'.mp4';
/** Persist before opening a target. Staging is private until a complete file is linked atomically. */
export function createLocalCompositionUploadIntentV2(binding:LocalCompositionUploadBindingV2):LocalCompositionUploadIntentV2{
 if(!valid(binding))return fail('INTENT_INVALID');
 const date=new Date().toISOString().slice(0,10).replace(/-/g,'/'),name=filename(binding,date);
 return {version:2,...binding,date,target:date+'/'+name,staging:'.'+name+'.'+randomUUID()+'.pending'};
}
export function assertLocalCompositionUploadIntentV2(intent:LocalCompositionUploadIntentV2,binding:LocalCompositionUploadBindingV2){
 if(!intent||!valid(binding)||intent.version!==2||Object.keys(intent).sort().join(',')!=='contentSha256,date,operationId,organizationId,renderKey,staging,target,version'||
 !/^\d{4}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])$/.test(intent.date)||
 (Object.keys(binding) as (keyof LocalCompositionUploadBindingV2)[]).some(k=>intent[k]!==binding[k])||intent.target!==intent.date+'/'+filename(binding,intent.date)||
 !intent.staging.startsWith('.'+filename(binding,intent.date)+'.')||!/^\.[a-f0-9]{64}\.mp4\.[a-f0-9-]{36}\.pending$/.test(intent.staging))fail('INTENT_INVALID');
}
const dirFlags=constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW;
async function directory(path:string,createFrom?:string){
 let current=await open('/',dirFlags);
 try{
  const parts=resolve(path).split('/').filter(Boolean),base=createFrom?resolve(createFrom).split('/').filter(Boolean).length:Infinity;
  for(let i=0;i<parts.length;i++){
   const nextPath=`/proc/self/fd/${current.fd}/${parts[i]}`;
   if(i>=base)try{await mkdir(nextPath);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
   const next=await open(nextPath,dirFlags);await current.close();current=next;
  }
  return current;
 }catch(error){await current.close();throw error;}
}
const same=(a:LocalCompositionUploadStageV2,b:LocalCompositionUploadStageV2)=>a.dev===b.dev&&a.ino===b.ino;
async function digest(file:FileHandle,bytes:number,guard:()=>Promise<void>){
 const result=createHash('sha256'),chunk=Buffer.alloc(1024*1024);let at=0;
 while(at<bytes){await guard();const read=await file.read(chunk,0,Math.min(chunk.length,bytes-at),at);if(!read.bytesRead)fail('CONTENT_MISMATCH');result.update(chunk.subarray(0,read.bytesRead));at+=read.bytesRead;}
 return result.digest('hex');
}
/** Last verification contains no caller callbacks: a callback cannot swap the leaf after this check. */
async function verifyFinalTarget(target:string,expected:LocalCompositionUploadStageV2,bytes:number,sha256:string){
 const file=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const initial=await file.stat();if(!initial.isFile()||initial.nlink!==1||initial.size!==bytes||!same(initial,expected))fail('CONTENT_MISMATCH');
  if(await digest(file,bytes,async()=>{})!==sha256)fail('CONTENT_MISMATCH');
  const current=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{for(const info of [await file.stat(),await current.stat()])if(!info.isFile()||info.nlink!==1||!same(info,initial)||info.size!==bytes||info.mtimeMs!==initial.mtimeMs||info.ctimeMs!==initial.ctimeMs)fail('CONTENT_MISMATCH');}finally{await current.close();}
 }finally{await file.close();}
}
/** V2 only: bounded streaming copy from C's SAME pinned and verified result descriptor.
 * The stage inode is checkpointed before bytes; retries never overwrite a foreign target.
 */
export async function uploadLocalCompositionV2(root:string,source:{file:FileHandle;bytes:number;sha256:string;assertUnchanged:()=>Promise<void>},
 intent:LocalCompositionUploadIntentV2,binding:LocalCompositionUploadBindingV2,previousStage:LocalCompositionUploadStageV2|undefined,
 options:{assertCurrent:()=>Promise<void>;onStage:(stage:LocalCompositionUploadStageV2)=>Promise<void>}){
 assertLocalCompositionUploadIntentV2(intent,binding);
 if(process.platform!=='linux')return fail('PLATFORM_UNSUPPORTED');
 if(!Number.isSafeInteger(source.bytes)||source.bytes<1||source.bytes>LOCAL_COMPOSITION_LIMITS_V2.maxOutputBytes||source.sha256!==binding.contentSha256)fail('CONTENT_MISMATCH');
 await options.assertCurrent();await source.assertUnchanged();
 const dir=await directory(resolve(root,intent.date),root),dirInfo=await dir.stat();
 const name=intent.target.split('/').pop()!,target=`/proc/self/fd/${dir.fd}/${name}`,staging=`/proc/self/fd/${dir.fd}/${intent.staging}`;
 const checkDirectory=async()=>{const live=await directory(resolve(root,intent.date));try{if(!same(dirInfo,await live.stat()))fail('DIRECTORY_CHANGED');}finally{await live.close();}};
 let file:FileHandle|undefined,owned:LocalCompositionUploadStageV2|undefined;
 try{
  // A crash immediately after atomic link can leave our checkpointed staging link.
  let existing:FileHandle|undefined;
  try{existing=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(existing){try{
   let info=await existing.stat();
   if(info.nlink===2&&previousStage&&same(info,previousStage)){
    await options.assertCurrent();
    const pending=await open(staging,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{if(!same(info,await pending.stat()))fail('CONTENT_MISMATCH');await unlink(staging);}finally{await pending.close();}
    info=await existing.stat();
   }
   if(!info.isFile()||info.nlink!==1||info.size!==source.bytes||await digest(existing,source.bytes,options.assertCurrent)!==binding.contentSha256)fail('CONTENT_MISMATCH');
   const after=await existing.stat();if(!same(info,after)||info.size!==after.size||info.mtimeMs!==after.mtimeMs||info.ctimeMs!==after.ctimeMs)fail('CONTENT_MISMATCH');
   const liveTarget=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{if(!same(info,await liveTarget.stat()))fail('CONTENT_MISMATCH');}finally{await liveTarget.close();}
   await options.assertCurrent();await checkDirectory();await verifyFinalTarget(target,info,source.bytes,binding.contentSha256);return {name,path:intent.target,bytes:source.bytes,reused:true};
  }finally{await existing.close();}}
  try{file=await open(staging,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
   await options.assertCurrent();
   const pending=await open(staging,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   try{const info=await pending.stat();if(!info.isFile()||info.nlink!==1||!(info.size===0||previousStage&&same(info,previousStage)))fail('STAGE_CHANGED');await unlink(staging);}finally{await pending.close();}
   file=await open(staging,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  }
  const initial=await file.stat();owned={dev:initial.dev,ino:initial.ino};await options.onStage(owned);
  const input=await source.file.stat();if(!input.isFile()||input.size!==source.bytes)fail('CONTENT_MISMATCH');
  const chunk=Buffer.alloc(1024*1024),sha=createHash('sha256');let at=0;
  while(at<source.bytes){
   await options.assertCurrent();const read=await source.file.read(chunk,0,Math.min(chunk.length,source.bytes-at),at);if(!read.bytesRead)fail('CONTENT_MISMATCH');
   sha.update(chunk.subarray(0,read.bytesRead));let written=0;
   while(written<read.bytesRead){const result=await file.write(chunk,written,read.bytesRead-written,at+written);if(!result.bytesWritten)fail('CONTENT_MISMATCH');written+=result.bytesWritten;}
   at+=read.bytesRead;
  }
  if(sha.digest('hex')!==binding.contentSha256)fail('CONTENT_MISMATCH');
  await source.assertUnchanged();await options.assertCurrent();await checkDirectory();
  const stage=await open(staging,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const info=await stage.stat();if(!same(info,owned)||info.nlink!==1||info.size!==source.bytes)fail('STAGE_CHANGED');}finally{await stage.close();}
  await file.chmod(0o644);await file.sync();if(await digest(file,source.bytes,options.assertCurrent)!==binding.contentSha256)fail('CONTENT_MISMATCH');
  await source.assertUnchanged();await options.assertCurrent();await checkDirectory();
  const lateStage=await open(staging,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const info=await lateStage.stat();if(!same(info,owned)||info.nlink!==1||info.size!==source.bytes)fail('STAGE_CHANGED');}finally{await lateStage.close();}
  const expected=owned;await link(staging,target);
  const linked=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{if(!same(await linked.stat(),expected))fail('CONTENT_MISMATCH');}finally{await linked.close();}
  const unlinkStage=await open(staging,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{if(!same(await unlinkStage.stat(),expected))fail('STAGE_CHANGED');await unlink(staging);}finally{await unlinkStage.close();}
  owned=undefined;await dir.sync();
  await options.assertCurrent();await checkDirectory();
  await verifyFinalTarget(target,expected,source.bytes,binding.contentSha256);
  return {name,path:intent.target,bytes:source.bytes,reused:false};
 }finally{
  try{if(owned)try{const check=await open(staging,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{if(same(owned,await check.stat()))await unlink(staging);}finally{await check.close();}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  finally{try{await file?.close();}finally{await dir.close();}}
 }
}
