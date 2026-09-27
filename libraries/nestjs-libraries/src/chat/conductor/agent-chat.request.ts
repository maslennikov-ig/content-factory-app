import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AGENT_APPROVALS_PER_REQUEST,
  AGENT_ATTACHMENT_MAX_BYTES,
  AGENT_ATTACHMENT_MAX_FILES,
  AGENT_ATTACHMENT_MEDIA_TYPES,
  AGENT_ATTACHMENTS_TOTAL_MAX_BYTES,
  AGENT_TEXT_ATTACHMENT_MAX_BYTES,
  AGENT_TEXT_ATTACHMENT_MEDIA_TYPES,
  type AgentDoorErrorCode,
} from '../capabilities/agent-parts.contract';
import { approvalFingerprint } from '../capabilities/approval-fingerprint';
import {
  QUESTION_CARD_ID_PATTERN,
  answerFitsCard,
  questionCardId,
} from '../capabilities/question-card';
import { wrapUntrusted } from '../capabilities/untrusted-data';
import { redactSecretShapes } from './secret-shapes';

/**
 * Reading `POST /agent/chat` (`content-factory-next-kcxz.8`, premortem S2–S5).
 *
 * `handleChatStream` accepts the whole of `AgentExecutionOptions` in its
 * params — memory, request context, step limits, tool choice, provider
 * options. The door therefore reads four things from the body and nothing
 * else: `threadId`, the last of `messages`, `runId` and `resumeData`. The
 * thread's history is the server's own (memory), so a client cannot slip an
 * invented assistant turn into what the model reads.
 *
 * An answer on a card (an approval or a question) is checked against the runs
 * that really wait in this person's thread before anything runs or is billed;
 * an approval is recorded as the fingerprint of the stored call — tool and
 * arguments as the model asked for them — never of what the client sent back.
 * A question answer names the card it answers (`cardId`), and only the card
 * that waits now takes it, in the shape of that card (review W2 F3).
 *
 * What the person typed on a card (a decline reason, a question's answer) and
 * the text of an attached file pass the same key redaction as a message
 * before Mastra stores them (correctness review W1 F2, F13).
 */

export class AgentChatRequestError extends HttpException {
  constructor(
    readonly code: AgentDoorErrorCode | 'AGENT_RUN_NOT_PENDING',
    status: number,
    message: string
  ) {
    super({ code, message }, status);
  }
}

const badRequest = (message: string) =>
  new AgentChatRequestError('AGENT_BAD_REQUEST', HttpStatus.BAD_REQUEST, message);
export const notYours = () =>
  new AgentChatRequestError(
    'AGENT_NOT_YOURS',
    HttpStatus.FORBIDDEN,
    'This conversation or this card belongs to somebody else.'
  );

/**
 * The card is no longer open: already answered, finished, or being answered
 * by another request right now (correctness review W1 F5, F6). The thread is
 * the caller's own — this never says whose the run is.
 */
export const notPending = () =>
  new AgentChatRequestError(
    'AGENT_RUN_NOT_PENDING',
    HttpStatus.CONFLICT,
    'This card is no longer waiting for an answer.'
  );

/** Our ids and Mastra's (uuid, nanoid) both fit; paths and spaces do not. */
export const AGENT_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
/** The longest message one request carries, in characters of text. */
export const AGENT_MESSAGE_MAX_CHARS = 20_000;
/** A question card's answer is a few fields, never a document. */
export const AGENT_RESUME_MAX_BYTES = 8_192;
/** A decline reason is a sentence. */
export const AGENT_REASON_MAX_CHARS = 500;
const FILENAME_MAX_CHARS = 200;

export type AgentApprovalAnswer = {
  runId: string;
  toolCallId: string;
  approved: boolean;
  reason?: string;
};

export type AgentChatInput =
  | {
      mode: 'message';
      threadId?: string;
      /** The new user message, reduced to text and file parts. */
      message: { id: string; role: 'user'; parts: Record<string, unknown>[] };
      text: string;
    }
  | {
      mode: 'approval';
      threadId: string;
      messageId: string;
      approvals: AgentApprovalAnswer[];
    }
  | {
      mode: 'resume';
      threadId: string;
      runId: string;
      /** The question answered; absent → the run's only open question. */
      toolCallId?: string;
      /** The card answered (`AGENT_CARD_ID_KEY` of the card shown). */
      cardId: string;
      resumeData: Record<string, unknown>;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const idOrNull = (value: unknown) =>
  typeof value === 'string' && AGENT_ID_PATTERN.test(value) ? value : null;

/** Every string leaf with key shapes redacted; the shape is kept. */
export const redactSecretLeaves = (value: unknown): unknown => {
  if (typeof value === 'string') return redactSecretShapes(value);
  if (Array.isArray(value)) return value.map(redactSecretLeaves);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, leaf]) => [key, redactSecretLeaves(leaf)])
    );
  }
  return value;
};

