import { createHash } from 'node:crypto';
import type { CampaignItemV1, CampaignV1, EditorialMaterialV1 } from '../contracts/social-factory.v1';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const fail=(code:string):never=>{throw new Error(code);};
const hasText=(value:unknown):value is string=>typeof value==='string'&&!!value.trim();
const localError=(code:string)=>['LOCAL_REEL_SCREEN_TEXT_REQUIRED','LOCAL_REEL_SCREEN_TEXT_AMBIGUOUS','LOCAL_REEL_SCREEN_TEXT_CONFLICT','LOCAL_REEL_SCENE_TIMING_INVALID','LOCAL_REEL_SCREEN_TEXT_TOO_LONG','LOCAL_REEL_SCENE_INVALID','LOCAL_REEL_INPUT_INVALID','LOCAL_REEL_DURATION_LIMIT'].includes(code);
export const isLocalReelInputErrorV1=localError;

/** Only explicit single quoted screen copy is recoverable from a historical visual direction. */
function savedScreenLiteral(value:string):string|undefined{
 const prefix=/^(?:На экране(?:\s+точная\s+строка)?|On[- ]screen(?:\s+(?:exact\s+text|text))?|Screen text)\s*:\s*/iu;
 const direction=(value??'').trim();
 if(!prefix.test(direction))return undefined;
 const rest=direction.replace(prefix,'').trim();
 const match=/^«([^«»]+)»[.!?…]?$/u.exec(rest)||/^"([^"“”]+)"[.!?…]?$/u.exec(rest)||/^“([^“”]+)”[.!?…]?$/u.exec(rest);
 if(!match||!hasText(match[1]))return fail('LOCAL_REEL_SCREEN_TEXT_AMBIGUOUS');
 return match[1];
}
export const localSceneTextDigestV1=(material:EditorialMaterialV1)=>hash(JSON.stringify(material.scenes?.map(scene=>({index:scene.index,startSeconds:scene.startSeconds,endSeconds:scene.endSeconds,text:scene.screenText??scene.spokenText}))??[]));

/** Derived material only. The saved model output, original material and source pin stay untouched. */
export function projectLocalReelScenesV1(raw:EditorialMaterialV1):EditorialMaterialV1{
 const material=structuredClone(raw),sources:string[]=[];let end=0;
 if(!material.scenes?.length||material.scenes.length>20)return fail('LOCAL_REEL_SCREEN_TEXT_REQUIRED');
 for(const scene of material.scenes){
  if(!Number.isSafeInteger(scene.index)||!Number.isFinite(scene.startSeconds)||!Number.isFinite(scene.endSeconds)||Math.abs(scene.startSeconds-end)>0.00001||scene.endSeconds<=scene.startSeconds||
   (scene.endSeconds-scene.startSeconds)<1||Math.abs((scene.endSeconds-scene.startSeconds)*30-Math.round((scene.endSeconds-scene.startSeconds)*30))>0.00001)return fail('LOCAL_REEL_SCENE_TIMING_INVALID');
  end=scene.endSeconds;
  const literal=savedScreenLiteral(scene.visualIntent),typed=hasText(scene.screenText)?scene.screenText:undefined;
  if(typed&&literal&&typed!==literal)return fail('LOCAL_REEL_SCREEN_TEXT_CONFLICT');
  const text=typed??literal??(hasText(scene.spokenText)?scene.spokenText:undefined);
  if(!text)return fail('LOCAL_REEL_SCREEN_TEXT_REQUIRED');
  if(text.length>5000)return fail('LOCAL_REEL_SCREEN_TEXT_TOO_LONG');
  scene.screenText=text;sources.push(typed?'screenText':literal?'saved_visual_literal':'saved_spoken_text');
 }
 if(end>90)return fail('LOCAL_REEL_SCENE_TIMING_INVALID');
 material.script=material.scenes.map(scene=>scene.screenText!).join('\n\n');
 material.settings={...material.settings,audioMode:'silent',localReelSceneText:{version:1,sourceFields:sources,originalScriptSha256:hash(raw.script??''),originalScenesSha256:hash(JSON.stringify(raw.scenes)),
  ...(raw.pieceId?{sourcePieceId:raw.pieceId}:{}),...(raw.derivationId?{sourceDerivationId:raw.derivationId}:{}),scriptKind:'on_screen_text'}};
 return material;
}
const sameRef=(left:any,right:any)=>!!left&&!!right&&['version','kind','pieceId','adaptationId','postId','revision'].every(key=>left[key]===right[key]);
/** Shared read/write eligibility; source freshness and grants are additionally resolved by their existing services. */
export function assertLocalReelCandidateV1(org:string,actor:string,op:any,campaign:CampaignV1,item:CampaignItemV1){
 const source=op?.baseInput?.sourceArtifact,material=op?.videoBaseMaterial??op?.material;
 if(op?.version!==2||op.campaignId!==campaign.id||op.itemId!==item.id||item.campaignId!==campaign.id||campaign.state!=='active'||
  campaign.mode!==op.campaignAuthority?.mode||campaign.grantId!==op.campaignAuthority?.grantId||op.baseInput?.actorId!==actor||source?.actorId!==actor||source?.organizationId!==org||
  item.format!=='reel'||op.baseInput?.brief?.audioMode==='narrated'||!material||op.output===undefined||op.output===null||!sameRef(source.ref,material.sourceArtifact)||!sameRef(source.ref,item.material?.sourceArtifact)||
  item.contentRevision!==(op.appliedContentRevision??op.sourceContentRevision)||!['needs_input','ready','awaiting_approval','approved'].includes(item.state)||
  op.productionId||op.captionEdit?.state==='pending'||op.finalizing&&Date.parse(op.finalizing.until)>Date.now()||op.leaseUntil&&Date.parse(op.leaseUntil)>Date.now()||
  !(['needs_video','material_ready'].includes(op.state)||op.state==='ready'&&op.localReel?.asset))return fail('LOCAL_REEL_SAVED_PREPARATION_REQUIRED');
 return material as EditorialMaterialV1;
}

export interface LocalRenderContinuationV1 {kind:'local_render';reason:'SAVED_PREPARATION_READY';primaryPreparation:'saved';primaryRetryAllowed:false;speech:false;nextAction:'campaign.render_local_reel';expectedContentRevision:number;sourceArtifact:NonNullable<EditorialMaterialV1['sourceArtifact']>;input:{operationId:string;expectedContentRevision:number}}
