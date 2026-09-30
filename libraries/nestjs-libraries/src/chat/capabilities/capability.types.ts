import type { Type } from '@nestjs/common';
import type { z } from 'zod';
import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import type { UntrustedSource } from './untrusted-data';
import { CARD_KINDS, type CardKind } from './agent-parts.contract';

/**
 * One product action, declared once (`content-factory-next-kcxz.6`,
 * `docs/product/agent-harness-spec.md` §4.2).
 *
 * A declaration is data plus one `run`. It never talks to Mastra or MCP: the
 * adapters beside it turn the same declaration into a native Mastra tool and
 * into an MCP tool, so the chat, the MCP entrance and the screen share one
 * implementation — the service the screen's door calls.
 */

/**
 * The six risk classes of spec §5.1. What each one means in the web chat and
 * over MCP is decided by the adapters, not by the declaration.
 */
export const RISK_CLASSES = [
  'read',
  'write',
  'paid',
  'confirm',
  'input',
  'secret',
] as const;
export type RiskClass = (typeof RISK_CLASSES)[number];

/** The groups of the catalogue (spec §5.2); the skills follow the same split. */
export const CAPABILITY_GROUPS = [
  'overview',
  'avatar',
  'channels',
  'content',
  'plan',
  'ideas',
  'facts',
  'media',
  'ai-settings',
  'analytics',
] as const;
export type CapabilityGroup = (typeof CAPABILITY_GROUPS)[number];

/**
 * What the chat draws for a result (spec §6.2). The kind is also the suffix of
 * the persisted `data-<kind>` part, so a reloaded thread draws the same card.
 * Declared in the wire contract the screen mirrors.
 */
export { CARD_KINDS, type CardKind };

/**
 * The screen door a capability mirrors: the controller class and its handler.
 * Its `@CheckPolicies` are read from this handler, so the chat and the screen
 * cannot disagree about who may do what.
 */
export type CapabilityDoor<C = any> = {
  controller: Type<C>;
  method: keyof C & string;
};

/** Typed door reference: a misspelt handler fails the compiler. */
export const door = <C>(
  controller: Type<C>,
  method: keyof C & string
): CapabilityDoor<C> => ({ controller, method });

/**
 * Who is acting, built by the server from the session only (spec §4.3). Only
 * primitives: the premortem S1 keeps whole rows out of anything Mastra stores.
 */
export type CapabilityIdentity = {
  organizationId: string;
  /** ISO date; `PermissionsService.check` reads it for plan limits. */
  organizationCreatedAt: string;
  userId: string;
  role: OrganizationRole;
  language: 'ru' | 'en';
  /**
   * The person's time zone as the door resolved it (`person-time.ts`): the
   * browser's IANA zone, else the saved offset, else `UTC`. Times are read
   * and said in it, as the screens do.
   */
  timeZone: string;
};

/** Where the call came from. MCP has no approval card and no question card. */
export type CapabilityEntrance = 'chat' | 'mcp';

export type CapabilityRunContext = CapabilityIdentity & {
  entrance: CapabilityEntrance;
  /** The Nest provider the door itself uses, resolved by class. */
  service: <T>(token: Type<T>) => T;
  abortSignal?: AbortSignal;
  /** A question's capability: the person's answer when the call is resumed. */
  resumeData?: unknown;
  /**
   * On resume: the payload the call suspended with, as Mastra stored it on
   * the server (`context.agent.suspendPayload`) — not what the browser sent.
   */
  suspendPayload?: unknown;
  /**
   * A question's capability, web chat only: stop and show the question card.
   * Absent over MCP; a capability that can decide for the person then does.
   */
  suspend?: (payload: unknown) => Promise<void>;
  /**
   * MCP only (`kcxz.49`): the person said «да» in the conversation to the
   * question this call returned, and the call carries the code issued for
   * exactly these arguments (`mcp-confirmation.ts`). A capability that asks
   * inside its run (the autopilot consent of `piece.adapt`) reads it instead
   * of a card; without it it throws `ConfirmationNeeded`.
   */
  confirmed?: boolean;
};

