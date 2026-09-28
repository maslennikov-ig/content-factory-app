import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import {
  createCapabilityHooks,
  stopAfterOpenProposalRefusal,
  type CapabilityGate,
} from '../capabilities/capability.admission';
import { readCapabilityIdentity } from '../capabilities/capability.context';
import {
  assertCapabilityRegistry,
  CAPABILITY_CATALOGUE,
} from '../capabilities/capability.registry';
import type {
  CapabilityDeclaration,
  CapabilityIdentity,
} from '../capabilities/capability.types';
import {
  activeCapabilityToolNames,
  buildMastraCapabilityTools,
  type CapabilityServices,
  type CapabilityTools,
} from '../capabilities/mastra.adapter';
import { readWorkspaceSnapshot } from '../capabilities/catalogue/overview.capabilities';
import {
  CONDUCTOR_AGENT_ID,
  CONDUCTOR_MAX_RETRIES,
  CONDUCTOR_MAX_STEPS,
  conductorContextSchema,
} from './conductor.context';
import { conductorInstructions } from './conductor.instructions';
import { lastStepSpeaks } from './conductor.steps';
import { CONDUCTOR_SKILLS } from './conductor.skills';
import {
  conductorInputProcessors,
  conductorOutputProcessors,
} from './conductor.secrets';

/**
 * The conductor (`content-factory-next-kcxz.7`, spec §4.6, ADR-0012 amendment
 * §3–§6): one Mastra agent, native all the way down.
 *
 * - tools: the capability registry's own Mastra tools, filtered by the
 *   caller's role per request (the model is offered only what the role may
 *   use), labelled in the caller's interface language;
 * - per-call checks: `createCapabilityHooks` — the CASL re-check, the paid
 *   cap, an approval bound to `toolName + args`; the web agent never runs
 *   without them (`tests/agent-conductor.guard.test.cjs`);
 * - identity and memory keys: a server-built `RequestContext`, validated by
 *   `requestContextSchema` before the model is reached;
 * - the workspace snapshot at the start of every turn, inside the instruction
 *   and wrapped as data;
 * - group know-how as skills; secrets redacted by processors both ways;
 * - caps: 7 steps, the last one text-only (`lastStepSpeaks`, W3 walk P2-B),
 *   `maxRetries: 0`; paid 1 (hard 2) is the hooks' job; a step refused only
 *   for an open card of proposed changes ends the turn.
 *
 * It holds no Nest dependency: `MastraService` passes the service resolver,
 * the policy gate and the model, so a test can build the same agent with a
 * scripted model and fakes.
 */

export type ConductorDependencies = {
  services: CapabilityServices;
  gate: CapabilityGate;
  /**
   * The model for this turn, already inside the turn's `agent` admission.
   * Production: `AiUsageService.prepareModelExecution(org, 'agent', …)` over
   * the chat model of role `agent`.
   */
  model: (identity: CapabilityIdentity) => Promise<unknown>;
  memory?: MastraMemory;
  capabilities?: readonly CapabilityDeclaration[];
  /** Replaced in tests; production reads the `workspace.snapshot` capability. */
  snapshot?: (identity: CapabilityIdentity) => Promise<unknown>;
  now?: () => Date;
};

const IDENTITY_REQUIRED =
  'The conductor ran without a server-built identity; nothing was done.';

export const buildConductorAgent = (deps: ConductorDependencies) => {
  const capabilities = assertCapabilityRegistry(
    deps.capabilities ?? CAPABILITY_CATALOGUE
  );
  const now = deps.now ?? (() => new Date());

  // One tool set per interface language; the role filter picks from it.
  const toolsByLanguage = new Map<'ru' | 'en', CapabilityTools>();
  const toolsFor = (identity: CapabilityIdentity): CapabilityTools => {
    let tools = toolsByLanguage.get(identity.language);
    if (!tools) {
      tools = buildMastraCapabilityTools(capabilities, {
        services: deps.services,
        language: identity.language,
      });
      toolsByLanguage.set(identity.language, tools);
    }
    const allowed = new Set(
      activeCapabilityToolNames(capabilities, identity.role)
    );
    return Object.fromEntries(
      Object.entries(tools).filter(([name]) => allowed.has(name))
    );
  };

  const readSnapshot =
    deps.snapshot ??
    ((identity: CapabilityIdentity) =>
      readWorkspaceSnapshot({ ...identity, service: deps.services }));

  // Read once per request: the instruction may be resolved more than once in
  // a turn, the workspace is read at its start.
  const snapshots = new WeakMap<object, Promise<unknown | null>>();
  const snapshotOf = (context: object, identity: CapabilityIdentity) => {
    let pending = snapshots.get(context);
    if (!pending) {
      pending = readSnapshot(identity).catch(() => null);
      snapshots.set(context, pending);
    }
    return pending;
  };

  return new Agent({
    id: CONDUCTOR_AGENT_ID,
    name: 'Content Factory',
    description:
      'The Content Factory assistant: does what the screens do, from one chat.',
    requestContextSchema: conductorContextSchema as any,
    instructions: async ({ requestContext }) => {
      const identity = readCapabilityIdentity(requestContext as any);
      if (!identity) throw new Error(IDENTITY_REQUIRED);
      return conductorInstructions({
        language: identity.language,
        role: identity.role,
        now: now(),
        timeZone: identity.timeZone,
        snapshot: await snapshotOf(requestContext as object, identity),
      });
    },
    model: async ({ requestContext }) => {
      const identity = readCapabilityIdentity(requestContext as any);
      if (!identity) throw new Error(IDENTITY_REQUIRED);
      return (await deps.model(identity)) as any;
    },
    tools: ({ requestContext }) => {
      const identity = readCapabilityIdentity(requestContext as any);
      return identity ? toolsFor(identity) : {};
    },
    hooks: createCapabilityHooks(capabilities, deps.gate, deps.services),
    skills: CONDUCTOR_SKILLS,
    ...(deps.memory ? { memory: deps.memory } : {}),
    maxRetries: CONDUCTOR_MAX_RETRIES,
    // Mastra adds `stepCountIs(maxSteps)` to these conditions; a request's own
    // `maxSteps` keeps the stop after an open-card refusal (kcxz.38, R5). The
    // door passes `prepareStep` for its own `maxSteps`; this one is for a
    // caller that keeps the ordinary cap.
    defaultOptions: {
      maxSteps: CONDUCTOR_MAX_STEPS,
      stopWhen: stopAfterOpenProposalRefusal as any,
      prepareStep: lastStepSpeaks(CONDUCTOR_MAX_STEPS) as any,
    },
    inputProcessors: conductorInputProcessors(),
    outputProcessors: conductorOutputProcessors(),
  });
};

export type ConductorAgent = ReturnType<typeof buildConductorAgent>;