const MEDIA_TYPES: readonly string[] = AGENT_ATTACHMENT_MEDIA_TYPES;
const TEXT_MEDIA_TYPES: readonly string[] = AGENT_TEXT_ATTACHMENT_MEDIA_TYPES;

/** `data:<type>[;param…];base64,<payload>` — nothing else is an attachment. */
const DATA_URL = /^data:[^,;]*((?:;[^,;]*)*);base64,/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const decodedBytes = (payload: string) =>
  Math.floor((payload.length * 3) / 4) -
  (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);

const cleanFilename = (value: unknown) =>
  typeof value === 'string'
    ? redactSecretShapes(value)
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .trim()
        .slice(0, FILENAME_MAX_CHARS) || undefined
    : undefined;

/** The shape an attached text file reaches the model in (premortem A4). */
export const attachedTextPart = (
  filename: string | undefined,
  mediaType: string,
  text: string
) => ({
  type: 'text' as const,
  text: JSON.stringify(
    wrapUntrusted(
      { attachment: filename ?? null, mediaType, text: redactSecretShapes(text) },
      ['uploaded-file']
    )
  ),
});

/**
 * One file part, checked (correctness review W1 F2): an inline `data:` URL
 * only — a link would make the server, Mastra or the provider fetch whatever
 * it names — of an allowed type, within the size limits. A text file becomes
 * a text part: redacted, and wrapped as untrusted data. A picture is rebuilt
 * under its declared type.
 */
const attachmentPart = (part: Record<string, unknown>) => {
  const mediaType =
    typeof part.mediaType === 'string' ? part.mediaType.trim().toLowerCase() : '';
  if (!MEDIA_TYPES.includes(mediaType)) {
    throw badRequest('This kind of file is not taken.');
  }
  const url = typeof part.url === 'string' ? part.url : '';
  const header = DATA_URL.exec(url);
  if (!header) throw badRequest('A file is sent inline, never as a link.');
  const payload = url.slice(header[0].length).replace(/\s+/g, '');
  if (!BASE64.test(payload)) throw badRequest('The file is not readable.');
  const bytes = decodedBytes(payload);
  const text = TEXT_MEDIA_TYPES.includes(mediaType);
  if (bytes > (text ? AGENT_TEXT_ATTACHMENT_MAX_BYTES : AGENT_ATTACHMENT_MAX_BYTES)) {
    throw badRequest('The file is too big.');
  }
  const filename = cleanFilename(part.filename);
  if (text) {
    const decoded = Buffer.from(payload, 'base64')
      .toString('utf8')
      .replace(/^\uFEFF/, '');
    return { part: attachedTextPart(filename, mediaType, decoded), bytes };
  }
  return {
    part: {
      type: 'file',
      url: `data:${mediaType};base64,${payload}`,
      mediaType,
      ...(filename ? { filename } : {}),
    },
    bytes,
  };
};

const userParts = (parts: unknown) => {
  if (!Array.isArray(parts)) throw badRequest('The message has no parts.');
  const kept: Record<string, unknown>[] = [];
  let text = '';
  let files = 0;
  let bytes = 0;
  for (const part of parts) {
    if (!isRecord(part)) continue;
    if (part.type === 'text' && typeof part.text === 'string') {
      text += (text ? '\n' : '') + part.text;
      kept.push({ type: 'text', text: part.text });
    } else if (part.type === 'file') {
      files += 1;
      if (files > AGENT_ATTACHMENT_MAX_FILES) {
        throw badRequest('Too many files in one message.');
      }
      const attached = attachmentPart(part);
      bytes += attached.bytes;
      if (bytes > AGENT_ATTACHMENTS_TOTAL_MAX_BYTES) {
        throw badRequest('The files are too big together.');
      }
      kept.push(attached.part);
    }
  }
  if (!text.trim() && !files) throw badRequest('The message is empty.');
  if (text.length > AGENT_MESSAGE_MAX_CHARS) {
    throw badRequest('The message is too long.');
  }
  return { parts: kept, text };
};

