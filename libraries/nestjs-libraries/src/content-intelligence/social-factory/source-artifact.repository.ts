import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { serializableWithRetry } from '../../database/prisma/serializable.transaction';
import { authenticatedSession } from '../../user/authenticated.session';
import { isOrganizationEditor } from '../../user/organization.roles';
import { ResolvedSourceArtifactSchemaV1, SourceArtifactDraftEditSchemaV1, SourceArtifactRefSchemaV1, SourceArtifactSelectionSchemaV1, type ResolvedSourceArtifactV1, type SourceArtifactDraftEditInputV1, type SourceArtifactRefV1, type SourceArtifactSelectionV1 } from './contracts/source-artifact.v1';

export type SourceArtifactReaderV1 = Pick<Prisma.TransactionClient, 'userOrganization' | 'contentPiece' | 'contentDerivation' | 'post' | 'integration'>;
const deny = (code: string, status = 409): never => { throw new HttpException({ code }, status); };
const canonical = (value: any): any => Object.prototype.toString.call(value) === '[object Date]' ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, canonical(value[key])])) : value;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

/** Read-only and transaction-compatible. No prompt, model or caller text is an authority. */
async function readSourceArtifactV1(db: SourceArtifactReaderV1, organizationId: string, actorId: string, selection: SourceArtifactSelectionV1) {
  const parsed = SourceArtifactSelectionSchemaV1.safeParse(selection);
  if (!parsed.success) return deny('SOURCE_ARTIFACT_INPUT_INVALID', 400);
  if (authenticatedSession() && authenticatedSession()!.actorId !== actorId) return deny('SOURCE_ARTIFACT_ACCESS_DENIED', 403);
  const member = await db.userOrganization.findFirst({ where: { organizationId, userId: actorId, disabled: false }, include: { user: true } });
  if (!member || !member.user.activated || !isOrganizationEditor(member.role)) return deny('SOURCE_ARTIFACT_ACCESS_DENIED', 403);
  const input = parsed.data;
  const piece = await db.contentPiece.findFirst({ where: { organizationId, id: input.pieceId, archivedAt: null } });
  if (!piece) return deny('SOURCE_ARTIFACT_NOT_FOUND', 404);
  const pieceStamp = { id: piece.id, organizationId: piece.organizationId, kind: piece.kind, title: piece.title, body: piece.body,
    brief: piece.brief, language: piece.language, updatedAt: piece.updatedAt, archivedAt: piece.archivedAt };
  const locks: Array<() => Promise<{count: number}>> = [() => db.contentPiece.updateMany({where: {organizationId, id: piece.id, archivedAt: null,
    updatedAt: piece.updatedAt, title: piece.title, body: piece.body, language: piece.language, brief: {equals: piece.brief === null ? Prisma.AnyNull : piece.brief}}, data: {updatedAt: piece.updatedAt}})];
  let title = piece.title, text = piece.body, locale = piece.language;
  let identity: unknown = { piece: pieceStamp }, ref: SourceArtifactRefV1;
  if (input.kind === 'adaptation') {
    const adaptation = await db.contentDerivation.findFirst({ where: { organizationId, id: input.adaptationId, contentPieceId: piece.id } });
    if (!adaptation || input.postId && input.postId !== adaptation.postId) return deny('SOURCE_ARTIFACT_NOT_FOUND', 404);
    const post = adaptation.postId ? await db.post.findFirst({ where: { organizationId, id: adaptation.postId, deletedAt: null },
      include: { integration: { select: { id: true, organizationId: true, contentLanguage: true, updatedAt: true } } } }) : null;
    if (adaptation.postId && (!post || post.integration.organizationId !== organizationId || adaptation.integrationId && adaptation.integrationId !== post.integrationId)) return deny('SOURCE_ARTIFACT_NOT_FOUND', 404);
    locks.push(() => db.contentDerivation.updateMany({where: {organizationId, id: adaptation.id, contentPieceId: piece.id, updatedAt: adaptation.updatedAt,
      postId: adaptation.postId, integrationId: adaptation.integrationId, title: adaptation.title, body: adaptation.body}, data: {updatedAt: adaptation.updatedAt}}));
    if (post) {
      locks.push(() => db.post.updateMany({where: {organizationId, id: post.id, deletedAt: null, updatedAt: post.updatedAt, title: post.title, content: post.content,
        integrationId: post.integrationId, parentPostId: post.parentPostId}, data: {updatedAt: post.updatedAt}}));
      locks.push(() => db.integration.updateMany({where: {organizationId, id: post.integration.id, updatedAt: post.integration.updatedAt,
        contentLanguage: post.integration.contentLanguage}, data: {updatedAt: post.integration.updatedAt}}));
    }
    title = post?.title ?? adaptation.title ?? piece.title;
    text = post ? post.content : adaptation.body ?? '';
    locale = post?.integration.contentLanguage?.trim() ? post.integration.contentLanguage : piece.language;
    identity = { piece: pieceStamp, adaptation: { id: adaptation.id, organizationId: adaptation.organizationId, contentPieceId: adaptation.contentPieceId,
      postId: adaptation.postId, integrationId: adaptation.integrationId, title: adaptation.title, body: adaptation.body, platform: adaptation.platform,
      format: adaptation.format, kind: adaptation.kind, updatedAt: adaptation.updatedAt },
      post: post ? { id: post.id, organizationId: post.organizationId, title: post.title, content: post.content, integrationId: post.integrationId,
        parentPostId: post.parentPostId, updatedAt: post.updatedAt, deletedAt: post.deletedAt, integration: post.integration } : null };
    ref = { version: 1, kind: 'adaptation', pieceId: piece.id, adaptationId: adaptation.id, ...(post ? { postId: post.id } : {}), revision: '' };
  } else ref = { version: 1, kind: 'piece', pieceId: piece.id, revision: '' };
  if (!text.trim()) return deny('SOURCE_ARTIFACT_EMPTY', 409);
  ref.revision = digest({ version: 1, kind: input.kind, identity, title, text, locale });
  if (input.revision && input.revision !== ref.revision) return deny('SOURCE_ARTIFACT_STALE', 409);
  const artifact: ResolvedSourceArtifactV1 = { ref, actorId, organizationId, title, text, locale, contentDigest: createHash('sha256').update(text, 'utf8').digest('hex') };
  return {artifact, locks};
}

