import type { UIMessage } from 'ai';

/**
 * The agent screen's contract with `POST /agent/chat` and `/agent/threads`,
 * in one file (`content-factory-next-kcxz.10`).
 *
 * The server declares the wire in
 * `libraries/nestjs-libraries/src/chat/capabilities/agent-parts.contract.ts`;
 * the frontend cannot import a backend module, so the constants below repeat
 * it under the same names, and `tests/agent-parts.mirror.guard.test.cjs`
 * holds the two files together.
 *
 * Everything the screen knows about the wire lives here: the doors, the body
 * the chat door takes, the thread shapes, and how a stored or streamed
 * message part becomes a block the screen draws. The components below this
 * file read `AgentBlock` and `AgentArtifact` only, so when the server's parts
 * change shape, this is the one file that changes with them.
 *
 * Native, and not ours (ADR-0012 «Поправка 27.09.2026»): the stream is AI SDK
 * UI v7; a tool call is `tool-<toolName>` with the capability label as its
 * `title`; an approval is the part state `approval-requested`; a question is
 * `data-tool-call-suspended`, answered with `{ runId, resumeData }`, and the
 * answer continues the same assistant message (spike 26.09, Q3).
 */

/* ---- Mirror of agent-parts.contract.ts ------------------------------------ */

export const AGENT_STREAM_VERSION = 'v7' as const;

export const CARD_KINDS = [
  'workspace',
  'channels',
  'piece',
  'avatar',
  'adaptation',
  'plan',
  'channel',
  'channel-connect',
  'secret',
  'ideas',
  'facts',
  'media',
] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** How a platform is connected from the chat (`kcxz.19`). */
export const CHANNEL_CONNECT_FLOWS = ['telegram', 'oauth'] as const;
export type ChannelConnectFlow = (typeof CHANNEL_CONNECT_FLOWS)[number];

export const PROGRESS_PART_TYPE = 'data-progress' as const;

export const CAPABILITY_REFUSAL_CODES = [
  'IDENTITY_MISSING',
  'APPROVAL_MISMATCH',
  'PAID_CAP_REACHED',
  'PERMISSION_DENIED',
  'INPUT_NEEDS_PERSON',
  'APPROVAL_CONTENT_CHANGED',
  'PROPOSAL_CARD_OPEN',
  'CONFIRMATION_INVALID',
  'CONFIRMATION_UNAVAILABLE',
] as const;

export const AGENT_ERROR_CODES = [
  'AGENT_FAILED',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_ALLOWANCE_EXHAUSTED',
  'AI_PROVIDER_BUSY',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_REJECTED',
  'AGENT_PICTURE_NOT_SEEN',
  'AGENT_BLOCKED',
  'AGENT_RUN_NOT_PENDING',
] as const;

export const AGENT_DOOR_ERROR_CODES = [
  'AGENT_BAD_REQUEST',
  'AGENT_NOT_YOURS',
  'ai_rate_limited',
] as const;

/** The key «Решите за меня» answers a question card with. */
export const AGENT_DECIDE_FOR_PERSON_KEY = 'decideForPerson' as const;

/**
 * The key a question card's id rides under (review W2 F3): the server puts
 * it on every card it shows, and the answer sends it back as `cardId`, so an
 * answer lands only on the card it answers.
 */
export const AGENT_CARD_ID_KEY = 'cardId' as const;

/**
 * A selection card's `suspendPayload` (`kcxz.12`): rows to keep, several at
 * once. `selected` is the product's own default; the answer is
 * `{ [answerKey]: ids }` or `{ [AGENT_DECIDE_FOR_PERSON_KEY]: true }`.
 */
export type AgentSelectionQuestionPayload = {
  kind: 'selection';
  question: string;
  answerKey: string;
  options: Array<{
    id: string;
    label: string;
    selected: boolean;
    status?: string | null;
    source?: string | null;
  }>;
  canDecideForPerson: true;
  cardId?: string;
};

/**
 * The adaptation interview card's `suspendPayload` (`kcxz.14`). Answer:
 * `{ answers: [{ key, text, origin }], decideKeys }` or «Решите за меня».
 */
export type AgentInterviewQuestionPayload = {
  kind: 'interview';
  question: string;
  questions: Array<{
    key: string;
    question: string;
    suggested: string | null;
    options?: string[];
    why?: string;
  }>;
  canDecideForPerson: true;
  channel: { id: string; name: string; provider: string } | null;
  cardId?: string;
};

/**
 * A consent card that names its answer key (`kcxz.14`: adapting into an
 * autopilot channel). Answer `{ [answerKey]: true | false }`; no «Решите за
 * меня».
 */
export type AgentConsentQuestionPayload = {
  kind: 'consent';
  /** What is consented to; `autopilot` — writing into an autopilot channel. */
  subject: 'autopilot';
  question: string;
  answerKey: string;
  canDecideForPerson: false;
  channel: { id: string; name: string; provider: string } | null;
  cardId?: string;
};

/**
 * The card of `media.keep` (owner decision 28.09.2026, «агент видит
 * картинки»): the browser that holds the picture it showed the agent puts it
 * into the media library when the person agrees, and answers
 * `{ kept: true, mediaId }`, `{ kept: false }` or `{ kept: false, gone: true }`
 * when the page no longer holds it. No «Решите за меня».
 */
export type AgentKeepPictureQuestionPayload = {
  kind: 'keep-picture';
  question: string;
  /** The key the browser keeps the picture under. */
  pictureKey: string;
  canDecideForPerson: false;
  cardId?: string;
};

/**
 * Where a plan card's post stands (`kcxz.15`): `reserve` goes out only once
 * confirmed, `scheduled` by itself, `draft` has no plan, `published` is out,
 * `error` was sent and did not go out (review W2 F14).
 */
export const PLAN_SLOT_STATES = ['reserve', 'scheduled', 'draft', 'published', 'error'] as const;
export type PlanSlotState = (typeof PLAN_SLOT_STATES)[number];

/**
 * A plan card's `data` (`data-plan`): `id` is the adaptation, `pieceId` its
 * piece, `at` the ISO time it stands at.
 */
export type AgentPlanCardPayload = {
  kind: 'plan';
  id: string;
  pieceId: string;
  channel?: { id: string; name: string; provider: string };
  at?: string | null;
  state: PlanSlotState;
};

/** Request header: the browser's IANA time zone, the zone of the screens. */
export const AGENT_TIMEZONE_HEADER = 'x-agent-timezone' as const;

/** Response header of `POST /agent/chat` naming the thread it wrote to. */
export const AGENT_THREAD_HEADER = 'x-agent-thread-id' as const;

export const AGENT_THREAD_TITLE_MAX = 120;

/** What the chat door takes as an attachment, inline only (review W1 F2). */
export const AGENT_ATTACHMENT_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export const AGENT_TEXT_ATTACHMENT_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
] as const;
export const AGENT_ATTACHMENT_MAX_FILES = 5;
export const AGENT_ATTACHMENT_MAX_BYTES = 5242880;
export const AGENT_TEXT_ATTACHMENT_MAX_BYTES = 262144;
export const AGENT_ATTACHMENTS_TOTAL_MAX_BYTES = 10485760;

/** Answers one approval request carries at most: the cards of one step. */
export const AGENT_APPROVALS_PER_REQUEST = 3;

/** The approval card's «what and where» line, at most. */
/** 700 since kcxz.45: a «Не надо» card names each of up to ten leads. */
export const AGENT_APPROVAL_SUMMARY_MAX = 700;

/**
 * Samples attached in the chat (`kcxz.18`): the composer uploads the files to
 * the avatar door itself and the message carries only this receipt; the file
 * body never reaches the chat door or the model.
 */
export const AGENT_SAMPLES_PART_TYPE = 'data-avatar-samples' as const;
export const AGENT_SAMPLES_MAX_FILES = 10;
export const AGENT_SAMPLES_MAX_REASONS = 20;
export type AgentSamplesUpload = {
  avatarId: string | null;
  files: string[];
  accepted: number;
  refused: Array<{ reason: string; count: number }>;
  telegram: Array<{ name: string; selected: number; eligible: number }>;
};

/**
 * Pictures attached in the chat (`kcxz.25`): the composer uploads them to the
 * media library itself and the message carries only this receipt — library
 * ids, names, types; the picture never reaches the chat door or the model.
 */
export const AGENT_MEDIA_PART_TYPE = 'data-media-upload' as const;
export const AGENT_MEDIA_MAX_FILES = 5;
export const AGENT_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export type ChatPictureType = (typeof AGENT_MEDIA_TYPES)[number];
export type LibraryUploadReceipt = {
  media: Array<{ id: string; name: string; type: ChatPictureType }>;
};

