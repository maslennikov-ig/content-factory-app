import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const piece = z.object({ version: z.literal(1), kind: z.literal('piece'), pieceId: id }).strict();
const adaptation = z.object({ version: z.literal(1), kind: z.literal('adaptation'), pieceId: id, adaptationId: id, postId: id.optional() }).strict();

export const SourceArtifactSelectionSchemaV1 = z.discriminatedUnion('kind', [
  piece.extend({ revision: revision.optional() }), adaptation.extend({ revision: revision.optional() }),
]);
export const SourceArtifactRefSchemaV1 = z.discriminatedUnion('kind', [
  piece.extend({ revision }), adaptation.extend({ revision }),
]);
export type SourceArtifactSelectionV1 = z.infer<typeof SourceArtifactSelectionSchemaV1>;
export type SourceArtifactRefV1 = z.infer<typeof SourceArtifactRefSchemaV1>;

export const ResolvedSourceArtifactSchemaV1 = z.object({
  ref: SourceArtifactRefSchemaV1, actorId: id, organizationId: id,
  title: z.string(), text: z.string().refine(value => value.trim().length > 0), locale: z.string().min(1).max(80), contentDigest: revision,
}).strict();
export type ResolvedSourceArtifactV1 = z.infer<typeof ResolvedSourceArtifactSchemaV1>;

export const SourceArtifactDraftEditSchemaV1 = z.object({
  sourceArtifact: SourceArtifactRefSchemaV1.refine(ref => ref.kind === 'adaptation'),
  body: z.string().max(100000).refine(body => body.trim().length > 0), requestId: z.string().min(1).max(200),
}).strict();
export type SourceArtifactDraftEditInputV1 = z.infer<typeof SourceArtifactDraftEditSchemaV1>;