/** `tool-<name>` or `dynamic-tool` parts in state `approval-responded`. */
const approvalAnswers = (parts: unknown): AgentApprovalAnswer[] => {
  const byTarget = new Map<string, AgentApprovalAnswer>();
  if (!Array.isArray(parts)) return [];
  for (const part of parts) {
    if (!isRecord(part) || typeof part.type !== 'string') continue;
    if (!part.type.startsWith('tool-') && part.type !== 'dynamic-tool') continue;
    if (part.state !== 'approval-responded' || !isRecord(part.approval)) continue;
    const approvalId = part.approval.id;
    if (typeof approvalId !== 'string') continue;
    const separator = approvalId.lastIndexOf('::');
    if (separator === -1) continue;
    const runId = idOrNull(approvalId.slice(0, separator));
    const toolCallId = approvalId.slice(separator + 2);
    if (!runId || !toolCallId || toolCallId !== part.toolCallId) continue;
    if (typeof part.approval.approved !== 'boolean') continue;
    const reason =
      typeof part.approval.reason === 'string'
        ? redactSecretShapes(part.approval.reason.slice(0, AGENT_REASON_MAX_CHARS))
        : undefined;
    byTarget.set(`${runId}::${toolCallId}`, {
      runId,
      toolCallId,
      approved: part.approval.approved,
      ...(reason ? { reason } : {}),
    });
  }
  return [...byTarget.values()];
};

export const parseAgentChatBody = (body: unknown): AgentChatInput => {
  if (!isRecord(body)) throw badRequest('The body is not an object.');
  const threadId =
    body.threadId === undefined || body.threadId === null
      ? undefined
      : idOrNull(body.threadId);
  if (body.threadId !== undefined && body.threadId !== null && !threadId) {
    throw badRequest('The thread id is not valid.');
  }

  if (body.runId !== undefined || body.resumeData !== undefined) {
    const runId = idOrNull(body.runId);
    if (!runId || !isRecord(body.resumeData)) {
      throw badRequest('A resume needs a run id and the answer.');
    }
    if (JSON.stringify(body.resumeData).length > AGENT_RESUME_MAX_BYTES) {
      throw badRequest('The answer is too long.');
    }
    const toolCallId =
      body.toolCallId === undefined || body.toolCallId === null
        ? undefined
        : idOrNull(body.toolCallId);
    if (body.toolCallId !== undefined && body.toolCallId !== null && !toolCallId) {
      throw badRequest('The question id is not valid.');
    }
    if (!threadId) throw badRequest('A resume needs its thread.');
    // The card the answer is for, as the card carried it (review W2 F3).
    if (typeof body.cardId !== 'string' || !QUESTION_CARD_ID_PATTERN.test(body.cardId)) {
      throw badRequest('A resume names the card it answers.');
    }
    return {
      mode: 'resume',
      threadId,
      runId,
      ...(toolCallId ? { toolCallId } : {}),
      cardId: body.cardId,
      resumeData: redactSecretLeaves(body.resumeData) as Record<string, unknown>,
    };
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1];
  if (!isRecord(last)) throw badRequest('There is no message to answer.');
  const messageId = idOrNull(last.id);
  if (!messageId) throw badRequest('The message id is not valid.');

  if (last.role === 'user') {
    const { parts, text } = userParts(last.parts);
    return {
      mode: 'message',
      ...(threadId ? { threadId } : {}),
      message: { id: messageId, role: 'user', parts },
      text,
    };
  }
  if (last.role === 'assistant') {
    const approvals = approvalAnswers(last.parts);
    if (!approvals.length) throw badRequest('The message answers no approval.');
    // One billed request answers the cards of one step, a few at most
    // (correctness review W1 F4).
    if (approvals.length > AGENT_APPROVALS_PER_REQUEST) {
      throw badRequest('Too many answers in one request.');
    }
    if (new Set(approvals.map((answer) => answer.runId)).size > 1) {
      throw badRequest('One request answers the cards of one run.');
    }
    if (!threadId) throw badRequest('An approval answer needs its thread.');
    return { mode: 'approval', threadId, messageId, approvals };
  }
  throw badRequest('Only a person’s message or an answer on a card is taken.');
};

/** The part of `Agent.listSuspendedRuns` this door reads. */
export type PendingRun = {
  runId: string;
  threadId?: string;
  resourceId?: string;
  toolCalls: Array<{
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    requiresApproval: boolean;
    suspendPayload?: unknown;
  }>;
};

export type VerifiedAnswer = {
  /** Fingerprints of the calls the person approved, from the stored call. */
  fingerprints: string[];
  /** The run this answer continues; claimed by the door before it runs. */
  runId: string;
  /** Resume only: the question this answer is for, pinned. */
  toolCallId?: string;
  /** Resume only: the card of that question the answer was verified against. */
  card?: string;
  /** Approval only: the calls the person said «Да» to, as stored. */
  approved?: Array<{ toolCallId: string; toolName: string; args: unknown }>;
  /**
   * The assistant message handed to `handleChatStream` for an approval: only
   * verified approval parts, with the stored arguments.
   */
  approvalMessage?: {
    id: string;
    role: 'assistant';
    parts: Record<string, unknown>[];
  };
};

