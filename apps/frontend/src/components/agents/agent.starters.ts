import {
  isOrganizationAdmin,
  isOrganizationEditor,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
import type { OnboardingStepKey } from '@contentfactory/frontend/components/onboarding/onboarding.adapter';

/**
 * Which starters a role can run (`kcxz.31`, D14). A starter is a sentence the
 * chat sends for the person; one the role cannot run only earns a refusal
 * («недоступно для вашей роли»), so it is not offered.
 *
 * The same role functions the doors behind them use: connecting a channel is
 * `Sections.ADMIN` (`integrations.controller.ts`), writing an avatar, a piece
 * or an adaptation is `Sections.EDITOR`, and reading the plan is anyone's.
 */
export const starterAllowed = (
  step: OnboardingStepKey,
  role: string | null | undefined
): boolean => {
  switch (step) {
    case 'plan':
      return true;
    case 'channel':
      return isOrganizationAdmin(role);
    default:
      return isOrganizationEditor(role);
  }
};
