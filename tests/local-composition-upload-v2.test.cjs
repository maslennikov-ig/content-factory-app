const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {createHash}=require('node:crypto');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const upload=loadTypeScriptModule('libraries/nestjs-libraries/src/upload/local-composition-upload.v2.ts');

async function fixture(t,size=1024*1024+17){
 const root=await fs.mkdtemp(path.join(tmpdir(),'cf-local-upload-v2-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=await fs.open(path.join(root,'render.mp4'),'wx+');
 await source.truncate(size);
 const hash=createHash('sha256'),chunk=Buffer.alloc(1024*1024);
 for(let at=0;at<size;at+=chunk.length)hash.update(chunk.subarray(0,Math.min(chunk.length,size-at)));
 const binding={organizationId:'org-a',operationId:'operation-a',renderKey:'a'.repeat(64),contentSha256:hash.digest('hex')};
 const intent=upload.createLocalCompositionUploadIntentV2(binding);
 const targetRoot=path.join(root,'uploads');await fs.mkdir(targetRoot);
 let stage;
 const options={assertCurrent:async()=>{},onStage:async value=>{stage=value;}};
 const input={file:source,bytes:size,sha256:binding.contentSha256,assertUnchanged:async()=>{assert.equal((await source.stat()).size,size);}};
 t.after(()=>source.close());
 return {root:targetRoot,source,input,binding,intent,options,get stage(){return stage;},
  run:()=>upload.uploadLocalCompositionV2(targetRoot,input,intent,binding,stage,options)};
}

test('streams an owned output larger than V1 100MiB and exact retry reuses one complete target',async t=>{
 const f=await fixture(t,100*1024*1024+1);
 const saved=await f.run();assert.equal(saved.bytes,f.input.bytes);assert.equal(saved.reused,false);
 assert.equal((await fs.stat(path.join(f.root,f.intent.target))).nlink,1);
 assert.ok(f.stage?.ino);assert.equal((await f.run()).reused,true);
 assert.equal((await fs.readdir(path.dirname(path.join(f.root,f.intent.target)))).length,1);
});

test('stale authority during copy leaves no published target and a later exact retry recovers',async t=>{
 const f=await fixture(t,3*1024*1024);let calls=0;
 f.options.assertCurrent=async()=>{if(++calls===4)throw Error('SOURCE_STALE');};
 await assert.rejects(f.run(),/SOURCE_STALE/);
 await assert.rejects(fs.stat(path.join(f.root,f.intent.target)),{code:'ENOENT'});
 f.options.assertCurrent=async()=>{};assert.equal((await f.run()).reused,false);
});

test('refuses foreign target bytes, target hardlinks and symlinked upload directories',async t=>{
 const f=await fixture(t);const target=path.join(f.root,f.intent.target);await fs.mkdir(path.dirname(target),{recursive:true});
 await fs.writeFile(target,'customer-original');await assert.rejects(f.run(),/CONTENT_MISMATCH/);
 assert.equal(await fs.readFile(target,'utf8'),'customer-original');await fs.unlink(target);
 await fs.copyFile(path.join(path.dirname(f.root),'render.mp4'),target);await fs.link(target,target+'.foreign');
 await assert.rejects(f.run(),/CONTENT_MISMATCH/);await fs.unlink(target);await fs.unlink(target+'.foreign');
 const year=f.intent.date.split('/')[0];await fs.rm(path.join(f.root,year),{recursive:true});
 const outside=path.join(path.dirname(f.root),'outside');await fs.mkdir(outside);await fs.symlink(outside,path.join(f.root,year));
 await assert.rejects(f.run());assert.deepEqual(await fs.readdir(outside),[]);
});

test('target replacement while rechecking an exact retry is refused',async t=>{
 const f=await fixture(t,3*1024*1024);await f.run();let calls=0;
 const target=path.join(f.root,f.intent.target);
 f.options.assertCurrent=async()=>{if(++calls===3){await fs.rename(target,target+'.original');await fs.writeFile(target,'foreign-replacement');}};
 await assert.rejects(f.run(),/CONTENT_MISMATCH/);assert.equal(await fs.readFile(target,'utf8'),'foreign-replacement');
});

test('staging replacement in the last source callback cannot publish or delete foreign bytes',async t=>{
 const f=await fixture(t,3*1024*1024);let checks=0;const stage=path.join(f.root,f.intent.date,f.intent.staging);
 f.input.assertUnchanged=async()=>{if(++checks===3){await fs.rename(stage,stage+'.original');await fs.writeFile(stage,'late-foreign-staging');}};
 await assert.rejects(f.run(),/STAGE_CHANGED|CONTENT_MISMATCH/);
 assert.equal(await fs.readFile(stage,'utf8'),'late-foreign-staging');await assert.rejects(fs.stat(path.join(f.root,f.intent.target)),{code:'ENOENT'});
});

test('target replacement in the last authority callback of a reused upload is refused without deleting it',async t=>{
 const f=await fixture(t);await f.run();let checks=0;const target=path.join(f.root,f.intent.target);
 f.options.assertCurrent=async()=>{if(++checks===4){await fs.rename(target,target+'.original');await fs.writeFile(target,'last-callback-foreign');}};
 await assert.rejects(f.run(),/CONTENT_MISMATCH/);assert.equal(await fs.readFile(target,'utf8'),'last-callback-foreign');
});
