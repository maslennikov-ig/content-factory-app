import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import { decodeHggReadV1 } from './video-hgg-qualification-read.v1';
import { hggPilotWaitRequestV1, type HggPilotJobReceiptV1, type HggPilotQuoteRequestV1 } from './video-hgg-pilot-quote.v1';
const id=z.string().min(1).max(512).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const media=z.object({role:z.string(),value:z.string().uuid()}).strict();
const base={model:id,prompt:z.string().min(1).max(20000),count:z.literal(1),aspect_ratio:z.literal('9:16'),get_cost:z.boolean(),use_unlim:z.literal(false).optional()};
const image=z.object({...base,variant:z.enum(['flare','sunburst']),quality:z.enum(['low','medium','high','xhigh','max']),resolution:z.enum(['1k','2k','4k']),background:z.enum(['auto','opaque','transparent']).optional(),medias:z.array(media.extend({role:z.literal('image_references')})).max(1).optional()}).strict();
const video=z.object({...base,mode:z.literal('image-to-video'),resolution:z.enum(['720p','1080p']),duration:z.literal(5),medias:z.tuple([media.extend({role:z.literal('start_image')}),media.extend({role:z.literal('end_image')})]).optional()}).strict();
export type HggPilotExchangeV1 = {kind:'observe'|'select';workspaceId:string} | {kind:'quote'|'submit';workspaceId:string;request:HggPilotQuoteRequestV1} | {kind:'poll';workspaceId:string;receipt:HggPilotJobReceiptV1};
export interface HggPilotExchangeHooksV1 {beforeMutation?():Promise<void>;afterResult?(raw:Record<string,unknown>):Promise<void>}
export function hggPilotWireV1(action:HggPilotExchangeV1){
 if(!id.safeParse(action.workspaceId).success)return videoErrorV1('VIDEO_PILOT_WORKSPACE_INVALID',409);
 if(action.kind==='observe')return null;
 if(action.kind==='select')return {tool:'select_workspace',arguments:{workspace_id:action.workspaceId}};
 if(action.kind==='poll')return hggPilotWaitRequestV1(action.receipt);
 if(!('request' in action))return videoErrorV1('VIDEO_PILOT_REQUEST_INVALID',409);
 const params={...action.request.arguments.params,...(action.kind==='submit'?{get_cost:false,use_unlim:false}:{})};
 const parsed=(action.request.tool==='generate_image'?image:video).safeParse(params);
 if(!parsed.success || parsed.data.get_cost!==(action.kind==='quote') || action.kind==='quote' && parsed.data.use_unlim!==undefined ||
  !['generate_image','generate_video'].includes(action.request.tool))return videoErrorV1('VIDEO_PILOT_REQUEST_INVALID',409);
 return {tool:action.request.tool,arguments:{params:parsed.data}};
}
export function hggPrivateWorkspaceV1(raw:Record<string,unknown>,workspaceId:string,selected=true){
 const value=decodeHggReadV1({kind:'workspaces'},raw) as any;
 const matches=value.workspaces.filter((w:any)=>w.id===workspaceId);
 if(matches.length!==1 || matches[0].type!=='private' || matches[0].user_role!=='owner' ||
  selected && (!matches[0].is_selected || value.workspaces.filter((w:any)=>w.is_selected).length!==1))return videoErrorV1('VIDEO_PILOT_WORKSPACE_CHANGED',409);
 return matches[0] as {id:string;type:'private';user_role:'owner';is_selected:boolean;credits:number;plan_type:string};
}
