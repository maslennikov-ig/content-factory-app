import type { RequestContext } from '@mastra/core/request-context';
import type { ToolHooks } from '@mastra/core/tools';
import { approvalFingerprint } from './approval-fingerprint';
import { approvalContentDigest, approvalContentFingerprint } from './approval-summary';
import {
  consumeApproval,
  hasApproval,
  markQuestionsOpened,
  PAID_CALLS_HARD_LIMIT,
  PAID_CALLS_PER_TURN,
  proposalOpenHere,
  questionsOpenedHere,
  readCapabilityIdentity,
  releasePaidSlot,
  reservePaidSlot,
} from './capability.context';
import {
  refusal,
  toolNameOf,
  type CapabilityDeclaration,
  type CapabilityDoor,
  type CapabilityIdentity,
  type CapabilityRefusal,
} from './capability.types';
import type { DoorVerdict } from './door-policy';
import type { CapabilityServices } from './mastra.adapter';

/**
 * Per-call checks (`content-factory-next-kcxz.6`, spec §4.2, ADR-0012
 * amendment §4).
 *
 * In the web chat they run in the agent's native `hooks.beforeToolCall` /
 * `afterToolCall` — once for every tool, not a wrapper per tool. An MCP server
 * has no agent hooks, so the MCP adapter calls the same `admitCapabilityCall`
 * inside its execute: one rule, two entrances.
 *
 * What a call must pass, in this order:
 *
 * 1. a server-built identity;
 * 1a. questions only the person answers (`personQuestions.answers`): not for
 *    an object whose questions this same request has just put to them
 *    (`kcxz.31`, D1) — before a paid slot is taken;
 * 1b. a proposal of changes (`proposes`): not while a card of proposed
 *    changes to the same text waits in the conversation (`kcxz.32`, N2) —
 *    before a paid slot is taken; the call that card belongs to, resumed
 *    with the person's answer, is not a new proposal;
 * 2. `confirm`: the approval the person gave is for exactly this tool and these
 *    arguments (fingerprint), and — for a capability that declares
 *    `approvalContent` — for what goes out as it is stored now (review W2 F4);
 * 3. `paid`: a free paid slot in this turn — 1, or 2 on an explicit
 *    continuation, never more;
 * 4. the door's `@CheckPolicies`, re-evaluated now with `PermissionsService`
 *    (the role may have changed since the tool list was built, and plan limits
 *    are only known now).
 *
 * Steps 1–3 finish before the first `await`, so parallel calls of one step
 * cannot both take the last paid slot.
 *
 * A refusal is returned as the tool's result — the model reads the reason and
 * tells the person — which is how Mastra's `beforeToolCall` declines a call
 * (`{ proceed: false, output }`).
 */

/**
 * The words of the paid cap (`kcxz.31`, D11), the same rule the card states:
 * one paid step per message of the person, two when the request carries their
 * «Да» on a card. Their next message runs the next step.
 */
export const paidCapReason = (limit: number) =>
  `Nothing more was spent: one message of the person runs at most ${PAID_CALLS_PER_TURN} paid step (${PAID_CALLS_HARD_LIMIT} right after their «Да» on a card), and this one has used its ${limit}. Say what is done, then ask the person whether to continue — their next message runs the next paid step.`;

export type CapabilityGate = {
  check(door: CapabilityDoor, identity: CapabilityIdentity): Promise<DoorVerdict>;
};

type ContextLike = Pick<RequestContext<unknown>, 'get' | 'set'>;

export const admitCapabilityCall = async (
  capability: CapabilityDeclaration,
  input: unknown,
  requestContext: ContextLike | undefined,
  gate: CapabilityGate,
  options: {
    countPaid: boolean;
    services?: CapabilityServices;
    capabilities?: readonly CapabilityDeclaration[];
    /** The call carries the person's answer on its own card (a resume). */
    resuming?: boolean;
  }
): Promise<CapabilityRefusal | null> => {
  const identity = readCapabilityIdentity(requestContext);
  if (!identity || !requestContext) {
    return refusal(
      'IDENTITY_MISSING',
      'The call arrived without a server-built identity; nothing was done.'
    );
  }

  const answering = capability.personQuestions?.answers?.(input as never);
  if (answering && questionsOpenedHere(requestContext, answering)) {
    return refusal(
      'INPUT_NEEDS_PERSON',
      'These questions were put to the person a moment ago, on the card in this very answer, and they have not replied yet; nothing was done or spent. Only the person answers them: ask them in one message to answer here or on the card, or to say «Решите за меня». Do not answer or decide for them now.'
    );
  }

  const proposing = options.resuming ? null : capability.proposes?.(input as never);
  if (proposing && proposalOpenHere(requestContext, proposing)) {
    return refusal(
      'PROPOSAL_CARD_OPEN',
      'A card with proposed changes to this same text is still open in this conversation, waiting for the person; nothing was run or spent. The person already sees this under the tool, in their words: the card above waits, nothing was run again. Do not repeat or rephrase that, and do not mention the card; just continue. Answer only what else their message asked; when it asked nothing else (a thanks, «посмотрю»), one short word such as «Хорошо» is enough. Do not run a check or a rewrite of this text again now: a new proposal for it runs only after that card is answered, and only when the person asks for one again.'
    );
  }

  const toolName = toolNameOf(capability.id);
  const confirm = capability.risk === 'confirm';
  if (confirm) {
    const print = approvalFingerprint(toolName, input);
    if (!hasApproval(requestContext, print)) {
      return refusal(
        'APPROVAL_MISMATCH',
        'The person did not approve this exact action. Ask again with the approval card; do not retry with other arguments.'
      );
    }
  }

  let slot = false;
  if (capability.risk === 'paid' && options.countPaid) {
    const reserved = reservePaidSlot(requestContext);
    if (!reserved.ok) {
      return refusal('PAID_CAP_REACHED', paidCapReason(reserved.limit));
    }
    slot = true;
  }

  // What goes out is read again now (the first `await` of a confirm call; a
  // confirm call takes no paid slot). Without the services to read it, no
  // bound approval can be proven: refused.
  if (confirm && capability.approvalContent) {
    const digest = options.services
      ? await approvalContentDigest(
          options.capabilities ?? [capability],
          options.services,
          identity,
          toolName,
          input
        )
      : null;
    if (!digest || !hasApproval(requestContext, approvalContentFingerprint(toolName, input, digest))) {
      return refusal(
        'APPROVAL_CONTENT_CHANGED',
        'What the person approved is no longer what would go out: the post text, its picture or the number of posts changed after the card was shown. Nothing was done. Call the tool again so the person sees it as it is now; do not change it yourself.'
      );
    }
  }

  const verdict = await gate.check(capability.door, identity);
  if (!verdict.allowed) {
    if (slot) releasePaidSlot(requestContext);
    return refusal(
      'PERMISSION_DENIED',
      `The person's role or plan does not allow this action (${verdict.refused}). Say so; do not try another way around it.`
    );
  }
  return null;
};

