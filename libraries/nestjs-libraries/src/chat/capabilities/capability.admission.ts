import type { RequestContext } from '@mastra/core/request-context';
import { randomUUID } from 'node:crypto';
import type { ToolHooks } from '@mastra/core/tools';
import { validateToolInput } from '@mastra/core/tools';
import { standardSchemaToJSONSchema, toStandardSchema } from '@mastra/core/schema';
import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';
import { currentConductorExecution } from '../conductor/conductor.execution';
import { approvalFingerprint } from './approval-fingerprint';
import { approvalContentDigest, approvalContentFingerprint } from './approval-summary';
import {
  consumeApproval,
  CAPABILITY_CONTEXT_KEYS,
  hasApproval,
  markQuestionsOpened,
  proposalOpenHere,
  questionsOpenedHere,
  readCapabilityIdentity,
  releasePaidSlot,
  reservePaidSlot,
  settlePaidSlot,
} from './capability.context';
import {
  mayAskApproval,
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
 * 1a. valid declared input, before callbacks or paid-slot reservation; native
 *    Mastra validation still owns parsing and execution;
 * 1b. questions only the person answers (`personQuestions.answers`): not for
 *    an object whose questions this same request has just put to them
 *    (`kcxz.31`, D1) — before a paid slot is taken;
 * 1c. a proposal of changes (`proposes`): not while a card of proposed
 *    changes to the same text waits in the conversation (`kcxz.32`, N2) —
 *    before a paid slot is taken; the call that card belongs to, resumed
 *    with the person's answer, is not a new proposal;
 * 2. `confirm`: the approval the person gave is for exactly this tool and these
 *    arguments (fingerprint), and — for a capability that declares
 *    `approvalContent` — for what goes out as it is stored now (review W2 F4);
 * 2a. `asksInWebChat`, web chat only (`kcxz.45`): the same fingerprint;
 * 3. `paid`: one atomic in-flight permit under the task execution policy;
 *    completed domain operations do not consume a per-message allowance;
 * 4. the door's `@CheckPolicies`, re-evaluated now with `PermissionsService`
 *    (the role may have changed since the tool list was built, and plan limits
 *    are only known now).
 *
 * Steps 1–3 finish before the first `await`, so parallel calls cannot claim
 * the same in-flight permit. Actual monthly quota is still admitted by each
 * domain operation's service.
 *
 * A refusal is returned as the tool's result — the model reads the reason and
 * tells the person — which is how Mastra's `beforeToolCall` declines a call
 * (`{ proceed: false, output }`).
 */

/**
 * Compatibility export for old callers. A stopped budget reports incomplete
 * work; it does not require a new message after each paid operation.
 */
export const paidCapReason = () =>
  'No new paid work started. The execution budget stopped this task, or an admitted domain operation is still in flight. Preserve confirmed results, state what remains, quote any questions left to the person in «», word for word as the tool gave them, and do not retry uncertain work automatically.';

export type CapabilityGate = {
  check(door: CapabilityDoor, identity: CapabilityIdentity): Promise<DoorVerdict>;
};

type ContextLike = Pick<RequestContext<unknown>, 'get' | 'set'>;
type ReadableContextLike = ContextLike | Readonly<Record<string, unknown>>;

/** Only declaration-owned field names/types, never rejected input or issue text. */
const inputStructure = (schema: JSONSchema7Definition): unknown => {
  if (typeof schema === 'boolean') return 'value';
  if (schema.properties) return Object.fromEntries(Object.entries(schema.properties)
    .map(([key, value]) => [key, inputStructure(value)]));
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) return inputStructure(variants.find((value) =>
    typeof value === 'object' && value.type !== 'null') ?? true);
  if (schema.items) return [inputStructure(Array.isArray(schema.items) ? schema.items[0] ?? true : schema.items)];
  return schema.enum ?? schema.const ?? schema.type ?? 'value';
};

