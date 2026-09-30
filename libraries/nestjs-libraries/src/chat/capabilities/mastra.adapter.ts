import type { Type } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  admitCapabilityCall,
  type CapabilityGate,
} from './capability.admission';
import {
  capabilityContextSchema,
  readCapabilityIdentity,
  releasePaidSlot,
} from './capability.context';
import {
  isProductErrorCode,
  refusal,
  toolNameOf,
  type CapabilityDeclaration,
  type CapabilityEntrance,
  type CapabilityPart,
  type CapabilityRefusal,
  type CapabilityRunContext,
  type CapabilityToolOutput,
  type RiskClass,
} from './capability.types';
import { roleMayUse } from './door-policy';
import { failedUnspent } from './catalogue/selection';
import { runPaidCapability } from './paid-adapter';
import { questionCardView } from './question-card';
import { modelSummary, wrapUntrusted } from './untrusted-data';
import { redactSecretLeaves } from '../conductor/secret-shapes';
import { approvalContentDigest, cleanApprovalSummary } from './approval-summary';
import {
  isConfirmationNeeded,
  mcpConfirmationInput,
  MCP_CONFIRMATION_FIELD,
  McpConfirmationService,
  type ConfirmationScope,
} from './mcp-confirmation';

/**
 * Native Mastra tools from the registry (`content-factory-next-kcxz.6`,
 * ADR-0012 amendment §3): `createTool` with `title`, `toModelOutput`,
 * `transform`, `requestContextSchema`, `requireApproval` for `confirm`,
 * `suspendSchema`/`resumeSchema` for `input`, and `mcp.annotations`.
 *
 * Per-call checks are not here: in the web chat they live in the agent's
 * `beforeToolCall`/`afterToolCall` (`capability.admission.ts`). The only
 * entrance-specific step is MCP's, which has no agent and therefore runs the
 * same admission inside `execute`.
 */

export type CapabilityServices = <T>(token: Type<T>) => T;

export type CapabilityToolOptions = {
  services: CapabilityServices;
  language: 'ru' | 'en';
  entrance: CapabilityEntrance;
  /** Required for MCP, where there are no agent hooks to run it. */
  gate?: CapabilityGate;
};

/** MCP hints per risk class (spec §5.1). */
export const MCP_ANNOTATIONS: Record<
  RiskClass,
  {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  }
> = {
  read: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  write: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  // Spends the allowance and calls models or search outside the product.
  paid: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  confirm: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  input: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  secret: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const UNKNOWN_FAILURE =
  'The action failed for a reason the product did not name; nothing more is known. Tell the person it did not work; do not retry by yourself.';

/**
 * A service refusal keeps its code (the screens' `safeHttpError` shape), so
 * the model says «в этом месяце посты кончились», not «что-то пошло не так».
 * Only a product code carries its message to the model and the transcript;
 * any other coded error (a driver, the network) reaches them as a code and a
 * fixed sentence (correctness review W2 F13).
 */
export const codedRefusal = (error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== 'string' || !code) return null;
  if (!isProductErrorCode(code)) return refusal('CAPABILITY_FAILED', UNKNOWN_FAILURE);
  const message = (error as { message?: unknown })?.message;
  return refusal(
    code,
    typeof message === 'string' && message ? message.slice(0, 1_000) : code
  );
};

/**
 * Mastra's own refusal of arguments that do not match the input schema
 * (`validateToolInput` in `@mastra/core` 1.71) repeats what was sent — «…
 * received 'sk-…'» and «Provided arguments: {…}» — into the tool result the
 * model reads and the transcript keeps. A value the model put in the wrong
 * field would come back to it verbatim (review W3-20 F12, `ai.key.enter`'s
 * enum). The refusal keeps the paths that failed and drops every value.
 */
const INPUT_INVALID = 'CAPABILITY_INPUT_INVALID';
const isMastraValidationError = (
  output: unknown
): output is { error: true; message?: unknown } =>
  !!output &&
  typeof output === 'object' &&
  (output as { error?: unknown }).error === true &&
  'validationErrors' in (output as object);

export const inputRefusal = (output: { message?: unknown }): CapabilityRefusal => {
  const message = typeof output.message === 'string' ? output.message : '';
  const paths = [
    ...new Set(
      [...message.matchAll(/^- ([^:\n]{1,80}):/gm)].map(([, path]) => path.trim())
    ),
  ];
  return refusal(
    INPUT_INVALID,
    `The arguments do not match this tool’s input${
      paths.length ? ` (${paths.join(', ')})` : ''
    }; read its description and call it again with allowed values. Nothing was done.`
  );
};

