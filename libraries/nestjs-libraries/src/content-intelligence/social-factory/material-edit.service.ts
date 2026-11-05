import { Injectable } from '@nestjs/common';
import { CampaignService } from './campaign/campaign.service';
import { SocialFactoryError } from './social-factory.repository';
import { NativeEditorialMaterialService } from './editorial/native-material.service';
import { PieceService } from '../pieces/piece.service';
import { SocialFactoryProductionService } from './production.service';
import type { SourceAdmissionV1 } from './contracts/social-factory.v1';
export interface CampaignTextEdit { campaignId:string;itemId:string;expectedContentRevision:number;body:string;postIndex?:number }
/** Text/caption only. Does not claim to alter burned artwork, speech or video frames. */
@Injectable()
export class SocialFactoryMaterialEditService {
 constructor(private readonly campaigns:CampaignService,private readonly native:NativeEditorialMaterialService,private readonly pieces:PieceService,private readonly production:SocialFactoryProductionService){}
 async edit(org:string,actorId:string,input:CampaignTextEdit,language:'ru'|'en'='ru'){
  if(!actorId||!input.body?.trim()||input.body.length>100000)throw new SocialFactoryError('CAMPAIGN_TEXT_REQUIRED');
  const item=(await this.campaigns.get(org,input.campaignId)).items.find(row=>row.id===input.itemId);
  if(!item?.material)throw new SocialFactoryError('CAMPAIGN_MATERIAL_REQUIRED');
  if(['reel','short','long_video'].includes(item.format))return this.production.editCaption(org,actorId,input,language);
  const material=structuredClone(item.material);
  if(material.format==='thread'){
   if(input.postIndex===undefined||!material.posts?.[input.postIndex])throw new SocialFactoryError('CAMPAIGN_THREAD_PART_REQUIRED');
   material.posts[input.postIndex].text=input.body.trim();
  }else if(material.platform==='telegram'){
   material.body=input.body.trim();material.caption=input.body.trim();material.settings.renderedText=input.body.trim();
   if(material.assets.some(asset=>['image','video'].includes(asset.kind)))material.settings.renderedCaption=input.body.trim();
  }else if(material.caption)material.caption=input.body.trim();else material.body=input.body.trim();
  // First revoke approval/native binding; a failed save cannot expose old native content as the new revision.
  delete material.pieceId;delete material.derivationId;
  const revised=await this.campaigns.setMaterial(org,input.campaignId,input.itemId,{material,expectedContentRevision:input.expectedContentRevision});
  if(item.state==='scheduled'&&item.material.pieceId&&item.material.derivationId)await this.pieces.unscheduleAdaptation(org,item.material.pieceId,item.material.derivationId,language);
  const saved=await this.native.save(org,actorId,{campaignId:input.campaignId,itemId:input.itemId,requestId:`edit-${input.itemId}-${revised.contentRevision}`,material,scheduledAt:item.scheduledAt,sourceAdmissions:(material.settings.sourceAdmissions??[])as unknown as SourceAdmissionV1[]},language);
  return this.campaigns.setMaterial(org,input.campaignId,input.itemId,{material:saved,expectedContentRevision:revised.contentRevision});
 }
}