export async function resolveSourceArtifactV1(db: SourceArtifactReaderV1, organizationId: string, actorId: string, selection: SourceArtifactSelectionV1): Promise<ResolvedSourceArtifactV1> {
  return (await readSourceArtifactV1(db, organizationId, actorId, selection)).artifact;
}

/** Writer-transaction assertion. No-op updates fence edits without changing revision stamps. */
export async function assertSourceArtifactCurrentV1(db: SourceArtifactReaderV1, organizationId: string, actorId: string, ref: SourceArtifactRefV1): Promise<ResolvedSourceArtifactV1> {
  const parsed = SourceArtifactRefSchemaV1.safeParse(ref);
  if (!parsed.success) return deny('SOURCE_ARTIFACT_INPUT_INVALID', 400);
  const read = await readSourceArtifactV1(db, organizationId, actorId, parsed.data);
  for (const lock of read.locks) if ((await lock()).count !== 1) return deny('SOURCE_ARTIFACT_STALE', 409);
  return read.artifact;
}

export function assertSourceArtifactBindingV1(artifact: unknown, organizationId: string, actorId: string, pieceId?: string): ResolvedSourceArtifactV1 {
  const parsed = ResolvedSourceArtifactSchemaV1.safeParse(artifact);
  if (!parsed.success) return deny('SOURCE_ARTIFACT_INPUT_INVALID', 400);
  if (parsed.data.actorId !== actorId || parsed.data.organizationId !== organizationId) return deny('SOURCE_ARTIFACT_ACCESS_DENIED', 403);
  if (pieceId && parsed.data.ref.pieceId !== pieceId) return deny('SOURCE_ARTIFACT_SCOPE_MISMATCH', 409);
  return parsed.data;
}

export async function assertResolvedSourceArtifactCurrentV1(db: SourceArtifactReaderV1, organizationId: string, actorId: string, artifact: unknown, pieceId?: string): Promise<ResolvedSourceArtifactV1> {
  const bound = assertSourceArtifactBindingV1(artifact, organizationId, actorId, pieceId);
  const current = await assertSourceArtifactCurrentV1(db, organizationId, actorId, bound.ref);
  if (current.contentDigest !== bound.contentDigest || current.title !== bound.title || current.text !== bound.text || current.locale !== bound.locale) return deny('SOURCE_ARTIFACT_STALE', 409);
  return current;
}

