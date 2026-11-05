import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import { VideoMcpClient, type VideoTokenGuard } from '../subscriptions/video-mcp-client';
import { SubscriptionEndpoint } from '../subscriptions/video-provider-registry';
import { subscriptionHash } from '../subscriptions/video-provider-registry';
import { decodeHggPilotQuoteV1,decodeHggPilotWaitV1,type HggPilotQuoteInputV1,type HggPilotQuoteOwnerV1,type HggPilotJobReceiptV1 } from '../subscriptions/video-hgg-pilot-quote.v1';
import type { HggPilotStoredStageV1 } from '../subscriptions/video-hgg-pilot-stage.v1';
import type { HggPilotExchangeHooksV1 } from '../subscriptions/video-hgg-pilot-wire.v1';
import { hggPilotNativeCompileV1,type HggPilotNativeModelsV1 } from '../subscriptions/video-hgg-pilot-native-profile.v1';
@Injectable()
export class HiggsfieldPilotProviderV1 {
 constructor(readonly mcp:VideoMcpClient){}
 compile(input:HggPilotQuoteInputV1,owner:HggPilotQuoteOwnerV1,models:HggPilotNativeModelsV1){
  if(!models)return videoErrorV1('VIDEO_PILOT_MODEL_DISCOVERY_REQUIRED',409);
  return hggPilotNativeCompileV1(input,owner,models);
 }
 async quote(def:SubscriptionEndpoint,token:string,stage:HggPilotStoredStageV1,guard:VideoTokenGuard,hooks:HggPilotExchangeHooksV1){
  const {raw}=await this.mcp.exchangeHiggsfieldPilot(def,token,{kind:'quote',workspaceId:stage.workspace.workspaceId,request:stage.compiled},guard,hooks);
  return decodeHggPilotQuoteV1(stage.compiled,raw);
 }
 decodeReceipt(stage:HggPilotStoredStageV1,raw:unknown):HggPilotJobReceiptV1 & {raw:unknown;inputChanged:boolean;changedFields:string[]}{
  const parsed=z.object({results:z.array(z.object({id:z.string().uuid(),type:z.enum(['image','video']),model:z.string(),status:z.enum(['pending','waiting','queued','dna','script','visuals','vision','flow','in_progress','ip_detect','completed','canceled','failed','nsfw','ip_detected']),params:z.object({prompt:z.string()}).passthrough()}).passthrough()).length(1)}).passthrough().safeParse(raw);
  if(!parsed.success)return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID',409);
  const job=parsed.data.results[0],kind=stage.stage==='clip'?'video':'image';
  if(job.type!==kind || job.model!==stage.compiled.arguments.params.model)return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID',409);
  const body=raw as any,echo=(job as any).params,expected=stage.compiled.arguments.params as Record<string,unknown>,changedFields:string[]=[];
  if(body.adjustments!==undefined && (!body.adjustments || Array.isArray(body.adjustments) || typeof body.adjustments!=='object' || Object.keys(body.adjustments).length))changedFields.push('provider_adjustments');
  if(body.error || body.unlim_choice || body.cost)changedFields.push('conflicting_provider_result');
  if(echo && typeof echo==='object')for(const [key,value] of Object.entries(echo)){
   if(!(key in expected))continue;
   const normalized=key==='medias' && Array.isArray(value)?value.map((m:any)=>({role:m.role,value:m.value??m.data?.id})):value;
   if(subscriptionHash(normalized)!==subscriptionHash(expected[key]))changedFields.push(key);
  }
  return {profile:'hgg_pilot_job_v1',requestHash:stage.requestHash,kind,modelId:job.model,jobId:job.id,raw,inputChanged:changedFields.length>0,changedFields};
 }
 async submit(def:SubscriptionEndpoint,token:string,stage:HggPilotStoredStageV1,guard:VideoTokenGuard,hooks:HggPilotExchangeHooksV1){
  const {raw}=await this.mcp.exchangeHiggsfieldPilot(def,token,{kind:'submit',workspaceId:stage.workspace.workspaceId,request:stage.compiled},guard,hooks);
  return this.decodeReceipt(stage,raw);
 }
 async poll(def:SubscriptionEndpoint,token:string,stage:HggPilotStoredStageV1,receipt:HggPilotJobReceiptV1,guard:VideoTokenGuard){
  if(receipt.requestHash!==stage.requestHash || receipt.modelId!==stage.compiled.arguments.params.model)return videoErrorV1('VIDEO_PROVIDER_RECEIPT_INVALID',409);
  const canonical:HggPilotJobReceiptV1={profile:receipt.profile,requestHash:receipt.requestHash,kind:receipt.kind,modelId:receipt.modelId,jobId:receipt.jobId};
  const {raw}=await this.mcp.exchangeHiggsfieldPilot(def,token,{kind:'poll',workspaceId:stage.workspace.workspaceId,receipt:canonical},guard);
  const result=decodeHggPilotWaitV1(canonical,raw);
  const jobs=(raw as any).jobs;
  if(jobs?.[0]?.exr_url)return videoErrorV1('VIDEO_PROVIDER_RESULT_UNSUPPORTED',409);
  return {result,raw};
 }
}
