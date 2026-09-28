/**
 * The wire contract of the agent chat (`content-factory-next-kcxz.7`,
 * `kcxz.8`; spec §4.4, §6.2; ADR-0012 amendment §2).
 *
 * One file, importless on purpose: the screen (`apps/frontend`, `kcxz.10`)
 * cannot import a backend module, so it mirrors this file, and a guard in
 * `tests/` holds the mirror to it once the mirror exists. Everything the
 * browser reads from `POST /agent/chat` and the `/agent/threads` doors is
 * named here: the stream version, the part names, the card payloads, the
 * tool output, the refusal and error codes, the thread and history shapes.
 *
 * What is native and what is ours:
 *
 * - the stream is AI SDK UI v7 (`@mastra/ai-sdk` `handleChatStream`); tool
 *   parts `tool-<toolName>`, the approval request (`tool-approval-request`,
 *   UI state `approval-requested`) and `data-tool-call-suspended` for a
 *   question are Mastra's own;
 * - a card is a persisted `data-<kind>` part whose `data` carries the entity
 *   id, so a reloaded thread draws the same card and the panel beside the chat
 *   opens the product object itself; progress is `data-progress`, transient —
 *   streamed, never stored.
 */

/** The AI SDK UI stream contract. Pinned, never the library default. */
export const AGENT_STREAM_VERSION = 'v7' as const;

/**
 * What the chat draws for a result, and the suffix of its `data-*` part.
 * `channel-connect` (`kcxz.19`) is drawn in the conversation itself — the
 * Telegram steps or the platform's button, which the person acts on — and
 * never opens beside the chat; so is `secret` (`kcxz.20`), the key field the
 * browser posts straight to the AI settings door. Every other kind is a thing
 * the panel opens.
 */
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
] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** The part name of a persisted card. */
export type CardPartType<K extends CardKind = CardKind> = `data-${K}`;
export const cardPartType = <K extends CardKind>(kind: K): CardPartType<K> =>
  `data-${kind}` as CardPartType<K>;

/** The transient progress part of a running capability. */
export const PROGRESS_PART_TYPE = 'data-progress' as const;

/**
 * Card payloads, by kind. `id` is always there: the card and the panel open
 * the object by it. Anything else is what the capability wrote in this call —
 * long texts are never repeated here, the screen reads them by id.
 */
