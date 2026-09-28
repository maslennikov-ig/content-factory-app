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
import { runPaidCapability } from './paid-adapter';
import { questionCardView } from './question-card';
import { modelSummary } from './untrusted-data';
import { redactSecretLeaves } from '../conductor/secret-shapes';

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

const withoutEchoedInput = (output: unknown) =>
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
        { countPaid: false }
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
    };
    const invoke = () => capability.run(runContext, input, emit);

    let output: unknown;
    try {
      output =
        capability.risk === 'paid'
          ? await runPaidCapability(invoke)
          : await invoke();
    } catch (error) {
      const refused = codedRefusal(error);
      if (refused) return refused;
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
    inputSchema: capability.input,
    requestContextSchema: capabilityContextSchema,
    ...(capability.risk === 'confirm' ? { requireApproval: true } : {}),
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