/* ---- Doors ----------------------------------------------------------------- */

export const AGENT_DOORS = {
  chat: '/agent/chat',
  threads: '/agent/threads',
  thread: (id: string) => `/agent/threads/${encodeURIComponent(id)}`,
} as const;

export type AgentMessage = UIMessage;

/* ---- Artifacts ------------------------------------------------------------- */

/**
 * Cards drawn in the conversation itself, never opened beside it
 * (`kcxz.19`): connecting a channel is something the person does on the card
 * — the Telegram steps or the platform's button — not a thing to look at; so
 * is typing a key into the key card (`kcxz.20`).
 */
export const INLINE_CARD_KINDS = ['channel-connect', 'secret'] as const;

export type AgentArtifactKind = Exclude<CardKind, (typeof INLINE_CARD_KINDS)[number]>;

const ARTIFACT_KINDS: readonly string[] = CARD_KINDS.filter(
  (kind) => !(INLINE_CARD_KINDS as readonly string[]).includes(kind)
);

export const isArtifactKind = (value: unknown): value is AgentArtifactKind =>
  typeof value === 'string' && ARTIFACT_KINDS.includes(value);

/** The product object a turn produced, by id, with what its part carried. */
export type AgentArtifact = {
  kind: AgentArtifactKind;
  id: string;
  title: string | null;
  code: string | null;
  data: Readonly<Record<string, unknown>>;
};

/**
 * The channel an adaptation card is about: `channel.id` of the card
 * (`kcxz.14`), or `channelId` as it was first drawn. `null` when the card
 * does not say (an edit or a check names only the adaptation).
 */
export const artifactChannelId = (artifact: {
  data?: Readonly<Record<string, unknown>>;
}): string | null =>
  stringOf(recordOf(artifact.data?.channel).id) ??
  stringOf(artifact.data?.channelId) ??
  null;

/** Where «Открыть на экране» leads for each kind. */
export const artifactHref = (artifact: {
  kind: AgentArtifactKind;
  id: string;
  data?: Readonly<Record<string, unknown>>;
}): string => {
  const id = encodeURIComponent(artifact.id);
  switch (artifact.kind) {
    case 'piece':
      return `/content/pieces/${id}`;
    case 'adaptation':
    case 'plan': {
      const pieceId = stringOf(artifact.data?.pieceId);
      const channelId = artifactChannelId(artifact);
      // A plan slot opens the channel tab at its time (`pieceSlotPath`).
      const when = artifact.kind === 'plan' ? stringOf(artifact.data?.at) : null;
      if (!pieceId) return artifact.kind === 'plan' ? '/launches' : '/content?tab=materials';
      const query = [
        ...(channelId ? [`tab=${encodeURIComponent(channelId)}`] : []),
        ...(channelId && when ? [`when=${encodeURIComponent(when)}`] : []),
      ].join('&');
      return `/content/pieces/${encodeURIComponent(pieceId)}${query ? `?${query}` : ''}`;
    }
    case 'avatar':
      return `/content/avatars/${id}`;
    case 'channel':
      return `/channels/${id}`;
    case 'channels':
      return '/channels';
    case 'ideas':
      return '/content?tab=leads';
    case 'facts':
      return '/content?tab=provenance';
    case 'media':
      return '/media';
    case 'workspace':
    default:
      return '/onboarding';
  }
};

const artifactOf = (kind: unknown, data: unknown): AgentArtifact | null => {
  if (!isArtifactKind(kind)) return null;
  const record = recordOf(data);
  const id = stringOf(record.id);
  if (!id) return null;
  return {
    kind,
    id,
    title: stringOf(record.title) ?? stringOf(record.name),
    code: stringOf(record.code),
    data: record,
  };
};

/**
 * A `channel-connect` card (`kcxz.19`): which platform, how it connects, and
 * the channels of that platform that were already there, so the card can
 * name the one that arrived. No word, nonce or token rides here.
 */
export type AgentChannelConnect = {
  provider: string;
  name: string;
  flow: ChannelConnectFlow;
  known: readonly string[];
  /** When the card was made (ISO); `null` on a card from before the window. */
  since: string | null;
};

const readChannelConnect = (data: unknown): AgentChannelConnect | null => {
  const record = recordOf(data);
  const provider = stringOf(record.provider) ?? stringOf(record.id);
  const flow = record.flow === 'telegram' || record.flow === 'oauth' ? record.flow : null;
  if (!provider || !flow) return null;
  return {
    provider,
    name: stringOf(record.name) ?? provider,
    flow,
    known: Array.isArray(record.known)
      ? record.known.filter((id): id is string => typeof id === 'string')
      : [],
    since: stringOf(record.since),
  };
};

/**
 * How long after the card a new channel is still its own (review W3-19
 * P3-3): long enough for a person who steps away mid-connection, short
 * enough that a card left in the history does not claim a channel connected
 * another day. After it the card offers the connection again.
 */
export const CONNECT_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Server clocks may differ a little between the card and the channel row. */
const CONNECT_SKEW_MS = 60 * 1000;

/** A row of `GET /integrations/list`, as the connect card reads it. */
export type ConnectListRow = {
  id: string;
  name: string;
  identifier: string;
  inBetweenSteps?: boolean;
  refreshNeeded?: boolean;
  createdAt?: string | null;
};

const connectSince = (connect: AgentChannelConnect) => {
  const since = connect.since ? Date.parse(connect.since) : Number.NaN;
  return Number.isFinite(since) ? since : null;
};

/** Whether the card may still credit a channel (its window is open). */
export const connectWindowOpen = (connect: AgentChannelConnect, now: number) => {
  const since = connectSince(connect);
  return since !== null && now <= since + CONNECT_WINDOW_MS;
};

/**
 * The channel this card connected, or `null` (review W3-19 P3-3): the same
 * platform, not there when the card was made, created after the card and
 * within its window, and finished — a two-step connection left at the page
 * choice (`inBetweenSteps`) or a channel that already needs reconnecting is
 * not a connected channel. A card without `since` credits nothing. Another
 * member connecting the same platform inside the window is still credited:
 * nothing in the list tells the two apart.
 */
export const arrivedChannelOf = (
  connect: AgentChannelConnect,
  rows: readonly ConnectListRow[]
): ConnectListRow | null => {
  const since = connectSince(connect);
  if (since === null) return null;
  return (
    rows.find((row) => {
      if (row.identifier !== connect.provider || connect.known.includes(row.id)) return false;
      if (row.inBetweenSteps || row.refreshNeeded) return false;
      const created = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
      return (
        Number.isFinite(created) &&
        created >= since - CONNECT_SKEW_MS &&
        created <= since + CONNECT_WINDOW_MS
      );
    }) ?? null
  );
};

/**
 * What the platform's return said, from the chat's own address (review
 * W3-19 P3-4). The callback page (`continue.integration.tsx`,
 * `navigateOrShow`) sends a failure to the return address the door answered
 * with, as `?precondition=true` (412: the account was connected to another
 * workspace, and a trial cannot take it) or `?msg=<text>` (406); a success
 * carries `added=<platform>` beside its own `msg`. Today the door names the
 * return address only on success, so a 412 lands on «Каналы» with its own
 * dialog and other failures stay on the callback page; this reading keeps
 * the chat honest if a failure does come back here.
 */
export type ConnectReturn =
  | { kind: 'precondition' }
  | { kind: 'failed'; message: string };

export const connectReturnOf = (search: string): ConnectReturn | null => {
  const params = new URLSearchParams(search);
  if (params.get('added')) return null;
  if (params.get('precondition')) return { kind: 'precondition' };
  const message = (params.get('msg') ?? '').trim();
  return message ? { kind: 'failed', message: message.slice(0, 200) } : null;
};

/* ---- Threads --------------------------------------------------------------- */

export type AgentThreadSummary = {
  id: string;
  title: string | null;
  updatedAt: string | null;
};

const readThread = (row: unknown): AgentThreadSummary | null => {
  const record = recordOf(row);
  const id = stringOf(record.id);
  if (!id) return null;
  return {
    id,
    title: stringOf(record.title),
    updatedAt: stringOf(record.updatedAt) ?? stringOf(record.createdAt),
  };
};

/** `GET /agent/threads` → `{ threads }`, newest first. */
export const readThreadList = (body: unknown): AgentThreadSummary[] => {
  const list = recordOf(body).threads;
  return Array.isArray(list)
    ? list
        .map(readThread)
        .filter((row): row is AgentThreadSummary => row !== null)
    : [];
};

/**
 * An approval or a question still waiting, read from storage after a reload
 * (`AgentPendingRunV1`), so the card is redrawn and answered by `runId`.
 */