export type AgentCardPayloads = {
  workspace: { kind: 'workspace'; id: string };
  channels: { kind: 'channels'; id: string };
  piece: {
    kind: 'piece';
    id: string;
    title?: string;
    code?: string | null;
    /** Open questions the person answers on the piece (kcxz.29, D4). */
    questions?: number;
  };
  /** `name`: what the person called it on the consent card (kcxz.29, D12). */
  avatar: { kind: 'avatar'; id: string; name?: string | null };
  /**
   * One adaptation (`kcxz.14`): `id` is the adaptation, `pieceId` its piece;
   * the panel draws the channel preview by these ids. `channel` and `variant`
   * come with a text written in this call (`variant` 1 is the first for the
   * channel, a repeat adaptation the next); no text rides here.
   */
  adaptation: {
    kind: 'adaptation';
    id: string;
    pieceId: string;
    channel?: { id: string; name: string; provider: string };
    variant?: number;
  };
  /**
   * A plan slot (`kcxz.15`, spec §6.2 «Plan slot»): `id` is the adaptation,
   * `pieceId` its piece; `at` the ISO time it stands at (`null` — none), and
   * `state` where it stands. What the card shows beyond these (the local time,
   * «Отменить бронь») the screen reads by id; no text rides here.
   */
  plan: {
    kind: 'plan';
    id: string;
    pieceId: string;
    channel?: { id: string; name: string; provider: string };
    at?: string | null;
    state: PlanSlotState;
  };
  /**
   * One channel (`kcxz.19`): the panel opens the channel's own screen by id
   * — its writing card, plan mode, posting times and recent posts.
   */
  channel: { kind: 'channel'; id: string; name?: string; provider?: string };
  /**
   * Connecting a channel (`kcxz.19`, spec §6.2 «Channel connect»): `id` is
   * the platform (`telegram`, `linkedin`…). `flow` says what the card draws:
   * `telegram` — the onboarding's three steps (the bot as an admin,
   * `/connect <word>`, the channel appearing by itself), `oauth` — a button
   * that opens the platform's window, as «Каналы» does. The word, the nonce
   * and every token stay in the browser and the platform: none rides here.
   * `known` are the channels of that platform already there when the card was
   * made, so the card can tell the one that arrived; `since` (ISO) is when
   * it was made: only a channel created after it, within the card's window,
   * is credited (review W3-19 P3-3).
   */
  'channel-connect': {
    kind: 'channel-connect';
    id: string;
    provider: string;
    name: string;
    flow: ChannelConnectFlow;
    known: string[];
    since: string;
  };
  /**
   * The key card (`kcxz.20`, spec §1.5, §6.2 «Secret»): which field, never a
   * value. `id` is `workspace-key` or `search-key:<engine>`. The person types
   * the key into the card and the browser posts it to `POST /settings/ai`
   * itself; nothing about the key comes back into the conversation.
   */
  secret:
    | { kind: 'secret'; id: 'workspace-key'; field: 'workspace-key' }
    | {
        kind: 'secret';
        id: `search-key:${SecretSearchEngine}`;
        field: 'search-key';
        engine: SecretSearchEngine;
      };
};
/** The search engines whose key the key card takes (`kcxz.20`). */
export const SECRET_SEARCH_ENGINES = ['tavily', 'exa'] as const;
export type SecretSearchEngine = (typeof SECRET_SEARCH_ENGINES)[number];
/** How a platform is connected from the chat (`kcxz.19`). */
export const CHANNEL_CONNECT_FLOWS = ['telegram', 'oauth'] as const;
export type ChannelConnectFlow = (typeof CHANNEL_CONNECT_FLOWS)[number];
/**
 * Where a post stands in the plan: `reserve` — holds a time and goes out only
 * once confirmed; `scheduled` — queued, goes out by itself; `draft` — a draft
 * of a channel without a plan; `published` — already out; `error` — it was
 * sent and did not go out (the calendar's ERROR; review W2 F14).
 */
export const PLAN_SLOT_STATES = ['reserve', 'scheduled', 'draft', 'published', 'error'] as const;
export type PlanSlotState = (typeof PLAN_SLOT_STATES)[number];
export type AgentCardPayload<K extends CardKind = CardKind> =
  AgentCardPayloads[K];

/** `data-progress`: which capability runs and which stage it reached. */
export type AgentProgressPayload = {
  capability: string;
  /** The service event name, e.g. `intake-started`, `piece`, `done`. */
  stage: string;
};

/**
 * Question cards are `data-tool-call-suspended` parts (Mastra's own); their
 * `suspendPayload` is what the card draws. Every card the product can decide
 * for carries `canDecideForPerson: true`, and «Решите за меня» answers with
 * `{ [AGENT_DECIDE_FOR_PERSON_KEY]: true }` instead of the card's own key.
 */
export const AGENT_DECIDE_FOR_PERSON_KEY = 'decideForPerson' as const;

/**
 * The key a question card's id rides under (review W2 F3). The server adds it
 * to every question card it shows — the live `data-tool-call-suspended` part,
 * the stored transcript and the thread's `pending` list — as the fingerprint
 * of the card the call stopped on; the answer sends it back as
 * `AgentChatRequestV1.cardId`. The door recomputes the fingerprint of the
 * card that waits now from the payload Mastra keeps on the server and refuses
 * any other (`AGENT_RUN_NOT_PENDING`): an answer lands only on the card it
 * answers, never on a later card of the same call.
 */
export const AGENT_CARD_ID_KEY = 'cardId' as const;