/** Also applied by the MCP server's own call path (`mcp.adapter.ts`, `kcxz.26`). */
export const withoutEchoedInput = (output: unknown) =>
  isMastraValidationError(output) ? inputRefusal(output) : output;

/** No stack, no file path, no message a service did not mean for people. */
const publicError = ({ error }: { error?: unknown }) => ({
  code:
    typeof (error as { code?: unknown })?.code === 'string'
      ? (error as { code: string }).code
      : 'CAPABILITY_FAILED',
});

/**
 * What the browser and the stored transcript see of a call. Once a target is
 * configured, Mastra 1.71 replaces every phase without a transformer by «Tool
 * … payload unavailable» (`payload-transform` in `@mastra/core`), which hid the
 * approval card's arguments, the question card's payload and the card
 * reference (found by `kcxz.8`'s pipeline probe). So every phase is named:
 * the error is reduced to its code, a question card loses its server-only
 * keys and gains its id, the rest passes as the tool produced it — the inputs
 * carry no identity (input guards) and the outputs no key.
 */
const TOOL_PAYLOAD_TRANSFORM = {
  input: ({ input }: { input?: unknown }) => input ?? {},
  inputDelta: ({ inputTextDelta }: { inputTextDelta?: string }) =>
    inputTextDelta ?? '',
  output: ({ output }: { output?: unknown }) => withoutEchoedInput(output) ?? null,
  error: publicError,
  // The call waiting for «Да» (and the one declined): its arguments as the
  // model wrote them. Mastra shows this phase in `data-tool-call-approval` and
  // keeps it as the pending approval's args, so it must stay the real call.
  approval: ({ input }: { input?: unknown }) => input ?? {},
  // A question card: shown with its id, without what only the server reads
  // back (snapshot key, signed token). The run's snapshot keeps the whole
  // payload; the resume reads it from there (review W2 F3, F9).
  suspend: ({ suspendPayload }: { suspendPayload?: unknown }) =>
    questionCardView(suspendPayload),
  resume: ({ resumeData }: { resumeData?: unknown }) => resumeData ?? null,
};

/**
 * What the assistant does with a question it got instead of a result
 * (`kcxz.49`): ask it as it is, wait, and repeat the call with the code only
 * after the person's own «да».
 */
const CONFIRMATION_NEXT =
  'Nothing was done or spent yet. Ask the person the question in `question` (its value) in your reply, word for word, and stop there. Only when their next message says yes, call this tool again with exactly the same arguments plus `confirmation` set to this code. If they say no or anything else, do not call it; a new question needs a new call without the code. Never answer the question yourself. The code works once, for 10 minutes.';

const CONFIRMATION_INVALID =
  'This confirmation code is not valid for this call: it was used already, expired (10 minutes), belongs to other arguments, or the post changed since the person was asked. Nothing was done. Call the tool again without `confirmation` to get a fresh question, and ask the person again.';

const CONFIRMATION_UNAVAILABLE =
  'Could not check the confirmation right now; nothing was done or spent. Tell the person it did not work and to try again in a minute.';

/** The tool's arguments without the code, as the binding and the run see them. */
const withoutConfirmation = (input: unknown) => {
  if (!input || typeof input !== 'object' || !(MCP_CONFIRMATION_FIELD in input)) {
    return { args: input, code: undefined as string | undefined };
  }
  const { [MCP_CONFIRMATION_FIELD]: code, ...args } = input as Record<string, unknown>;
  return { args, code: typeof code === 'string' && code ? code : undefined };
};

/**
 * MCP gets the extra `confirmation` argument on the tools that may ask
 * (`mcpConfirm: 'ask'`); the web chat's schema is the declaration's, untouched.
 */
const inputSchemaFor = (capability: CapabilityDeclaration, entrance: CapabilityEntrance) =>
  entrance === 'mcp' && capability.mcpConfirm === 'ask'
    ? capability.input.extend({ [MCP_CONFIRMATION_FIELD]: mcpConfirmationInput })
    : capability.input;

type ToolContextLike = {
  requestContext?: any;
  abortSignal?: AbortSignal;
  writer?: { custom: (chunk: any) => Promise<void> };
  agent?: {
    resumeData?: unknown;
    suspendPayload?: unknown;
    suspend?: (payload: unknown) => Promise<unknown>;
  };
};

