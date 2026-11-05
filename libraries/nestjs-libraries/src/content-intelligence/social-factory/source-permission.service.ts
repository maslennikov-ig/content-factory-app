import { EditorialSourceAuthorityV1, sourcePermissionFailureV1, sourceOriginFromUrlV1, type RegistrySourcePermissionV1 } from './editorial/source-authority.v1';
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ContentSourceRegistryRepository } from '../source-registry/source-registry.repository';
import { SocialFactoryRepository, SocialFactoryError } from './social-factory.repository';
import type { DiscoverySource, DiscoverySourceGrant } from './discovery/discovery.types';
import type { SocialFactoryRecordV1 } from './contracts/social-factory.v1';
import { digest } from './campaign/domain';
import type { PublicDiscoveryRights } from './discovery/discovery.adapters';

export type SourcePermissionSaveInput=Omit<RegistrySourcePermissionV1,'organizationId'|'evidenceId'|'revision'|'revokedAt'> & {expectedRevision:number};

/** Explicit source-purpose grants are persisted by an authenticated owner route, never by discovery/model output. */
@Injectable()
export class SocialFactorySourcePermissionService{
 constructor(private readonly store:SocialFactoryRepository,private readonly sources:ContentSourceRegistryRepository,private readonly authority:EditorialSourceAuthorityV1){}
 async resolve(org:string,channelId:string,sourceIds:string[]){
  const loaded=await this.authority.read(org,channelId,sourceIds,'discovery');
  const allowed:DiscoverySource[]=[];
  for(const document of loaded.documents){
    const state=await this.store.readSourcePermissionState<DiscoverySourceGrant>(org,document.sourceId);
    if(state.state==='unknown')continue;
    if(state.state==='present'){
      if(!sourcePermissionFailureV1(state.record,org,channelId,document.sourceId,'discovery',Date.now()))allowed.push({id:document.sourceId,grant:state.record.payload});
    }else{
      const evidence=document.evidence[0];if(!evidence)continue;
      allowed.push({id:document.sourceId,grant:{organizationId:org,sourceId:document.sourceId,revision:document.sourceRevision,purposes:['discovery','editorial'],basis:evidence.access==='first_party'?'owned':'consented',evidenceId:evidence.id,expiresAt:document.retainUntil??new Date(Date.now()+21600000).toISOString(),origin:(evidence.originPlatform??'other')as DiscoverySourceGrant['origin'],acquisition:evidence.access==='first_party'?'first_party':'url',sourceContext:document.sourceId,channelIds:[channelId]}});
    }
  }
  return allowed;
 }
 async publicRights(org:string,url:string,channelId?:string):Promise<PublicDiscoveryRights>{
  if(channelId){
    const sources=await this.sources.listSources(org);
    const matched=sources.find(source=>source.canonicalUrl===url);
    if(matched){
      const loaded=await this.authority.read(org,channelId,[matched.id],'discovery');
      const evidence=loaded.documents[0]?.evidence[0];
      if(evidence)return {origin:(evidence.originPlatform??'other')as PublicDiscoveryRights['origin'],rights:evidence.rights,expiresAt:evidence.expiresAt??loaded.documents[0].retainUntil??new Date(Date.now()+21600000).toISOString(),access:evidence.access,evidenceId:evidence.id,sourceId:matched.id};
    }
  }
  return {origin:sourceOriginFromUrlV1(url)??'web',rights:'unknown',expiresAt:new Date(Date.now()+3600000).toISOString(),access:'public',evidenceId:createHash('sha256').update(url).digest('hex'),sourceId:url};
 }
 async save(org:string,actorId:string,input:SourcePermissionSaveInput){
  this.identity(org,input.sourceId,input.expectedRevision);
  if(!actorId?.trim())throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_ACTOR_REQUIRED');
  if(!Array.isArray(input.channelIds)||!input.channelIds.length||input.channelIds.length>100||input.channelIds.some(id=>typeof id!=='string'||!id.trim()))throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_CHANNEL_SCOPE');
  if(!Array.isArray(input.purposes)||!input.purposes.length||input.purposes.some(purpose=>!['discovery','editorial','licensed_registry_export_v1'].includes(purpose)))throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PURPOSE_REQUIRED');
  if(!['owned','licensed','consented'].includes(input.basis)||!['first_party','upload','url','rss','search','licensed'].includes(input.acquisition)||!input.sourceContext?.trim())throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PROVENANCE_REQUIRED');
  if((input as {revokedAt?:unknown}).revokedAt!==undefined)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_REVOKED');
  return this.store.transactSourcePermission(async(tx,client)=>{
   const now=new Date();
   if(!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=now.getTime())throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_EXPIRY');
   // Same order as assertSourceAdmissionsV1: canonical source first, permission second.
   const source=await client.contentSource.findFirst({where:{organizationId:org,id:input.sourceId},include:{currentSnapshot:{include:{evidence:{where:{tombstone:null},orderBy:{createdAt:'asc'}}}}}});
   if(!source)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_NOT_FOUND');
   const locked=await client.contentSource.updateMany({where:{organizationId:org,id:source.id,configVersion:source.configVersion},data:{configVersion:source.configVersion}});
   if(locked.count!==1)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_CHANGED');
   const state=await tx.readSourcePermissionState<RegistrySourcePermissionV1>(org,source.id);
   if(state.state==='unknown')throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_UNAVAILABLE');
   const previous=state.state==='present'?state.record:null;
   if(previous?.deletedAt||previous?.invalidatedAt)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_DELETED');
   if(previous?.payload?.revokedAt!==undefined)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_REVOKED');
   if(previous&&(previous.payload?.organizationId!==org||previous.payload?.sourceId!==source.id||!previous.payload?.revision))throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_STATE_INVALID');
   if((previous?.revision??0)!==input.expectedRevision)throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
   const snapshot=source.currentSnapshot;
   if(!snapshot)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_UNAVAILABLE');
   // This seed comes only from registry data. B's authority then checks all persisted
   // URL/retrieval/evidence lineage, including Telegram forwarded through uploads.
   const seed=sourceOriginFromUrlV1(source.canonicalUrl)??(source.kind==='MANUAL'?'first_party':'other');
   const grant:RegistrySourcePermissionV1={organizationId:org,sourceId:source.id,revision:String(input.expectedRevision+1),purposes:[...new Set(input.purposes)],basis:input.basis,
    evidenceId:`owner:${actorId}:${source.id}:${input.expectedRevision+1}`,expiresAt:new Date(input.expiresAt).toISOString(),origin:seed,acquisition:input.acquisition,sourceContext:input.sourceContext,channelIds:[...new Set(input.channelIds)],
    ...(input.telegramConsent?{telegramConsent:input.telegramConsent}:{})};
   const candidate:SocialFactoryRecordV1<RegistrySourcePermissionV1>={organizationId:org,kind:'source_permission' as const,id:source.id,revision:input.expectedRevision+1,payload:grant,parentId:null,createdAt:now,updatedAt:now,deletedAt:null,invalidatedAt:null,expiresAt:new Date(input.expiresAt),sourceIds:[]};
   const prospective=new EditorialSourceAuthorityV1({read:tx.read.bind(tx),readSourcePermissionState:async<T>()=>({state:'present' as const,record:{...candidate,payload:grant as unknown as T}})},{getDraftMaterial:async()=>({source,snapshot,evidence:snapshot.evidence})},()=>now);
   for(const channelId of grant.channelIds)for(const purpose of grant.purposes){
    const checked=await prospective.read(org,channelId,[source.id],purpose==='editorial'?'editorial_generation':purpose);
    const origin=checked.documents[0]?.evidence[0]?.originPlatform;
    if(!origin){
     const gap=checked.gaps[0]?.code;
     if(gap==='SOURCE_EXPORT_LICENSE_REQUIRED')throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_EXPORT_LICENSE_REQUIRED');
     if(gap==='TELEGRAM_SCOPED_CONSENT_REQUIRED')throw new SocialFactoryError('SOCIAL_FACTORY_TELEGRAM_CONSENT_REQUIRED');
     throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_UNAVAILABLE',gap??'Registered source is unavailable.');
    }
    grant.origin=origin as DiscoverySourceGrant['origin'];
   }
   const payload=JSON.parse(JSON.stringify(grant));
   if(previous){
    // Expired live rows are renewable only through this raw, explicit revision CAS.
    // Deleted/invalidated/revoked rows above are never implicitly resurrected.
    const changed=await client.socialFactoryRecord.updateMany({where:{organizationId:org,kind:'source_permission',id:source.id,revision:input.expectedRevision,deletedAt:null,invalidatedAt:null},data:{payload,expiresAt:new Date(input.expiresAt),sourceIds:[],revision:{increment:1}}});
    if(changed.count!==1)throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
   }else await client.socialFactoryRecord.create({data:{organizationId:org,kind:'source_permission',id:source.id,payload,expiresAt:new Date(input.expiresAt)}});
   // A live, identical owner grant extended in time preserves native history. Its
   // old admission revision still fails the final fence until refreshed. Changed
   // scope/provenance and a previous absent or expired grant require invalidation.
   if(this.sameActiveGrant(previous,grant,actorId,now))await tx.renewSourceRetention(org,source.id,new Date(previous!.payload.expiresAt));
   else await tx.invalidateBySource(org,source.id);
   return client.socialFactoryRecord.findFirst({where:{organizationId:org,kind:'source_permission',id:source.id}});
  });
 }
 async revoke(org:string,id:string,expectedRevision:number){
  this.identity(org,id,expectedRevision);
  return this.store.transactSourcePermission(async(tx,client)=>{
   const source=await client.contentSource.findFirst({where:{organizationId:org,id}});
   if(!source)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_NOT_FOUND');
   const locked=await client.contentSource.updateMany({where:{organizationId:org,id,configVersion:source.configVersion},data:{configVersion:source.configVersion}});
   if(locked.count!==1)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_CHANGED');
   const state=await tx.readSourcePermissionState<DiscoverySourceGrant>(org,id);
   if(state.state==='unknown')throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_UNAVAILABLE');
   if(state.state!=='present'||state.record.revision!==expectedRevision)throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
   const row=state.record;
   if(row.deletedAt||row.invalidatedAt)throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_DELETED');
   if(!row.payload.revokedAt){
    const changed=await client.socialFactoryRecord.updateMany({where:{organizationId:org,kind:'source_permission',id,revision:expectedRevision,deletedAt:null,invalidatedAt:null},data:{payload:JSON.parse(JSON.stringify({...row.payload,revokedAt:new Date().toISOString()})),revision:{increment:1}}});
    if(changed.count!==1)throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
   }
   return {redacted:await tx.invalidateBySource(org,id)};
  });
 }
 private sameActiveGrant(previous:SocialFactoryRecordV1<RegistrySourcePermissionV1>|null,grant:RegistrySourcePermissionV1,actorId:string,now:Date){
  if(!previous||previous.deletedAt||previous.invalidatedAt||previous.payload.revokedAt!==undefined)return false;
  const old=previous.payload,oldExpiry=Date.parse(old.expiresAt),newExpiry=Date.parse(grant.expiresAt);
  const recordExpiry=previous.expiresAt?new Date(previous.expiresAt).getTime():oldExpiry;
  if(!Number.isFinite(oldExpiry)||!Number.isFinite(recordExpiry)||oldExpiry<=now.getTime()||recordExpiry<=now.getTime()||newExpiry<Math.max(oldExpiry,recordExpiry))return false;
  if(old.evidenceId!==`owner:${actorId}:${grant.sourceId}:${previous.revision}`)return false;
  if(!Array.isArray(old.channelIds)||!Array.isArray(old.purposes))return false;
  const scope=(value:RegistrySourcePermissionV1)=>({organizationId:value.organizationId,sourceId:value.sourceId,basis:value.basis,origin:value.origin,acquisition:value.acquisition,sourceContext:value.sourceContext,
   channelIds:[...new Set(value.channelIds)].sort(),purposes:[...new Set(value.purposes)].sort(),telegramConsent:value.telegramConsent??null});
  return digest(scope(old))===digest(scope(grant));
 }
 private identity(org:string,id:string,revision:number){
  if(!org?.trim()||!id?.trim()||!Number.isSafeInteger(revision)||revision<0)throw new SocialFactoryError('SOCIAL_FACTORY_INVALID_INPUT');
 }
}
