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
  return {
    organizationId: organization.id,
    organizationCreatedAt: new Date(organization.createdAt).toISOString(),
    userId: user.id,
    // An unknown role reads as the least one, never as a writer.
    role: role && ROLES.includes(role) ? role : 'USER',
    language:
      resolveBackendLocale((user as { language?: unknown }).language) === 'ru'
        ? 'ru'
        : 'en',
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
 * transient on the wire as the contract says: Mastra 1.71 drops the flag a
 * capability writes, so the browser would keep every stage in the message
 * (review W1).
 */
const sanitisedPart = (part: any) => {
  if (part?.type === 'error' && !KNOWN_ERRORS.includes(part.errorText)) {
    return { ...part, errorText: 'AGENT_FAILED' };
  }
  if (part?.type === PROGRESS_PART_TYPE && part.transient !== true) {
    return { ...part, transient: true };
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
  (part?.type === 'finish' && part?.finishReason === 'error');

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
    const forceAbort = () => {
      explicitlyStopped = true;
      execution?.stop('AGENT_TASK_STOPPED');
      turn?.stop();
      abort.abort();
      void reader?.cancel().catch(() => undefined);
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
        // The card this answer is for is being answered, not waiting.
        openProposals = openProposalTargets(
          runs,
          input.mode === 'resume'
            ? { runId: verified.runId, toolCallId: verified.toolCallId }
            : undefined
        );
        // One answer per run at a time: a second tab, or a retry, meets 409
        // instead of running the same card twice (review W1 F5).
        release = await this.threads.claimRun(verified.runId);
        if (!release) throw notPending();
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

      // This request's own id: the pictures it carries are held under it,
      // never under the thread (review W4-25 vision F3).
      const requestId = randomUUID();
      execution = createConductorExecution({ requestId, signal: abort.signal });
      releaseThread = await this.threads.claimThreadTurn(identity, threadId);
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
          await this.threads.sessionFor(identity, threadId, {
            bindThread: true,
            requestContext,
          });
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
      const activeTurn = this.threads.registerActiveTurn?.({
        identity,
        threadId,
        requestId,
        onStop: forceAbort,
      });
      try {
        turn = await this.threads.startTurn(identity, threadId, requestId, releaseThread);
        if (abort.signal.aborted) return;
        await execution.run(() => turn!.run(() => admission.run(async () => {
          let stream: ReadableStream<any>;
          try {
            stream = (await handleChatStream({
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
          }

          reader = stream.getReader();
          // Ended with no words and no card after its last tool (W3 walk
          // P2-B; review F1, F10 — each approval leg judged on its own): the
          // door's own closing line, before the part that ends it.
          const silence = closingLineWatch(answered?.calls.map((call) => call.toolCallId));
          const write = (part: unknown) => {
            const clean = sanitisedPart(part);
            activeTurn?.emitPart(clean);
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
          let held: any = null;
          const flushHeld = async () => {
            if (!held) return;
            const part = held;
            held = null;
            write(await this.withApprovalReason(part, identity, threadId, calls));
          };
          while (!abort.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            if (failedPart(value)) failed = true;
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
              held = value;
              continue;
            }
            write(
              value?.type === 'tool-approval-request'
                ? await this.withApprovalReason(value, identity, threadId, calls)
                : this.withToolTitle(value, identity)
            );
          }
          if (!abort.signal.aborted) await flushHeld();
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
            activeTurn?.emitPart(clean);
            if (!detached && !res.writableEnded) {
              res.write(`data: ${JSON.stringify(clean)}\n\n`);
            }
          }
        }
        const code = conductorErrorCode(error, errorScope);
        this.logger.warn(`Agent turn failed after the stream opened: ${stopped ?? code}`);
        const errorPart = { type: 'error', errorText: code };
        activeTurn?.emitPart(errorPart);
        if (!detached && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(errorPart)}\n\n`);
        }
      } finally {
        activeTurn?.finishStream();
        if (failedExecution()) failed = true;
        finished = true;
        // UI cancellation can finish before a non-cancellable service write.
        // Hold both claims and the unknown-result guard until those actual
        // capability Promises settle, including failures.
        try {
          await turn?.finish(failed ? 'failed' : abort.signal.aborted ? 'interrupted' : 'completed');
        } catch {
          // No terminal receipt: history stays running/unknown and refuses
          // a retry. A failed store write must never fabricate success.
          failed = true;
          this.logger.warn('Agent turn outcome could not be recorded.');
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
    const active = await this.threads.activeTurnFor(identity, threadId);
    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
    res.setHeader('x-accel-buffering', 'no');
    res.setHeader(AGENT_THREAD_HEADER, threadId);
    res.flushHeaders?.();
    if (!active) {
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    await new Promise<void>((resolve) => {
      let unsubscribe: () => void = () => undefined;
      const done = () => {
        unsubscribe();
        res.off?.('close', done);
        if (!res.writableEnded) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
        resolve();
      };
      res.on?.('close', done);
      unsubscribe = active.subscribe((event) => {
        if (event.done) {
          done();
          return;
        }
        if (event.part !== undefined && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(event.part)}\n\n`);
        }
      });
    });
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
