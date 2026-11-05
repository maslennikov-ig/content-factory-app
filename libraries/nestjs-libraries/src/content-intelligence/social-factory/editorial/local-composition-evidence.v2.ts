import {LOCAL_COMPOSITION_ENGINE_V2,localCompositionDigestV2,type LocalCompositionResultV2} from '../../../videos/local-reel/local-composition.v2';
import type {EditorialMaterialV1,ProductionAssetV1} from '../contracts/social-factory.v1';
import type {SourceArtifactRefV1} from '../contracts/source-artifact.v1';

export interface LocalCompositionEvidenceV2{
 version:2;engineVersion:typeof LOCAL_COMPOSITION_ENGINE_V2;renderKey:string;manifestDigest:string;approvedSettingsDigest:string;
 sourceArtifact:SourceArtifactRefV1;textSha256:string;materialDigest:string;outputSha256:string;
 speechAlignment:'unverified';screenOnly:boolean;captions:LocalCompositionResultV2['captions'];textRendering:LocalCompositionResultV2['textRendering'];
}
export const localCompositionMaterialDigestV2=(material:EditorialMaterialV1)=>localCompositionDigestV2({format:material.format,sourceArtifact:material.sourceArtifact,script:material.script,scenes:material.scenes});
/** Structural local render evidence. Human speech/playability review remains independent. */
export function localCompositionEvidenceV2(material:EditorialMaterialV1,video:ProductionAssetV1|undefined){
 const evidence=video?.videoEvidence?.localComposition;
 if(!evidence||!material.sourceArtifact||!evidence.sourceArtifact||!evidence.textRendering||!evidence.captions||evidence.speechAlignment!=='unverified'||evidence.version!==2||evidence.engineVersion!==LOCAL_COMPOSITION_ENGINE_V2||video?.provenance?.provider!=='local-composition.v2'||video.provenance?.jobId||
  evidence.outputSha256!==video.videoEvidence?.metadata.sha256||!/^[a-f0-9]{64}$/.test(evidence.renderKey)||
  localCompositionDigestV2(evidence.sourceArtifact)!==localCompositionDigestV2(material.sourceArtifact)||evidence.materialDigest!==localCompositionMaterialDigestV2(material))return undefined;
 if(evidence.screenOnly&&(!evidence.textRendering.physicalBurn||!material.scenes?.length||material.scenes.some(s=>s.spokenText?.trim()||!s.screenText?.trim())||
  evidence.textRendering.screenTitlesSha256!==localCompositionDigestV2(material.scenes.map(s=>({startSeconds:s.startSeconds,endSeconds:s.endSeconds,text:s.screenText!.trim(),role:'screen_title'})))))return undefined;
 return evidence;
}
