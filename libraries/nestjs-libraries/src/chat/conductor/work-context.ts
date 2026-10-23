import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import type {
  AgentArtifactRef,
  AgentWorkContextV1,
  AgentWorkspaceV1,
} from '../capabilities/agent-parts.contract';
import { redactSecretShapes } from './secret-shapes';

/** Only identities persist here. Product records remain the content authority. */
export const AGENT_WORKSPACE_METADATA_KEY = 'assistantWorkspace';
export const AGENT_WORK_CONTEXT_KEY = 'cf.workContext';
export const AGENT_WORK_ARTIFACTS_MAX = 24;
export const AGENT_WORK_CONTENT_MAX_CHARS = 16_000;
export const AGENT_WORK_CONTEXT_VERSION = 'assistant-work-context/v1' as const;
export const AGENT_WORKSPACE_VERSION = 'assistant-workspace/v1' as const;

export class AgentWorkContextError extends HttpException {
  constructor(status: number, message: string) {
    super({ code: status === 403 ? 'AGENT_NOT_YOURS' : 'AGENT_BAD_REQUEST', message }, status);
  }
}

export const invalidWorkContext = () => new AgentWorkContextError(400, 'The selected work context is not valid.');
export const missingWorkContext = () => new AgentWorkContextError(404, 'The selected object is not available in this workspace.');
export const forbiddenWorkContext = () => new AgentWorkContextError(403, 'This role cannot open the selected context.');
export const staleWorkContext = () => new AgentWorkContextError(409, 'The selected object changed. Reload it before continuing.');

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const date = z.string().max(35).refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const parsed = Date.parse(value);
  const day = value.slice(0, 10);
  return Number.isFinite(parsed) && !Number.isNaN(Date.parse(day)) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
});

const contextSchema = z.object({
  version: z.literal(AGENT_WORK_CONTEXT_VERSION),
  kind: z.enum(['workspace', 'piece', 'avatar', 'channel', 'adaptation', 'plan', 'calendar', 'ideas', 'facts', 'media']),
  id: id.optional(),
  pieceId: id.optional(),
  channelId: id.optional(),
  adaptationId: id.optional(),
  videoJobId: id.optional(),
  videoDraftId: id.optional(),
  from: date.optional(),
  to: date.optional(),
  revision: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).optional(),
}).strict().superRefine((value, ctx) => {
  const invalid = () => ctx.addIssue({ code: 'custom', message: 'Inconsistent context scope.' });
  if (value.kind === 'piece' && value.id && value.pieceId && value.id !== value.pieceId) invalid();
  if (value.kind === 'channel' && value.id && value.channelId && value.id !== value.channelId) invalid();
  if ((value.kind === 'adaptation' || value.kind === 'plan') && value.id && value.adaptationId && value.id !== value.adaptationId) invalid();
  if (value.kind === 'adaptation' && (!value.pieceId || !(value.id || value.adaptationId))) invalid();
  if (value.kind === 'plan' && (value.id || value.adaptationId) && !value.pieceId) invalid();
  if (value.kind === 'plan' && value.pieceId && !(value.id || value.adaptationId)) invalid();
  const video = !!(value.videoJobId || value.videoDraftId);
  if (video && (value.kind !== 'media' || value.id && value.id !== 'library')) invalid();
  if (value.pieceId && !['piece', 'adaptation', 'plan'].includes(value.kind) && !(value.kind === 'media' && video)) invalid();
  if (value.adaptationId && !['adaptation', 'plan'].includes(value.kind)) invalid();
  if (value.channelId && !['channel', 'adaptation', 'plan', 'calendar'].includes(value.kind)) invalid();
  if ((value.from || value.to) && !['calendar', 'plan'].includes(value.kind)) invalid();
  if (!!value.from !== !!value.to) invalid();
  if (value.from && value.to && (Date.parse(value.to) <= Date.parse(value.from) || Date.parse(value.to) - Date.parse(value.from) > 366 * 86_400_000)) invalid();
}) as z.ZodType<AgentWorkContextV1>;