export const buildCapabilityTool = (
  capability: CapabilityDeclaration,
  options: CapabilityToolOptions
) => {
  const name = toolNameOf(capability.id);
  if (options.entrance === 'mcp' && !options.gate) {
    throw new Error(`MCP tool ${name} needs a policy gate.`);
  }

  const execute = async (
    input: any,
    context: ToolContextLike
  ): Promise<CapabilityToolOutput | undefined> => {
    // A «Да» asked in the conversation (`kcxz.49`): MCP only, and only on
    // the tools that declare it. A `request` tool runs on the person's own
    // words over MCP (`kcxz.52`): no card, no code.
    const asksByCode = options.entrance === 'mcp' && capability.mcpConfirm === 'ask';
    const noCard = options.entrance === 'mcp' && capability.mcpConfirm !== undefined;
    let code: string | undefined;
    if (asksByCode) ({ args: input, code } = withoutConfirmation(input));
    if (options.entrance === 'mcp') {
      // The chat door redacts keys from everything a person sends before the
      // model or Mastra holds it; an MCP client's arguments reach the
      // services and the generation models the same way, so their free text
      // is redacted here, before admission reads it (review W3-20 F12).
      input = redactSecretLeaves(input);
      const refused = await admitCapabilityCall(
        capability,
        input,
        context?.requestContext,
        options.gate!,
        { countPaid: false, confirmsByCode: noCard }
      );
      if (refused) return refused;
    }
    const identity = readCapabilityIdentity(context?.requestContext);
    if (!identity) {
      return refusal(
        'IDENTITY_MISSING',
        'The call arrived without a server-built identity; nothing was done.'
      );
    }

    // The code is bound to the person, the workspace, these arguments and —
    // for a post — its text as stored when the question was asked.
    // The text is read once per question and bound to its code.
    const scope = async (content?: string | null): Promise<ConfirmationScope> => ({
      organizationId: identity.organizationId,
      userId: identity.userId,
      toolName: name,
      args: input,
      content:
        content !== undefined
          ? content
          : await approvalContentDigest([capability], options.services, identity, name, input),
    });
    const confirmations = () => options.services(McpConfirmationService);
    const askPerson = async (question: string, content?: string | null): Promise<CapabilityToolOutput> => {
      let issued: string;
      try {
        issued = await confirmations().issue(await scope(content));
      } catch {
        return refusal('CONFIRMATION_UNAVAILABLE', CONFIRMATION_UNAVAILABLE);
      }
      return {
        ok: true,
        capability: capability.id,
        summary: {
          done: false,
          needsConfirmation: true,
          // Channel names and the post's words are in it: data, never orders
          // (premortem A4) — the web card showed it to the person only.
          question: wrapUntrusted(question, ['workspace-text']),
          confirmation: issued,
          next: CONFIRMATION_NEXT,
        },
      };
    };
    let confirmed = false;
    if (asksByCode && code) {
      try {
        confirmed = await confirmations().redeem(code, await scope());
      } catch {
        return refusal('CONFIRMATION_UNAVAILABLE', CONFIRMATION_UNAVAILABLE);
      }
      if (!confirmed) return refusal('CONFIRMATION_INVALID', CONFIRMATION_INVALID);
    }
    // A confirm call asks before anything runs: the card's own line.
    // A refusal of the arguments (a zone not named over MCP) is the tool's
    // answer, as it would be from the run.
    if (asksByCode && capability.risk === 'confirm' && !confirmed) {
      let line: string | undefined;
      try {
        line = await capability.describeApproval?.(
          { ...identity, entrance: 'mcp', service: options.services },
          input
        );
      } catch (error) {
        return codedRefusal(error) ?? refusal('CAPABILITY_FAILED', UNKNOWN_FAILURE);
      }
      // The line first: it refuses arguments (the zone) before anything is
      // read. The text is read right after it; an edit in that moment binds
      // the new text, as the web card's own two reads do.
      const content = await approvalContentDigest([capability], options.services, identity, name, input);
      return askPerson(cleanApprovalSummary(line) ?? capability.label[identity.language], content);
    }

    const emit = async (part: CapabilityPart) => {
      await context?.writer?.custom({
        type: `data-${part.kind}`,
        data: part.data,
        ...(part.transient ? { transient: true } : {}),
      });
    };
    const suspend = context?.agent?.suspend;
    const runContext: CapabilityRunContext = {
      ...identity,
      entrance: options.entrance,
      service: options.services,
      abortSignal: context?.abortSignal,
      resumeData: context?.agent?.resumeData,
      suspendPayload: context?.agent?.suspendPayload,
      ...(suspend
        ? { suspend: async (payload: unknown) => void (await suspend(payload)) }
        : {}),
      ...(confirmed ? { confirmed: true } : {}),
    };
    const invoke = () => capability.run(runContext, input, emit);

    let output: unknown;
    try {
      output =
        capability.risk === 'paid'
          ? await runPaidCapability(invoke)
          : await invoke();
    } catch (error) {
      // The run stopped before anything was spent for a «Да» only the person
      // gives (the autopilot consent over MCP).
      if (asksByCode && !confirmed && isConfirmationNeeded(error)) {
        return askPerson(error.question);
      }
      const refused = codedRefusal(error);
      if (refused) {
        // A paid run refused before it spent anything (`unspentFailure`)
        // gives the turn's slot back, as a run that answers `spentNothing`
        // does (review W4-23 F2).
        if (
          options.entrance === 'chat' &&
          capability.risk === 'paid' &&
          context?.requestContext &&
          failedUnspent(error)
        ) {
          releasePaidSlot(context.requestContext);
        }
        return refused;
      }
      throw error;
    }
    // Suspended for the person's answer: Mastra resumes the same call.
    if (output === undefined) return undefined;
    // A paid run that spent nothing gives the turn's slot back; only the
    // chat's hooks took one (MCP admits with `countPaid: false`).
    if (
      options.entrance === 'chat' &&
      capability.risk === 'paid' &&
      context?.requestContext &&
      capability.spentNothing?.(output)
    ) {
      releasePaidSlot(context.requestContext);
    }

    const card = capability.cardOf?.(output) ?? null;
    if (card) await emit({ kind: card.kind, data: card });
    return {
      ok: true,
      capability: capability.id,
      summary: modelSummary(capability.summarize(output), capability.untrusted),
      ...(card ? { card: { kind: card.kind, id: card.id } } : {}),
    };
  };

  return createTool({
    id: name,
    title: capability.label[options.language],
    description: capability.description,
    inputSchema: inputSchemaFor(capability, options.entrance),
    requestContextSchema: capabilityContextSchema,
    // Over MCP a `confirm` tool asks in the conversation instead (`kcxz.49`).
    ...(options.entrance === 'chat' && capability.risk === 'confirm' ? { requireApproval: true } : {}),
    // kcxz.45: in the web chat a lead action always asks (a lead's title is
    // outside text); over MCP the client's own tool approval stays.
    ...(options.entrance === 'chat' && capability.asksInWebChat ? { requireApproval: true } : {}),
    // MCP has no question card: a capability that can decide for the person
    // runs on without asking there (`ctx.suspend` absent).
    ...(options.entrance === 'chat' &&
    capability.suspendSchema &&
    capability.resumeSchema
      ? {
          suspendSchema: capability.suspendSchema,
          resumeSchema: capability.resumeSchema,
        }
      : {}),
    mcp: {
      annotations: {
        title: capability.label[options.language],
        ...MCP_ANNOTATIONS[capability.risk],
        // A tool that may send a post out by itself: the host's own approval
        // of the tool stays the person's check (kcxz.49, kcxz.52).
        ...(options.entrance === 'mcp' && capability.mcpConfirm ? { destructiveHint: true } : {}),
      },
    },
    // The model reads the short answer; the long text is on the card by id.
    toModelOutput: (raw: CapabilityToolOutput | undefined) => {
      if (!raw) return { type: 'json', value: null };
      const output = withoutEchoedInput(raw) as CapabilityToolOutput;
      if (output.ok === false) {
        const refused = output as CapabilityRefusal;
        return {
          type: 'json',
          value: { ok: false, code: refused.code, reason: refused.reason },
        };
      }
      return {
        type: 'json',
        value: JSON.parse(
          JSON.stringify({
            ok: true,
            summary: output.summary,
            ...(output.card ? { card: output.card } : {}),
          })
        ),
      };
    },
    transform: {
      display: TOOL_PAYLOAD_TRANSFORM,
      transcript: TOOL_PAYLOAD_TRANSFORM,
    },
    execute: execute as any,
  });
};

export type CapabilityTools = Record<
  string,
  ReturnType<typeof buildCapabilityTool>
>;

/** Every capability of the web chat, keyed by its tool name. */
export const buildMastraCapabilityTools = (
  capabilities: readonly CapabilityDeclaration[],
  options: Omit<CapabilityToolOptions, 'entrance'>
): CapabilityTools =>
  Object.fromEntries(
    capabilities.map((capability) => [
      toolNameOf(capability.id),
      buildCapabilityTool(capability, { ...options, entrance: 'chat' }),
    ])
  );

/**
 * `activeTools` for one role: the model is offered only what the role may
 * use. Plan limits and the rest are checked per call.
 */
export const activeCapabilityToolNames = (
  capabilities: readonly CapabilityDeclaration[],
  role: OrganizationRole
): string[] =>
  capabilities
    .filter((capability) => roleMayUse(capability, role))
    .map((capability) => toolNameOf(capability.id));