/**
 * The agent-level hooks. Tools that are not in the registry (Mastra's own
 * skill or memory tools) pass through untouched.
 */
export const createCapabilityHooks = (
  capabilities: readonly CapabilityDeclaration[],
  gate: CapabilityGate,
  /** The door's services, to read what a bound approval sends out now. */
  services?: CapabilityServices
): Required<ToolHooks> => {
  const byTool = new Map(
    capabilities.map((capability) => [toolNameOf(capability.id), capability])
  );
  const contextOf = (context: unknown) =>
    (context as { requestContext?: ContextLike } | undefined)?.requestContext;
  /** Mastra resumes a suspended call with the person's answer in `agent`. */
  const resumingIn = (context: unknown) =>
    (context as { agent?: { resumeData?: unknown } } | undefined)?.agent?.resumeData !==
    undefined;

  return {
    beforeToolCall: async ({ toolName, input, context }) => {
      const capability = byTool.get(toolName);
      if (!capability) return undefined;
      const refused = await admitCapabilityCall(
        capability,
        input,
        contextOf(context),
        gate,
        { countPaid: true, services, capabilities, resuming: resumingIn(context) }
      );
      return refused ? { proceed: false, output: refused } : undefined;
    },
    afterToolCall: async ({ toolName, input, context, output }) => {
      const capability = byTool.get(toolName);
      const requestContext = contextOf(context);
      if (!capability || !requestContext) return;
      // The questions a call has just put before the person (kcxz.31, D1):
      // read from the summary the model is given, unwrapped if it is data.
      const opens = capability.personQuestions?.opens;
      const result = output as { ok?: unknown; summary?: unknown } | undefined;
      if (opens && result?.ok === true && result.summary && typeof result.summary === 'object') {
        const summary = result.summary as Record<string, unknown>;
        const wrapped = (summary.untrustedData as { value?: unknown } | undefined)?.value;
        const opened = opens((wrapped && typeof wrapped === 'object' ? wrapped : summary) as Record<string, unknown>);
        if (opened) markQuestionsOpened(requestContext, opened);
      }
      if (capability.risk !== 'confirm') return;
      // Spent whether the call succeeded or threw: one «Да», one call. The
      // content-bound print of the same call goes with it.
      consumeApproval(requestContext, approvalFingerprint(toolName, input));
    },
  };
};

/**
 * Ends the turn after a step whose every tool call was refused with
 * `PROPOSAL_CARD_OPEN` (`kcxz.38`, R5). The person already reads that refusal
 * under the tool, in their words; a model step after it only restated it
 * («Повторную проверку сейчас не запустили.») however the reason was worded.
 * So the loop stops there, natively (Mastra's `stopWhen`, evaluated after a
 * step with tool results), and no model text follows. A step that also ran
 * another tool goes on as ever: the rest of the message is answered.
 */
type StepLike = {
  content?: ReadonlyArray<{ type?: string; toolCallId?: string; output?: unknown; result?: unknown }>;
};

const refusedOpenProposal = (part: { output?: unknown; result?: unknown }): boolean => {
  const raw = (part.output ?? part.result) as { type?: unknown; value?: unknown } | undefined;
  // AI SDK v5 model messages wrap a tool's value as `{ type: 'json', value }`.
  const value = (raw && typeof raw === 'object' && 'value' in raw && (raw.type === 'json' || raw.type === 'text')
    ? raw.value
    : raw) as { ok?: unknown; code?: unknown } | undefined;
  return !!value && typeof value === 'object' && value.ok === false && value.code === 'PROPOSAL_CARD_OPEN';
};

export const stopAfterOpenProposalRefusal = ({
  steps,
}: {
  steps: ReadonlyArray<StepLike>;
}): boolean => {
  const last = steps[steps.length - 1];
  const content = last?.content ?? [];
  const calls = content.filter((part) => part.type === 'tool-call');
  const results = content.filter((part) => part.type === 'tool-result');
  if (!calls.length || results.length !== calls.length) return false;
  return results.every(refusedOpenProposal);
};