export const admitCapabilityCall = async (
  capability: CapabilityDeclaration,
  input: unknown,
  requestContext: ReadableContextLike | undefined,
  gate: CapabilityGate,
  options: {
    countPaid: boolean;
    paidOwner?: string;
    services?: CapabilityServices;
    capabilities?: readonly CapabilityDeclaration[];
    /** The call carries the person's answer on its own card (a resume). */
    resuming?: boolean;
    /** The web chat's hooks: `asksInWebChat` applies (never over MCP). */
    webChat?: boolean;
    /**
     * Pre-approval check (`A27`): checks identity, stop state, input schema,
     * open questions/proposals, and door permissions before parking an approval
     * card, without requiring the approval fingerprint yet.
     */
    beforeApprovalOnly?: boolean;
    /**
     * MCP (`kcxz.49`, `kcxz.52`): a `confirm` call's «Да» is its one-time
     * code, which the adapter checks after admission (`mcp-confirmation.ts`),
     * or the person's own request (`mcpConfirm: 'request'`); there is no card
     * whose approval this request could carry.
     */
    confirmsByCode?: boolean;
  }
): Promise<CapabilityRefusal | null> => {
  const identity = readCapabilityIdentity(requestContext);
  if (!identity || !requestContext) {
    return refusal(
      'IDENTITY_MISSING',
      'The call arrived without a server-built identity; nothing was done.'
    );
  }
  const stopped = currentConductorExecution()?.snapshot().stopCode;
  if (stopped) return refusal(stopped, paidCapReason());

  // Mastra calls beforeToolCall before its native input validator. An invalid
  // call must not reserve a paid slot or reach declaration callbacks. Check
  // synchronously so parallel valid calls still reserve atomically below.
  // Reuse Mastra's public validator: it normalizes optional nulls and JSON
  // arguments the same way execution does. A raw Zod check would reject valid
  // model calls. Leave the approved input untouched for native execution.
  const validation = validateToolInput(toStandardSchema(capability.input), input);
  if (validation.error) {
    // Error messages, rejected values and even record keys in issue paths can
    // contain secrets. Only top-level field names owned by the schema are safe
    // to return; unknown fields and root errors need no path detail.
    const invalidFields = validation.error.validationErrors.fields;
    const paths = Object.keys(capability.input.shape).filter((key) =>
      Object.prototype.hasOwnProperty.call(invalidFields, key)
    );
    const schema = standardSchemaToJSONSchema(toStandardSchema(capability.input), { io: 'input' }) as JSONSchema7;
    const fields = paths.length && schema.properties
      ? { type: 'object' as const, properties: Object.fromEntries(paths.map((key) => [key, schema.properties![key]])) }
      : schema;
    return refusal(
      'CAPABILITY_INPUT_INVALID',
      `The arguments do not match this tool’s input${
        paths.length ? ` (${paths.join(', ')})` : ''
      }; read its description and call it again with allowed values. Nothing was done. ` +
      `Expected field structure: ${JSON.stringify(inputStructure(fields)).slice(0, 5_000)}. ` +
      'Keep nested fields in their declared object; omit unused optional fields.'
    );
  }

  const answering = capability.personQuestions?.answers?.(input as never);
  if (answering && questionsOpenedHere(requestContext, answering) && !(options.webChat && capability.nativeDomainQuestions)) {
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
  const confirm = capability.risk === 'confirm' && !options.confirmsByCode && !options.beforeApprovalOnly;
  const asksHere = !!options.webChat && !!capability.asksInWebChat && !options.beforeApprovalOnly;
  if (confirm || asksHere) {
    const print = approvalFingerprint(toolName, input);
    if (!hasApproval(requestContext, print)) {
      return refusal(
        'APPROVAL_MISMATCH',
        confirm
          ? 'The person did not approve this exact action. Ask again with the approval card; do not retry with other arguments.'
          : 'The person did not approve this exact action on its card; nothing was done. Call it again so the card is shown; do not retry with other arguments or by other means.'
      );
    }
  }

  let slot = false;
  if (capability.risk === 'paid' && options.countPaid && !options.beforeApprovalOnly) {
    const reserved = reservePaidSlot(requestContext as ContextLike, options.paidOwner);
    if (!reserved.ok) {
      return refusal(reserved.code ?? 'AGENT_TASK_STOPPED', paidCapReason());
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
        'What the person approved is no longer what would go out: the post text, its picture, the number of posts or the avatar it acts on changed after the card was shown. Nothing was done. Call the tool again so the person sees it as it is now; do not change it yourself.'
      );
    }
  }

  let verdict: DoorVerdict;
  try {
    verdict = await gate.check(capability.door, identity);
  } catch (error) {
    if (slot) releasePaidSlot(requestContext as ContextLike);
    throw error;
  }
  if (!verdict.allowed) {
    if (slot) releasePaidSlot(requestContext as ContextLike);
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
  const ownerIds = new WeakMap<object, string>();
  const paidOwnerOf = (context: unknown): string | undefined => {
    if (!context || typeof context !== 'object') return undefined;
    const id = (context as { toolCallId?: unknown }).toolCallId;
    if (typeof id === 'string') return id;
    let owner = ownerIds.get(context);
    if (!owner) { owner = randomUUID(); ownerIds.set(context, owner); }
    return owner;
  };
  /** Mastra resumes a suspended call with the person's answer in `agent`. */
  const resumingIn = (context: unknown) =>
    (context as { agent?: { resumeData?: unknown } } | undefined)?.agent?.resumeData !==
    undefined;

  return {
    beforeToolCall: async ({ toolName, input, context }) => {
      const requestContext = contextOf(context);
      if (toolName === 'subagent') {
        const identity = readCapabilityIdentity(requestContext);
        if (!identity) {
          return {
            proceed: false,
            output: refusal(
              'IDENTITY_MISSING',
              'The call arrived without a server-built identity; nothing was done.'
            ),
          };
        }
        const subagentInput = (input ?? {}) as {
          agentType?: unknown;
          forked?: unknown;
          prompt?: unknown;
        };
        if (subagentInput.forked === true) {
          return {
            proceed: false,
            output: refusal(
              'PERMISSION_DENIED',
              'Forked subagent execution is disabled: subagents must use a bounded specialist definition and never bypass parent tool approvals.'
            ),
          };
        }
        const agentType =
          typeof subagentInput.agentType === 'string'
            ? subagentInput.agentType
            : '';
        if (!['research', 'writing', 'review'].includes(agentType)) {
          return {
            proceed: false,
            output: refusal(
              'CAPABILITY_INPUT_INVALID',
              'Unknown subagent specialist; allowed specialists are research, writing, and review.'
            ),
          };
        }
        if (identity.role === 'USER' && agentType !== 'research') {
          return {
            proceed: false,
            output: refusal(
              'PERMISSION_DENIED',
              "The person's role or plan does not allow this action (Edit Posts). Say so; do not try another way around it."
            ),
          };
        }
        return undefined;
      }
      if (
        toolName === 'set_objective' ||
        toolName === 'schedule_followup_create' ||
        toolName === 'schedule_followup_cancel'
      ) {
        const identity = readCapabilityIdentity(requestContext);
        if (!identity) {
          return {
            proceed: false,
            output: refusal(
              'IDENTITY_MISSING',
              'The call arrived without a server-built identity; nothing was done.'
            ),
          };
        }
        const action = (input as { action?: unknown } | undefined)?.action;
        if (
          identity.role === 'USER' &&
          !(toolName === 'set_objective' && action === 'get')
        ) {
          return {
            proceed: false,
            output: refusal(
              'PERMISSION_DENIED',
              "The person's role or plan does not allow this action (Edit Posts). Say so; do not try another way around it."
            ),
          };
        }
        return undefined;
      }
      const capability = byTool.get(toolName);
      if (!capability) return undefined;
      const refused = await admitCapabilityCall(
        capability,
        input,
        requestContext,
        gate,
        { countPaid: true, paidOwner: paidOwnerOf(context), services, capabilities, resuming: resumingIn(context), webChat: true }
      );
      return refused ? { proceed: false, output: refused } : undefined;
    },
    afterToolCall: async ({ toolName, input, context, output, error }) => {
      const capability = byTool.get(toolName);
      const requestContext = contextOf(context);
      currentConductorExecution()?.recordToolResult(toolName, input, output);
      if (!capability || !requestContext) return;
      if (capability.risk === 'paid') {
        const owner = paidOwnerOf(context);
        const admitted = requestContext.get(CAPABILITY_CONTEXT_KEYS.paidOwner as never) === owner;
        const result = output as { ok?: unknown; canReviseInput?: unknown } | undefined;
        // Pre-spend refusals explicitly release their permit in the adapter.
        // A started paid failure must not be blindly bought again.
        if (admitted && (error !== undefined || (result?.ok === false && result.canReviseInput !== true))) {
          currentConductorExecution()?.stop('AGENT_TASK_OPERATION_FAILED');
        }
        settlePaidSlot(requestContext, owner);
      }
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
      if (!mayAskApproval(capability)) return;
      // Spent whether the call succeeded or threw: one «Да», one call. The
      // content-bound print of the same call goes with it.
      consumeApproval(requestContext, approvalFingerprint(toolName, input));
    },
  };
};

export { stopAfterOpenProposalRefusal } from '../conductor/conductor.steps';