@Injectable()
export class SourceArtifactRepositoryV1 {
  constructor(private readonly prisma: PrismaService) {}
  resolve(organizationId: string, actorId: string, selection: SourceArtifactSelectionV1, transaction?: Prisma.TransactionClient): Promise<ResolvedSourceArtifactV1> {
    if (transaction) return resolveSourceArtifactV1(transaction, organizationId, actorId, selection);
    return serializableWithRetry(this.prisma, tx => resolveSourceArtifactV1(tx, organizationId, actorId, selection), 'Source changed; reload the selected material.');
  }
  async editDraft(organizationId: string, actorId: string, value: SourceArtifactDraftEditInputV1): Promise<ResolvedSourceArtifactV1> {
    const parsed = SourceArtifactDraftEditSchemaV1.safeParse(value);
    if (!parsed.success || parsed.data.sourceArtifact.kind !== 'adaptation') return deny('SOURCE_ARTIFACT_INPUT_INVALID', 400);
    const input = parsed.data, ref = input.sourceArtifact;
    if (ref.kind !== 'adaptation') return deny('SOURCE_ARTIFACT_DRAFT_ONLY');
    const id = `source-artifact-edit-${digest({organizationId, actorId, requestId: input.requestId})}`;
    const inputDigest = digest({sourceArtifact: ref, body: input.body});
    return serializableWithRetry(this.prisma, async tx => {
      // Replay is still an authorized read of the current owned draft, even
      // though its original expected revision naturally predates our edit.
      const {revision: _revision, ...selection} = ref;
      const current = await resolveSourceArtifactV1(tx, organizationId, actorId, selection);
      const piece = await tx.contentPiece.findFirst({where: {organizationId, id: ref.pieceId, archivedAt: null}});
      const adaptation = await tx.contentDerivation.findFirst({where: {organizationId, id: ref.adaptationId, contentPieceId: ref.pieceId, postId: null, integrationId: null}});
      const brief = piece?.brief as {version?: unknown; material?: {channelId?: unknown; platform?: unknown; destination?: {kind?: unknown; id?: unknown; publishable?: unknown}}} | null;
      const material = brief?.material, destination = material?.destination;
      if (!piece || piece.kind !== 'CORE' || !adaptation || brief?.version !== 'social-factory-material/v1' || destination?.kind !== 'draft' || destination.publishable !== false ||
        typeof material?.channelId !== 'string' || destination.id !== material.channelId || adaptation.platform !== material.platform) return deny('SOURCE_ARTIFACT_DRAFT_ONLY', 403);
      const draft = await tx.socialFactoryRecord.findFirst({where: {organizationId, kind: 'draft_destination', id: material.channelId, deletedAt: null, invalidatedAt: null,
        OR: [{expiresAt: null}, {expiresAt: {gt: new Date()}}]}});
      const proof = draft?.payload as {version?: unknown; kind?: unknown; id?: unknown; publishable?: unknown; actorId?: unknown; platform?: unknown} | undefined;
      if (!draft || proof?.version !== 1 || proof.kind !== 'draft' || proof.id !== material.channelId || proof.publishable !== false || proof.actorId !== actorId || proof.platform !== material.platform) return deny('SOURCE_ARTIFACT_DRAFT_ONLY', 403);
      const receipt = await tx.socialFactoryRecord.findUnique({where: {organizationId_kind_id: {organizationId, kind: 'action', id}}});
      if (receipt && (receipt.deletedAt || receipt.invalidatedAt || receipt.expiresAt && receipt.expiresAt <= new Date())) return deny('SOURCE_ARTIFACT_EDIT_RECEIPT_UNAVAILABLE');
      const saved = receipt?.payload as {version?: unknown; type?: unknown; actorId?: unknown; inputDigest?: unknown; result?: unknown} | undefined;
      if (receipt && (saved?.version !== 1 || saved.type !== 'source_artifact_draft_edit' || saved.actorId !== actorId || saved.inputDigest !== inputDigest)) return deny('SOURCE_ARTIFACT_IDEMPOTENCY_CONFLICT');
      await assertSourceArtifactCurrentV1(tx, organizationId, actorId, receipt ? current.ref : ref);
      const locked = await tx.socialFactoryRecord.updateMany({where: {organizationId, kind: 'draft_destination', id: draft.id, revision: draft.revision, deletedAt: null, invalidatedAt: null,
        payload: {equals: draft.payload}, OR: [{expiresAt: null}, {expiresAt: {gt: new Date()}}]}, data: {updatedAt: draft.updatedAt}});
      if (locked.count !== 1) return deny('SOURCE_ARTIFACT_DRAFT_ONLY', 403);
      if (receipt) {
        const result = assertSourceArtifactBindingV1(saved!.result, organizationId, actorId, ref.pieceId);
        // Never overwrite a later edit merely because an older request replayed.
        if (result.ref.revision !== current.ref.revision) return deny('SOURCE_ARTIFACT_STALE');
        return result;
      }
      const changed = await tx.contentDerivation.updateMany({where: {organizationId, id: adaptation.id, contentPieceId: piece.id, postId: null, integrationId: null,
        body: adaptation.body, updatedAt: adaptation.updatedAt}, data: {body: input.body}});
      if (changed.count !== 1) return deny('SOURCE_ARTIFACT_STALE');
      const result = await resolveSourceArtifactV1(tx, organizationId, actorId, selection);
      await tx.socialFactoryRecord.create({data: {organizationId, kind: 'action', id, parentId: piece.id,
        payload: {version: 1, type: 'source_artifact_draft_edit', actorId, inputDigest, result} as Prisma.InputJsonValue}});
      return result;
    }, 'Source draft changed; retry the same edit request.');
  }
}
