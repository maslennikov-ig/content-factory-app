import { createHash } from 'node:crypto';
import type { Mastra } from '@mastra/core/mastra';
import type { RequestContext } from '@mastra/core/request-context';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import type { PieceService, PieceAdaptPlanV1 } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';

export const NATIVE_ADAPTATION_SERIES_WORKFLOW_ID = 'content-factory-adaptation-series-v1';
const GENERATE = 'generate-posts';
const SAVE = 'save-drafts';
type Generated = Awaited<ReturnType<PieceService['generateSeriesAdaptation']>>;
type Saved = Awaited<ReturnType<PieceService['persistSeriesAdaptation']>>;
type Input = { organizationId: string; userId: string; plan: PieceAdaptPlanV1; presentation: 'auto' | 'series'; savedGeneration?: Generated; originalSeriesId?: string };
const inputSchema = z.custom<Input>();
const generatedSchema = z.custom<Generated>();
const resultSchema = z.custom<Saved | Extract<Generated, { kind: 'questions' }>>();
const unavailable = () => Object.assign(new Error('The saved series does not belong to this person or material.'), { code: 'ADAPTATION_SERIES_UNAVAILABLE' });
export const adaptationSeriesResource = (organizationId: string, userId: string, pieceId: string) =>
  `adaptation-series:${JSON.stringify([organizationId, userId, pieceId])}`;

/** Native snapshots retain the paid output before the all-or-none draft transaction. */
export const createNativeAdaptationSeriesWorkflow = (service: () => PieceService) => {
  const generate = createStep({
    id: GENERATE, inputSchema, outputSchema: generatedSchema,
    execute: async ({ inputData, abortSignal }) => inputData.savedGeneration ?? service().generateSeriesAdaptation(
      inputData.organizationId, inputData.plan, inputData.userId, inputData.presentation, abortSignal),
  });
  const save = createStep({
    id: SAVE, inputSchema: generatedSchema, outputSchema: resultSchema,
    suspendSchema: z.object({ code: z.string() }), resumeSchema: z.object({ save: z.literal(true) }),
    execute: async ({ inputData, getInitData, runId, suspend, abortSignal }) => {
      if (inputData.kind === 'questions') return inputData;
      const owner = getInitData<Input>();
      if (abortSignal.aborted) return suspend({ code: 'ADAPTATION_SERIES_STOPPED' });
      try {
        return await service().persistSeriesAdaptation(owner.organizationId, owner.userId, owner.originalSeriesId || runId, inputData);
      } catch (error) {
        // No generation retry. An unknown commit is reconciled by the atomic receipt on resume.
        return suspend({ code: typeof (error as any)?.code === 'string' ? (error as any).code : 'ADAPTATION_SERIES_SAVE_FAILED' });
      }
    },
  });
  return createWorkflow({
    id: NATIVE_ADAPTATION_SERIES_WORKFLOW_ID, inputSchema, outputSchema: resultSchema,
    retryConfig: { attempts: 0, delay: 0 },
    options: { shouldPersistSnapshot: () => true, autoRestartActiveRuns: false },
  }).then(generate).then(save).commit();
};

type Host = Pick<Mastra, 'getWorkflow' | 'getStorage'>;
const workflowOf = (host: Host) => host.getWorkflow('nativeAdaptationSeries') as ReturnType<typeof createNativeAdaptationSeriesWorkflow>;
const ownedState = async (host: Host, runId: string, owner: { organizationId: string; userId: string; pieceId: string }) => {
  const state = await workflowOf(host).getWorkflowRunById(runId);
  const resourceId = adaptationSeriesResource(owner.organizationId, owner.userId, owner.pieceId);
  const input = state?.payload;
  if (!state || state.resourceId !== resourceId || (input &&
    (input.organizationId !== owner.organizationId || input.userId !== owner.userId || input.plan?.pieceId !== owner.pieceId))) throw unavailable();
  return state;
};
const disposition = (runId: string, state: any):
  | { status: 'success'; runId: string; result: Saved | Extract<Generated, { kind: 'questions' }> }
  | { status: 'pending' | 'incomplete'; generated: boolean; nativeStatus: string; runId: string; saved: false; saveFailure?: unknown } => {
  if (state.status === 'success') return { status: 'success', runId, result: state.result };
  const generated = state.steps?.[GENERATE]?.status === 'success' && state.steps[GENERATE].output?.kind === 'generated';
  return { status: generated ? 'pending' : 'incomplete', generated, nativeStatus: String(state.status), runId, saved: false,
    ...(state.steps?.[SAVE]?.suspendPayload ? { saveFailure: state.steps[SAVE].suspendPayload } : {}),
    ...(!generated && state.error ? { saveFailure: { code: 'GENERATION_FAILED', message: String(state.error.message || 'Generation did not complete.') } } : {}) };
};

