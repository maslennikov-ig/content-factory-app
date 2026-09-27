import { z } from 'zod';
import { BrandVoiceController } from '@contentfactory/backend/api/routes/brand-voice.controller';
import { VoiceService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { defineCapability, door } from '../capability.types';

/**
 * Switching an avatar on needs the person's own consent (spec §5.2, the
 * `input` class). The model can ask for it; it can never give it: consent is
 * not a field of the model's input, only of the person's answer on the card.
 * There is no «Решите за меня» here, because the product cannot decide this
 * for the person.
 */

const activationQuestion = z.object({
  question: z.string(),
  avatarId: z.string().nullable(),
  mode: z.enum(['assist', 'manual']),
  /** Consent is the person's; the card offers no «Решите за меня». */
  canDecideForPerson: z.literal(false),
});

const activationAnswer = z.object({
  consentGiven: z.boolean(),
  avatarName: z.string().trim().max(120).optional(),
});

const QUESTION = {
  ru: 'Включить этот аватар? Подтвердите, что у вас есть право писать этим голосом, и дайте аватару имя.',
  en: 'Switch this avatar on? Confirm that you have the right to write in this voice, and give the avatar a name.',
};

type Activation = {
  avatarId: string | null;
  activated: boolean;
  /** The name given on the card, for the avatar's line (kcxz.29, D12). */
  name?: string | null;
};

export const avatarActivate = defineCapability({
  id: 'avatar.activate',
  group: 'avatar',
  label: { ru: 'Включить аватар', en: 'Switch an avatar on' },
  description:
    'Switch on the proposed avatar (voice) after its analysis or after its lines were filled by hand. First checks the avatar is ready: if it is not, it refuses with the reason (for example lines still empty) and asks nothing — tell the person what to finish. When ready, shows the person a consent card and waits for their answer; the avatar is switched on only if they consent.',
  input: z.object({
    avatarId: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe('Avatar id; absent means the workspace default'),
    mode: z
      .enum(['assist', 'manual'])
      .optional()
      .describe('assist — the analysed proposal; manual — the lines filled by hand'),
  }),
  risk: 'input',
  card: 'avatar',
  door: door(BrandVoiceController, 'activateProposal'),
  untrusted: [],
  suspendSchema: activationQuestion,
  resumeSchema: activationAnswer,
  run: async (ctx, input): Promise<Activation | undefined> => {
    const answer = activationAnswer.safeParse(ctx.resumeData);
    if (!answer.success) {
      if (!ctx.suspend) {
        throw Object.assign(new Error('Only the person can answer this.'), {
          code: 'INPUT_NEEDS_PERSON',
        });
      }
      // Ready first, consent second (kcxz.29, D7): a person is not asked to
      // consent and name an avatar that the activation then refuses. The
      // refusal keeps its code and the service's reason, like the door's.
      const blocker = await ctx.service(VoiceService).activationBlocker(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          canManage: isOrganizationEditor(ctx.role),
          ...(input.avatarId ? { avatarId: input.avatarId } : {}),
        },
        input.mode ?? 'assist'
      );
      if (blocker) throw blocker;
      await ctx.suspend({
        question: QUESTION[ctx.language],
        avatarId: input.avatarId ?? null,
        mode: input.mode ?? 'assist',
        canDecideForPerson: false,
      });
      return undefined;
    }
    if (!answer.data.consentGiven) {
      return { avatarId: input.avatarId ?? null, activated: false };
    }
    await ctx.service(VoiceService).activateProposal(
      {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        // The same predicate the door's `canManageVoice` reads.
        canManage: isOrganizationEditor(ctx.role),
        ...(input.avatarId ? { avatarId: input.avatarId } : {}),
      },
      {
        version: 2,
        consentGiven: true,
        avatarName: answer.data.avatarName,
        mode: input.mode,
      }
    );
    return {
      avatarId: input.avatarId ?? null,
      activated: true,
      name: answer.data.avatarName?.trim() || null,
    };
  },
  summarize: (output) => ({
    avatarId: output.avatarId,
    activated: output.activated,
  }),
  cardOf: (output) =>
    output.activated && output.avatarId
      ? {
          kind: 'avatar',
          id: output.avatarId,
          ...(output.name ? { name: output.name } : {}),
        }
      : null,
});
