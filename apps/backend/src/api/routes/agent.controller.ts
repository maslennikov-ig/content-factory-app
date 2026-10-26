import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { Organization, User } from '@prisma/client';
import { handleChatStream } from '@mastra/ai-sdk';
import { AGENT_NATIVE_CONTINUATION_PART, streamNativeSession } from '@contentfactory/nestjs-libraries/chat/conductor/native-session-stream';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  isOrganizationEditor,
  type OrganizationRole,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
import { resolveBackendLocale } from '@contentfactory/nestjs-libraries/locale/backend-strings';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { MastraService } from '@contentfactory/nestjs-libraries/chat/mastra.service';
import { AgentThreadsService } from '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service';
import type { AgentTurnLifecycle } from '@contentfactory/nestjs-libraries/chat/conductor/agent-turn-lifecycle';
import {
  AGENT_ERROR_CODES,
  AGENT_STREAM_VERSION,
  AGENT_THREAD_HEADER,
  AGENT_NOT_STARTED_HEADER,
  AGENT_TIMEZONE_HEADER,
  PROGRESS_PART_TYPE,
} from '@contentfactory/nestjs-libraries/chat/capabilities/agent-parts.contract';
import { agentTimeZone } from '@contentfactory/nestjs-libraries/chat/capabilities/person-time';
import { approvalContentFingerprint } from '@contentfactory/nestjs-libraries/chat/capabilities/approval-summary';
import type { CapabilityIdentity } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.types';
import {
  AGENT_ID_PATTERN,
  AgentChatRequestError,
  notPending,
  normalizeResumeDataForPendingCall,
  openProposalTargets,
  parseAgentChatBody,
  samplesReceiptRefused,
  mediaReceiptRefused,
  withMediaReceipt,
  APPROVED_ON_CARD,
  DECLINED_ON_CARD,
  verifyPendingAnswer,
} from '@contentfactory/nestjs-libraries/chat/conductor/agent-chat.request';
import {
  CONDUCTOR_AGENT_ID,
  buildConductorContext,
  conductorResourceId,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.context';
import {
  conductorErrorCode,
  conductorOnError,
  logConductorError,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.errors';
import { normaliseThreadTitle } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.memory';
import { createConductorExecution, type ConductorExecution } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution';
import { holdViewedPictures } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.pictures';
import {
  STEP_CAP_CLOSING,
  closingLineWatch,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.steps';
import { AgentChatThrottleGuard } from './agent-chat.throttle';
import { isRejectedAdaptationReviewProgress } from '@contentfactory/nestjs-libraries/chat/conductor/adaptation-review-progress';

/**
 * The agent chat's doors (`content-factory-next-kcxz.8`, spec §4.4, §4.8,
 * ADR-0012 «Последствия», premortem U2–U4, S2–S7, A3).
 *
 * `POST /agent/chat` streams the AI SDK UI protocol (pinned `v7`) from
 * `@mastra/ai-sdk` `handleChatStream` for one of three requests: a message,
 * an answer on an approval card, an answer on a question card. Each opens
 * exactly one `agent` operation of the allowance — the model runs in each —
 * held for the whole stream and closed as failed when the stream carried an
 * error or the person left. Paid capabilities leave it and admit their own.
 *
 * Everything the agent runs with is built here from the session: identity,
 * memory resource and thread, step and paid limits, approvals. From the body
 * only the thread id, the last message, `runId`, `toolCallId`, `cardId` and
 * `resumeData` are read.
 *
 * The thread doors read and write the caller's own threads only, and open no
 * operation: loading the screen spends nothing.
 */

type RequestOrganization = Organization & {
  users?: Array<{ role: OrganizationRole }>;
};

const ROLES: readonly OrganizationRole[] = ['USER', 'EDITOR', 'ADMIN', 'SUPERADMIN'];
const KNOWN_ERRORS: readonly string[] = AGENT_ERROR_CODES;

/** The identity of the caller, from the session only (spec §4.3). */
export const agentIdentity = (
  organization: RequestOrganization,
  user: User,
  /** `AGENT_TIMEZONE_HEADER`: the browser's zone, taken only when `Intl` knows it. */
  timeZoneHeader?: unknown
): CapabilityIdentity => {
  const role = organization.users?.[0]?.role;
  const interfaceLanguage = resolveBackendLocale((user as { language?: unknown }).language);
  return {
    organizationId: organization.id,
    organizationCreatedAt: new Date(organization.createdAt).toISOString(),
    userId: user.id,
    // An unknown role reads as the least one, never as a writer.
    role: role && ROLES.includes(role) ? role : 'USER',
    language: interfaceLanguage === 'ru' ? 'ru' : 'en',
    interfaceLanguage,
    // The browser's zone, as the screens use; else the saved standard
    // offset (`User.timezone`, minutes); else UTC (`kcxz.15`).
    timeZone: agentTimeZone(timeZoneHeader, (user as { timezone?: unknown }).timezone),
  };
};

const threadIdParam = (value: string) => {
  if (!AGENT_ID_PATTERN.test(value)) {
    throw new AgentChatRequestError(
      'AGENT_BAD_REQUEST',
      400,
      'The thread id is not valid.'
    );
  }
  return value;
};

/** Bounds are native page sizes; subsequent pages stay reachable. */
const threadPageQuery = (query: unknown, maximum: number) => {
  const value = query && typeof query === 'object' && !Array.isArray(query)
    ? query as Record<string, unknown> : {};
  const parse = (key: string, fallback: number, min: number, max: number) => {
    if (value[key] === undefined) return fallback;
    if (typeof value[key] !== 'string' || !/^\d+$/.test(value[key] as string)) {
      throw new AgentChatRequestError('AGENT_BAD_REQUEST', 400, 'Invalid conversation page.');
    }
    const n = Number(value[key]);
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      throw new AgentChatRequestError('AGENT_BAD_REQUEST', 400, 'Invalid conversation page.');
    }
    return n;
  };
  return { page: parse('page', 0, 0, Number.MAX_SAFE_INTEGER), perPage: parse('perPage', maximum, 1, maximum) };
};

/**
 * An `error` part never carries more than a code (premortem S6). Progress is
 * transient on the wire, except the bounded rejected-adaptation diagnostic.
 * Mastra 1.71 drops the flag a
 * capability writes, so the browser would keep every stage in the message
 * (review W1).
 */
const sanitisedPart = (part: any) => {
  if (part?.type === 'error' && !KNOWN_ERRORS.includes(part.errorText)) {
    return { ...part, errorText: 'AGENT_FAILED' };
  }
  if (part?.type === PROGRESS_PART_TYPE) {
    if (isRejectedAdaptationReviewProgress(part)) return { ...part, transient: false };
    if (part.transient !== true) return { ...part, transient: true };
  }
  return part;
};

/** The step-cap closing line as UI message stream parts. */
const closingLine = (language: 'ru' | 'en', message?: string) => {
  const id = `cf-closing-${randomUUID()}`;
  return [
    { type: 'text-start', id },
    { type: 'text-delta', id, delta: message ?? STEP_CAP_CLOSING[language] },
    { type: 'text-end', id },
  ];
};

const failedPart = (part: any) =>
  part?.type === 'error' ||
  // Mastra converts a terminal model tripwire to finishReason "other".
  // Ordinary tripwires retain their existing user/retry handling.
  (part?.type === 'data-tripwire' && part?.data?.metadata?.terminalModelError === true) ||
  // Only the terminal UI finish reaches this boundary. Native intermediate
  // length retries remain eligible; an exhausted truncated answer is incomplete.
  (part?.type === 'finish' && ['error', 'length'].includes(part?.finishReason));

@ApiTags('Agent')
@Controller('/agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly mastraService: MastraService,
    private readonly threads: AgentThreadsService,
    private readonly aiUsage: AiUsageService
  ) {}

  @Post('/chat')
  // The chat itself is any member's: what a member may do in it is decided
  // per action by the door each action mirrors, and the model is offered only
  // the actions the role may use. The AI section is the plan's allowance.
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  @UseGuards(AgentChatThrottleGuard)
  async chat(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: unknown,
    @Res() res: Response,
    @Headers(AGENT_TIMEZONE_HEADER) timeZone?: string
  ) {
    // Listening from the first line: a person who leaves while the turn is
    // still being admitted is not billed a finished turn (review W1 F15).
    const abort = new AbortController();
    let finished = false;
    let detached = false;
    let explicitlyStopped = false;
    let durableTurn = false;
    let reader: ReadableStreamDefaultReader<any> | undefined;
    let turn: AgentTurnLifecycle | undefined;
    let execution: ConductorExecution | undefined;
    let session: any;
    let drainStoppedNative = false;
    const forceAbort = (fromExplicitStop = false) => {
      if (!explicitlyStopped) {
        // A live native producer still owns its message flush. Parked gates
        // already persisted their suspension and use native cancellation.
        drainStoppedNative = fromExplicitStop && durableTurn &&
          !(session?.approval?.isArmed?.() || session?.suspensions?.hasPending?.());
      }
      explicitlyStopped = true;
      execution?.stop('AGENT_TASK_STOPPED');
      turn?.stop();
      abort.abort();
      if (!drainStoppedNative) void reader?.cancel().catch(() => undefined);
    };
    // `res` closes when the person leaves (and after the end, when `finished`
    // is already set); `req` closes as soon as the body was read. When the
    // turn is backed by a native DurableAgent (`on0i.3`, `A11`), an observer
    // disconnect after the turn started detaches the HTTP stream while the
    // durable execution continues in the background; explicit Stop (`A13`)
    // calls `forceAbort()`.
    const onClose = () => {
      if (finished) return;
      if (turn && durableTurn && !explicitlyStopped) {
        detached = true;
        return;
      }
      forceAbort();
    };
    res.on?.('close', onClose);
    let release: (() => Promise<void>) | null = null;
    let releaseThread: (() => Promise<void>) | undefined;

    try {
      const identity = agentIdentity(organization, user, timeZone);
      const input = parseAgentChatBody(body);
      const resourceId = conductorResourceId(identity.organizationId, identity.userId);

      // Ownership and pending answers are proven before anything is billed.
      let threadId: string;
      let fingerprints: string[] = [];
      let messages: unknown[];
      let resume:
        | { runId: string; toolCallId: string; resumeData: Record<string, unknown> }
        | undefined;
      let newThreadTitleFrom: string | undefined;
      let nativeResumeRequestId: string | undefined;
      let nativeResumeRunId: string | undefined;
      /** System lines of this request only, never stored (review F9). */
      let stepNotes: string[] = [];
      /** Texts whose card of proposed changes waits in the thread (kcxz.32, N2). */
      let openProposals: string[] = [];
      /** The calls this request answers, marked answered once it streams. */
      let answered: {
        runId: string;
        calls: Array<{ toolCallId: string; card?: string }>;
      } | null = null;
      if (input.mode === 'message') {
        // A samples receipt is the report of an upload only an editor can
        // make, to an avatar of this workspace (review W3-18 F3).
        if (input.samplesAvatarId !== undefined) {
          if (!isOrganizationEditor(identity.role)) throw samplesReceiptRefused();
          if (
            input.samplesAvatarId &&
            !(await this.mastraService.samplesAvatarKnown(identity, input.samplesAvatarId))
          ) {
            throw samplesReceiptRefused();
          }
        }
        // A pictures receipt is the report of an upload to the media library
        // only an editor can make, of pictures of this workspace (`kcxz.25`).
        // The line the model reads is rebuilt from the library's own rows:
        // their names and types, not the browser's (review W4-25 F3).
        let message = input.message;
        if (input.mediaIds) {
          if (!isOrganizationEditor(identity.role)) throw mediaReceiptRefused();
          const media = await this.mastraService.mediaReceipt(identity, input.mediaIds);
          if (!media || input.mediaPart === undefined) throw mediaReceiptRefused();
          message = withMediaReceipt(message, input.mediaPart, media);
        }
        threadId = input.threadId ?? randomUUID();
        // Somebody else's thread is refused here; a new one is created only
        // once the turn is admitted, so a refused turn leaves no empty thread.
        if (!(await this.threads.ownThread(identity, threadId))) {
          newThreadTitleFrom = input.text;
        } else {
          openProposals = openProposalTargets(
            await this.threads.pendingRuns(identity, threadId)
          );
        }
        messages = [message];
      } else {
        threadId = input.threadId;
        await this.threads.threadForAnswer(identity, threadId);
        const runs = await this.threads.pendingRuns(identity, threadId);
        const verified = verifyPendingAnswer(input, runs, { threadId, resourceId });
        if (input.mode === 'resume') {
          const pending = runs.find(run => run.runId === verified.runId)?.toolCalls
            .find(call => call.toolCallId === verified.toolCallId);
          await this.mastraService.assertDomainQuestionCurrent?.(identity, pending?.suspendPayload);
        }
        // The card this answer is for is being answered, not waiting.
        openProposals = openProposalTargets(
          runs,
          input.mode === 'resume'
            ? { runId: verified.runId, toolCallId: verified.toolCallId }
            : undefined
        );
        // Claim each exact gate. A crash while answering an earlier card must
        // not lock the next card of the same native run for the old lease TTL.
        // Overlapping parallel approval batches still contend on shared calls.
        const answerKeys = input.mode === 'resume'
          ? [`${verified.runId}::${verified.toolCallId}::${verified.card}`]
          : input.approvals.map(answer => `${verified.runId}::approval::${answer.toolCallId}`).sort();
        const answerClaims: Array<() => Promise<void>> = [];
        release = async () => { for (const releaseClaim of answerClaims) await releaseClaim(); };
        for (const key of answerKeys) {
          const claimed = await this.threads.claimRun(key);
          if (!claimed) throw notPending();
          answerClaims.push(claimed);
        }
        fingerprints = [
          ...verified.fingerprints,
          ...(await this.contentBoundApprovals(identity, verified)),
        ];
        messages = verified.approvalMessage ? [verified.approvalMessage] : [];
        if (verified.declined) stepNotes = [DECLINED_ON_CARD];
        if (verified.approved?.length) stepNotes.push(APPROVED_ON_CARD);
        answered = {
          runId: verified.runId,
          calls:
            input.mode === 'approval'
              ? input.approvals.map((answer) => ({ toolCallId: answer.toolCallId }))
              : [{ toolCallId: verified.toolCallId as string, card: verified.card }],
        };
        if (input.mode !== 'approval') {
          resume = {
            runId: input.runId,
            // Pinned: Mastra does not choose the question (review W1 F7).
            toolCallId: verified.toolCallId as string,
            resumeData: normalizeResumeDataForPendingCall(
              runs,
              input.runId,
              verified.toolCallId as string,
              input.resumeData
            ) as any,
          };
        }
      }

      // A native Session keeps the admitted run alive while its approval or
      // question is parked. Answer that exact gate within the original task;
      // acquiring another turn/admission here would deadlock its owner.
      if (input.mode !== 'message' && await this.threads.isDurableConductor?.()) {
        const pointer = await this.threads.readNativeRun(identity, threadId);
        if (pointer?.runId === answered?.runId && pointer.logicalRequestId) {
          const context = buildConductorContext({ identity, threadId, requestId: pointer.logicalRequestId,
            trackExecution: true, approvals: fingerprints, openProposals,
            workContext: await this.threads.workContextForTurn(identity, threadId),
          });
          const live = await this.threads.sessionFor(identity, threadId, { bindThread: true, requestContext: context });
          const owner = await this.threads.activeTurnFor(identity, threadId);
          const queuedOwner = owner?.requestId !== pointer.logicalRequestId &&
            this.mastraService.hasNativeTaskOwner?.(identity, threadId, pointer.logicalRequestId);
          // Stored gates can precede their local Session event. The exact
          // admitted owner remains authoritative; the native adapter selects
          // its live or persisted response path without opening another ledger.
          if (owner?.requestId === pointer.logicalRequestId || queuedOwner) {
            const dispatch = async () => streamNativeSession({ session: live as any,
              agent: await this.mastraService.conductor() as any, threadId, resourceId, requestContext: context,
              ...(resume ? { resume } : {}),
              ...(input.mode === 'approval' ? { approvals: { runId: answered!.runId, answers: input.approvals } } : {}),
              onRunId: async () => undefined,
              onMessageId: (runId, messageId) => this.threads.rememberNativeResponse(identity, threadId, runId, messageId),
              nextRunId: async () => (await this.threads.readNativeRun(identity, threadId))?.runId,
              onError: error => conductorOnError(error, { picturesInStep: () => false }),
            });
            const stream = queuedOwner
              ? await this.mastraService.runInNativeTaskScope(identity, threadId, pointer.logicalRequestId, dispatch)
              : await dispatch();
            await this.threads.markAnswered(answered!.runId, answered!.calls);
            await release?.();
            release = undefined;
            await this.pipeNativeAnswer(stream, identity, threadId, live, res);
            return;
          }
          if (live) {
            nativeResumeRequestId = pointer.logicalRequestId;
            nativeResumeRunId = answered!.runId;
          }
        }
      }

      // This request's own id: the pictures it carries are held under it,
      // never under the thread (review W4-25 vision F3).
      const requestId = nativeResumeRequestId ?? randomUUID();
      durableTurn = (await this.threads.isDurableConductor?.()) ?? false;
      execution = createConductorExecution({ requestId, signal: abort.signal, native: durableTurn, initialStepNotes: stepNotes });
      releaseThread = await this.threads.claimThreadTurn(identity, threadId, nativeResumeRunId ? { nativeResumeRunId } : undefined);
      // Resolve tenant, role, deletion and revision before an admission or any
      // model call. An answered card cannot inject a different work target.
      const workContext = await this.threads.workContextForTurn(identity, threadId, input.mode === 'message' ? input.workContext : undefined);
      const requestContext = buildConductorContext({
        identity,
        threadId,
        executionPolicy: execution.policy,
        approvals: fingerprints,
        openProposals,
        requestId,
        trackExecution: true,
        workContext,
        ...(input.mode === 'message' ? {
          originalAuthorRequest: { messageId: input.message.id, text: input.text },
        } : {}),
      });
      const mastra = await this.mastraService.mastra();

      // One admission for this model-running request. Refused (no key, no
      // allowance) → an HTTP error with the service's code, before any stream.
      const admission = await this.aiUsage.beginAiOperation(
        identity.organizationId,
        'agent',
        'agent'
      );
      if (!abort.signal.aborted) {
        try {
          if (newThreadTitleFrom !== undefined) {
            await this.threads.threadForMessage(identity, threadId, newThreadTitleFrom, input.mode === 'message' && (input.workContext !== undefined || workContext) ? workContext : undefined);
          } else if (input.mode === 'message' && (input.workContext !== undefined || workContext)) {
            await this.threads.rememberWorkContext(identity, threadId, workContext);
          }
          if (input.mode !== 'message') {
            session = await this.threads.sessionFor(identity, threadId, {
              bindThread: true,
              requestContext,
            });
          }
        } catch (error) {
          await admission.finish(false, error);
          throw error;
        }
      }
      if (abort.signal.aborted) {
        // Gone before the turn started: nothing ran, nothing is written.
        await admission.finish(false);
        return;
      }

      let failed = false;
      const failedExecution = () => {
        const stopCode = execution?.snapshot().stopCode;
        return !!stopCode && !(stopCode === 'AGENT_TASK_STOPPED' && abort.signal.aborted);
      };
      /** Tool calls of this stream by id, for the approval card's words. */
      const calls = new Map<string, { toolName: string; input: unknown }>();
      // Pictures to look at reach the model for this request only; the
      // message and the memory hold their lines (owner decision 28.09).
      const pictures = holdViewedPictures(
        requestId,
        resourceId,
        threadId,
        input.mode === 'message' ? input.pictures ?? [] : []
      );
      // A provider refusal of the step that carried them is about the picture.
      const errorScope = { picturesInStep: pictures.lastStepShown };
      durableTurn = (await this.threads.isDurableConductor?.()) ?? false;
      let settleActiveTurn!: (failure?: unknown) => void;
      const turnSettlement = new Promise<void>((resolve, reject) => {
        settleActiveTurn = (failure) => failure ? reject(failure) : resolve();
      });
      // Most tasks finish without a Stop reader awaiting this receipt.
      void turnSettlement.catch(() => undefined);
      const activeTurn = this.threads.registerActiveTurn?.({
        identity,
        threadId,
        requestId,
        onStop: () => forceAbort(true),
        settled: turnSettlement,
      });
      try {
        turn = await this.threads.startTurn(identity, threadId, requestId, releaseThread);
        if (abort.signal.aborted) return;
        await execution.run(() => turn!.run(() => admission.run(async () => {
          let stream: ReadableStream<any>;
          try {
            if (input.mode === 'message') {
              // A cached idle Session can retain a finished task's subscriber
              // scope. Bind a fresh driver inside this task's existing owners;
              // manual gate answers retain their original Session binding.
              session = durableTurn && typeof this.mastraService.bindNativeTaskSession === 'function'
                ? await this.mastraService.bindNativeTaskSession(identity, threadId, requestContext)
                : await this.threads.sessionFor(identity, threadId, { bindThread: true, requestContext });
            }
            stream = session?.sendSignal && durableTurn
              ? await streamNativeSession({
                session, agent: await this.mastraService.conductor() as any,
                threadId, resourceId, requestContext: requestContext as any,
                ...(input.mode === 'message' ? { message: messages[0] as any } : {}),
                ...(resume ? { resume } : {}),
                ...(input.mode === 'approval' ? { approvals: { runId: input.mode === 'approval' ? answered!.runId : '', answers: input.approvals } } : {}),
                onRunId: (nativeRunId) => this.threads.rememberNativeRun(identity, threadId, nativeRunId, requestId),
                onMessageId: (nativeRunId, messageId) => this.threads.rememberNativeResponse(identity, threadId, nativeRunId, messageId),
                nextRunId: async () => (await this.threads.readNativeRun(identity, threadId))?.runId,
                onError: (error) => conductorOnError(error, errorScope),
              })
              : (await handleChatStream({
              mastra,
              agentId: CONDUCTOR_AGENT_ID,
              version: AGENT_STREAM_VERSION,
              sendReasoning: false,
              sendSources: false,
              onError: (error: unknown) => conductorOnError(error, errorScope),
              params: {
                messages: messages as any,
                ...(resume ?? {}),
                requestContext: requestContext as any,
                memory: { thread: threadId, resource: resourceId },
                ...execution!.streamOptions(stepNotes),
                abortSignal: execution!.signal,
              } as any,
            })) as unknown as ReadableStream<any>;
          } catch (error) {
            failed = true;
            logConductorError(error, errorScope);
            const code = conductorErrorCode(error, errorScope);
            throw new HttpException({ code }, code === 'AGENT_RUN_NOT_PENDING' ? 409 : 502);
          }

          if (!detached) {
            res.status(200);
            res.setHeader('content-type', 'text/event-stream');
            res.setHeader('cache-control', 'no-cache, no-transform');
            res.setHeader('connection', 'keep-alive');
            res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
            res.setHeader('x-accel-buffering', 'no');
            res.setHeader(AGENT_THREAD_HEADER, threadId);
            res.flushHeaders?.();
          }
          // From here the answer is delivered: a cut stream or a retry must
          // not run the same card again (kcxz.29, D2).
          if (answered) {
            await this.threads.markAnswered(answered.runId, answered.calls);
            // The durable card receipt rejects duplicates. The run may now
            // park another question/approval before this execution finishes.
            await release?.();
            release = undefined;
          }

          reader = stream.getReader();
          // Ended with no words and no card after its last tool (W3 walk
          // P2-B; review F1, F10 — each approval leg judged on its own): the
          // door's own closing line, before the part that ends it.
          const silence = closingLineWatch(answered?.calls.map((call) => call.toolCallId));
          const write = (part: unknown) => {
            const clean = sanitisedPart(part);
            if (!detached && !res.writableEnded) {
              res.write(`data: ${JSON.stringify(clean)}\n\n`);
            }
          };
          /**
           * An approval request whose call this stream never showed — the
           * second card of a step, streamed in the answer to the first — waits
           * for its companion `data-tool-call-approval` part, which names the
           * call (`@mastra/ai-sdk` emits the two together), so every card
           * carries its words and its shown content (review kcxz.45 F5).
           */
          const held = new Map<string, any>();
          const flushHeld = async (force = false) => {
            for (const [id, part] of held) {
              if (!force && !calls.has(id)) continue;
              held.delete(id);
              write(await this.withApprovalReason(part, identity, threadId, calls));
            }
          };
          while (!abort.signal.aborted || drainStoppedNative) {
            const { done, value } = await reader.read();
            if (done) break;
            if (failedPart(value)) failed = true;
            // Explicit native Stop suppresses display work, while this same
            // reader awaits native FINISH/EOF after the actual Memory flush.
            if (abort.signal.aborted) continue;
            if (value?.type === AGENT_NATIVE_CONTINUATION_PART) {
              write(value);
              if (!detached && !res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
              // Keep the logical task/admission draining the native successor;
              // the UI attaches with a fresh SDK response for its new message.
              detached = true;
              continue;
            }
            if (value?.type === 'data-tool-call-approval' && value.data) {
              const data = value.data as { toolCallId?: unknown; toolName?: unknown; args?: unknown };
              if (typeof data.toolCallId === 'string' && !calls.has(data.toolCallId)) {
                calls.set(data.toolCallId, { toolName: String(data.toolName ?? ''), input: data.args ?? {} });
              }
            }
            if (
              (value?.type === 'data-tool-call-approval' ||
                value?.type === 'data-tool-call-suspended') &&
              (value.data as { resumed?: unknown } | undefined)?.resumed === true
            ) {
              continue;
            }
            await flushHeld();
            if (silence.before(value)) {
              failed = true;
              for (const part of closingLine(identity.language, execution!.closing(identity.language) || undefined)) write(part);
            }
            if (value?.type === 'tool-input-available' && value.toolCallId) {
              calls.set(value.toolCallId, {
                toolName: value.toolName,
                input: value.input,
              });
            }
            if (value?.type === 'tool-approval-request' && value.toolCallId && !calls.has(value.toolCallId)) {
              held.set(value.toolCallId, value);
              continue;
            }
            write(
              value?.type === 'tool-approval-request'
                ? await this.withApprovalReason(value, identity, threadId, calls)
                : this.withToolTitle(value, identity)
            );
            if (session && this.nativeInputWait(value, session, threadId)) {
              write({ type: 'data-native-input-wait', data: { runId: (value as any).data?.runId }, transient: true });
              if (!detached && !res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
              // The native Session and this task's ledger keep owning the run
              // while the UI becomes free to answer its specific parked gate.
              detached = true;
            }
          }
          if (!abort.signal.aborted) await flushHeld(true);
        })));
        if (failedExecution()) failed = true;
      } catch (error) {
        if (!abort.signal.aborted || failedExecution()) failed = true;
        if (!res.headersSent && !detached) throw error;
        logConductorError(error, errorScope);
        const stopped = execution?.snapshot().stopCode;
        if (stopped && execution) {
          for (const part of closingLine(identity.language, execution.closing(identity.language))) {
            const clean = sanitisedPart(part);
            if (!detached && !res.writableEnded) {
              res.write(`data: ${JSON.stringify(clean)}\n\n`);
            }
          }
        }
        const code = conductorErrorCode(error, errorScope);
        this.logger.warn(`Agent turn failed after the stream opened: ${stopped ?? code}`);
        const errorPart = { type: 'error', errorText: code };
        if (!detached && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(errorPart)}\n\n`);
        }
      } finally {
        if (failedExecution()) failed = true;
        finished = true;
        // UI cancellation can finish before a non-cancellable service write.
        // Hold both claims and the unknown-result guard until those actual
        // capability Promises settle, including failures.
        try {
          const settled = await turn?.finish(failed ? 'failed' : abort.signal.aborted ? 'interrupted' : 'completed');
          if (settled === 'failed') failed = true;
          settleActiveTurn(settled ? undefined : new Error('Agent turn settlement was not started.'));
        } catch (error) {
          // No terminal receipt: history stays running/unknown and refuses
          // a retry. A failed store write must never fabricate success.
          failed = true;
          settleActiveTurn(error ?? new Error('Agent turn outcome could not be recorded.'));
          this.logger.warn('Agent turn outcome could not be recorded.');
        } finally {
          // Retain the captured completion while a terminal store write is
          // pending, so a Stop entering during that write can await it too.
          activeTurn?.finishStream();
        }
        if (execution) this.logger.log?.(JSON.stringify({ event: 'agent_task_execution', ...execution.snapshot() }));
        pictures.release();
        // A turn with an `error` part, or one the person left, is not a
        // success (premortem U2, U3); its tokens are recorded either way.
        await admission.finish(!failed && !abort.signal.aborted);
        if (!detached && res.headersSent && !res.writableEnded) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
    } catch (error) {
      // A local refusal before the native run is positive proof that this
      // request started no model/tool work. Proxy/network errors cannot add
      // it, and a failed or interrupted started turn must use its receipt.
      if (!res.headersSent && !turn) res.setHeader(AGENT_NOT_STARTED_HEADER, '1');
      throw error;
    } finally {
      finished = true;
      res.off?.('close', onClose);
      await release?.();
      await releaseThread?.();
    }
  }

  private nativeInputWait(part: any, session: any, threadId: string) {
    if (part?.type === 'data-native-input-wait') return true;
    if (part?.data?.resumed === true) return false;
    const address = { runId: part?.data?.runId, toolCallId: part?.data?.toolCallId, threadId };
    if (part?.type === 'data-tool-call-suspended') return session?.suspensions.has(address);
    return part?.type === 'data-tool-call-approval' &&
      session?.resolveToolApproval(part.data?.toolName, threadId) === 'ask' && session.approval.isArmed(address);
  }

  private async pipeNativeAnswer(stream: ReadableStream<any>, identity: CapabilityIdentity,
    threadId: string, session: any, res: Response) {
    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
    res.setHeader('x-accel-buffering', 'no');
    res.setHeader(AGENT_THREAD_HEADER, threadId);
    res.flushHeaders?.();
    const reader = stream.getReader();
    let detached = false;
    const detach = () => { detached = true; void reader.cancel().catch(() => undefined); };
    res.on?.('close', detach);
    const calls = new Map<string, { toolName: string; input: unknown }>();
    try {
      while (!detached) {
        const part = await reader.read();
        if (part.done) break;
        const value = part.value;
        if (value?.type === 'tool-input-available') calls.set(value.toolCallId, { toolName: value.toolName, input: value.input });
        if (value?.data?.resumed === true && ['data-tool-call-approval', 'data-tool-call-suspended'].includes(value.type)) continue;
        const shown = value?.type === 'tool-approval-request'
          ? await this.withApprovalReason(value, identity, threadId, calls) : this.withToolTitle(value, identity);
        res.write(`data: ${JSON.stringify(sanitisedPart(shown))}\n\n`);
        if (this.nativeInputWait(value, session, threadId)) {
          res.write(`data: ${JSON.stringify({ type: 'data-native-input-wait', data: { runId: value.data?.runId }, transient: true })}\n\n`);
          break;
        }
        if (value?.type === AGENT_NATIVE_CONTINUATION_PART) break;
      }
    } finally {
      res.off?.('close', detach);
      await reader.cancel().catch(() => undefined);
      if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
    }
  }

  /**
   * «Да» to a call that sends a post out is bound to what the card showed
   * (review W2 F4): the digest remembered when the card was first drawn, or —
   * when none was remembered — what goes out now. The hook reads what goes out
   * again when the call runs and refuses a call whose digest differs, so a
   * text edited between the card and the run is never published unseen.
   */
  private async contentBoundApprovals(
    identity: CapabilityIdentity,
    verified: { runId: string; approved?: Array<{ toolCallId: string; toolName: string; args: unknown }> }
  ): Promise<string[]> {
    const prints: string[] = [];
    for (const call of verified.approved ?? []) {
      if (this.threads.describeApproval && !await this.threads.describeApproval(identity, call.toolName, call.args)) {
        throw notPending();
      }
      const now = await this.threads.approvalContentNow(identity, call.toolName, call.args);
      if (!now) continue;
      const shown = await this.threads.approvalContentShown(verified.runId, call.toolCallId);
      prints.push(approvalContentFingerprint(call.toolName, call.args, shown ?? now));
    }
    return prints;
  }

  /**
   * The capability's label on the live tool part (kcxz.29, D5). Mastra
   * streams tool calls without the `title` it stores, so the live approval
   * card fell back to «Сделать это?» while the reloaded one said «Удалить
   * заготовку». Mastra's own tools (skills, memory) get none and stay out of
   * the person's view.
   */
  private withToolTitle(part: any, identity: CapabilityIdentity) {
    if (
      (part?.type !== 'tool-input-start' && part?.type !== 'tool-input-available') ||
      part.title
    ) {
      return part;
    }
    const title = this.mastraService.toolTitle?.(identity, part.toolName);
    return title ? { ...part, title } : part;
  }

  /**
   * The approval card's «what and where» (review W1 F1): the capability reads
   * the entity for the call's arguments in the caller's workspace, and the
   * line rides on the native `reason` of the request, which AI SDK UI shows as
   * `approval.requestReason`. The arguments are the call this stream made
   * (the display transform passes them unchanged, so they are what Mastra
   * stores and the answer is fingerprinted from); a request streamed without
   * its call reads the stored run.
   */
  private async withApprovalReason(
    part: any,
    identity: CapabilityIdentity,
    threadId: string,
    calls: ReadonlyMap<string, { toolName: string; input: unknown }>
  ) {
    try {
      let call = calls.get(part.toolCallId);
      if (!call) {
        const stored = (await this.threads.pendingRuns(identity, threadId))
          .flatMap((run) => run.toolCalls)
          .find((candidate) => candidate.toolCallId === part.toolCallId);
        if (stored?.toolName) call = { toolName: stored.toolName, input: stored.args };
      }
      const reason = call
        ? await this.threads.describeApproval(identity, call.toolName, call.input)
        : null;
      // What the card sends out, as it is now: «Да» binds to it (W2 F4).
      const approvalId = typeof part.approvalId === 'string' ? part.approvalId : '';
      const separator = approvalId.lastIndexOf('::');
      if (call && separator > 0) {
        await this.threads
          .approvalCardShown(identity, approvalId.slice(0, separator), part.toolCallId, call.toolName, call.input)
          .catch(() => undefined);
      }
      return reason ? { ...part, reason } : part;
    } catch {
      return part;
    }
  }

  @Post('/voice/transcribe')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  @UseInterceptors(FileInterceptor('file'))
  async transcribeVoice(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: unknown,
    @Headers(AGENT_TIMEZONE_HEADER) timeZone?: string
  ) {
    const identity = agentIdentity(organization, user, timeZone);
    if (file?.buffer) {
      return this.mastraService.transcribeVoice(identity, {
        buffer: file.buffer,
        mimeType: file.mimetype,
      });
    }
    const payload =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { audio?: unknown; mediaType?: unknown })
        : {};
    const rawAudio = typeof payload.audio === 'string' ? payload.audio.trim() : '';
    if (!rawAudio) {
      throw new AgentChatRequestError(
        'AGENT_BAD_REQUEST',
        400,
        'Audio recording is required.'
      );
    }
    const dataUrlMatch = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i.exec(rawAudio);
    const mimeType =
      dataUrlMatch?.[1] ??
      (typeof payload.mediaType === 'string' ? payload.mediaType : 'audio/webm');
    const base64 = dataUrlMatch ? dataUrlMatch[2] : rawAudio;
    const buffer = Buffer.from(base64, 'base64');
    return this.mastraService.transcribeVoice(identity, {
      buffer,
      mimeType,
    });
  }

  @Get('/threads')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async listThreads(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Query() query?: unknown
  ) {
    return this.threads.list(agentIdentity(organization, user), threadPageQuery(query, 100));
  }

  @Get('/workspace/browser')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async workspaceBrowser(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Query() query: unknown
  ) {
    return this.mastraService.browseWorkObjects(agentIdentity(organization, user), query);
  }

  @Get('/threads/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getThread(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    // The pending approval cards are redrawn in the reader's zone.
    @Headers(AGENT_TIMEZONE_HEADER) timeZone?: string,
    @Query() query?: unknown
  ) {
    return this.threads.history(agentIdentity(organization, user, timeZone), threadIdParam(id), threadPageQuery(query, 200));
  }

  @Patch('/threads/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async renameThread(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const title = normaliseThreadTitle((body as { title?: unknown })?.title);
    if (!title) {
      throw new AgentChatRequestError(
        'AGENT_BAD_REQUEST',
        400,
        'The title is empty or too long.'
      );
    }
    return this.threads.rename(
      agentIdentity(organization, user),
      threadIdParam(id),
      title
    );
  }

  @Post('/threads/:id/fork')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async forkThread(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body?: unknown
  ) {
    const payload =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { upToMessageId?: unknown; title?: unknown })
        : {};
    const upToMessageId =
      typeof payload.upToMessageId === 'string' && payload.upToMessageId.trim()
        ? payload.upToMessageId.trim()
        : null;
    const title = normaliseThreadTitle(payload.title);
    return this.threads.fork(
      agentIdentity(organization, user),
      threadIdParam(id),
      { upToMessageId, title }
    );
  }

  @Patch('/threads/:id/workspace')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async updateWorkspace(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    return this.threads.patchWorkspace(agentIdentity(organization, user), threadIdParam(id), body);
  }

  @Patch('/threads/:id/model')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async switchThreadModel(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const modelId = (body as { modelId?: unknown })?.modelId;
    const thinkingLevel = (body as { thinkingLevel?: unknown })?.thinkingLevel;
    return this.threads.switchModel(
      agentIdentity(organization, user),
      threadIdParam(id),
      typeof modelId === 'string' ? modelId : '',
      typeof thinkingLevel === 'string' ? { thinkingLevel } : undefined
    );
  }

  @Patch('/threads/:id/mode')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async switchThreadMode(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const modeId = (body as { modeId?: unknown })?.modeId;
    return this.threads.switchMode(
      agentIdentity(organization, user),
      threadIdParam(id),
      typeof modeId === 'string' ? modeId : ''
    );
  }

  @Post('/threads/:id/signals')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  @UseGuards(AgentChatThrottleGuard)
  async signalThread(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers(AGENT_TIMEZONE_HEADER) timeZone?: string
  ) {
    const identity = agentIdentity(organization, user, timeZone);
    const threadId = threadIdParam(id);
    await this.threads.threadForAnswer(identity, threadId, { bindSession: false });
    const value = body && typeof body === 'object' ? body as Record<string, any> : {};
    const kind = value.kind ?? 'deliver';
    if (!['deliver', 'queue', 'follow-up', 'steer'].includes(kind)) {
      throw new AgentChatRequestError('AGENT_BAD_REQUEST', 400, 'Invalid signal kind.');
    }
    const parsed = parseAgentChatBody({ threadId, messages: [value.message], workContext: value.workContext });
    if (parsed.mode !== 'message' || parsed.pictures?.length) {
      throw new AgentChatRequestError('AGENT_BAD_REQUEST', 400, 'Send pictures in a new turn after the active response.');
    }
    if (parsed.samplesAvatarId !== undefined && (!isOrganizationEditor(identity.role) ||
      parsed.samplesAvatarId && !await this.mastraService.samplesAvatarKnown(identity, parsed.samplesAvatarId))) throw samplesReceiptRefused();
    let message = parsed.message;
    if (parsed.mediaIds) {
      if (!isOrganizationEditor(identity.role)) throw mediaReceiptRefused();
      const media = await this.mastraService.mediaReceipt(identity, parsed.mediaIds);
      if (!media || parsed.mediaPart === undefined) throw mediaReceiptRefused();
      message = withMediaReceipt(message, parsed.mediaPart, media);
    }
    const pointer = await this.threads.readNativeRun(identity, threadId);
    const requestId = kind === 'deliver' && pointer?.logicalRequestId ? pointer.logicalRequestId : randomUUID();
    const workContext = await this.threads.workContextForTurn(identity, threadId, parsed.workContext);
    const context = buildConductorContext({ identity, threadId, requestId, trackExecution: true,
      openProposals: openProposalTargets(await this.threads.pendingRuns(identity, threadId)),
      workContext,
    });
    // Explicit queued input is driven by its native workflow's admitted scope.
    // Creating its Session subscription here would capture this HTTP scope.
    const queued = kind === 'queue' || kind === 'follow-up';
    const session = queued ? undefined : await this.threads.sessionFor(identity, threadId, { bindThread: true, requestContext: context });
    if (!queued && !session?.sendSignal) throw new HttpException({ code: 'AGENT_FAILED' }, 503);
    const contents = message.parts.filter(part => part.type === 'text').map(part => ({ type: 'text' as const, text: String(part.text) }));
    let accepted: Record<string, unknown> = {};
    if (kind === 'deliver') {
      accepted = await session!.sendSignal({ id: message.id, type: 'user', contents, author: { id: identity.userId },
        ...(parsed.workContext !== undefined || workContext ? { attributes: { workContext: JSON.stringify(workContext?.context ?? null) } } : {}),
      }, {
        requestContext: context as any, requireDelivery: true,
        ifActive: { behavior: 'deliver' }, ifIdle: { behavior: 'discard' },
      }).accepted;
      // A finishing run can become idle after the browser chose /signals.
      // Native discard proves these exact words were neither delivered nor
      // saved; the caller can submit the same message as an ordinary turn.
      if (accepted.action === 'discard') return { accepted: false, id: message.id, kind,
        code: 'AGENT_SIGNAL_IDLE', durability: 'native' };
      if (accepted.action === 'blocked') throw notPending();
      if (accepted.action !== 'deliver') throw new HttpException({ code: 'AGENT_FAILED' }, 503);
    } else if (kind === 'queue' || kind === 'follow-up') {
      try {
        accepted = await this.mastraService.queueNativeInput({ identity, threadId, requestId,
          previousRunId: pointer?.runId,
          ...(parsed.workContext !== undefined || workContext ? { workContext: workContext?.context ?? null } : {}),
          signal: { id: message.id, contents: contents.map(part => part.text).join('\n'),
            createdAt: new Date().toISOString(), author: { id: identity.userId } },
        });
      } catch (error) {
        const uncertain = error as { code?: string; receipt?: unknown };
        if (uncertain.code !== 'QUEUED_INPUT_ACCEPTANCE_UNCERTAIN') throw error;
        await this.threads.rememberSignalReceipt(identity, threadId, { id: message.id, text: parsed.text, kind, durability: 'native', state: 'unknown' }).catch(() => undefined);
        // Durable dispatch may have succeeded. Keep the exact original id in
        // the receipt; neither caller nor server should invent a retry input.
        return { accepted: 'unknown', id: message.id, kind, durability: 'native',
          code: uncertain.code, receipt: uncertain.receipt };
      }
    } else {
      await session!.steer({ content: contents.map(part => part.text).join('\n'), requestContext: context as any, author: { id: identity.userId } });
    }
    const durability = 'native' as const;
    await this.threads.rememberSignalReceipt(identity, threadId, { id: message.id, text: parsed.text, kind, durability }).catch(() => {
      // The native admission is already authoritative. A failed UI projection
      // must not turn it into an apparent rejection and invite another input.
      this.logger.warn('Native signal accepted; its display receipt could not be recorded.');
    });
    return { accepted: true, id: message.id, kind, durability, ...accepted };
  }

  @Post('/threads/:id/stop')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async stopThread(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    return this.threads.stopTurn(
      agentIdentity(organization, user),
      threadIdParam(id)
    );
  }

  @Get('/threads/:id/observe')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async observeThread(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Res() res: Response
  ) {
    const identity = agentIdentity(organization, user);
    const threadId = threadIdParam(id);
    const stream = await this.threads.observeTurn(identity, threadId,
      (error) => conductorOnError(error, { picturesInStep: () => false }));
    if (!stream) { res.status(204); res.end(); return; }
    const session = await this.threads.sessionFor(identity, threadId, { bindThread: true });
    await this.pipeNativeAnswer(stream, identity, threadId, session, res);
  }

  @Get('/threads/:id/objective')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getThreadObjective(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    return this.threads.getObjective(
      agentIdentity(organization, user),
      threadIdParam(id)
    );
  }

  @Put('/threads/:id/objective')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async setThreadObjective(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    return this.threads.setObjective(
      agentIdentity(organization, user),
      threadIdParam(id),
      (body as { text?: string; maxRuns?: number }) ?? {}
    );
  }

  @Delete('/threads/:id/objective')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async clearThreadObjective(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    return this.threads.clearObjective(
      agentIdentity(organization, user),
      threadIdParam(id)
    );
  }

  @Get('/threads/:id/schedules')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async listThreadSchedules(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    return this.threads.listFollowUpSchedules(
      agentIdentity(organization, user),
      threadIdParam(id)
    );
  }

  @Post('/threads/:id/schedules')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async createThreadSchedule(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers(AGENT_TIMEZONE_HEADER) timeZone?: string
  ) {
    return this.threads.createFollowUpSchedule(
      agentIdentity(organization, user, timeZone),
      threadIdParam(id),
      (body as { title?: string; prompt?: string; cron?: string; timeZone?: string }) ?? {}
    );
  }

  @Delete('/threads/:id/schedules/:scheduleId')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async deleteThreadSchedule(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string
  ) {
    return this.threads.cancelFollowUpSchedule(
      agentIdentity(organization, user),
      threadIdParam(id),
      scheduleId
    );
  }

  @Get('/threads/:id/observability')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getThreadObservability(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    return this.threads.queryObservability(
      agentIdentity(organization, user),
      threadIdParam(id)
    );
  }

  @Get('/notifications')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async listNotifications(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Query() query?: unknown
  ) {
    const q =
      query && typeof query === 'object' && !Array.isArray(query)
        ? (query as { threadId?: unknown; limit?: unknown })
        : {};
    const threadId =
      typeof q.threadId === 'string' && q.threadId.trim()
        ? threadIdParam(q.threadId.trim())
        : undefined;
    const limit =
      typeof q.limit === 'string' && /^\d+$/.test(q.limit)
        ? Number(q.limit)
        : undefined;
    return this.threads.listNotifications(
      agentIdentity(organization, user),
      { threadId, limit }
    );
  }

  @Post('/notifications/read-all')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async markAllNotificationsRead(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body?: unknown
  ) {
    const payload =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { threadId?: unknown })
        : {};
    const threadId =
      typeof payload.threadId === 'string' && payload.threadId.trim()
        ? threadIdParam(payload.threadId.trim())
        : undefined;
    return this.threads.markAllNotificationsRead(
      agentIdentity(organization, user),
      threadId
    );
  }

  @Post('/notifications/:id/read')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async markNotificationRead(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body?: unknown
  ) {
    if (!AGENT_ID_PATTERN.test(id)) {
      throw new AgentChatRequestError(
        'AGENT_BAD_REQUEST',
        400,
        'The notification id is not valid.'
      );
    }
    const payload =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { threadId?: unknown })
        : {};
    const threadId =
      typeof payload.threadId === 'string' && payload.threadId.trim()
        ? threadIdParam(payload.threadId.trim())
        : undefined;
    return this.threads.markNotificationRead(
      agentIdentity(organization, user),
      id,
      threadId
    );
  }

  @Delete('/threads/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async deleteThread(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    return this.threads.remove(agentIdentity(organization, user), threadIdParam(id));
  }
}
