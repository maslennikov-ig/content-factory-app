import { assertSourceArtifactCurrentV1 } from './source-artifact.repository';
import type { SourceArtifactRefV1 } from './contracts/source-artifact.v1';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { digestBrandProfileContent } from '../brand-profile/brand-profile.validation';
import { Injectable } from '@nestjs/common';
import { PrismaRepository, PrismaTransaction } from '../../database/prisma/prisma.service';
import { PublicationStoreV106, type PublicationKeyV106, type PublicationResultV106 } from '../../database/prisma/posts/publication-store.v106';
import type { SocialFactoryKindV1, SocialFactoryPutV1, SocialFactoryRecordV1, SocialFactoryStoreV1, SourceAdmissionV1, SourcePermissionStateV1 } from './contracts/social-factory.v1';

export class SocialFactoryError extends Error {
  constructor(public readonly code: string, message = code, public readonly status = 409) { super(message); }
}
const staleInputKinds = new Set<SocialFactoryKindV1>(['discovery', 'channel_profile_snapshot', 'finding', 'experiment']);
const immutable = new Set<SocialFactoryKindV1>(['observation', 'decision', 'exchange', 'action', 'publication_binding']);

/** All reads/writes carry tenant scope; tombstones prevent stale recreation. */
@Injectable()
export class SocialFactoryRepository implements SocialFactoryStoreV1 {
  constructor(private readonly database: PrismaRepository<any>, private readonly transaction: PrismaTransaction) {}
  private bound?: any;
  private client(): any { return this.bound ?? this.database.model; }
  /** Authority transition and native publication claim commit or roll back together. */
  async claimNativePublication(key: PublicationKeyV106, authorize: (store: SocialFactoryStoreV1, post: any) => Promise<void>): Promise<PublicationResultV106> {
    return this.transact(async store => {
      const client = (store as SocialFactoryRepository).client();
      const journal = new PublicationStoreV106(client);
      const existing = await journal.inspect(key);
      if (existing.status !== 'ready') return existing;
      const post = await client.post.findFirst({ where: { organizationId: key.organizationId, id: key.postId,
        integrationId: key.integrationId, deletedAt: null }, include: { integration: true } });
      if (!post) return { status: 'refused' };
      await authorize(store, post);
      const claim = await journal.claim(key);
      if (claim.status !== 'claimed') throw new SocialFactoryError('SOCIAL_FACTORY_PUBLICATION_CLAIM_CHANGED');
      return claim;
    });
  }
  async transact<T>(work: (store: SocialFactoryStoreV1) => Promise<T>): Promise<T> {
    if (this.bound) return work(this);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await (this.transaction.model as any).$transaction(async (client: any) => {
          const scoped = new SocialFactoryRepository(this.database, this.transaction);
          scoped.bound = client;
          return work(scoped);
        }, { isolationLevel: 'Serializable' });
      } catch (error: any) {
        if (error?.code !== 'P2034' || attempt === 2) throw error;
      }
    }
    throw new SocialFactoryError('SOCIAL_FACTORY_BUSY', 'Concurrent update. Retry the operation.', 503);
  }
  /** The permission writer shares the exact source-row and permission CAS transaction with revocation. */
  transactSourcePermission<T>(work: (store: SocialFactoryStoreV1, client: Pick<Prisma.TransactionClient, 'contentSource' | 'socialFactoryRecord'>) => Promise<T>): Promise<T> {
    return this.transact(store => work(store, (store as SocialFactoryRepository).bound));
  }
  /** Save a video plan and its exact draft revision together; neither may survive a failed CAS. */
  transactVideoDraft<T>(work: (store: SocialFactoryStoreV1, client: Pick<Prisma.TransactionClient, 'videoPromptDraft' | 'contentPiece' | 'videoSubscriptionConnection' | 'videoSubscriptionJob' | 'socialFactoryRecord' | 'media'>) => Promise<T>): Promise<T> {
    return this.transact(store => work(store, (store as SocialFactoryRepository).bound));
  }
  async read<T>(organizationId: string, kind: SocialFactoryKindV1, id: string): Promise<SocialFactoryRecordV1<T> | null> {
    return this.client().socialFactoryRecord.findFirst({ where: { organizationId, kind, id, ...this.live() } });
  }
  /** Internal recovery dispatch lists identifiers only; every worker rechecks tenant/actor/source/CAS. */
  pendingLocalCompositionsV2():Promise<{organizationId:string;id:string;parentId:string|null}[]>{
    return this.client().socialFactoryRecord.findMany({where:{kind:'editorial',...this.live(),AND:[
      {payload:{path:['type'],equals:'local_composition_v2'}},
      {OR:['queued','running'].map(state=>({payload:{path:['state'],equals:state}}))},
    ]},select:{organizationId:true,id:true,parentId:true},orderBy:{updatedAt:'asc'},take:100});
  }
  async readSourcePermissionState<T>(organizationId: string, sourceId: string): Promise<SourcePermissionStateV1<T>> {
    try { const record = await this.client().socialFactoryRecord.findFirst({ where: { organizationId, kind: 'source_permission', id: sourceId } });
      return record ? { state: 'present', record } : { state: 'absent' };
    } catch { return { state: 'unknown' }; }
  }
  async assertArtifactSource(organizationId:string,actorId:string,source:SourceArtifactRefV1):Promise<void>{
    if(!this.bound)return this.transact(store=>store.assertArtifactSource!(organizationId,actorId,source));
    await assertSourceArtifactCurrentV1(this.bound,organizationId,actorId,source);
  }
  async assertSourceAdmissions(organizationId: string, admissions: SourceAdmissionV1[]): Promise<void> {
    if (!this.bound) throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_TRANSACTION_REQUIRED');
    await assertSourceAdmissionsV1(this.bound, organizationId, admissions);
  }
  /** A same-scope permission extension renews only deadlines inferred by native generation writers.
   * These kinds have no independent explicit expiry in their owning domain services.
   * Cache/measurement/finding TTLs and earlier limits of other sources are never extended.
   */
  async renewSourceRetention(organizationId: string, sourceId: string, previousExpiry: Date): Promise<void> {
    if (!this.bound) throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_TRANSACTION_REQUIRED');
    const rows = await this.bound.socialFactoryRecord.findMany({where:{organizationId,deletedAt:null,invalidatedAt:null,sourceIds:{has:sourceRef(sourceId)},expiresAt:previousExpiry,kind:{in:['editorial','campaign_item','action','decision','publication_binding']}}});
    for (const row of rows) {
      const admissions = row.payload?.sourceAdmissions ?? row.payload?.material?.settings?.sourceAdmissions ?? [];
      const evidence = row.payload?.material?.evidence ?? row.payload?.evidence ?? [];
      const deadlines: number[] = [];
      let known = true;
      for (const ref of row.sourceIds.filter((value:string)=>value.startsWith('source:'))) {
        const id = ref.slice(7), source = await this.bound.contentSource.findFirst({where:{organizationId,id},include:{currentSnapshot:true}});
        if (!source || source.archivedAt || source.purgedAt || source.rightsState !== 'CONFIRMED') { known=false;break; }
        const originalSnapshotId = admissions.find((stamp:any)=>stamp.sourceId===id)?.snapshotId ?? evidence.find((entry:any)=>entry.sourceId===id)?.sourceRevision;
        const snapshot = originalSnapshotId ? await this.bound.sourceSnapshot.findFirst({where:{organizationId,sourceId:id,id:originalSnapshotId}}) : source.currentSnapshot;
        if (!snapshot || snapshot.purgedAt) { known=false;break; }
        if (snapshot.retentionUntil) deadlines.push(new Date(snapshot.retentionUntil).getTime());
        const permission = await this.bound.socialFactoryRecord.findFirst({where:{organizationId,kind:'source_permission',id}});
        if (permission) {
          if(permission.deletedAt || permission.invalidatedAt || permission.payload?.revokedAt){known=false;break;}
          for(const value of [permission.expiresAt,permission.payload?.expiresAt])if(value)deadlines.push(new Date(value).getTime());
        }
      }
      if(!known || !deadlines.length || deadlines.some(value=>!Number.isFinite(value)))continue;
      const expiresAt=new Date(Math.min(...deadlines));
      // An earlier independent source deadline still wins, including after grant renewal.
      if(expiresAt.getTime()<=previousExpiry.getTime())continue;
      const changed=await this.bound.socialFactoryRecord.updateMany({where:{organizationId,kind:row.kind,id:row.id,revision:row.revision,expiresAt:previousExpiry,deletedAt:null,invalidatedAt:null},data:{expiresAt,revision:{increment:1}}});
      if(changed.count!==1)throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
    }
  }
  /** Locks the native brand rows before derived-profile persistence, never a copied social-factory key. */
  async assertBrandProfileVersion(organizationId: string, expected: { profileId: string; versionId: string; contentDigest: string }): Promise<void> {
    if (!this.bound) throw new SocialFactoryError('SOCIAL_FACTORY_BRAND_TRANSACTION_REQUIRED');
    const profile = await this.bound.projectBrandProfile.findFirst({ where: { organizationId, id: expected.profileId, deletedAt: null } });
    const version = profile && await this.bound.projectBrandProfileVersion.findFirst({ where: { organizationId, id: expected.versionId, profileId: expected.profileId, lifecycle: 'PUBLISHED', contentDigest: expected.contentDigest } });
    let valid = false;
    try { valid = !!version && digestBrandProfileContent(version.content) === expected.contentDigest; } catch {}
    if (!valid) throw new SocialFactoryError('SOCIAL_FACTORY_BRAND_VERSION_UNAVAILABLE');
    const locked = await this.bound.projectBrandProfile.updateMany({ where: { organizationId, id: profile.id, deletedAt: null, updatedAt: profile.updatedAt }, data: { updatedAt: profile.updatedAt } });
    if (locked.count !== 1) throw new SocialFactoryError('SOCIAL_FACTORY_BRAND_VERSION_UNAVAILABLE');
    const lockedVersion = await this.bound.projectBrandProfileVersion.updateMany({ where: { organizationId, id: version.id, profileId: profile.id, lifecycle: 'PUBLISHED', contentDigest: expected.contentDigest, revision: version.revision }, data: { updatedAt: version.updatedAt } });
    if (lockedVersion.count !== 1) throw new SocialFactoryError('SOCIAL_FACTORY_BRAND_VERSION_UNAVAILABLE');
  }
  private live(): { deletedAt: null; invalidatedAt: null; OR: ({ expiresAt: null } | { expiresAt: { gt: Date } })[] } { return { deletedAt: null, invalidatedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }; }
  async page<T>(organizationId: string, kind: SocialFactoryKindV1, query: { cursor?: string; limit?: number; parentId?: string } = {}): Promise<{ items: SocialFactoryRecordV1<T>[]; nextCursor: string | null }> {
    const take = Math.min(1000, Math.max(1, query.limit ?? 100));
    const rows = await this.client().socialFactoryRecord.findMany({
      where: { organizationId, kind, ...this.live(), ...(query.cursor ? { id: { gt: query.cursor } } : {}), ...(query.parentId === undefined ? {} : { parentId: query.parentId }) },
      orderBy: { id: 'asc' }, take: take + 1,
    });
    const more = rows.length > take;
    const items = rows.slice(0, take);
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  }
  async list<T>(organizationId: string, kind: SocialFactoryKindV1, limit = 10000, parentId?: string): Promise<SocialFactoryRecordV1<T>[]> {
    const items: SocialFactoryRecordV1<T>[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.page<T>(organizationId, kind, { cursor, parentId, limit: Math.min(1000, limit - items.length) });
      items.push(...page.items);
      if (!page.nextCursor) return items;
      if (items.length >= limit) throw new SocialFactoryError('SOCIAL_FACTORY_PAGE_REQUIRED', 'Use cursor pagination to read this collection.', 400);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  }
  private async redactCascade(organizationId: string, initial: any[], stamp: Date, expiry = false): Promise<number> {
    const queue = [...initial];
    const seen = new Set<string>();
    let count = 0;
    while (queue.length) {
      const row = queue.shift()!;
      const key = resourceRef(row.kind, row.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const children = await this.client().socialFactoryRecord.findMany({ where: {
        organizationId, deletedAt: null, sourceIds: { has: key },
      } });
      if (!expiry || !staleInputKinds.has(row.kind)) queue.push(...children);
      if (row.kind === 'action' && ['native_material_receipt','native_material_revision'].includes(row.payload?.type)) {
        const material = row.payload.material;
        if (material?.pieceId && material?.derivationId) {
          // Only native copies proven to be created by our immutable generation receipt.
          await this.client().contentPiece.updateMany({ where: { organizationId, id: material.pieceId }, data: { body: '', brief: { redacted: true }, title: 'Source removed' } });
          const derivations = await this.client().contentDerivation.findMany({ where: { organizationId, id: material.derivationId, contentPieceId: material.pieceId }, select: { postId: true } });
          await this.client().contentDerivation.updateMany({ where: { organizationId, id: material.derivationId, contentPieceId: material.pieceId }, data: { body: null, title: null } });
          for (const derivation of derivations) if (derivation.postId) {
            const root = await this.client().post.findFirst({ where: { organizationId, id: derivation.postId }, select: { group: true } });
            const posts = root ? await this.client().post.findMany({ where: { organizationId, group: root.group }, select: { id: true, state: true, publicationJournal: true } }) : [];
            for (const post of posts) await this.client().post.updateMany({ where: { organizationId, id: post.id }, data: { content: '', image: '[]', settings: '{}', ...(!post.publicationJournal && post.state !== 'PUBLISHED' ? { state: 'DRAFT' } : {}) } });
          }
        }
      }
      const material = row.payload?.material;
      if (material && Array.isArray(material.assets) || row.kind === 'editorial' && Array.isArray(row.payload?.partialAssets) && row.sourceIds.some((ref: string) => ref.startsWith('source:'))) {
        const originals = new Set(material?.settings?.visualSourceMediaIds ?? row.payload?.baseInput?.visuals?.imageMediaIds ?? []);
        const ids = [...new Set([...(material?.assets ?? []).filter((asset: any) => asset.provenance?.sourceIds?.length).map((asset: any) => asset.mediaId), ...(row.kind === 'editorial' && row.sourceIds.some((ref: string) => ref.startsWith('source:')) ? (row.payload?.partialAssets ?? []).map((asset: any) => asset.id) : [])].filter(id => id && !originals.has(id)))];
        for (const mediaId of ids) {
          const media = await this.client().media.findFirst({ where: { organizationId, id: mediaId } });
          if (!media) continue;
          await this.client().media.updateMany({ where: { organizationId, id: mediaId }, data: { deletedAt: stamp } });
          const id = `generated-media:${mediaId}`;
          await this.client().socialFactoryRecord.upsert({ where: { organizationId_kind_id: { organizationId, kind: 'media_purge', id } },
            create: { organizationId, kind: 'media_purge', id, payload: { mediaId, path: media.path } }, update: {} });
        }
      }
      if (row.kind === 'editorial' && row.sourceIds.some((ref: string) => ref.startsWith('source:')) && typeof row.payload?.unregisteredAsset?.path === 'string') {
        const path = row.payload.unregisteredAsset.path;
        const id = `generated-path:${createHash('sha256').update(path).digest('hex')}`;
        await this.client().socialFactoryRecord.upsert({where:{organizationId_kind_id:{organizationId,kind:'media_purge',id}},create:{organizationId,kind:'media_purge',id,payload:{path}},update:{}});
      }
      // Owner-authored settings are separate from derived snapshots and never source-owned.
      if (['channel_profile', 'campaign', 'grant', 'source_recommendation'].includes(row.kind)) continue;
      let payload: any = { redacted: true };
      let invalidatedAt: Date | null = stamp;
      if (row.kind === 'campaign_item') {
        const previous = row.payload;
        const { material, approval, ...plan } = previous;
        payload = { ...plan, contentRevision: previous.contentRevision + 1,
          state: previous.state === 'published' ? 'published' : ['submitting','uncertain'].includes(previous.state) ? 'uncertain' : 'needs_input',
          blocker: { code: 'SOURCE_REVOKED', detail: 'Source-derived content was removed. Supply permitted evidence and prepare a new revision.' } };
        invalidatedAt = null;
      }
      if (row.kind === 'publication_binding') {
        payload = { campaignId: row.payload.campaignId, itemId: row.payload.itemId, revoked: true };
        invalidatedAt = null;
      }
      const changed = await this.client().socialFactoryRecord.updateMany({ where: {
        organizationId, kind: row.kind, id: row.id, revision: row.revision,
      }, data: { payload, sourceIds: [], invalidatedAt, revision: { increment: 1 } } });
      if (changed.count !== 1) throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
      count++;
    }
    return count;
  }
  /** Canonical source identity is distinct from resource kind/id and evidence identity. */
  async invalidateBySource(organizationId: string, sourceId: string): Promise<number> {
    return this.transact(async store => {
      const scoped = store as SocialFactoryRepository;
      const rows = await scoped.client().socialFactoryRecord.findMany({ where: {
        organizationId, deletedAt: null, sourceIds: { has: sourceRef(sourceId) },
      } });
      return scoped.redactCascade(organizationId, rows, new Date());
    });
  }
  /** Traverses expired rows without the live-read predicate, physically clearing payloads. */
  async purgeExpired(organizationId: string, now = new Date()): Promise<number> {
    return this.transact(async store => {
      const scoped = store as SocialFactoryRepository;
      const rows = await scoped.client().socialFactoryRecord.findMany({ where: {
        organizationId, deletedAt: null, invalidatedAt: null, expiresAt: { lte: now },
      } });
      // Discovery/profile snapshots expire as planning caches. Staleness never revokes
      // storage rights or destroys already prepared/published native content.
      const caches = rows.filter((row: any) => staleInputKinds.has(row.kind));
      for (const row of caches) {
        const changed = await scoped.client().socialFactoryRecord.updateMany({where:{organizationId,kind:row.kind,id:row.id,revision:row.revision},data:{payload:{expired:true},sourceIds:[],invalidatedAt:now,revision:{increment:1}}});
        if(changed.count!==1)throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
      }
      return caches.length + await scoped.redactCascade(organizationId, rows.filter((row: any) => !staleInputKinds.has(row.kind)), now, true);
    });
  }
  async put<T>(input: SocialFactoryPutV1<T>): Promise<SocialFactoryRecordV1<T>> {
    const { organizationId, kind, id, payload, expectedRevision, parentId, sourceIds } = input;
    let expiresAt = input.expiresAt;
    if (sourceIds?.some(ref => ref.startsWith('source:'))) {
      const deadlines: number[] = expiresAt ? [expiresAt.getTime()] : [];
      for (const ref of sourceIds.filter(ref => ref.startsWith('source:'))) {
        const sourceId = ref.slice(7);
        const source = await this.client().contentSource?.findFirst({ where: { organizationId, id: sourceId }, include: { currentSnapshot: true } });
        if (!source) continue;
        for (const value of [source.currentSnapshot?.retentionUntil]) if (value) deadlines.push(new Date(value).getTime());
        const permission = await this.client().socialFactoryRecord.findFirst({ where: { organizationId, kind: 'source_permission', id: sourceId } });
        if (permission?.payload?.expiresAt) deadlines.push(Date.parse(permission.payload.expiresAt));
      }
      if (deadlines.length) expiresAt = new Date(Math.min(...deadlines));
    }
    if (!organizationId || !id || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new SocialFactoryError('SOCIAL_FACTORY_INVALID_INPUT', 'Invalid record identity or revision.', 400);
    }
    if (expectedRevision === 0) {
      try { return await this.client().socialFactoryRecord.create({ data: { organizationId, kind, id, payload, parentId, expiresAt, sourceIds } }); }
      catch (error: any) { if (error?.code === 'P2002') throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT'); throw error; }
    }
    if (immutable.has(kind)) throw new SocialFactoryError('SOCIAL_FACTORY_IMMUTABLE');
    const changed = await this.client().socialFactoryRecord.updateMany({
      where: { organizationId, kind, id, revision: expectedRevision, ...this.live() },
      data: { payload, ...(expiresAt === undefined ? {} : { expiresAt }), ...(sourceIds === undefined ? {} : { sourceIds }), ...(parentId === undefined ? {} : { parentId }), revision: { increment: 1 } },
    });
    if (changed.count !== 1) throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
    return (await this.read<T>(organizationId, kind, id))!;
  }
  async remove(organizationId: string, kind: SocialFactoryKindV1, id: string, expectedRevision: number): Promise<void> {
    await this.transact(async store => {
      const scoped = store as SocialFactoryRepository;
      // Expired/invalidated data still must be deletable; only the tombstone is excluded.
      const row = await scoped.client().socialFactoryRecord.findFirst({ where: { organizationId, kind, id, revision: expectedRevision, deletedAt: null } });
      if (!row) throw new SocialFactoryError('SOCIAL_FACTORY_CONFLICT');
      await scoped.redactCascade(organizationId, [row], new Date());
      await scoped.client().socialFactoryRecord.updateMany({ where: { organizationId, kind, id, deletedAt: null }, data: { payload: { redacted: true }, sourceIds: [], deletedAt: new Date(), revision: row.revision + 1 } });
    });
  }
}

export const sourceRef = (sourceId: string): string => `source:${sourceId}`;
export const resourceRef = (kind: SocialFactoryKindV1, id: string): string => `resource:${kind}:${id}`;

/** Called inside the SAME serializable transaction that writes derived content/native drafts. */
export async function assertSourceAdmissionsV1(client: any, organizationId: string, admissions: SourceAdmissionV1[], now = new Date()): Promise<void> {
  for (const stamp of admissions) {
    // Prisma's compare-and-set update takes the row lock; revocation cannot slip between validation and material commit.
    const source = await client.contentSource.updateMany({ where: {
      organizationId, id: stamp.sourceId, configVersion: stamp.sourceConfigVersion, archivedAt: null, purgedAt: null, desiredState: 'ACTIVE', usagePurpose: 'EVIDENCE', rightsState: 'CONFIRMED',
      OR: [{ kind: 'MANUAL' }, { freshUntil: { gt: now } }],
      currentSnapshotId: stamp.snapshotId, rightsConfirmedAt: stamp.rightsConfirmedAt ? new Date(stamp.rightsConfirmedAt) : null,
      currentSnapshot: { is: { purgedAt: null, supersededAt: null, OR: [{ retentionUntil: null }, { retentionUntil: { gt: now } }] } },
    }, data: { configVersion: stamp.sourceConfigVersion } });
    if (source.count !== 1) throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_CHANGED');
    const permission = await client.socialFactoryRecord.findFirst({ where: { organizationId, kind: 'source_permission', id: stamp.sourceId } });
    if (stamp.permissionRevision === null) {
      if (permission) throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
    } else {
      if (!permission || permission.revision !== stamp.permissionRevision || permission.deletedAt || permission.invalidatedAt ||
          permission.expiresAt && permission.expiresAt <= now || permission.payload.revokedAt ||
          !Number.isFinite(Date.parse(permission.payload.expiresAt)) || Date.parse(permission.payload.expiresAt) <= now.getTime()) throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
      const claimed = await client.socialFactoryRecord.updateMany({ where: { organizationId, kind: 'source_permission', id: stamp.sourceId,
        revision: stamp.permissionRevision, deletedAt: null, invalidatedAt: null }, data: { revision: stamp.permissionRevision } });
      if (claimed.count !== 1) throw new SocialFactoryError('SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
    }
  }
}