/**
 * A selection card (`kcxz.12`): rows to keep, several at once — the facts at
 * the research pause of «Новый материал». `selected` is what the product
 * would keep by itself (the screen's defaults); the answer names the kept
 * rows by id under `answerKey`, or decides for the person.
 */
export type AgentSelectionQuestionPayload = {
  kind: 'selection';
  question: string;
  answerKey: string;
  options: Array<{
    id: string;
    label: string;
    selected: boolean;
    /** `confirmed`, `conflicting`, `unverified`… as the screen marks a row. */
    status?: string | null;
    /** The host of the row's source, when it has one. */
    source?: string | null;
  }>;
  canDecideForPerson: true;
  /** `AGENT_CARD_ID_KEY`: added by the server to the card it shows. */
  cardId?: string;
};

/**
 * A consent card that names its answer key (`kcxz.14`): writing into a
 * channel on autopilot, where the post would go out by itself (spec §1.4).
 * Answer `{ [answerKey]: true | false }`; no «Решите за меня».
 */
export type AgentConsentQuestionPayload = {
  kind: 'consent';
  /** What is consented to; `autopilot` — writing into an autopilot channel. */
  subject: 'autopilot';
  question: string;
  answerKey: string;
  canDecideForPerson: false;
  channel: { id: string; name: string; provider: string } | null;
  /** `AGENT_CARD_ID_KEY`: added by the server to the card it shows. */
  cardId?: string;
};

/**
 * The adaptation interview card (`kcxz.14`): questions for one channel, each
 * with the suggested answer (`null` — we ask for the person's words), finite
 * options and why it is asked. The answer is
 * `{ answers: [{ key, text, origin: 'person' | 'confirmed' }], decideKeys }`
 * — «Так и есть» is `confirmed` with the suggested text, a question given to
 * us goes in `decideKeys` — or `{ [AGENT_DECIDE_FOR_PERSON_KEY]: true }` for
 * all of them.
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
  /** `AGENT_CARD_ID_KEY`: added by the server to the card it shows. */
  cardId?: string;
};

/**
 * Codes a capability or the per-call hooks answer with instead of a result.
 * The model reads them as the tool's output and tells the person; the screen
 * may draw the Error card from the same code.
 */
export const CAPABILITY_REFUSAL_CODES = [
  'IDENTITY_MISSING',
  'APPROVAL_MISMATCH',
  'PAID_CAP_REACHED',
  'PERMISSION_DENIED',
  'INPUT_NEEDS_PERSON',
  /**
   * The person said «Да» to a post whose text (or picture, or the number of
   * posts a mode applies to) is no longer what the card showed; nothing ran
   * (review W2 F4). The model shows the card again.
   */
  'APPROVAL_CONTENT_CHANGED',
  /**
   * A check or a rewrite of a text whose card of proposed changes still
   * waits in the conversation; nothing ran or was spent (`kcxz.32`, N2). The
   * model points the person at the open card.
   */
  'PROPOSAL_CARD_OPEN',
] as const;
export type CapabilityRefusalCode = (typeof CAPABILITY_REFUSAL_CODES)[number];

/**
 * The output of every registry tool (`tool-<name>` part, `output`). A service
 * refusal keeps the service's own code (`PIECE_ERROR_CODES`,
 * `VOICE_ERROR_CODES`), so `code` is wider than the list above.
 */
export type AgentToolOutput =
  | {
      ok: true;
      capability: string;
      summary: unknown;
      card?: { kind: CardKind; id: string };
    }
  | { ok: false; code: string; reason: string };

/**
 * What the stream's `error` part carries in `errorText`: one of these codes,
 * never a message, a stack or a path (premortem S6).
 */