/**
 * Every answer must name a run that waits in this very thread of this very
 * person, and a tool call of that run that waits for this kind of answer
 * (premortem S2). `runs` come from `listSuspendedRuns({ threadId,
 * resourceId })`; the thread and the resource are re-read on each row too.
 *
 * The caller has already proven the thread is the person's own. A run it does
 * not list, or a call of it that no longer waits for this kind of answer, is
 * therefore a card that closed — answered in another tab, finished — and is
 * refused as `AGENT_RUN_NOT_PENDING` (409), not as somebody else's
 * (correctness review W1 F6). A row that storage returned for another thread
 * or person stays `AGENT_NOT_YOURS`.
 */
export const verifyPendingAnswer = (
  input: Exclude<AgentChatInput, { mode: 'message' }>,
  runs: readonly PendingRun[],
  scope: { threadId: string; resourceId: string }
): VerifiedAnswer => {
  const runOf = (runId: string) => {
    const run = runs.find((candidate) => candidate.runId === runId);
    if (!run) throw notPending();
    if (
      (run.threadId !== undefined && run.threadId !== scope.threadId) ||
      (run.resourceId !== undefined && run.resourceId !== scope.resourceId)
    ) {
      throw notYours();
    }
    return run;
  };

  if (input.mode === 'resume') {
    const run = runOf(input.runId);
    const questions = run.toolCalls.filter(
      (call) => !call.requiresApproval && call.toolCallId
    );
    const call = input.toolCallId
      ? questions.find((candidate) => candidate.toolCallId === input.toolCallId)
      : questions.length === 1
        ? questions[0]
        : undefined;
    if (!call) {
      if (!input.toolCallId && questions.length > 1) {
        throw badRequest('Name the question this answer is for.');
      }
      throw notPending();
    }
    // The card waiting now, from the payload Mastra keeps on the server. An
    // answer written for another card of the same call — a stale tab, an
    // older card redrawn — is not an answer to this one (review W2 F3).
    const card = questionCardId(call.suspendPayload);
    if (card !== input.cardId) throw notPending();
    if (!answerFitsCard(call.suspendPayload, input.resumeData)) {
      throw badRequest('The answer does not fit the card it names.');
    }
    return {
      fingerprints: [],
      runId: run.runId,
      toolCallId: call.toolCallId as string,
      card,
    };
  }

  const fingerprints: string[] = [];
  const approved: NonNullable<VerifiedAnswer['approved']> = [];
  const parts: Record<string, unknown>[] = [];
  for (const answer of input.approvals) {
    const run = runOf(answer.runId);
    const call = run.toolCalls.find(
      (candidate) =>
        candidate.requiresApproval && candidate.toolCallId === answer.toolCallId
    );
    if (!call?.toolName) throw notPending();
    if (answer.approved) {
      fingerprints.push(approvalFingerprint(call.toolName, call.args ?? {}));
      approved.push({ toolCallId: answer.toolCallId, toolName: call.toolName, args: call.args ?? {} });
    }
    parts.push({
      type: `tool-${call.toolName}`,
      toolCallId: answer.toolCallId,
      state: 'approval-responded',
      input: call.args ?? {},
      approval: {
        id: `${answer.runId}::${answer.toolCallId}`,
        approved: answer.approved,
        ...(answer.reason ? { reason: answer.reason } : {}),
      },
    });
  }
  return {
    fingerprints,
    approved,
    runId: input.approvals[0].runId,
    approvalMessage: { id: input.messageId, role: 'assistant', parts },
  };
};

/**
 * The texts whose card of proposed changes still waits in the thread
 * (`kcxz.32`, N2), read from the cards Mastra stored (`target`, server-only),
 * except the call this request itself answers: its resume is the answer, not
 * a second proposal. The hooks refuse a new check or rewrite of these texts.
 */
export const openProposalTargets = (
  runs: readonly PendingRun[],
  answering?: { runId: string; toolCallId?: string }
): string[] => {
  const targets = new Set<string>();
  for (const run of runs) {
    for (const call of run.toolCalls) {
      if (call.requiresApproval) continue;
      if (
        answering &&
        run.runId === answering.runId &&
        (!answering.toolCallId || call.toolCallId === answering.toolCallId)
      ) {
        continue;
      }
      const payload = isRecord(call.suspendPayload) ? call.suspendPayload : null;
      if (payload?.kind === 'selection' && typeof payload.target === 'string' && payload.target) {
        targets.add(payload.target);
      }
    }
  }
  return [...targets];
};