/** What `describeApproval` may read: the caller and the door's services. */
export type ApprovalDescribeContext = CapabilityIdentity & {
  service: <T>(token: Type<T>) => T;
  /** Set when the question is asked over MCP (`kcxz.49`); the web chat's card leaves it out. */
  entrance?: CapabilityEntrance;
};

/**
 * One part for the chat. A card (`transient` absent) is persisted into the
 * thread as `data-<kind>` and carries an `id`, so the panel beside the chat
 * opens the product object itself; progress is `transient` and is only
 * streamed.
 */
export type CapabilityPart = {
  kind: CardKind | 'progress';
  data: { id?: string } & Record<string, unknown>;
  transient?: boolean;
};
export type CapabilityEmit = (part: CapabilityPart) => Promise<void>;

/** What the card the capability produced is about, by id. */
export type CardReference = { kind: CardKind; id: string } & Record<
  string,
  unknown
>;

export type CapabilityDeclaration<
  TInput extends z.AnyZodObject = z.AnyZodObject,
  TOutput = unknown,
> = {
  /** Dotted product id, e.g. `piece.rename`. The tool name is derived from it. */
  id: string;
  group: CapabilityGroup;
  /** The label people read (the tool `title`), in both interface languages. */
  label: { ru: string; en: string };
  /** For the model: when to use it and what it returns. English. */
  description: string;
  /**
   * What the model may pass. Never an organization or a user: those come from
   * the server-built context (guarded by `assertCapabilityInput`).
   */
  input: TInput;
  risk: RiskClass;
  card?: CardKind;
  door: CapabilityDoor;
  /**
   * Where the words in the model summary come from when somebody outside the
   * product could have written them (premortem A4). Non-empty means the
   * summary reaches the model only inside the data wrapper.
   */
  untrusted: readonly UntrustedSource[];
  /**
   * What the question card shows, and the answer it takes. Required for the
   * `input` class; a `paid` capability may carry them when its run pauses for
   * a choice only the person makes mid-way (spec §5.2, intake «paid + input»:
   * facts to keep at the research pause) and resumes the same call.
   */
  suspendSchema?: z.ZodTypeAny;
  resumeSchema?: z.ZodTypeAny;
  run: (
    ctx: CapabilityRunContext,
    input: z.infer<TInput>,
    emit: CapabilityEmit
  ) => Promise<TOutput | undefined>;
  /**
   * `write` class, web chat only (`kcxz.45`, spec §5.7): an action a line of
   * outside text the model read (a lead's title) could talk it into. In the
   * web chat every call shows the approval card — native Mastra approval —
   * and runs only on «Да» bound to its arguments, as `confirm` does. Over MCP
   * it stays plain `write`: the client's own tool approval decides there.
   */
  asksInWebChat?: true;
  /**
   * Offered over MCP though its web chat asks first (`kcxz.49`, `kcxz.52`).
   * Only for what can be undone from the product (a scheduled post comes off
   * the schedule); deleting, publishing at once, channels and keys stay
   * web-only.
   *
   * - `ask` — the request does not name what follows (an adaptation into an
   *   autopilot channel goes out by itself): the call first answers with the
   *   question and a one-time code; the assistant asks the person and, after
   *   their «да», calls again with the code (`mcp-confirmation.ts`).
   * - `request` — the request names the action and its time («перенеси на
   *   завтра 10:00»): the person's own words are the consent and the call
   *   runs at once (owner, live walk 30.09.2026: «если я уже сказал, что
   *   сделать, зачем спрашивать повторно»).
   */
  mcpConfirm?: 'ask' | 'request';
  /**
   * `confirm` class, and an `asksInWebChat` one, required: the approval card's «what and where», read from
   * the workspace for the stored arguments (the entity by id, in the caller's
   * organization) — never words the model wrote. One line in the caller's
   * language. Shown to the person only; the model never reads it.
   */
  describeApproval?: (
    ctx: ApprovalDescribeContext,
    input: z.infer<TInput>
  ) => Promise<string>;
  /**
   * `confirm` class, optional: what goes out, as stored now — a post's text
   * and picture, the number of posts a mode applies to (review W2 F4, F10).
   * Read when the card is first shown, when the person answers and when the
   * call runs; «Да» is bound to the value the card was shown with, and a call
   * whose value differs is refused (`APPROVAL_CONTENT_CHANGED`) — the model
   * shows the card again. Never a value the model wrote.
   */
  approvalContent?: (
    ctx: ApprovalDescribeContext,
    input: z.infer<TInput>
  ) => Promise<unknown>;
  /**
   * Questions only the person answers (`kcxz.31`, D1). `opens` names the
   * object whose open questions a successful call has just put before the
   * person (from the call's summary), `answers` the object a call would
   * answer them for (from its input). The hooks refuse an `answers` call for
   * an object whose questions were opened in the same request: the person has
   * not said a word since they were asked. Their next message is a new
   * request, so their own answer or «Решите за меня» goes through.
   */
  personQuestions?: {
    opens?: (summary: Record<string, unknown>) => string | null;
    answers?: (input: z.infer<TInput>) => string | null;
  };
  /**
   * A proposal of changes the person accepts on a card (`kcxz.32`, N2): the
   * text it is for (`proposalTarget`). While a card of proposed changes to
   * that text waits in the conversation, the hooks refuse a new proposal
   * before anything is spent and point the model at the open card.
   */
  proposes?: (input: z.infer<TInput>) => string | null;
  /**
   * `paid` class, optional: the run says it spent nothing — a stored result
   * returned, too little to work on. The turn's paid slot is given back, so
   * the next paid step the person asked for in the same message still runs
   * (review W3-18 F4).
   */
  spentNothing?: (output: TOutput) => boolean;
  /** The short answer for the model. Long texts stay on the card, by id. */
  summarize: (output: TOutput) => Record<string, unknown>;
  /** The persisted card payload, `null` when there is nothing to show. */
  cardOf?: (output: TOutput) => CardReference | null;
};

