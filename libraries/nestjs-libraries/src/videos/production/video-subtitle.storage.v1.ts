import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { inspectSubtitleFileV1, StoredSubtitleV1 } from './video-production-result.v1';

/** Dedicated validated sidecars; generic user-upload MIME allow-lists remain unchanged. */
export async function storeOwnedVideoSubtitleV1(bytes:Buffer,durationSeconds:number,source:StoredSubtitleV1['source']):Promise<StoredSubtitleV1>{
  const evidence=inspectSubtitleFileV1(bytes,durationSeconds);
  const extension=evidence.mimeType==='text/vtt'?'vtt':'srt';
  const name=randomUUID().replace(/-/g,'')+'.'+extension;
  let path:string;
  const provider=process.env.STORAGE_PROVIDER||'local';
  if(provider==='local'){
    if(!process.env.UPLOAD_DIRECTORY||!process.env.FRONTEND_URL)throw new Error('VIDEO_SUBTITLE_STORAGE_UNAVAILABLE');
    const now=new Date();
    const folder=[String(now.getFullYear()),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')];
    const directory=join(resolve(process.env.UPLOAD_DIRECTORY),...folder);
    await mkdir(directory,{recursive:true});await writeFile(join(directory,name),bytes,{flag:'wx'});
    path=process.env.FRONTEND_URL.replace(/\/$/,'')+'/uploads/'+folder.join('/')+'/'+name;
  }else if(provider==='cloudflare'){
    const bucket=process.env.CLOUDFLARE_BUCKETNAME;const base=process.env.CLOUDFLARE_BUCKET_URL;
    if(!bucket||!base||!process.env.CLOUDFLARE_ACCOUNT_ID||!process.env.CLOUDFLARE_ACCESS_KEY||!process.env.CLOUDFLARE_SECRET_ACCESS_KEY)throw new Error('VIDEO_SUBTITLE_STORAGE_UNAVAILABLE');
    const client=new S3Client({endpoint:`https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,region:process.env.CLOUDFLARE_REGION,
      credentials:{accessKeyId:process.env.CLOUDFLARE_ACCESS_KEY,secretAccessKey:process.env.CLOUDFLARE_SECRET_ACCESS_KEY},maxAttempts:1,requestChecksumCalculation:'WHEN_REQUIRED'});
    try{await client.send(new PutObjectCommand({Bucket:bucket,Key:name,Body:bytes,ContentType:evidence.mimeType,ContentDisposition:`attachment; filename="${name}"`}),{abortSignal:AbortSignal.timeout(15000)});}finally{client.destroy();}
    path=base.replace(/\/$/,'')+'/'+name;
  }else throw new Error('VIDEO_SUBTITLE_STORAGE_UNAVAILABLE');
  return {name,path,size:bytes.length,...evidence,source};
}