export type AgentPendingRun = {
  runId: string;
  toolCallId: string | null;
  toolName: string | null;
  kind: 'approval' | 'question';
  suspendPayload: unknown;
  /** Approval only: what and where, the server's words from the stored call. */
  summary: string | null;
};

const readPending = (row: unknown): AgentPendingRun | null => {
  const record = recordOf(row);
  const runId = stringOf(record.runId);
  if (!runId) return null;
  if (record.kind !== 'approval' && record.kind !== 'question') return null;
  return {
    runId,
    toolCallId: stringOf(record.toolCallId),
    toolName: stringOf(record.toolName),
    kind: record.kind,
    suspendPayload: record.suspendPayload ?? null,
    summary: stringOf(record.summary),
  };
};

export type AgentThreadHistory = {
  thread: AgentThreadSummary | null;
  messages: AgentMessage[];
  pending: AgentPendingRun[];
};

/**
 * `GET /agent/threads/:id` → `{ thread, messages, pending }`. The messages are
 * AI SDK UI v7 messages. A pending approval whose stored tool part lost its
 * approval state is put back into `approval-requested`, with the approval id
 * Mastra gives it (`<runId>::<toolCallId>`) and the server's «what and where»
 * as its `requestReason`, so «Да» and «Нет» answer it the native way. A
 * stored `approval-requested` part that no longer waits (answered in another
 * tab, finished) is drawn as closed, without buttons (review W1 F6).
 */
export const readThreadHistory = (body: unknown): AgentThreadHistory => {
  const record = recordOf(body);
  const pending = Array.isArray(record.pending)
    ? record.pending
        .map(readPending)
        .filter((run): run is AgentPendingRun => run !== null)
    : [];
  const approvals = new Map(
    pending
      .filter((run) => run.kind === 'approval' && run.toolCallId)
      .map((run) => [run.toolCallId as string, run])
  );
  const messages = (Array.isArray(record.messages) ? record.messages : [])
    .filter(isUiMessage)
    .map((message) => reopenApprovals(message, approvals));
  return { thread: readThread(record.thread), messages, pending };
};

const reopenApprovals = (
  message: AgentMessage,
  approvals: ReadonlyMap<string, AgentPendingRun>
): AgentMessage => {
  let changed = false;
  const parts = (message.parts as unknown as Part[]).map((part) => {
    const toolCallId = stringOf(part.toolCallId);
    const run = toolCallId ? approvals.get(toolCallId) : undefined;
    if (!toolNameOfPart(part)) return part;
    if (!run) {
      if (part.state !== 'approval-requested') return part;
      changed = true;
      return { ...part, approval: { ...recordOf(part.approval), closed: true } };
    }
    if (part.state !== 'input-available' && part.state !== 'approval-requested') {
      return part;
    }
    changed = true;
    return {
      ...part,
      state: 'approval-requested',
      approval: {
        ...recordOf(part.approval),
        id: `${run.runId}::${toolCallId}`,
        ...(run.summary ? { requestReason: run.summary } : {}),
      },
    };
  });
  return changed
    ? ({ ...message, parts } as unknown as AgentMessage)
    : message;
};

const isUiMessage = (value: unknown): value is AgentMessage => {
  const record = recordOf(value);
  return (
    typeof record.id === 'string' &&
    (record.role === 'user' || record.role === 'assistant') &&
    Array.isArray(record.parts)
  );
};

/* ---- The chat door's body --------------------------------------------------- */

/**
 * An answer to a question: the one other thing the body carries. The question
 * is named by its call, so the server never has to guess it (review W1 F7).
 */
export type AgentResume = {
  runId: string;
  toolCallId: string | null;
  /** The card answered (`AGENT_CARD_ID_KEY`); the door refuses any other. */
  cardId: string | null;
  resumeData: Record<string, unknown>;
};

/** An assistant message carrying an answer on one of its approval cards. */
const answersApproval = (message: AgentMessage | undefined) =>
  message?.role === 'assistant' &&
  (message.parts as unknown as Part[]).some(
    (part) => toolNameOfPart(part) !== null && part.state === 'approval-responded'
  );

/**
 * `AgentChatRequestV1`. The server reads only these keys and only the last
 * message: a new user message, or the assistant message whose tool part is
 * `approval-responded`; a resume sends `runId` + `resumeData` and no message.
 * No `threadId` opens a new thread, named back in `AGENT_THREAD_HEADER`.
 *
 * An approval card further up the conversation (`kcxz.32`, N1): the AI SDK
 * sends the request for the message the card is in (`messageId`, set by
 * `addToolApprovalResponse` → `sendMessage()`), with every message of the
 * chat. That message, not the chat's last one, is the one sent.
 */
export const buildChatBody = ({
  threadId,
  messages,
  messageId,
  resume,
}: {
  threadId: string | null;
  messages: readonly AgentMessage[];
  /** The message the SDK's request is for, when it names one. */
  messageId?: string | null;
  resume?: AgentResume | null;
}) => {
  const thread = threadId ? { threadId } : {};
  if (resume) {
    return {
      ...thread,
      messages: [] as AgentMessage[],
      runId: resume.runId,
      ...(resume.toolCallId ? { toolCallId: resume.toolCallId } : {}),
      ...(resume.cardId ? { cardId: resume.cardId } : {}),
      resumeData: resume.resumeData,
    };
  }
  const named = messageId
    ? messages.find((message) => message.id === messageId)
    : undefined;
  const last = answersApproval(named) ? named : messages[messages.length - 1];
  return { ...thread, messages: last ? [last] : [] };
};

/**
 * A question card answered further up the conversation (`kcxz.32`, D2): the
 * AI SDK continues the chat's last assistant message with the answer's
 * stream, but the call it continues lives in an earlier message, so the chat
 * core met an output for a call it did not know and the screen said «Не
 * получилось» after the answer had gone through (live recheck 27.09, s10).
 * The call is announced first in the message that takes the stream — the
 * part it continues, by its id, name, input and label — and its result shows
 * where the person is. `null` when the last message already has the call.
 */
export const continuedCallChunk = (
  messages: readonly AgentMessage[],
  resume: AgentResume | null
): Record<string, unknown> | null => {
  const toolCallId = resume?.toolCallId;
  if (!toolCallId) return null;
  const last = messages[messages.length - 1];
  const has = (message: AgentMessage | undefined) =>
    (message?.parts as unknown as Part[] | undefined)?.find(
      (part) => toolNameOfPart(part) !== null && part.toolCallId === toolCallId
    );
  if (last?.role === 'assistant' && has(last)) return null;
  const origin = [...messages].reverse().map(has).find(Boolean);
  const toolName = origin ? toolNameOfPart(origin) : null;
  if (!origin || !toolName) return null;
  const title = stringOf(origin.title);
  return {
    type: 'tool-input-available',
    toolCallId,
    toolName,
    input: origin.input ?? {},
    ...(title ? { title } : {}),
  };
};

/** Read back the resume the screen put into `sendMessage(…, { body })`. */
export const readResumeOption = (body: unknown): AgentResume | null => {
  const resume = recordOf(recordOf(body).resume);
  const runId = stringOf(resume.runId);
  return runId
    ? {
        runId,
        toolCallId: stringOf(resume.toolCallId),
        cardId: stringOf(resume.cardId),
        resumeData: recordOf(resume.resumeData),
      }
    : null;
};

/** A door refusal before any stream: `{ code }` in the body, or the status. */
export const readDoorError = (message: string | undefined): string | null => {
  if (!message) return null;
  try {
    return stringOf(recordOf(JSON.parse(message)).code);
  } catch {
    const code = /"code"\s*:\s*"([A-Za-z_]+)"/.exec(message)?.[1];
    return code ?? null;
  }
};

/* ---- Attachments ------------------------------------------------------------ */

/**
 * What the composer takes: samples of the person's texts, a Telegram export
 * (`result.json`), pictures — exactly what the chat door accepts, inline, so a
 * file the server would refuse is refused here with words (review W1 F2).
 */
const ATTACHMENT_EXTENSIONS: Readonly<Record<string, AttachmentMediaType>> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

type AttachmentMediaType = (typeof AGENT_ATTACHMENT_MEDIA_TYPES)[number];

export const ATTACHMENT_ACCEPT = [
  ...AGENT_ATTACHMENT_MEDIA_TYPES,
  ...Object.keys(ATTACHMENT_EXTENSIONS).map((extension) => `.${extension}`),
].join(',');

/**
 * The media type the door will read the file as, or `null` when it takes no
 * such file. Browsers leave `type` empty for `.md` and some `.json`, and name
 * Markdown `text/x-markdown`; the extension decides then.
 */
