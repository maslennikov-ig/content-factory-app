import { createHash } from 'node:crypto';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import { VoiceService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { ContentFactService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service';
import { ContentLeadService } from '@contentfactory/nestjs-libraries/content-intelligence/leads/content-lead.service';
import { VideoJobService } from '@contentfactory/nestjs-libraries/videos/video-job.service';
import type { VideoAccessService as UnifiedVideoAccessService } from '@contentfactory/nestjs-libraries/videos/video-access.service';
import { MediaService } from '@contentfactory/nestjs-libraries/database/prisma/media/media.service';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import type { AgentArtifactRef, AgentWorkContextV1 } from '../capabilities/agent-parts.contract';
import type { CapabilityGate } from '../capabilities/capability.admission';
import type { CapabilityDeclaration, CapabilityIdentity } from '../capabilities/capability.types';
import type { CapabilityServices } from '../capabilities/mastra.adapter';
import {
  AgentWorkContextError,
  boundedWorkData,
  forbiddenWorkContext,
  missingWorkContext,
  parseAgentWorkContext,
  staleWorkContext,
  workContextForArtifact,
  type ResolvedAgentWorkContext,
} from './work-context';

type ResolverDependencies = {
  services: CapabilityServices;
  gate: CapabilityGate;
  capabilities: readonly CapabilityDeclaration[];
};

/**
 * A selected card is never content authority. This reader borrows the existing
 * read door's policy and reconstructs content through its tenant-scoped service.
 * No model, publication, write capability or client prompt is called here.
 */
export class AgentWorkContextResolver {
  constructor(private readonly deps: ResolverDependencies) {}

  private async allow(identity: CapabilityIdentity, capabilityId: string) {
    const capability = this.deps.capabilities.find((one) => one.id === capabilityId);
    if (!capability || !(await this.deps.gate.check(capability.door, identity)).allowed) throw forbiddenWorkContext();
  }

  private async videoJob(identity: CapabilityIdentity, id: string): Promise<any> {
    await this.allow(identity, 'video.status');
    try { return await this.deps.services(VideoJobService).get(identity.organizationId, id); }
    catch (error: any) {
      if (error?.getResponse?.()?.code !== 'VIDEO_JOB_NOT_FOUND' || !this.deps.capabilities.some(c => c.id === 'video.status_v2')) throw error;
      await this.allow(identity, 'video.status_v2');
      const {VideoAccessService} = require('@contentfactory/nestjs-libraries/videos/video-access.service');
      return this.deps.services<UnifiedVideoAccessService>(VideoAccessService).get(identity.organizationId, identity.userId, id);
    }
  }

  private async channel(identity: CapabilityIdentity, id: string) {
    await this.allow(identity, 'channel.open');
    const integrations = this.deps.services(IntegrationService);
    const row = (await integrations.getIntegrationsForChannelList(identity.organizationId)).find((one) => one.id === id);
    if (!row || row.inBetweenSteps) throw missingWorkContext();
    const writing = await integrations.getWritingProfile(identity.organizationId, id);
    return { id: row.id, name: row.name, platform: row.providerIdentifier, disabled: !!row.disabled, writing: writing.profile ?? null };
  }

  async resolve(
    identity: CapabilityIdentity,
    input: AgentWorkContextV1,
    /** Stored selections are refreshed; an explicit stale client revision fails. */
    options: { refresh?: boolean } = {}
  ): Promise<ResolvedAgentWorkContext> {
    const target = parseAgentWorkContext(input);
    if (!target) throw missingWorkContext();
    let data: Record<string, unknown>;
    let canonical: AgentWorkContextV1 = { ...target };
    delete canonical.revision;
    try {
      switch (target.kind) {
        case 'piece':
        case 'adaptation':
        case 'plan': {
          const variantId = target.kind === 'piece' ? undefined : target.id ?? target.adaptationId;
          const pieceId = target.kind === 'piece' ? target.id ?? target.pieceId : target.pieceId;
          await this.allow(identity, pieceId ? 'piece.open' : target.kind === 'piece' ? 'piece.list' : 'plan.ready');
          if (!pieceId) {
            if (target.channelId) await this.channel(identity, target.channelId);
            data = { section: target.kind, ...(target.channelId ? { channelId: target.channelId } : {}), ...(target.from ? { from: target.from, to: target.to } : {}) };
            break;
          }
          const detail = await this.deps.services(PieceService).detail(identity.organizationId, pieceId, identity.language);
          if (detail.piece?.id !== pieceId) throw missingWorkContext();
          const core = detail.core;
          data = {
            pieceId,
            code: detail.piece.code,
            title: detail.piece.title,
            currentText: core?.text ?? detail.legacyBody ?? null,
            task: core?.instructionText ?? null,
            originalMaterial: detail.sentText ?? core?.inputText ?? core?.personText ?? core?.sourceText ?? null,
            brief: core?.brief ?? null,
            questions: core?.questions ?? null,
            addedMaterial: core?.addedMaterial ?? [],
            materialPending: core?.materialPending === true,
            source: core?.leadSource ?? null,
            postLink: core?.postLink ?? null,
            archived: !!detail.piece.archivedAt,
          };
          if (variantId) {
            const variant = detail.adaptations.find((one) => one.id === variantId);
            if (!variant || (target.channelId && variant.integrationId !== target.channelId)) throw missingWorkContext();
            const channelId = variant.integrationId ?? undefined;
            if (channelId) await this.channel(identity, channelId);
            canonical = { ...canonical, id: variantId, adaptationId: variantId, pieceId, ...(channelId ? { channelId } : {}) };
            // The selected variant is what the person is discussing; keep it
            // before the core when bounded data has to omit later material.
            data = { adaptationId: variantId, currentText: variant.body ?? null, state: variant.state, plan: variant.plan ?? null, channelId, piece: data };
          } else {
            canonical = { ...canonical, id: pieceId };
          }
          break;
        }
        case 'avatar': {
          await this.allow(identity, 'avatar.list');
          if (!target.id) { data = { section: 'avatar' }; break; }
          const voice = this.deps.services(VoiceService);
          const actor = { organizationId: identity.organizationId, userId: identity.userId, canManage: isOrganizationEditor(identity.role), locale: identity.language };
          const row = (await voice.avatars(actor)).avatars.find((one) => one.id === target.id);
          if (!row) throw missingWorkContext();
          // The active passport is read-only. Loading a proposal draft can
          // create one and is deliberately outside this context read.
          const passport = await voice.passport({ ...actor, avatarId: target.id });
          data = { avatarId: row.id, name: row.name, analysed: row.analysed, voice: passport.voice };
          break;
        }
        case 'channel': {
          const channelId = target.id ?? target.channelId;
          if (!channelId) { await this.allow(identity, 'channels.list'); data = { section: 'channel' }; break; }
          canonical = { ...canonical, id: channelId };
          data = await this.channel(identity, channelId);
          break;
        }
        case 'calendar': {
          await this.allow(identity, 'plan.calendar');
          if (target.id) throw missingWorkContext();
          if (target.channelId) await this.channel(identity, target.channelId);
          data = { section: 'calendar', ...(target.channelId ? { channelId: target.channelId } : {}), ...(target.from ? { from: target.from, to: target.to } : {}) };
          break;
        }
        case 'facts': {
          await this.allow(identity, 'facts.list');
          if (!target.id || target.id === 'facts') { data = { section: 'facts' }; break; }
          const fact = await this.deps.services(ContentFactService).fact(identity.organizationId, target.id);
          if (!fact) throw missingWorkContext();
          data = { factId: fact.id, statement: fact.statement, status: fact.status, verifiedAt: fact.verifiedAt, freshUntil: fact.freshUntil };
          break;
        }
        case 'ideas': {
          await this.allow(identity, 'ideas.list');
          if (!target.id || target.id === 'leads') { data = { section: 'ideas' }; break; }
          const lead = await this.deps.services(ContentLeadService).getLead(identity.organizationId, target.id);
          if (!lead) throw missingWorkContext();
          const row = lead as unknown as Record<string, unknown>;
          data = { leadId: target.id, title: row.title, summary: row.summary, url: row.url, status: row.status };
          break;
        }
        case 'media': {
          if (target.videoJobId || target.videoDraftId) {
            const videos = this.deps.services(VideoJobService);
            let job: Awaited<ReturnType<VideoJobService['get']>> | undefined;
            if (target.videoJobId) {
              job = await this.videoJob(identity, target.videoJobId);
              if (target.pieceId && job.pieceId !== target.pieceId || target.videoDraftId && job.draftId !== target.videoDraftId) throw missingWorkContext();
            }
            const draftId = target.videoDraftId ?? job?.draftId;
            let draft: Awaited<ReturnType<VideoJobService['readDraft']>> | undefined;
            if (draftId) {
              await this.allow(identity, 'video.draft');
              draft = await videos.readDraft(identity.organizationId, draftId);
              if (target.pieceId && draft.pieceId !== target.pieceId || job && draft.pieceId !== job.pieceId) throw missingWorkContext();
            }
            canonical = {...canonical, id: 'library', pieceId: draft?.pieceId ?? job?.pieceId};
            // Current editable content gets the bounded context budget before
            // job metadata; an old submitted script must not consume it first.
            const jobState = job ? Object.fromEntries(Object.entries(job).filter(([key]) => key !== 'snapshot')) : undefined;
            data = {section: 'media', ...(draft ? {videoDraft: draft} : {}), ...(jobState ? {videoJob: jobState} : {})};
            break;
          }
          await this.allow(identity, 'media.library');
          if (!target.id || target.id === 'library') { data = { section: 'media' }; break; }
          const media = (await this.deps.services(MediaService).mediaInWorkspace(identity.organizationId, [target.id])).find((one) => one.id === target.id);
          if (!media) throw missingWorkContext();
          data = { mediaId: media.id, name: media.originalName ?? media.name };
          break;
        }
        case 'workspace': {
          await this.allow(identity, 'workspace.snapshot');
          if (target.id && target.id !== 'workspace' && target.id !== identity.organizationId) throw missingWorkContext();
          data = { section: 'workspace' };
          break;
        }
      }
    } catch (error) {
      if (error instanceof AgentWorkContextError) throw error;
      const serviceError = error as { code?: unknown; status?: number; getStatus?: () => number; getResponse?: () => unknown };
      const response = serviceError.getResponse?.() as { code?: unknown } | undefined;
      const code = serviceError.code ?? response?.code;
      const status = serviceError.getStatus?.() ?? serviceError.status;
      if (status === 404 || (typeof code === 'string' && /NOT_FOUND|UNKNOWN$/.test(code))) throw missingWorkContext();
      if (status === 403) throw forbiddenWorkContext();
      // A database/policy outage is never mistaken for an absent target.
      throw error;
    }
    const revision = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    if (!options.refresh && target.revision && target.revision !== revision) throw staleWorkContext();
    return { context: { ...canonical, revision }, ...boundedWorkData(data) };
  }

  async validateArtifact(identity: CapabilityIdentity, ref: AgentArtifactRef): Promise<AgentArtifactRef> {
    if (ref.kind === 'media' && (ref.videoJobId || ref.videoDraftId)) {
      const jobs = this.deps.services(VideoJobService);
      if (ref.videoJobId) {
        const job = await this.videoJob(identity, ref.videoJobId);
        if (ref.pieceId && job.pieceId !== ref.pieceId) throw missingWorkContext();
        if (ref.videoDraftId && job.draftId !== ref.videoDraftId) throw missingWorkContext();
      }
      if (ref.videoDraftId) {
        await this.allow(identity, 'video.draft');
        const draft = await jobs.readDraft(identity.organizationId, ref.videoDraftId);
        if (ref.pieceId && draft.pieceId !== ref.pieceId) throw missingWorkContext();
      }
    }
    await this.resolve(identity, workContextForArtifact(ref));
    return ref;
  }
}
