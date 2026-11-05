import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { identity, digest } from './campaign/domain';
import { SocialFactoryRepository, SocialFactoryError } from './social-factory.repository';
import type { DraftDestinationRefV1, ChannelEditorialProfileV1, SocialPlatformV1 } from './contracts/social-factory.v1';

export const draftDestinationInputSchemaV1 = z.object({requestId:z.string().min(1).max(200),name:z.string().trim().min(1).max(300),
  platform:z.enum(['telegram','instagram','youtube','threads','tiktok']),locale:z.string().min(2).max(60)}).strict();
export interface DraftDestinationV1 extends DraftDestinationRefV1 {
  version:1; platform:SocialPlatformV1; name:string; locale:string; actorId:string; requestDigest:string;
}
export function readDraftDestinationV1(value:unknown,id:string):DraftDestinationV1 {
  const row=value as DraftDestinationV1;
  if(!row||row.version!==1||row.kind!=='draft'||row.id!==id||row.publishable!==false||!row.actorId||!row.platform||!row.locale)
    throw new SocialFactoryError('DRAFT_DESTINATION_INVALID');
  return row;
}

/** A preparation target, never a connected account, consent or publication grant. */
@Injectable()
export class DraftDestinationServiceV1 {
  constructor(private readonly store:SocialFactoryRepository){}
  async create(org:string,actorId:string,raw:unknown){
    const input=draftDestinationInputSchemaV1.parse(raw);
    try{new Intl.Locale(input.locale);}catch{throw new SocialFactoryError('DRAFT_DESTINATION_LOCALE_INVALID');}
    if(!org||!actorId)throw new SocialFactoryError('DRAFT_DESTINATION_ACTOR_REQUIRED');
    const id=identity('draft',org,actorId,input.requestId),requestDigest=digest(input);
    return this.store.transact(async store=>{
      const prior=await store.read<DraftDestinationV1>(org,'draft_destination',id);
      if(prior){
        const destination=readDraftDestinationV1(prior.payload,id);
        if(destination.actorId!==actorId||destination.requestDigest!==requestDigest)throw new SocialFactoryError('DRAFT_DESTINATION_IDEMPOTENCY_CONFLICT');
        return {destination,profileRevision:(await store.read(org,'channel_profile',id))?.revision??0};
      }
      const destination:DraftDestinationV1={version:1,id,kind:'draft',publishable:false,actorId,platform:input.platform,name:input.name,locale:input.locale,requestDigest};
      const profile:ChannelEditorialProfileV1={version:1,channelId:id,platform:input.platform,audience:'',promise:'',goals:[],expertise:[],pillars:[],languages:[input.locale],geography:[],exclusions:[],evidence:[],
        openQuestions:[]};
      await store.put({organizationId:org,kind:'draft_destination',id,payload:destination,expectedRevision:0});
      const saved=await store.put({organizationId:org,kind:'channel_profile',id,payload:{format:'channel-profile-base/v1',profile},expectedRevision:0});
      return {destination,profileRevision:saved.revision};
    });
  }
}