export const attachmentMediaType = (file: {
  name: string;
  type: string;
}): AttachmentMediaType | null => {
  const declared = file.type.trim().toLowerCase();
  if ((AGENT_ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(declared)) {
    return declared as AttachmentMediaType;
  }
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  const byName = extension ? ATTACHMENT_EXTENSIONS[extension] : undefined;
  if (!byName) return null;
  // A declared type that contradicts the name (a picture named .txt) is not
  // guessed around.
  const family = byName.startsWith('image/') ? 'image/' : 'text-or-json';
  if (declared && declared !== 'application/octet-stream' && declared !== 'text/x-markdown') {
    const declaredFamily = declared.startsWith('image/') ? 'image/' : 'text-or-json';
    if (declaredFamily !== family) return null;
  }
  return byName;
};

/** The size limit of one file of this type, decoded. */
export const attachmentLimit = (mediaType: AttachmentMediaType) =>
  (AGENT_TEXT_ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(mediaType)
    ? AGENT_TEXT_ATTACHMENT_MAX_BYTES
    : AGENT_ATTACHMENT_MAX_BYTES;

/** One line of a person's message that is a file, not words. */
export type AttachedLine = {
  name: string;
  mediaType: string;
  /** Sample files already added to an avatar (`kcxz.18`). */
  samples?: { accepted: number };
  /** Pictures already in the media library (`kcxz.25`). */
  media?: { count: number };
  /** A picture shown to the AI in its message, saved nowhere (28.09). */
  viewed?: boolean;
};

/**
 * An attached text file as the server hands it to the model: its words inside
 * the untrusted-data wrapper. Read back so a reloaded thread shows the file,
 * not the wrapper.
 */
export const readAttachedText = (
  text: string
): AttachedLine | null => {
  if (!text.startsWith('{"untrustedData"')) return null;
  try {
    const wrapper = recordOf(recordOf(JSON.parse(text)).untrustedData);
    const sources = Array.isArray(wrapper.sources) ? wrapper.sources : [];
    if (!sources.includes('uploaded-file')) return null;
    const value = recordOf(wrapper.value);
    // A samples receipt (`kcxz.18`): files the composer already added to an
    // avatar, never their text.
    // A pictures receipt (`kcxz.25`): pictures the composer already put into
    // the media library, never the pictures.
    const pictures = recordOf(value.mediaUpload);
    if (Array.isArray(pictures.media)) {
      return {
        name: stringOf(value.attachment) ?? '',
        mediaType: '',
        media: { count: pictures.media.length },
      };
    }
    const upload = recordOf(value.samplesUpload);
    if (Object.keys(upload).length) {
      return {
        name: stringOf(value.attachment) ?? '',
        mediaType: '',
        samples: { accepted: numberOf(upload.accepted) },
      };
    }
    const mediaType = stringOf(value.mediaType) ?? 'text/plain';
    // A picture shown to the AI (owner decision 28.09.2026): its line.
    if (stringOf(value.viewedPicture)) {
      return { name: stringOf(value.attachment) ?? mediaType, mediaType, viewed: true };
    }
    return { name: stringOf(value.attachment) ?? mediaType, mediaType };
  } catch {
    return null;
  }
};

/** A receipt as the composer put it into a live message (`AGENT_SAMPLES_PART_TYPE`). */
export const readSamplesPart = (
  part: { type: string; data?: unknown }
): { name: string; samples: { accepted: number } } | null => {
  if (part.type !== AGENT_SAMPLES_PART_TYPE) return null;
  const data = recordOf(part.data);
  const files = Array.isArray(data.files)
    ? data.files.filter((one): one is string => typeof one === 'string')
    : [];
  return { name: files.join(', '), samples: { accepted: numberOf(data.accepted) } };
};

/** A pictures receipt as the composer put it into a live message (`AGENT_MEDIA_PART_TYPE`). */
export const readMediaPart = (
  part: { type: string; data?: unknown }
): { name: string; media: { count: number } } | null => {
  if (part.type !== AGENT_MEDIA_PART_TYPE) return null;
  const media = Array.isArray(recordOf(part.data).media)
    ? (recordOf(part.data).media as unknown[])
    : [];
  const names = media
    .map((one) => stringOf(recordOf(one).name))
    .filter((one): one is string => !!one);
  return { name: names.join(', '), media: { count: media.length } };
};

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'«»]+[^\s<>"'«».,;:!?)\]]/giu;

/** Links in the draft, so the composer can show what the agent will read. */
export const linksIn = (text: string): string[] =>
  Array.from(new Set(text.match(URL_PATTERN) ?? [])).slice(0, 5);

/* ---- Questions -------------------------------------------------------------- */

export type AgentQuestionOption = { id: string; label: string };

export type AgentQuestion = (
  | {
      kind: 'consent';
      text: string;
      /** The boolean the answer sets (`consentGiven` of `avatar.activate`). */
      consentKey: string;
      /** An optional name the person may give (`avatarName`). */
      nameKey: string | null;
      /**
       * What is consented to: switching an avatar on (a tick «это моя
       * манера» first), or writing into an autopilot channel (`kcxz.14` — the
       * button is the consent; the server's words name the channel).
       */
      subject: 'avatar' | 'autopilot';
      /**
       * The avatar's name now (W3 walk P3-F): the name field starts with it,
       * so a name given at creation or a rename a step earlier is not typed
       * again. `null` — no name yet.
       */
      presetName: string | null;
      /** A brand's voice (W3 walk P3-G): the tick is not «моя манера». */
      brand: boolean;
    }
  | {
      kind: 'choice';
      text: string;
      options: AgentQuestionOption[];
      /** The key the chosen option or the typed answer goes under. */
      answerKey: string;
      /**
       * «Решите за меня»: on every question the product may decide (spec §1.9),
       * off where the capability says `canDecideForPerson: false`.
       */
      canDecideForPerson: boolean;
    }
  | {
      /**
       * Rows to keep, several at once (`AgentSelectionQuestionPayload`,
       * `kcxz.12`, `kcxz.13`): facts at a research pause, changes of a fact
       * check or a rewrite. `selected` is the product's own default.
       */
      kind: 'selection';
      text: string;
      /** The key the kept ids go under (`factKeys`, `changeIds`). */
      answerKey: string;
      options: AgentSelectionQuestionPayload['options'];
      canDecideForPerson: boolean;
    }
  | {
      /**
       * `media.keep` (`AgentKeepPictureQuestionPayload`, owner decision
       * 28.09.2026): this page puts the picture it showed the agent into the
       * library and answers with its id.
       */
      kind: 'keep-picture';
      text: string;
      pictureKey: string;
    }
  | {
      /** The adaptation interview (`AgentInterviewQuestionPayload`, `kcxz.14`). */
      kind: 'interview';
      /** The lead the server wrote (`payload.question`). */
      text: string;
      questions: AgentInterviewQuestionPayload['questions'];
      canDecideForPerson: boolean;
      channel: AgentInterviewQuestionPayload['channel'];
    }
) & {
  /**
   * The card's id as the server put it on the card (`AGENT_CARD_ID_KEY`),
   * sent back with the answer (review W2 F3). `null` on a card from before.
   */
  cardId: string | null;
};

/**
 * The answer «Решите за меня» sends; question capabilities accept it beside
 * their own key.
 */
export const DECIDE_FOR_PERSON_ANSWER = {
  [AGENT_DECIDE_FOR_PERSON_KEY]: true,
} as const;

/**
 * Answer keys of the question capabilities, for a card redrawn after a reload
 * (`pending` carries the payload but not the schema). Mirrors the
 * `resumeSchema` of each capability in the registry.
 */
const QUESTION_ANSWER_KEYS: Readonly<
  Record<string, { consentKey: string; nameKey: string | null }>
> = {
  avatar_activate: { consentKey: 'consentGiven', nameKey: 'avatarName' },
};

type SchemaProperty = { key: string; type: string; required: boolean };

const schemaProperties = (schema: unknown): SchemaProperty[] => {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = recordOf(typeof schema === 'string' ? JSON.parse(schema) : schema);
  } catch {
    return [];
  }
  const required = Array.isArray(parsed.required)
    ? parsed.required.filter((key): key is string => typeof key === 'string')
    : [];
  return Object.entries(recordOf(parsed.properties)).map(([key, value]) => ({
    key,
    type: String(recordOf(value).type ?? ''),
    required: required.includes(key),
  }));
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** The question card, from a suspend payload and (while live) its schema. */
export const readQuestion = (
  toolName: string,
  payload: unknown,
  resumeSchema: unknown
): AgentQuestion => {
  const record = recordOf(payload);
  const cardId = stringOf(record[AGENT_CARD_ID_KEY]);
  return { ...readQuestionShape(toolName, record, resumeSchema), cardId } as AgentQuestion;
};

