import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { SocialFactoryRepository } from './social-factory.repository';
import { PrismaRepository } from '../../database/prisma/prisma.service';
import { UploadFactory } from '../../upload/upload.factory';
import { resolve } from 'node:path';

/** Only generated assets queued by a source-linked receipt are physically removed. Originals are retained. */
@Injectable()
export class SocialFactorySourceLifecycleService implements OnApplicationBootstrap,OnApplicationShutdown{
 private timer?:ReturnType<typeof setInterval>;private busy=false;private readonly logger=new Logger(SocialFactorySourceLifecycleService.name);
 constructor(private readonly store:SocialFactoryRepository,private readonly database:PrismaRepository<any>){}
 async invalidateBySource(org:string,id:string){const count=await this.store.invalidateBySource(org,id);await this.drain(org);return count;}
 async purgeExpired(org:string,now=new Date()){const count=await this.store.purgeExpired(org,now);await this.drain(org);return count;}
 async drain(org:string){
  const pending=await this.store.list<{mediaId:string;path:string}>(org,'media_purge');
  const storage=UploadFactory.createStorage();
  for(const row of pending){
   try{
    let path=row.payload.path;
    if((process.env.STORAGE_PROVIDER??'local')==='local'){
      const configured=process.env.UPLOAD_DIRECTORY||process.env.UPLOADS_DIRECTORY;
      if(!configured)continue;
      const base=resolve(configured);let name=path;
      try{name=new URL(path,'http://local').pathname.split('/uploads/')[1]??'';}catch{}
      if(!/^\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.[a-z0-9]+$/i.test(name))continue;
      path=resolve(base,name);
      if(!path.startsWith(base+'/'))continue;
    }
    try{await storage.removeFile(path);}catch(error:any){if(error?.code!=='ENOENT')throw error;}
    await this.store.remove(org,'media_purge',row.id,row.revision);
   }catch{this.logger.warn('SOCIAL_FACTORY_GENERATED_MEDIA_PURGE_PENDING');}
  }
 }
 async onApplicationBootstrap(){this.timer=setInterval(()=>void this.maintain(),60000);this.timer.unref();}
 onApplicationShutdown(){if(this.timer)clearInterval(this.timer);}
 async maintain(){if(this.busy)return;this.busy=true;try{
  const groups=await (this.database.model as any).socialFactoryRecord.findMany({where:{deletedAt:null,OR:[{expiresAt:{lte:new Date()}},{kind:'media_purge'}]},select:{organizationId:true},distinct:['organizationId'],take:100});
  for(const {organizationId}of groups)await this.purgeExpired(organizationId);
 }catch{this.logger.warn('SOCIAL_FACTORY_SOURCE_MAINTENANCE_PENDING');}finally{this.busy=false;}}
}
