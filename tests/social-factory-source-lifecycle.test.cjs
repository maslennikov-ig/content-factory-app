const fs=require('node:fs/promises');
const os=require('node:os');const path=require('node:path');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {SocialFactorySourceLifecycleService}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/source-lifecycle.service.ts',{
 './social-factory.repository':{SocialFactoryRepository:class{}},'../../database/prisma/prisma.service':{PrismaRepository:class{}},
 '../../upload/upload.factory':{UploadFactory:{createStorage:()=>({removeFile:file=>fs.unlink(file)})}},
});
test('purge drains an owned generated file physically, preserves originals and refuses a malformed path',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'cf-owned-purge-'));const before={provider:process.env.STORAGE_PROVIDER,uploads:process.env.UPLOAD_DIRECTORY};
 process.env.STORAGE_PROVIDER='local';process.env.UPLOAD_DIRECTORY=base;
 try{
  const dir=path.join(base,'2030/01/01');await fs.mkdir(dir,{recursive:true});
  const generated=path.join(dir,'abcd.png'),original=path.join(dir,'beef.png');await fs.writeFile(generated,'synthetic generated');await fs.writeFile(original,'synthetic original');
  let rows=[{id:'derived',revision:1,payload:{mediaId:'derived',path:'https://local/uploads/2030/01/01/abcd.png'}},{id:'unsafe',revision:1,payload:{path:'../outside.png'}}];
  const store={list:async org=>{expect(org).toBe('org');return rows;},remove:async(org,kind,id)=>{expect(org).toBe('org');expect(kind).toBe('media_purge');rows=rows.filter(row=>row.id!==id);}};
  await new SocialFactorySourceLifecycleService(store,{}).drain('org');
  await expect(fs.readFile(generated)).rejects.toHaveProperty('code','ENOENT');expect(await fs.readFile(original,'utf8')).toBe('synthetic original');expect(rows.map(row=>row.id)).toEqual(['unsafe']);
 }finally{await fs.rm(base,{recursive:true,force:true});if(before.provider===undefined)delete process.env.STORAGE_PROVIDER;else process.env.STORAGE_PROVIDER=before.provider;if(before.uploads===undefined)delete process.env.UPLOAD_DIRECTORY;else process.env.UPLOAD_DIRECTORY=before.uploads;}
});