const readQuestionShape = (
  toolName: string,
  record: Record<string, unknown>,
  resumeSchema: unknown
): DistributiveOmit<AgentQuestion, 'cardId'> => {
  const text = stringOf(record.question) ?? '';
  // A consent the payload names its own key for (`kcxz.14`: writing into an
  // autopilot channel) — read the same live and after a reload.
  if (record.kind === 'consent' && stringOf(record.answerKey)) {
    return {
      kind: 'consent',
      text,
      consentKey: stringOf(record.answerKey)!,
      nameKey: null,
      subject: record.subject === 'autopilot' ? 'autopilot' : 'avatar',
      presetName: null,
      brand: false,
    };
  }
  if (record.kind === 'keep-picture') {
    return { kind: 'keep-picture', text, pictureKey: stringOf(record.pictureKey) ?? '' };
  }
  if (record.kind === 'interview') {
    const channel = recordOf(record.channel);
    const channelId = stringOf(channel.id);
    return {
      kind: 'interview',
      text,
      questions: (Array.isArray(record.questions) ? record.questions : [])
        .map((one): AgentInterviewQuestionPayload['questions'][number] | null => {
          const value = recordOf(one);
          const key = stringOf(value.key);
          const question = stringOf(value.question);
          if (!key || !question) return null;
          const options = Array.isArray(value.options)
            ? value.options.filter((option): option is string => typeof option === 'string')
            : null;
          const why = stringOf(value.why);
          return {
            key,
            question,
            suggested: stringOf(value.suggested) ?? null,
            ...(options?.length ? { options } : {}),
            ...(why ? { why } : {}),
          };
        })
        .filter(
          (one): one is AgentInterviewQuestionPayload['questions'][number] => one !== null
        ),
      canDecideForPerson: record.canDecideForPerson !== false,
      channel: channelId
        ? {
            id: channelId,
            name: stringOf(channel.name) ?? '',
            provider: stringOf(channel.provider) ?? '',
          }
        : null,
    };
  }
  if (record.kind === 'selection') {
    return {
      kind: 'selection',
      text,
      answerKey: stringOf(record.answerKey) ?? 'answer',
      options: (Array.isArray(record.options) ? record.options : [])
        .map((option): AgentSelectionQuestionPayload['options'][number] | null => {
          const value = recordOf(option);
          const id = stringOf(value.id);
          const label = stringOf(value.label);
          return id && label
            ? {
                id,
                label,
                selected: value.selected === true,
                status: stringOf(value.status) ?? null,
                source: stringOf(value.source) ?? null,
              }
            : null;
        })
        .filter(
          (option): option is AgentSelectionQuestionPayload['options'][number] =>
            option !== null
        ),
      canDecideForPerson: record.canDecideForPerson !== false,
    };
  }
  const properties = schemaProperties(resumeSchema);
  const consent =
    properties.find((p) => p.type === 'boolean' && p.required)?.key ??
    QUESTION_ANSWER_KEYS[toolName]?.consentKey;
  if (consent) {
    return {
      kind: 'consent',
      subject: 'avatar',
      text,
      presetName: stringOf(record.avatarName)?.trim() || null,
      brand: record.avatarKind === 'brand',
      consentKey: consent,
      nameKey:
        properties.find((p) => p.type === 'string' && /name/i.test(p.key))
          ?.key ??
        QUESTION_ANSWER_KEYS[toolName]?.nameKey ??
        null,
    };
  }
  const options = (Array.isArray(record.options) ? record.options : [])
    .map((option) => {
      const value = recordOf(option);
      const id = stringOf(value.id) ?? stringOf(value.value);
      const label =
        stringOf(value.label) ?? stringOf(value.name) ?? stringOf(value.title);
      return id && label ? { id, label } : null;
    })
    .filter((option): option is AgentQuestionOption => option !== null);
  const answerKey =
    properties.find((p) => p.type === 'string' && p.required)?.key ??
    properties.find((p) => p.type === 'string')?.key ??
    'answer';
  return {
    kind: 'choice',
    text,
    options,
    answerKey,
    canDecideForPerson: record.canDecideForPerson !== false,
  };
};

export const consentAnswer = (
  question: Extract<AgentQuestion, { kind: 'consent' }>,
  given: boolean,
  name: string
): Record<string, unknown> => ({
  [question.consentKey]: given,
  ...(question.nameKey && name.trim()
    ? { [question.nameKey]: name.trim() }
    : {}),
});

/** The kept rows of a selection card, in the order the card lists them. */
export const selectionAnswer = (
  question: Pick<Extract<AgentQuestion, { kind: 'selection' }>, 'answerKey'>,
  ids: readonly string[]
): Record<string, unknown> => ({ [question.answerKey]: [...ids] });

export const choiceAnswer = (
  question: Extract<AgentQuestion, { kind: 'choice' }>,
  value: string
): Record<string, unknown> => ({ [question.answerKey]: value });

/* ---- Secret ----------------------------------------------------------------- */

/**
 * The key card (`secret` class, spec §1.5, §5.1). A secret capability emits
 * `data-secret` naming the field; the value is typed into the card and posted
 * to the AI settings door, so it never enters a message, memory, a trace or a
 * log. The part carries no value, only which field.
 */
export const SECRET_PART_TYPE = 'data-secret' as const;

/** The search engines whose key the key card takes (`kcxz.20`). */
export const SECRET_SEARCH_ENGINES = ['tavily', 'exa'] as const;
export type SecretSearchEngine = (typeof SECRET_SEARCH_ENGINES)[number];

export type AgentSecretField =
  | { field: 'workspace-key' }
  | { field: 'search-key'; engine: SecretSearchEngine };

const readSecret = (data: unknown): AgentSecretField | null => {
  const record = recordOf(data);
  if (record.field === 'workspace-key') return { field: 'workspace-key' };
  if (
    record.field === 'search-key' &&
    (SECRET_SEARCH_ENGINES as readonly unknown[]).includes(record.engine)
  ) {
    return { field: 'search-key', engine: record.engine as SecretSearchEngine };
  }
  return null;
};

/* ---- Progress --------------------------------------------------------------- */

/** `data-progress` (`AgentProgressPayload`): transient, reaches `onData` only. */
export type AgentProgress = { capability: string; stage: string };

export const readProgressPart = (part: {
  type: string;
  data?: unknown;
}): AgentProgress | null => {
  if (part.type !== PROGRESS_PART_TYPE) return null;
  const record = recordOf(part.data);
  const capability = stringOf(record.capability);
  const stage = stringOf(record.stage);
  return capability && stage ? { capability, stage } : null;
};

/** `toolNameOf` of the registry: the tool a capability id became. */
export const toolNameOf = (capabilityId: string) =>
  capabilityId.replace(/[^a-zA-Z0-9_-]/g, '_');

/* ---- Blocks ----------------------------------------------------------------- */

export type AgentApprovalState =
  | 'asked'
  | 'sent'
  | 'approved'
  | 'declined'
  /** No longer waiting: answered elsewhere or finished (review W1 F6). */
  | 'closed';

export type AgentBlock =
  | { type: 'text'; key: string; text: string }
  | ({ type: 'file'; key: string } & AttachedLine)
  | {
      type: 'approval';
      key: string;
      approvalId: string;
      toolName: string;
      /** The capability label, the tool's native `title`. */
      title: string | null;
      /** What will happen, in the words the server put on the request. */
      reason: string | null;
      /** Deleting cannot be taken back; connecting can. */
      irreversible: boolean;
      state: AgentApprovalState;
    }
  | {
      type: 'question';
      key: string;
      toolName: string;
      title: string | null;
      /** `null` once answered. */
      runId: string | null;
      /** The call the answer is for; sent with the answer. */
      toolCallId: string | null;
      question: AgentQuestion;
      /**
       * Answered, but the text had changed since the proposal: nothing was
       * applied (`kcxz.32`, N2).
       */
      stale?: boolean;
    }
  | { type: 'working'; key: string; toolName: string; title: string | null }
  | {
      type: 'done';
      key: string;
      toolName: string;
      title: string | null;
      /** A proposal answered after its text changed: nothing applied (N2). */
      stale?: boolean;
    }
  | {
      type: 'artifact';
      key: string;
      artifact: AgentArtifact;
      /** Deleted later in the conversation: nothing to open (kcxz.29, D6). */
      removed: boolean;
    }
  | {
      type: 'error';
      key: string;
      toolName: string | null;
      title: string | null;
      code: string | null;
    }
  | { type: 'secret'; key: string; secret: AgentSecretField }
  /** Connecting a channel (`kcxz.19`): the card the person acts on. */
  | { type: 'connect'; key: string; connect: AgentChannelConnect };