const drive = async <T>(run: { cancel: () => Promise<void> }, signal: AbortSignal | undefined, work: () => Promise<T>) => {
  const stop = () => { void run.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    if (signal?.aborted) { await run.cancel(); throw new DOMException('The adaptation was stopped.', 'AbortError'); }
    return await work();
  } finally { signal?.removeEventListener('abort', stop); }
};

const sourceIdentity = (plan: PieceAdaptPlanV1) => {
  const { adaptationSeries: _receipts, ...brief } = (plan.sourceRevision?.brief ?? {}) as Record<string, unknown>;
  return { body: plan.sourceRevision?.body, brief };
};
const canonicalJson = (value: unknown) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);

export const startNativeAdaptationSeries = async (host: Host, input: Input, toolCallId: string,
  requestContext?: RequestContext, signal?: AbortSignal) => {
  const runId = `adaptation-series:${createHash('sha256').update(canonicalJson([
    input.organizationId, input.userId, toolCallId, input.plan.pieceId, input.plan.request, input.presentation, sourceIdentity(input.plan),
  ])).digest('hex')}`;
  const workflow = workflowOf(host);
  const prior = await workflow.getWorkflowRunById(runId);
  if (prior) return disposition(runId, await ownedState(host, runId, { ...input, pieceId: input.plan.pieceId }));
  if (signal?.aborted) throw new DOMException('The adaptation was stopped.', 'AbortError');
  const run = await workflow.createRun({ runId, resourceId: adaptationSeriesResource(input.organizationId, input.userId, input.plan.pieceId) });
  return disposition(runId, await drive(run, signal, () => run.start({ inputData: input, requestContext })));
};

/** Save-only resume never starts/restarts the generation step. */
export const resumeNativeAdaptationSeries = async (host: Host, owner: { organizationId: string; userId: string; pieceId: string },
  runId: string, requestContext?: RequestContext, signal?: AbortSignal): Promise<ReturnType<typeof disposition>> => {
  if (signal?.aborted) throw new DOMException('The adaptation was stopped.', 'AbortError');
  const state = await ownedState(host, runId, owner);
  if (state.status === 'success') return disposition(runId, state);
  const step = state.steps?.[GENERATE];
  const saveStep = state.steps?.[SAVE];
  const generated = (step && !Array.isArray(step) && 'output' in step ? step.output : undefined) as Generated | undefined;
  if (!step || Array.isArray(step) || step.status !== 'success' || generated?.kind !== 'generated' ||
    generated.plan?.pieceId !== owner.pieceId || !generated.plan.sourceRevision ||
    !Array.isArray(generated.output?.content) || !generated.output.content.length)
    throw Object.assign(new Error('There is no saved generation awaiting persistence. Inspect the series before starting new generation.'), { code: 'ADAPTATION_SERIES_NOT_RESUMABLE' });
  if (state.status === 'suspended' && saveStep && !Array.isArray(saveStep) && saveStep.status === 'suspended') {
    const run = await workflowOf(host).createRun({ runId, resourceId: state.resourceId });
    return disposition(runId, await drive(run, signal, () => run.resume({ step: SAVE, resumeData: { save: true }, requestContext })));
  }
  // A cold interruption may leave a running snapshot. Never restart its paid step.
  // This native run can only reuse the checkpoint; the same receipt reconciles concurrent/unknown saves.
  const recoveryId = `${runId}:save`;
  const workflow = workflowOf(host);
  const prior = await workflow.getWorkflowRunById(recoveryId);
  if (prior) return resumeNativeAdaptationSeries(host, owner, recoveryId, requestContext, signal);
  const original = state.payload as Input;
  if (!original || original.organizationId !== owner.organizationId || original.userId !== owner.userId) throw unavailable();
  const run = await workflow.createRun({ runId: recoveryId, resourceId: state.resourceId });
  return disposition(recoveryId, await drive(run, signal, () => run.start({ inputData: {
    ...original, savedGeneration: generated, originalSeriesId: original.originalSeriesId || runId,
  }, requestContext })));
};

export const readNativeAdaptationSeries = async (host: Host, owner: { organizationId: string; userId: string; pieceId: string }) => {
  const store = await host.getStorage()?.getStore('workflows');
  if (!store) return [];
  const rows = await store.listWorkflowRuns({ workflowName: NATIVE_ADAPTATION_SERIES_WORKFLOW_ID,
    resourceId: adaptationSeriesResource(owner.organizationId, owner.userId, owner.pieceId), perPage: false });
  return rows.runs.map(row => {
    const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
    return { runId: row.runId, status: String(snapshot.status) };
  });
};