const artifactSchema = z.object({
  kind: z.enum(['workspace', 'channels', 'piece', 'avatar', 'channel', 'adaptation', 'plan', 'ideas', 'facts', 'media']),
  id,
  pieceId: id.optional(),
  channelId: id.optional(),
  adaptationId: id.optional(),
  videoJobId: id.optional(),
  videoDraftId: id.optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.videoJobId || value.videoDraftId) && value.kind !== 'media') ctx.addIssue({ code: 'custom', message: 'Unexpected video scope.' });
  if (value.kind === 'media' && value.pieceId && !value.videoJobId && !value.videoDraftId) ctx.addIssue({ code: 'custom', message: 'Video scope is required.' });
  if ((value.kind === 'adaptation' || value.kind === 'plan') && !value.pieceId) ctx.addIssue({ code: 'custom', message: 'A variant names its piece.' });
  if (value.adaptationId && value.adaptationId !== value.id) ctx.addIssue({ code: 'custom', message: 'Conflicting variant ids.' });
  if (value.pieceId && !['piece', 'adaptation', 'plan', 'media'].includes(value.kind)) ctx.addIssue({ code: 'custom', message: 'Unexpected piece scope.' });
  if (value.kind === 'piece' && value.pieceId && value.pieceId !== value.id) ctx.addIssue({ code: 'custom', message: 'Conflicting piece ids.' });
  if (value.channelId && !['channel', 'adaptation', 'plan'].includes(value.kind)) ctx.addIssue({ code: 'custom', message: 'Unexpected channel scope.' });
  if (value.kind === 'channel' && value.channelId && value.channelId !== value.id) ctx.addIssue({ code: 'custom', message: 'Conflicting channel ids.' });
}) as z.ZodType<AgentArtifactRef>;