type Part = Record<string, unknown> & { type: string };

const toolNameOfPart = (part: Part): string | null => {
  if (part.type === 'dynamic-tool') return stringOf(part.toolName);
  return part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : null;
};

/** The persisted `channel-connect` card (`kcxz.19`). */
export const CONNECT_PART_TYPE = 'data-channel-connect' as const;

/** A deletion, or a learned rule forgotten (`avatar_rule_forget`, kcxz.18). */
const irreversibleTool = (toolName: string) =>
  /_delete$|_remove$|_forget$/.test(toolName);

/** A registry tool that answered `{ ok: false, code }` instead of a result. */
const refusalCode = (output: unknown): string | null => {
  const record = recordOf(output);
  return record.ok === false
    ? stringOf(record.code) ?? 'AGENT_FAILED'
    : null;
};

/** `errorText` carries a code (`publicError`), sometimes as JSON text. */
export const errorCodeOf = (errorText: unknown): string | null => {
  if (typeof errorText !== 'string' || !errorText.trim()) return null;
  const text = errorText.trim();
  if (/^[A-Za-z][A-Za-z0-9_]+$/.test(text)) return text;
  try {
    return stringOf(recordOf(JSON.parse(text)).code);
  } catch {
    return null;
  }
};

type LiveQuestion = {
  runId: string;
  toolName: string;
  payload: unknown;
  resumeSchema: unknown;
};

/** The card id a pending question carries (`AGENT_CARD_ID_KEY`), if any. */
export const pendingCardId = (run: AgentPendingRun): string | null =>
  stringOf(recordOf(run.suspendPayload)[AGENT_CARD_ID_KEY]);

/**
 * Whether a question card still waits for its answer (`kcxz.31`, D2): the
 * server's `pending` list holds its call, and — when both name one — the same
 * card. A card that is not the last thing the agent said stays answerable
 * while it waits; one that no longer waits says so instead of going dead.
 */
export const questionWaits = (
  pending: readonly AgentPendingRun[],
  question: { runId: string | null; toolCallId: string | null; cardId: string | null }
): boolean =>
  question.runId !== null &&
  pending.some((run) => {
    if (run.kind !== 'question') return false;
    const sameCall = question.toolCallId
      ? run.toolCallId === question.toolCallId
      : run.runId === question.runId;
    if (!sameCall) return false;
    const card = pendingCardId(run);
    return !card || !question.cardId || card === question.cardId;
  });

/**
 * Whether an approval card still waits for its «Да» or «Нет» (`kcxz.32`, N1,
 * D2): the server's `pending` list holds its call. Its id is Mastra's
 * `<runId>::<toolCallId>`.
 */
export const approvalWaits = (
  pending: readonly AgentPendingRun[],
  approvalId: string
): boolean => {
  const separator = approvalId.lastIndexOf('::');
  if (separator <= 0) return false;
  const runId = approvalId.slice(0, separator);
  const toolCallId = approvalId.slice(separator + 2);
  return pending.some(
    (run) => run.kind === 'approval' && run.runId === runId && run.toolCallId === toolCallId
  );
};

/**
 * The approval cards of a message's last step that still wait for an answer
 * here (`approval-requested`, not closed): the step goes to the server once
 * all of them are answered, as `lastAssistantMessageIsCompleteWithApprovalResponses`
 * decides for the last message — for any message (`kcxz.32`, N1).
 */
export const waitingApprovalIds = (message: AgentMessage): string[] => {
  const parts = message.parts as unknown as Part[];
  let start = -1;
  parts.forEach((part, index) => {
    if (part.type === 'step-start') start = index;
  });
  return parts
    .slice(start + 1)
    .filter(
      (part) =>
        toolNameOfPart(part) !== null &&
        part.state === 'approval-requested' &&
        recordOf(part.approval).closed !== true
    )
    .map((part) => stringOf(recordOf(part.approval).id))
    .filter((id): id is string => id !== null);
};

/**
 * An answer the door did not take (`kcxz.32`, N1): the card is put back to
 * `approval-requested` — asked again, or `closed` when the server said it no
 * longer waits — so it never says «ответ отправлен» for a request that did
 * not go through.
 */
export const reopenApprovalAnswer = (
  messages: readonly AgentMessage[],
  approvalId: string,
  closed: boolean
): AgentMessage[] =>
  messages.map((message) => {
    let changed = false;
    const parts = (message.parts as unknown as Part[]).map((part) => {
      const approval = recordOf(part.approval);
      if (
        toolNameOfPart(part) === null ||
        part.state !== 'approval-responded' ||
        approval.id !== approvalId
      ) {
        return part;
      }
      changed = true;
      return {
        ...part,
        state: 'approval-requested',
        approval: {
          id: approvalId,
          ...(typeof approval.requestReason === 'string'
            ? { requestReason: approval.requestReason }
            : {}),
          ...(closed ? { closed: true } : {}),
        },
      };
    });
    return changed ? ({ ...message, parts } as unknown as AgentMessage) : message;
  });

/**
 * The pieces a finished tool call touched (`kcxz.31`, D6), one entry per call:
 * a piece card names the piece, an adaptation or a plan card its `pieceId`.
 * The screen revalidates that piece's data once per entry, so the panel beside
 * the chat does not keep answered questions or a text a review replaced.
 */
export const pieceTouchesOf = (
  messages: readonly AgentMessage[]
): Array<{ key: string; pieceId: string }> => {
  const touches: Array<{ key: string; pieceId: string }> = [];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    (message.parts as unknown as Part[]).forEach((part, index) => {
      if (!toolNameOfPart(part) || part.state !== 'output-available') return;
      if (refusalCode(part.output)) return;
      const output = recordOf(part.output);
      const card = recordOf(output.card);
      const pieceId =
        card.kind === 'piece'
          ? stringOf(card.id)
          : card.kind === 'adaptation' || card.kind === 'plan'
            ? stringOf(card.pieceId)
            : stringOf(output.pieceId);
      if (!pieceId) return;
      const call = stringOf(part.toolCallId) ?? String(index);
      touches.push({ key: `${message.id}:${call}`, pieceId });
    });
  }
  return touches;
};

/**
 * Finished channel actions of the conversation (`kcxz.19`), counted: when the
 * count grows, the channel screen beside the chat and a connect card read the
 * channels again, as `pieceTouchesOf` does for a piece.
 */
export const channelCallsOf = (messages: readonly AgentMessage[]): number =>
  changingCallsOf(messages, 'channel_');

/**
 * The reads of the avatar, channel, ideas, facts and media groups (`risk: 'read'` in the
 * registry; `agent-w3-review-fixes` holds the two lists together). They
 * change nothing, so the `…CallsOf` counts leave them out (correctness review
 * F2). They do open the panel beside the chat, which then re-reads its
 * routes (`panelReadsOf`, W4 walk P2-B) — without dropping what it shows
 * (`useRevalidateUnder`), so a wizard mid-edit stays mounted.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'avatar_list',
  'avatar_overview',
  'avatar_proposal',
  'avatar_manual',
  'avatar_samples',
  'avatar_learning',
  'channel_open',
  'channel_posts',
  'ideas_list',
  'ideas_queue',
  'facts_list',
  'media_library',
]);

/**
 * Finished reads of a group, counted (W4 live walk 29.09.2026, P2-B): a read
 * opens the group's panel beside the chat, and the agent then points at it
 * («на карточке открыт полный список»). Leads that arrived while the panel
 * was open, or facts added elsewhere, stayed unseen until a reload. One rule
 * for every group: when this count grows, the panel re-reads its routes, as
 * it does after a change.
 */
export const panelReadsOf = (messages: readonly AgentMessage[], prefix: string): number => {
  let count = 0;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts as unknown as Part[]) {
      const toolName = toolNameOfPart(part);
      if (!toolName?.startsWith(prefix) || part.state !== 'output-available') continue;
      if (READ_ONLY_TOOLS.has(toolName) && !refusalCode(part.output)) count += 1;
    }
  }
  return count;
};

/** Finished calls of a group that may have changed something, counted. */
const changingCallsOf = (messages: readonly AgentMessage[], prefix: string): number => {
  let count = 0;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts as unknown as Part[]) {
      const toolName = toolNameOfPart(part);
      if (!toolName?.startsWith(prefix) || part.state !== 'output-available') continue;
      if (READ_ONLY_TOOLS.has(toolName)) continue;
      if (!refusalCode(part.output)) count += 1;
    }
  }
  return count;
};

