import { HttpException, Injectable } from '@nestjs/common';
import { Prisma, VideoGenerationJob } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { serializableWithRetry } from '../serializable.transaction';

export const VIDEO_PENDING_V1 = ['accepted', 'submitting', 'queued', 'running', 'saving'];
const json = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class VideoGenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  piece(organizationId: string, id: string) {
    return this.prisma.contentPiece.findFirst({ where: { organizationId, id, archivedAt: null } });
  }
  references(organizationId: string, ids: string[]) {
    return this.prisma.media.findMany({ where: { organizationId, id: { in: ids }, deletedAt: null } });
  }
  createDraft(data: {organizationId: string; userId: string; pieceId: string; pieceRevision: string; brief: unknown; settings: unknown}) {
    return this.prisma.videoPromptDraft.create({ data: {...data, brief: json(data.brief), settings: json(data.settings)} });
  }
  draft(organizationId: string, id: string) {
    return this.prisma.videoPromptDraft.findFirst({ where: {organizationId, id} });
  }
  drafts(organizationId: string, pieceId?: string) {
    return this.prisma.videoPromptDraft.findMany({ where: {organizationId, ...(pieceId ? {pieceId} : {})}, orderBy: {updatedAt: 'desc'}, take: 50 });
  }
  async editDraft(organizationId: string, id: string, version: number, brief: unknown, settings: unknown) {
    const changed = await this.prisma.videoPromptDraft.updateMany({ where: {organizationId, id, version}, data: {brief: json(brief), settings: json(settings), version: {increment: 1}, preflight: Prisma.DbNull} });
    if (!changed.count) throw new HttpException({code: 'VIDEO_DRAFT_CHANGED'}, 409);
    return this.draft(organizationId, id);
  }
  async preflight(organizationId: string, id: string, version: number, value: unknown) {
    const changed = await this.prisma.videoPromptDraft.updateMany({where: {organizationId, id, version}, data: {preflight: json(value)}});
    if (!changed.count) throw new HttpException({code: 'VIDEO_DRAFT_CHANGED'}, 409);
  }

  /** Reserve the explicit monetary policy alongside the durable identity, atomically. */
  async launch(data: Prisma.VideoGenerationJobUncheckedCreateInput, monthlyBudgetUsd: number) {
    try {
      return await serializableWithRetry(this.prisma, async tx => {
        const existing = await tx.videoGenerationJob.findUnique({where: {organizationId_intentId: {organizationId: data.organizationId, intentId: data.intentId}}});
        if (existing) {
          if (existing.draftId !== data.draftId || existing.draftVersion !== data.draftVersion || existing.preflightId !== data.preflightId) throw new HttpException({code: 'VIDEO_INTENT_MISMATCH'}, 409);
          return existing;
        }
        const accepted = await tx.videoGenerationJob.findUnique({where: {organizationId_preflightId: {organizationId: data.organizationId, preflightId: data.preflightId}}});
        if (accepted) return accepted;
        const draft = await tx.videoPromptDraft.findFirst({where: {id: data.draftId, organizationId: data.organizationId, version: data.draftVersion}});
        const expected = (data.snapshot as any)?.preflightId;
        if (!draft || (draft.preflight as any)?.preflightId !== expected) throw new HttpException({code: 'VIDEO_PREFLIGHT_STALE'}, 409);
        const start = new Date();
        start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
        const jobs = await tx.videoGenerationJob.findMany({where: {organizationId: data.organizationId, provider: data.provider, payer: data.payer, createdAt: {gte: start}}, select: {reservedUsd: true, costUsd: true}});
        const reserved = jobs.reduce((sum, job) => sum + (job.costUsd === null ? Number(job.reservedUsd) : Number(job.costUsd)), 0);
        if (reserved + Number(data.reservedUsd) > monthlyBudgetUsd + 0.00000001) throw new HttpException({code: 'VIDEO_MONTHLY_BUDGET_EXHAUSTED'}, 429);
        return tx.videoGenerationJob.create({data});
      }, 'Video admission is busy; retry the same intent.');
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await this.prisma.videoGenerationJob.findFirst({where: {organizationId: data.organizationId, OR: [{intentId: data.intentId}, {preflightId: data.preflightId}]}});
        if (existing && existing.draftId === data.draftId && existing.draftVersion === data.draftVersion && existing.preflightId === data.preflightId) return existing;
      }
      throw error;
    }
  }
  byIntent(organizationId: string, intentId: string) {
    return this.prisma.videoGenerationJob.findUnique({where: {organizationId_intentId: {organizationId, intentId}}});
  }
  job(organizationId: string, id: string) {
    return this.prisma.videoGenerationJob.findFirst({where: {organizationId, id}});
  }
  jobs(organizationId: string, pieceId?: string) {
    return this.prisma.videoGenerationJob.findMany({where: {organizationId, ...(pieceId ? {pieceId} : {})}, orderBy: {createdAt: 'desc'}, take: 50});
  }
  pending() {
    return this.prisma.videoGenerationJob.findMany({where: {state: {in: VIDEO_PENDING_V1}}, select: {organizationId: true, id: true, runCycle: true}, take: 500, orderBy: {updatedAt: 'asc'}});
  }
  async claim(organizationId: string, id: string, owner: string) {
    const result = await this.prisma.videoGenerationJob.updateMany({where: {organizationId, id, state: {in: VIDEO_PENDING_V1}, OR: [{leaseUntil: null}, {leaseUntil: {lt: new Date()}}]}, data: {leaseOwner: owner, leaseUntil: new Date(Date.now() + 180_000)}});
    return result.count === 1;
  }
  async write(organizationId: string, id: string, owner: string, data: Prisma.VideoGenerationJobUpdateManyMutationInput) {
    const result = await this.prisma.videoGenerationJob.updateMany({where: {organizationId, id, leaseOwner: owner, leaseUntil: {gt: new Date()}}, data});
    if (result.count !== 1) throw new Error('VIDEO_JOB_LEASE_LOST');
  }
  release(organizationId: string, id: string, owner: string) {
    return this.prisma.videoGenerationJob.updateMany({where: {organizationId, id, leaseOwner: owner}, data: {leaseOwner: null, leaseUntil: null}});
  }
  async retrySave(organizationId: string, id: string) {
    const changed = await this.prisma.videoGenerationJob.updateMany({where: {organizationId, id, state: 'save_failed'}, data: {state: 'saving', errorCode: null, saveAttempts: 0, runCycle: {increment: 1}, leaseOwner: null, leaseUntil: null}});
    if (!changed.count) throw new HttpException({code: 'VIDEO_SAVE_RETRY_UNAVAILABLE'}, 409);
    return this.job(organizationId, id);
  }
  async attachResult(job: VideoGenerationJob, owner: string, file: {name: string; path: string; size: number}) {
    return this.prisma.$transaction(async tx => {
      const fresh = await tx.videoGenerationJob.findFirst({where: {id: job.id, organizationId: job.organizationId, leaseOwner: owner, leaseUntil: {gt: new Date()}}});
      if (!fresh) throw new Error('VIDEO_JOB_LEASE_LOST');
      if (fresh.resultMediaId) return;
      const media = await tx.media.create({data: {organizationId: job.organizationId, name: file.name, originalName: `video-${job.id}.mp4`, path: file.path, type: 'video', fileSize: file.size}});
      const attached = await tx.videoGenerationJob.updateMany({
        where: {id: job.id, organizationId: job.organizationId, state: 'saving', resultMediaId: null, leaseOwner: owner, leaseUntil: {gt: new Date()}},
        data: {state: 'completed', resultMediaId: media.id, finishedAt: new Date(), errorCode: null},
      });
      // A stale importer rolls back its Media insert as part of this transaction.
      if (attached.count !== 1) throw new Error('VIDEO_JOB_LEASE_LOST');
    });
  }
  media(organizationId: string, id: string) {
    return this.prisma.media.findFirst({where: {organizationId, id, deletedAt: null}, select: {id: true, name: true, path: true, type: true}});
  }
  finishUsage(organizationId: string, id: string | null, success: boolean, costUsd?: number) {
    if (!id) return Promise.resolve();
    return this.prisma.aiUsageRecord.updateMany({where: {id, organizationId}, data: {status: success ? 'succeeded' : 'failed', ...(costUsd !== undefined ? {costUsd} : {})}});
  }
}