/**
 * Whether a call of this capability may wait for «Да» on an approval card in
 * the web chat: `confirm`, and `asksInWebChat` (`kcxz.45`).
 */
export const mayAskApproval = (capability: Pick<CapabilityDeclaration, 'risk' | 'asksInWebChat'>) =>
  capability.risk === 'confirm' || !!capability.asksInWebChat;

/** Keeps the generic parameters of one declaration while typing the list. */
export const defineCapability = <TInput extends z.AnyZodObject, TOutput>(
  declaration: CapabilityDeclaration<TInput, TOutput>
): CapabilityDeclaration<TInput, TOutput> => declaration;

/**
 * Mastra renames anything outside `[a-zA-Z0-9_-]`; naming the tool ourselves
 * keeps `activeTools`, the hooks and the stored tool parts on one name.
 */
export const toolNameOf = (capabilityId: string) =>
  capabilityId.replace(/[^a-zA-Z0-9_-]/g, '_');

/**
 * Classes whose capability may stop for the person's answer: `input` always,
 * `paid` when a choice sits in the middle of its run (spec §5.2).
 */
export const QUESTION_RISKS: readonly RiskClass[] = ['input', 'paid'];

/** Classes that never leave the web chat (spec §1.7, §5.1). */
export const WEB_ONLY_RISKS: readonly RiskClass[] = ['confirm', 'input', 'secret'];

/**
 * A refusal the model reads as the tool's result. The hooks and the adapters
 * use the same shape, so the model learns one way to hear «no».
 */
export type CapabilityRefusal = {
  ok: false;
  code: string;
  reason: string;
};

export type CapabilityToolOutput =
  | {
      ok: true;
      capability: string;
      summary: unknown;
      card?: { kind: CardKind; id: string };
    }
  | CapabilityRefusal;

/**
 * A product code: upper snake case with at least one underscore
 * (`PIECE_NOT_FOUND`, `CF_QUEUE_BUSY`). Not Prisma's `P2025`, not Node's
 * `ECONNREFUSED`, `ERR_…` or undici's `UND_ERR_…`: their messages were never
 * written for people and may name tables, hosts or paths (review W2 F13).
 */
const PRODUCT_CODE = /^(?!ERR_|UND_ERR_)[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
export const isProductErrorCode = (code: unknown): code is string =>
  typeof code === 'string' && code.length <= 64 && PRODUCT_CODE.test(code);

export const refusal = (code: string, reason: string): CapabilityRefusal => ({
  ok: false,
  code,
  reason,
});