/**
 * Finished avatar actions of the conversation (W3 live walk 28.09.2026,
 * P2-A), counted: when the count grows, the avatar screen beside the chat and
 * the composer's avatar list read the avatars again — as `channelCallsOf`
 * does for channels. A create, a samples add, an analysis, a line of the
 * proposal or by hand, a rename, a default, a consent answered: each changed
 * what the panel shows, and until this it kept «Аватара пока нет» until a
 * reload. A refused call and a read (`READ_ONLY_TOOLS`) changed nothing and
 * are not counted.
 */
export const avatarCallsOf = (messages: readonly AgentMessage[]): number =>
  changingCallsOf(messages, 'avatar_');

/**
 * Finished «Откуда идеи» actions of the conversation (`kcxz.23`), counted: a
 * subscription added or dropped, a check, a lead declined or taken — when the
 * count grows, the ideas screen beside the chat reads its subscriptions and
 * queue again, as channels and avatars do. Reads are not counted.
 */
export const ideaCallsOf = (messages: readonly AgentMessage[]): number =>
  changingCallsOf(messages, 'ideas_');

/**
 * Finished «Откуда факты» actions of the conversation (`kcxz.24`), counted: a
 * fact added, retracted or brought back — when the count grows, the facts
 * screen beside the chat reads the facts again. Reads are not counted.
 */
export const factCallsOf = (messages: readonly AgentMessage[]): number =>
  changingCallsOf(messages, 'facts_');

/**
 * Finished media actions of the conversation (`kcxz.25`), counted: a picture
 * generated into the library — when the count grows, the library beside the
 * chat reads its pages again. Reading the library is not counted; a picture
 * put on a post is the piece's (`pieceTouchesOf`).
 */
export const mediaCallsOf = (messages: readonly AgentMessage[]): number =>
  changingCallsOf(messages, 'media_');

/**
 * Whether a finished call's output says the person answered its selection
 * card (`kcxz.34`, F4). Only the counts of an answer mark it: a changes card
 * (`reviewSummary`: `offered` with an answered `outcome`; a `stale` one keeps
 * its own «правка устарела» line), a research card of
 * the core (`offered` and `kept`), the facts card of a new piece
 * (`factsCard: 'answered'`; an older history without it: `factsKept` above
 * zero, since zero is also what a pass with nothing to choose says).
 */
export const answeredSelectionOf = (output: unknown): boolean => {
  const summary = recordOf(recordOf(output).summary);
  // `factsCard` says whether the person saw the facts card (`kcxz.36`):
  // `not_shown` — the product kept its defaults (MCP, no suspend), nothing to
  // fold; `answered` — the card or «Решите за меня», even with nothing kept.
  // Histories before the field only have `factsKept`.
  if (summary.factsCard === 'answered' || summary.factsCard === 'not_shown')
    return summary.factsCard === 'answered';
  if (typeof summary.factsKept === 'number') return summary.factsKept > 0;
  if (typeof summary.offered !== 'number' || summary.offered <= 0) return false;
  return (
    typeof summary.kept === 'number' ||
    summary.outcome === 'applied' ||
    summary.outcome === 'kept-as-is'
  );
};

/** A selection card redrawn from its answer: the line names the call's title. */
const ANSWERED_SELECTION: AgentQuestion = {
  kind: 'selection',
  text: '',
  answerKey: '',
  options: [],
  canDecideForPerson: false,
  cardId: null,
};

/**
 * One message, read into the blocks the screen draws. `pending` comes from
 * the thread door after a reload; during a turn the same question arrives as a
 * `data-tool-call-suspended` part of the message itself.
 */
export const readMessageBlocks = (
  message: AgentMessage,
  pending: readonly AgentPendingRun[] = [],
  removed: ReadonlySet<string> = NOTHING_REMOVED,
  /**
   * Question cards the server listed earlier and no longer does (`kcxz.38`,
   * R2). A history loaded while a card waited keeps no question part, so a
   * card answered elsewhere would turn into an invisible «working» block and
   * vanish; with its old entry it stays a card the screen can fold into
   * «больше не ждёт ответа». Only a call still without an output uses it.
   */
  gone: readonly AgentPendingRun[] = []
): AgentBlock[] => {
  const parts = message.parts as unknown as Part[];
  const blocks: AgentBlock[] = [];

  // The card a stored or streamed part names, unless Mastra marked it
  // answered (`resumed`); then the server's `pending` list, which wins: it is
  // the card that waits now, read from the run itself, and a stored part may
  // be an older card of the same call (review W2 F3). The conversation drops
  // a pending entry once it is answered, so a card streamed after that shows.
  const questions = new Map<string, LiveQuestion>();
  for (const part of parts) {
    if (part.type !== 'data-tool-call-suspended') continue;
    const data = recordOf(part.data);
    if (data.resumed === true) continue;
    const toolCallId = stringOf(data.toolCallId);
    const runId = stringOf(data.runId);
    const toolName = stringOf(data.toolName);
    if (toolCallId && runId && toolName) {
      questions.set(toolCallId, {
        runId,
        toolName,
        payload: data.suspendPayload ?? null,
        resumeSchema: data.resumeSchema ?? null,
      });
    }
  }
  for (const run of pending) {
    if (run.kind === 'question' && run.toolCallId && run.toolName) {
      questions.set(run.toolCallId, {
        runId: run.runId,
        toolName: run.toolName,
        payload: run.suspendPayload,
        resumeSchema: questions.get(run.toolCallId)?.resumeSchema ?? null,
      });
    }
  }

  // One line per object. The tool output names it by id only; the
  // `data-<kind>` part beside it carries the title, so what either says is
  // merged into the line the first one opened.
  const seenArtifacts = new Map<string, AgentArtifact>();
  const pushArtifact = (artifact: AgentArtifact | null, key: string) => {
    if (!artifact) return false;
    const identity = `${artifact.kind}:${artifact.id}`;
    const seen = seenArtifacts.get(identity);
    if (seen) {
      const merged: AgentArtifact = {
        ...seen,
        title: seen.title ?? artifact.title,
        code: seen.code ?? artifact.code,
        data: {
          ...artifact.data,
          ...seen.data,
          // A later call's count of open questions is the newer truth: an
          // answer in the same turn leaves fewer (`kcxz.31`, D12).
          ...(typeof artifact.data.questions === 'number'
            ? { questions: artifact.data.questions }
            : {}),
        },
      };
      seenArtifacts.set(identity, merged);
      const index = blocks.findIndex(
        (block) =>
          block.type === 'artifact' &&
          block.artifact.kind === artifact.kind &&
          block.artifact.id === artifact.id
      );
      if (index >= 0) {
        blocks[index] = { ...blocks[index], artifact: merged } as AgentBlock;
      }
      return true;
    }
    seenArtifacts.set(identity, artifact);
    blocks.push({ type: 'artifact', key, artifact, removed: removed.has(identity) });
    return true;
  };

  // One connect card per platform in a message: the tool's output names it
  // by id beside the `data-channel-connect` part that carries it.
  const connects = new Set<string>();
  const drawnConnects = new Set(
    parts
      .filter((part) => part.type === CONNECT_PART_TYPE)
      .map((part) => readChannelConnect(part.data)?.provider)
      .filter((provider): provider is string => !!provider)
  );
  const pushConnect = (connect: AgentChannelConnect | null, key: string) => {
    if (!connect) return false;
    if (!connects.has(connect.provider)) {
      connects.add(connect.provider);
      blocks.push({ type: 'connect', key, connect });
    }
    return true;
  };

  parts.forEach((part, index) => {
    const key = `${message.id}:${index}`;

    if (part.type === 'text') {
      const text = typeof part.text === 'string' ? part.text : '';
      const attached = message.role === 'user' ? readAttachedText(text) : null;
      if (attached) {
        blocks.push({ type: 'file', key, ...attached });
        return;
      }
      if (text.trim()) blocks.push({ type: 'text', key, text });
      return;
    }

    if (part.type === 'file') {
      blocks.push({
        type: 'file',
        key,
        name: stringOf(part.filename) ?? stringOf(part.mediaType) ?? '',
        mediaType: stringOf(part.mediaType) ?? '',
      });
      return;
    }

    if (part.type === SECRET_PART_TYPE) {
      const secret = readSecret(part.data);
      if (secret) blocks.push({ type: 'secret', key, secret });
      return;
    }

    if (part.type === CONNECT_PART_TYPE) {
      pushConnect(readChannelConnect(part.data), key);
      return;
    }

    if (part.type.startsWith('data-')) {
      // `data-piece`, `data-avatar`, … — the persisted card, by id. Mastra's
      // own `data-tool-call-*` parts are read above with their tool part.
      pushArtifact(artifactOf(part.type.slice('data-'.length), part.data), key);
      return;
    }

    const toolName = toolNameOfPart(part);
    if (!toolName) return;
    const toolCallId = stringOf(part.toolCallId) ?? key;
    const title = stringOf(part.title);
    const state = part.state;
    // A product action always carries its label (the server adds it to the
    // live stream too). A part without one is Mastra's own housekeeping —
    // loading a skill, writing working memory — and the person never sees
    // it: a bare «✓ Готово» above an approval card read as if the deletion
    // had already happened (kcxz.29, D5).
    if (
      !title &&
      !questions.has(toolCallId) &&
      state !== 'approval-requested' &&
      state !== 'approval-responded' &&
      state !== 'output-denied'
    ) {
      return;
    }
    const approval = recordOf(part.approval);
    const reason = stringOf(approval.requestReason);
    const approvalBlock = (approvalState: AgentApprovalState): AgentBlock => ({
      type: 'approval',
      key: `${key}:approval`,
      approvalId: stringOf(approval.id) ?? toolCallId,
      toolName,
      // The label, as a reloaded card has it; the server's «what and where»
      // when a stream carried no label (kcxz.29, D5).
      title: title ?? reason,
      reason,
      irreversible: irreversibleTool(toolName),
      state: approvalState,
    });

    if (state === 'approval-requested') {
      blocks.push(approvalBlock(approval.closed === true ? 'closed' : 'asked'));
      return;
    }
    if (state === 'approval-responded') {
      blocks.push(approvalBlock('sent'));
      return;
    }
    if (state === 'output-denied') {
      blocks.push(approvalBlock('declined'));
      return;
    }
    if (state === 'output-error') {
      if (approval.approved === true) blocks.push(approvalBlock('approved'));
      blocks.push({
        type: 'error',
        key,
        toolName,
        title,
        code: errorCodeOf(part.errorText),
      });
      return;
    }

    const question = questions.get(toolCallId);
    const lost =
      question === undefined
        ? gone.find((run) => run.kind === 'question' && run.toolCallId === toolCallId)
        : undefined;
    const asked: LiveQuestion | undefined =
      question ??
      (lost && lost.toolName
        ? {
            runId: lost.runId,
            toolName: lost.toolName,
            payload: lost.suspendPayload,
            resumeSchema: null,
          }
        : undefined);
    if (state === 'input-streaming' || state === 'input-available') {
      blocks.push(
        asked
          ? {
              type: 'question',
              key,
              toolName,
              title,
              runId: asked.runId,
              toolCallId: stringOf(part.toolCallId),
              question: readQuestion(toolName, asked.payload, asked.resumeSchema),
            }
          : { type: 'working', key, toolName, title }
      );
      return;
    }

    if (state === 'output-available') {
      if (approval.approved === true) blocks.push(approvalBlock('approved'));
      const refused = refusalCode(part.output);
      if (refused) {
        blocks.push({ type: 'error', key, toolName, title, code: refused });
        return;
      }
      // Answered after its text changed: nothing applied (`kcxz.32`, N2).
      const stale = recordOf(recordOf(part.output).summary).outcome === 'stale';
      // The stored history keeps no question part (Mastra drops it once the
      // run resumes): a selection card answered before a reload is known by
      // the counts its call answered with, and folds into the same line
      // (`kcxz.34`, F4).
      const folded = question
        ? readQuestion(toolName, question.payload, question.resumeSchema)
        : answeredSelectionOf(part.output)
          ? ANSWERED_SELECTION
          : null;
      if (folded) {
        blocks.push({
          type: 'question',
          key: `${key}:question`,
          toolName,
          title,
          runId: null,
          // The call it folds, so a card refused here as no longer waiting
          // keeps saying so once the history is read again (`kcxz.38`, R2).
          toolCallId: stringOf(part.toolCallId),
          question: folded,
          ...(stale ? { stale: true } : {}),
        });
      }
      const card = recordOf(recordOf(part.output).card);
      // The connect card itself rides in its `data-channel-connect` part; the
      // output names only its platform, so it adds nothing (`kcxz.19`).
      if (card.kind === 'channel-connect') {
        if (!drawnConnects.has(String(card.id))) {
          blocks.push({ type: 'done', key, toolName, title });
        }
        return;
      }
      // The key card rides in its `data-secret` part the same way (`kcxz.20`).
      if (card.kind === 'secret') {
        if (!parts.some((one) => one.type === SECRET_PART_TYPE)) {
          blocks.push({ type: 'done', key, toolName, title });
        }
        return;
      }
      if (!pushArtifact(artifactOf(card.kind, card), key) && !folded) {
        blocks.push({ type: 'done', key, toolName, title, ...(stale ? { stale: true } : {}) });
      }
    }
  });

  return blocks;
};