export const AGENT_ERROR_CODES = [
  /** Anything not named below. */
  'AGENT_FAILED',
  /** The workspace has no model key in the chosen mode. */
  'AI_PROVIDER_UNAVAILABLE',
  /** The included allowance of the month is spent. */
  'AI_ALLOWANCE_EXHAUSTED',
  /** The provider refused for load or rate; trying later helps. */
  'AI_PROVIDER_BUSY',
  /** The provider did not answer in time. */
  'AI_PROVIDER_TIMEOUT',
  /**
   * The provider refused the request itself — unknown model, invalid key, a
   * setting it does not take; trying again changes nothing (kcxz.29, D9).
   */
  'AI_PROVIDER_REJECTED',
  /** A safety processor stopped the turn (e.g. a key shape in the input). */
  'AGENT_BLOCKED',
  /**
   * The answer was for an approval or a question that is no longer open —
   * already answered (another tab), finished, or being answered right now.
   * Also a door refusal (HTTP 409) before any stream.
   */
  'AGENT_RUN_NOT_PENDING',
] as const;
export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

/** Codes the `/agent` doors answer as HTTP errors, before any stream. */
export const AGENT_DOOR_ERROR_CODES = [
  /** The body is not one message, one approval answer or one resume. */
  'AGENT_BAD_REQUEST',
  /** The thread, the run or the tool call belongs to somebody else. */
  'AGENT_NOT_YOURS',
  /** `ai_rate_limited` is the throttler's own code, shared with `/copilot`. */
  'ai_rate_limited',
] as const;
export type AgentDoorErrorCode = (typeof AGENT_DOOR_ERROR_CODES)[number];

/*
 * Attachments of a message (`POST /agent/chat` file parts; correctness review
 * W1 F2). The server takes a file only inline — a `data:` URL of one of these
 * media types within these sizes — and never a link it would have to fetch.
 * Text files are decoded, key shapes redacted, and handed to the model as
 * untrusted data (`uploaded-file`); pictures go to the model as they are.
 */
export const AGENT_ATTACHMENT_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export type AgentAttachmentMediaType =
  (typeof AGENT_ATTACHMENT_MEDIA_TYPES)[number];
/** The text half: decoded and read as words, never as a picture. */
export const AGENT_TEXT_ATTACHMENT_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
] as const;
export const AGENT_ATTACHMENT_MAX_FILES = 5;
/** One picture, decoded: 5 MB. */
export const AGENT_ATTACHMENT_MAX_BYTES = 5242880;
/**
 * One text file, decoded: 256 KB — about 60 thousand tokens, already more than
 * one turn should read. A bigger export is cut down before it is attached.
 */
export const AGENT_TEXT_ATTACHMENT_MAX_BYTES = 262144;
/** Every attachment of one message together, decoded: 10 MB. */
export const AGENT_ATTACHMENTS_TOTAL_MAX_BYTES = 10485760;

/*
 * Samples attached in the chat (`kcxz.18`). A sample file or a Telegram
 * `result.json` never passes through the model: the composer uploads it from
 * the browser straight to the avatar screen's door (`POST
 * /content-intelligence/voice/samples/files`, the same request the samples
 * screen sends) and the message carries only this receipt — what went to which
 * avatar and how many texts were accepted. The door turns it into a text part
 * the model reads as untrusted data (file names are the person's), and a
 * reloaded thread shows it as the files' line.
 */
export const AGENT_SAMPLES_PART_TYPE = 'data-avatar-samples' as const;
/** Files of one upload: `VOICE_SAMPLE_FILE_LIMITS.maxFilesPerBatch`. */
export const AGENT_SAMPLES_MAX_FILES = 10;
/** Distinct refusal reasons a receipt names, each with its count. */
export const AGENT_SAMPLES_MAX_REASONS = 20;
export type AgentSamplesUploadV1 = {
  /** The avatar the texts went to; `null` — the workspace default (or none yet). */
  avatarId: string | null;
  /** The file names, as the person's browser named them. */
  files: string[];
  /** Texts added to the avatar's samples. */
  accepted: number;
  /** Texts or files not taken, by the door's reason (`DUPLICATE`, `TOO_SHORT`…). */
  refused: Array<{ reason: string; count: number }>;
  /** A Telegram export: posts taken of those that could be. */
  telegram: Array<{ name: string; selected: number; eligible: number }>;
};

