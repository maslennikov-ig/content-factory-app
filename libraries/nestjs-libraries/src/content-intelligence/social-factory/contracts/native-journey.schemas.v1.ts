import {z} from 'zod';
import {SourceArtifactSelectionSchemaV1,SourceArtifactDraftEditSchemaV1} from './source-artifact.v1';
import {socialId} from './social-factory.schemas.v1';
/** Provider-compatible root object; the discriminated domain contract remains authoritative. */
export const sourceArtifactResolveInputSchemaV1=z.object({version:z.literal(1),kind:z.enum(['piece','adaptation']),pieceId:socialId,adaptationId:socialId.optional(),postId:socialId.optional(),revision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
export const parseSourceArtifactSelectionV1=(raw:unknown)=>{
  const input=sourceArtifactResolveInputSchemaV1.parse(raw);
  // The V2 bridge retains undefined optional keys; the strict piece variant
  // forbids even empty adaptation-only keys. Non-empty selectors stay checked.
  return SourceArtifactSelectionSchemaV1.parse(Object.fromEntries(Object.entries(input).filter(([,value])=>value!==undefined)));
};
export const localReelInputSchemaV1=z.object({operationId:socialId,expectedContentRevision:z.number().int().positive()}).strict();

export const sourceDraftEditInputSchemaV1=SourceArtifactDraftEditSchemaV1;