/**
 * One folded line per question card across the conversation (`kcxz.38`,
 * release check P3-a). A card answered from further up gets its output in the
 * message that takes the stream (`continuedCallChunk`), so until a reload the
 * same call is in two messages: the card where it was asked, folded into
 * «отвечено», and a line read from its answer's counts at the bottom. After a
 * reload the history merges them into one. The first block of a call (by
 * `toolCallId`, or by card id) stays; a later answered line of it goes. A
 * live card (`runId` set) is never dropped.
 */
export const withoutRepeatedQuestionLines = (
  perMessage: readonly AgentBlock[][]
): AgentBlock[][] => {
  const seen = new Set<string>();
  return perMessage.map((blocks) =>
    blocks.filter((block) => {
      if (block.type !== 'question') return true;
      const keys = [
        block.toolCallId ? `call:${block.toolCallId}` : null,
        block.question.cardId ? `card:${block.question.cardId}` : null,
      ].filter((key): key is string => key !== null);
      const repeat = block.runId === null && keys.some((key) => seen.has(key));
      for (const key of keys) seen.add(key);
      return !repeat;
    })
  );
};

/** The artifacts of a whole conversation, latest last. */
export const artifactsOf = (
  messages: readonly AgentMessage[]
): AgentArtifact[] =>
  messages.flatMap((message) =>
    message.role === 'assistant'
      ? readMessageBlocks(message).flatMap((block) =>
          block.type === 'artifact' ? [block.artifact] : []
        )
      : []
  );

const NOTHING_REMOVED: ReadonlySet<string> = new Set();

/** `kind:id` of an artifact, as `removedArtifactsOf` names it. */
export const artifactKey = (artifact: { kind: string; id: string }) =>
  `${artifact.kind}:${artifact.id}`;

/**
 * What the conversation deleted (kcxz.29, D6): a `<kind>_delete` action that
 * finished without a refusal removed the `<kind>` named by `<kind>Id` in its
 * arguments. The panel closes on it and its line stops offering to open it.
 */
export const removedArtifactsOf = (
  messages: readonly AgentMessage[]
): ReadonlySet<string> => {
  const removed = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts as unknown as Part[]) {
      const toolName = toolNameOfPart(part);
      const kind = toolName ? /^(.+)_delete$/.exec(toolName)?.[1] : undefined;
      if (!kind || !isArtifactKind(kind)) continue;
      if (part.state !== 'output-available' || refusalCode(part.output)) continue;
      const id = stringOf(recordOf(part.input)[`${kind}Id`]);
      if (id) removed.add(artifactKey({ kind, id }));
    }
  }
  return removed;
};

/**
 * The avatar this conversation made last and did not delete (review W3-18
 * F2): the one attached sample files go to unless the person picks another.
 * An avatar card left by a read (a proposal, the lines by hand) or by a
 * change to an existing avatar does not count — only `avatar_create`.
 */
export const createdAvatarOf = (
  messages: readonly AgentMessage[],
  removed: ReadonlySet<string> = NOTHING_REMOVED
): { id: string; name: string | null } | null => {
  let found: { id: string; name: string | null } | null = null;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts as unknown as Part[]) {
      if (toolNameOfPart(part) !== 'avatar_create') continue;
      if (part.state !== 'output-available' || refusalCode(part.output)) continue;
      const card = recordOf(recordOf(part.output).card);
      const id = card.kind === 'avatar' ? stringOf(card.id) : null;
      if (!id || removed.has(artifactKey({ kind: 'avatar', id }))) continue;
      found = { id, name: stringOf(recordOf(part.input).name) };
    }
  }
  return found;
};

/** A thread's name before the server gives one: the first words asked. */
export const provisionalTitle = (
  messages: readonly AgentMessage[]
): string | null => {
  const first = messages.find((message) => message.role === 'user');
  const text = ((first?.parts ?? []) as unknown as Part[])
    // An attached file's wrapper is not what the person asked (kcxz.18).
    .map((part) =>
      part.type === 'text' && !readAttachedText(String(part.text ?? ''))
        ? String(part.text ?? '')
        : ''
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
};

/* ---- Readers ---------------------------------------------------------------- */

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
