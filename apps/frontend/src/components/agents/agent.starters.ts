import {
  ONBOARDING_STEP_KEYS,
  isOnboardingStepKey,
  stepAllowed,
  stepOffered,
  type OnboardingStepKey,
} from '@contentfactory/frontend/components/onboarding/onboarding.adapter';
import type { OnboardingStepCounts } from '@contentfactory/nestjs-libraries/database/prisma/onboarding/onboarding.steps';

/**
 * What an empty conversation offers (spec §6.1, `kcxz.21`): the five steps of
 * «С чего начать» that are still open, in menu order, and — once there is
 * nothing to set up — the everyday two. `week` is the everyday read «что у
 * нас в плане на неделю»; `plan` is the fifth step, a post into the plan.
 */
export type AgentStarter = OnboardingStepKey | 'week';

/**
 * Which starters a role can run (`kcxz.31`, D14). A starter is a sentence the
 * chat sends for the person; one the role cannot run only earns a refusal
 * («недоступно для вашей роли»), so it is not offered.
 *
 * The same role functions the doors behind them use: connecting a channel is
 * `Sections.ADMIN` (`integrations.controller.ts`), writing an avatar, a piece,
 * an adaptation or a reserve is `Sections.EDITOR`, and reading the plan is
 * anyone's.
 */
export const starterAllowed = (
  step: AgentStarter,
  role: string | null | undefined
): boolean => step === 'week' || stepAllowed(step, role);

/**
 * The starters of an empty thread, chosen from the workspace's progress (the
 * same answer and the same rules as «С чего начать» and the agent's snapshot,
 * `stepOffered`): the open steps the role can run, in menu order, the first
 * one leading — without an adaptation or a reserve while no channel is
 * connected (review W3-21 P3-3). With none offered, the everyday ones.
 */
export const startersFor = (
  progress: OnboardingStepCounts,
  role: string | null | undefined
): AgentStarter[] => {
  const open = ONBOARDING_STEP_KEYS.filter((step) =>
    stepOffered(step, progress, role)
  );
  if (open.length) return open;
  return (['piece', 'week'] as const).filter((step) =>
    starterAllowed(step, role)
  );
};

/**
 * «Сделать в чате» from «С чего начать»: `/agents/new?start=<step>` opens a new
 * conversation with the step's starter written into the composer; the person
 * sends it (owner decision on review W3-21 P2-2 — a link never sends a
 * message by itself). `AgentScreen` reads the parameter once and drops it
 * from the address.
 */
export const AGENT_START_PARAM = 'start';

export const agentStartHref = (step: OnboardingStepKey): string =>
  `/agents/new?${AGENT_START_PARAM}=${encodeURIComponent(step)}`;

/**
 * Whether a `?start=` value may fill the composer: a known step, on a new
 * conversation, that this role may run and that is still offered by the
 * workspace's progress. Anything else is ignored — a crafted or stale link
 * leaves an empty composer.
 */
export const startDraftStep = (
  value: string | null | undefined,
  {
    newThread,
    role,
    progress,
  }: {
    newThread: boolean;
    role: string | null | undefined;
    progress: OnboardingStepCounts;
  }
): OnboardingStepKey | null =>
  newThread && isOnboardingStepKey(value) && stepOffered(value, progress, role)
    ? value
    : null;
