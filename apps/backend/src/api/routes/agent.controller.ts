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
  Res,
  UseGuards,
} from '@nestjs/common';
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
import {
  AGENT_ERROR_CODES,
  AGENT_STREAM_VERSION,
  AGENT_THREAD_HEADER,
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
  openProposalTargets,
  parseAgentChatBody,
  samplesReceiptRefused,
  mediaReceiptRefused,
  withMediaReceipt,
  DECLINED_ON_CARD,
  verifyPendingAnswer,
} from '@contentfactory/nestjs-libraries/chat/conductor/agent-chat.request';
import {
  CONDUCTOR_AGENT_ID,
  CONDUCTOR_MAX_STEPS,
  PAID_CALLS_HARD_LIMIT,
  PAID_CALLS_PER_TURN,
  buildConductorContext,
  conductorResourceId,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.context';
import {
  conductorErrorCode,
  conductorOnError,
  logConductorError,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.errors';
import { normaliseThreadTitle } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.memory';
import { holdViewedPictures } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.pictures';
import {
  STEP_CAP_CLOSING,
  closingLineWatch,
  lastStepSpeaks,
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
const closingLine = (language: 'ru' | 'en') => {
  const id = `cf-closing-${randomUUID()}`;
  return [
    { type: 'text-start', id },
    { type: 'text-delta', id, delta: STEP_CAP_CLOSING[language] },
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
    let reader: ReadableStreamDefaultReader<any> | undefined;
    // `res` closes when the person leaves (and after the end, when `finished`
    // is already set); `req` closes as soon as the body was read.
    const onClose = () => {
      if (finished) return;
      abort.abort();
      void reader?.cancel().catch(() => undefined);
    };
    res.on?.('close', onClose);
    let release: (() => Promise<void>) | null = null;

    try {
      const identity = agentIdentity(organization, user, timeZone);
      const input = parseAgentChatBody(body);
      const resourceId = conductorResourceId(identity.organizationId, identity.userId);

      // Ownership and pending answers are proven before anything is billed.
      let threadId: string;
      let fingerprints: string[] = [];
      let messages: unknown[];
      let paidLimit = PAID_CALLS_PER_TURN;
      let maxSteps = CONDUCTOR_MAX_STEPS;
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
        answered = {
          runId: verified.runId,
          calls:
            input.mode === 'approval'
              ? input.approvals.map((answer) => ({ toolCallId: answer.toolCallId }))
              : [{ toolCallId: verified.toolCallId as string, card: verified.card }],
        };
        if (input.mode === 'approval') {
          // Only a «Да» is the explicit continuation of premortem A2; a «Нет»
          // keeps the ordinary cap (review W1 F3).
          if (input.approvals.some((answer) => answer.approved)) {
            paidLimit = PAID_CALLS_HARD_LIMIT;
          }
          // Mastra resumes each answer as its own leg; the legs share the
          // request's step cap, so one admission never covers more than
          // `CONDUCTOR_MAX_STEPS` model steps (review W1 F4).
          maxSteps = Math.max(
            1,
            Math.floor(CONDUCTOR_MAX_STEPS / input.approvals.length)
          );
        } else {
          resume = {
            runId: input.runId,
            // Pinned: Mastra does not choose the question (review W1 F7).
            toolCallId: verified.toolCallId as string,
            resumeData: input.resumeData,
          };
        }
      }

      // This request's own id: the pictures it carries are held under it,
      // never under the thread (review W4-25 vision F3).
      const requestId = randomUUID();
      const requestContext = buildConductorContext({
        identity,
        threadId,
        paidLimit,
        approvals: fingerprints,
        openProposals,
        requestId,
      });
      const mastra = await this.mastraService.mastra();

      // One admission for this model-running request. Refused (no key, no
      // allowance) → an HTTP error with the service's code, before any stream.
      const admission = await this.aiUsage.beginAiOperation(
        identity.organizationId,
        'agent',
        'agent'
      );
      if (newThreadTitleFrom !== undefined && !abort.signal.aborted) {
        try {
          await this.threads.threadForMessage(identity, threadId, newThreadTitleFrom);
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
      try {
        await admission.run(async () => {
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
                maxSteps,
                // The last step of this request's cap speaks (W3 walk P2-B),
                // counted from this request's first step; what a «Нет» means
                // is read on every step of it and never stored (review F9).
                prepareStep: lastStepSpeaks(maxSteps, stepNotes, { resumed: input.mode !== 'message' }),
                abortSignal: abort.signal,
              } as any,
            })) as unknown as ReadableStream<any>;
          } catch (error) {
            failed = true;
            logConductorError(error, errorScope);
            const code = conductorErrorCode(error, errorScope);
            throw new HttpException({ code }, code === 'AGENT_RUN_NOT_PENDING' ? 409 : 502);
          }

          res.status(200);
          res.setHeader('content-type', 'text/event-stream');
          res.setHeader('cache-control', 'no-cache, no-transform');
          res.setHeader('connection', 'keep-alive');
          res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
          res.setHeader('x-accel-buffering', 'no');
          res.setHeader(AGENT_THREAD_HEADER, threadId);
          res.flushHeaders?.();
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
          const write = (part: unknown) => res.write(`data: ${JSON.stringify(sanitisedPart(part))}\n\n`);
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
            await flushHeld();
            if (silence.before(value)) {
              for (const part of closingLine(identity.language)) write(part);
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
        });
      } catch (error) {
        failed = true;
        if (!res.headersSent) throw error;
        logConductorError(error, errorScope);
        const code = conductorErrorCode(error, errorScope);
        this.logger.warn(`Agent turn failed after the stream opened: ${code}`);
        res.write(`data: ${JSON.stringify({ type: 'error', errorText: code })}\n\n`);
      } finally {
        finished = true;
        pictures.release();
        // A turn with an `error` part, or one the person left, is not a
        // success (premortem U2, U3); its tokens are recorded either way.
        await admission.finish(!failed && !abort.signal.aborted);
        if (res.headersSent && !res.writableEnded) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
    } finally {
      finished = true;
      res.off?.('close', onClose);
      await release?.();
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

  @Get('/threads')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async listThreads(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User
  ) {
    return this.threads.list(agentIdentity(organization, user));
  }

  @Get('/threads/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getThread(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    // The pending approval cards are redrawn in the reader's zone.
    @Headers(AGENT_TIMEZONE_HEADER) timeZone?: string
  ) {
    return this.threads.history(agentIdentity(organization, user, timeZone), threadIdParam(id));
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