const patchSchema = z.object({
  workContext: contextSchema.nullable().optional(),
  artifacts: z.array(artifactSchema).max(AGENT_WORK_ARTIFACTS_MAX).optional(),
  activeArtifact: artifactSchema.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0) as z.ZodType<AgentWorkspacePatch>;

export type AgentWorkspacePatch = Pick<Partial<AgentWorkspaceV1>, 'workContext' | 'artifacts' | 'activeArtifact'>;
export type ResolvedAgentWorkContext = {
  context: AgentWorkContextV1;
  data: Record<string, unknown>;
  truncated: boolean;
};

export const parseAgentWorkContext = (value: unknown): AgentWorkContextV1 | null => {
  if (value === null) return null;
  const parsed = contextSchema.safeParse(value);
  if (!parsed.success) throw invalidWorkContext();
  return parsed.data;
};

export const parseAgentWorkspacePatch = (value: unknown): AgentWorkspacePatch => {
  const parsed = patchSchema.safeParse(value);
  if (!parsed.success) throw invalidWorkContext();
  return parsed.data;
};

export const emptyAgentWorkspace = (): AgentWorkspaceV1 => ({
  version: AGENT_WORKSPACE_VERSION, workContext: null, artifacts: [], activeArtifact: null,
});

/** Old or malformed metadata is inert; it never becomes prompt authority. */
export const readStoredAgentWorkspace = (metadata: Record<string, unknown> | undefined): AgentWorkspaceV1 => {
  const stored = metadata?.[AGENT_WORKSPACE_METADATA_KEY] as Partial<AgentWorkspaceV1> | undefined;
  if (stored?.version !== AGENT_WORKSPACE_VERSION) return emptyAgentWorkspace();
  const work = stored.workContext === null ? null : contextSchema.safeParse(stored.workContext);
  const artifacts = (Array.isArray(stored.artifacts) ? stored.artifacts : []).slice(-AGENT_WORK_ARTIFACTS_MAX).flatMap((ref) => {
    const parsed = artifactSchema.safeParse(ref);
    return parsed.success ? [parsed.data] : [];
  });
  const active = artifactSchema.safeParse(stored.activeArtifact);
  return {
    version: AGENT_WORKSPACE_VERSION,
    workContext: work && work.success ? work.data : null,
    artifacts,
    activeArtifact: active.success && artifacts.some((ref) => sameAgentArtifact(ref, active.data)) ? active.data : null,
  };
};

export const sameAgentArtifact = (left: AgentArtifactRef, right: AgentArtifactRef) =>
  left.kind === right.kind && left.id === right.id && left.pieceId === right.pieceId &&
  left.videoJobId === right.videoJobId && left.videoDraftId === right.videoDraftId;

export const workContextForArtifact = (ref: AgentArtifactRef): AgentWorkContextV1 => ({
  version: AGENT_WORK_CONTEXT_VERSION,
  kind: ref.kind === 'channels' ? 'channel' : ref.kind,
  ...(ref.kind === 'channels' ? {} : { id: ref.id }),
  ...(ref.pieceId ? { pieceId: ref.pieceId } : {}),
  ...(ref.channelId ? { channelId: ref.channelId } : {}),
  ...(ref.adaptationId ? { adaptationId: ref.adaptationId } : {}),
  ...(ref.videoJobId ? { videoJobId: ref.videoJobId } : {}),
  ...(ref.videoDraftId ? { videoDraftId: ref.videoDraftId } : {}),
});

export const artifactForWorkContext = (context: AgentWorkContextV1): AgentArtifactRef | null => {
  const id = context.id ?? (context.videoJobId || context.videoDraftId ? 'library' : context.kind === 'piece' ? context.pieceId : context.kind === 'channel' ? context.channelId : context.adaptationId);
  if (!id || context.kind === 'calendar') return null;
  return { kind: context.kind, id, ...(context.pieceId && context.kind !== 'piece' ? { pieceId: context.pieceId } : {}), ...(context.channelId && context.kind !== 'channel' ? { channelId: context.channelId } : {}), ...(context.videoJobId ? {videoJobId: context.videoJobId} : {}), ...(context.videoDraftId ? {videoDraftId: context.videoDraftId} : {}) };
};

/** Snapshot budgets count strings across the tree, not only individual leaves. */
export const boundedWorkData = (value: Record<string, unknown>) => {
  let remaining = 10_000;
  let truncated = false;
  const walk = (input: unknown, depth: number): unknown => {
    if (input === null || typeof input === 'boolean' || typeof input === 'number') return input;
    if (typeof input === 'string') {
      const clean = redactSecretShapes(input);
      const count = Math.max(0, Math.min(remaining, 6_000));
      const text = clean.slice(0, count);
      remaining -= text.length;
      if (text.length < clean.length) truncated = true;
      return text;
    }
    if (input instanceof Date) return input.toISOString();
    if (!input || typeof input !== 'object') return undefined;
    if (depth > 5 || remaining <= 0) { truncated = true; return null; }
    if (Array.isArray(input)) {
      if (input.length > 12) truncated = true;
      return input.slice(0, 12).map((item) => walk(item, depth + 1));
    }
    const entries = Object.entries(input).filter(([key]) => !/secret|token|password|api.?key|credential|cookie|authorization/i.test(key));
    if (entries.length > 24) truncated = true;
    return Object.fromEntries(entries.slice(0, 24).map(([key, item]) => [key, walk(item, depth + 1)]));
  };
  const data = walk(value, 0) as Record<string, unknown>;
  // Keys/escaping also count; a hostile text containing many quotes cannot
  // make the serialized request context exceed its contract.
  if (JSON.stringify(data).length > AGENT_WORK_CONTENT_MAX_CHARS) {
    return { data: { excerpt: JSON.stringify(data).slice(0, 7_000) }, truncated: true };
  }
  return { data, truncated };
};