/**
 * Answers one approval request may carry (correctness review W1 F4). Mastra
 * resumes each answer as its own leg; the door splits the turn's step cap
 * between them, so one billed `agent` operation never runs more than
 * `CONDUCTOR_MAX_STEPS` model steps however many cards it answers. All
 * answers of one request belong to one run — the cards of one step.
 */
export const AGENT_APPROVALS_PER_REQUEST = 3;

/**
 * `POST /agent/chat`. Only these keys are read; everything else the agent
 * runs with is built by the server (premortem S5).
 *
 * - a message: `messages` ends with the new user message;
 * - an approval answer: `messages` ends with the assistant message whose tool
 *   part is `approval-responded` (what `addToolApprovalResponse` produces);
 * - a question answer: `runId` + `toolCallId` + `cardId` + `resumeData`
 *   (from `data-tool-call-suspended` or the thread's `pending` list). Without
 *   `toolCallId` the run must have exactly one open question; `cardId` is the
 *   card's `AGENT_CARD_ID_KEY` and is required (review W2 F3).
 *
 * Only the last message is used: the thread's history is the server's. A user
 * message carries text parts and inline file parts (see the attachment limits
 * above); an approval message at most `AGENT_APPROVALS_PER_REQUEST` answers.
 */
export type AgentChatRequestV1 = {
  /** Absent: the server opens a new thread and names it in the response. */
  threadId?: string;
  messages: unknown[];
  runId?: string;
  toolCallId?: string;
  /** The answered card's `AGENT_CARD_ID_KEY`, as the card carried it. */
  cardId?: string;
  resumeData?: Record<string, unknown>;
};

/**
 * The approval request on the stream (`tool-approval-request`) carries
 * `reason`: what will happen and to what, written by the server from the
 * stored call and the workspace (e.g. «Удалить заготовку cnt-03 «Про
 * созвоны» вместе с её адаптациями»). AI SDK UI puts it on the tool part as
 * `approval.requestReason`. It reaches the browser only, never the model.
 */
export const AGENT_APPROVAL_SUMMARY_MAX = 300;

/**
 * Request header of every `/agent` door: the browser's IANA time zone
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`), the zone the screens
 * read and write times in. Taken only when `Intl` knows it; else the
 * person's saved offset, else UTC.
 */
export const AGENT_TIMEZONE_HEADER = 'x-agent-timezone' as const;

/** Response header of `POST /agent/chat` naming the thread it wrote to. */
export const AGENT_THREAD_HEADER = 'x-agent-thread-id' as const;

export type AgentThreadV1 = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/** `GET /agent/threads` — the caller's own threads, newest first. */
export type AgentThreadListV1 = { threads: AgentThreadV1[] };

/**
 * An approval card or a question card still waiting for the person, read from
 * storage (`listSuspendedRuns`), so a reload — even after a restart — redraws
 * it and answers it by `runId`.
 */
export type AgentPendingRunV1 = {
  runId: string;
  toolCallId: string | null;
  toolName: string | null;
  kind: 'approval' | 'question';
  /** Approval only: the arguments that will run on «Да». */
  args?: unknown;
  /**
   * Approval only: what and where, in the caller's language, from the stored
   * arguments — the same words the live card showed as `requestReason`.
   */
  summary?: string | null;
  /**
   * Question only: what the card shows (`suspendSchema` of the capability),
   * without what only the server continues with (a snapshot key, a signed
   * proposal), and with the card's `AGENT_CARD_ID_KEY`.
   */
  suspendPayload?: unknown;
};

/**
 * `GET /agent/threads/:id` — the thread, its messages as AI SDK UI v7
 * messages (the `useChat` initial messages), and what still waits.
 */
export type AgentThreadHistoryV1 = {
  thread: AgentThreadV1;
  messages: unknown[];
  pending: AgentPendingRunV1[];
};

/** `PATCH /agent/threads/:id`. */
export type AgentThreadRenameV1 = { title: string };
export const AGENT_THREAD_TITLE_MAX = 120;
