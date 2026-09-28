import { z } from 'zod';
import { BrandVoiceController } from '@contentfactory/backend/api/routes/brand-voice.controller';
import { IntegrationsController } from '@contentfactory/backend/api/routes/integrations.controller';
import {
  VoiceService,
  type VoiceActor,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service';
import { PROFILE_FIELDS_V2 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/assist.contract';
import { VOICE_SAMPLE_PASTE_LIMITS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  resumeStepFor,
  type ResumeStep,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/analysis-resume';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  defineCapability,
  door,
  isProductErrorCode,
  type ApprovalDescribeContext,
  type CapabilityEmit,
  type CapabilityRunContext,
} from '../capability.types';
import { AGENT_MESSAGE_MAX_CHARS } from '../../conductor/agent-chat.request';
import { rememberOnChannel } from './adaptation.capabilities';
import { codedFailure } from './selection';

/**
 * Avatars from the chat (spec §5.2 «Аватар», `content-factory-next-kcxz.18`).
 *
 * Every capability calls the `VoiceService` method its `BrandVoiceController`
 * door calls, with the actor the door builds (`canManage` from the role, the
 * avatar from `?avatar=`), so the chat and the avatar screen cannot disagree
 * about who may do what. Binding an avatar to a channel goes through the
 * channel card's own door, as the screen does it.
 *
 * Files never reach the model: the chat's composer uploads a file or a
 * Telegram `result.json` straight to `POST …/samples/files` and the message
 * carries only the receipt (`AGENT_SAMPLES_PART_TYPE`). Pasted texts come
 * through `avatar.samples.add`, as the screen's paste box sends them.
 *
 * Summaries carry ids, counts, codes and the short lines of a voice; the
 * texts of the samples never come back to the model.
 */

/**
 * An avatar id as the model passes it. Ids are Prisma `uuid()`s; the shape is
 * checked in `actorOf`, not by the schema, so a malformed id is refused with
 * the service's own `VOICE_AVATAR_NOT_FOUND` rather than a bare validation
 * failure or a Prisma error (review W3-18 F10).
 */
const avatarId = z
  .string()
  .min(1)
  .max(128)
  .describe('Avatar id (a UUID) from avatar.list or the snapshot');
const avatarScope = {
  avatarId: avatarId
    .optional()
    .describe('Avatar id (a UUID) from avatar.list or the snapshot; absent means the workspace default avatar'),
};

const AVATAR_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const avatarMissing = (id?: string) =>
  codedFailure(
    'VOICE_AVATAR_NOT_FOUND',
    id
      ? `There is no avatar ${id.slice(0, 64)} in this workspace; nothing was done.`
      : 'This workspace has no default avatar; nothing was done. Name the avatar (avatar.list).'
  );

/** A model-supplied avatar id: its shape, or the service's not-found refusal. */
const checkedAvatarId = (avatar?: string) => {
  if (avatar !== undefined && !AVATAR_ID_SHAPE.test(avatar)) throw avatarMissing(avatar);
  return avatar;
};

/** The actor the door builds (`BrandVoiceController.actor`). */
const actorOf = (
  ctx: Pick<CapabilityRunContext, 'organizationId' | 'userId' | 'role'>,
  avatar?: string
): VoiceActor => ({
  organizationId: ctx.organizationId,
  userId: ctx.userId,
  // The same predicate the door's `canManageVoice` reads.
  canManage: isOrganizationEditor(ctx.role),
  ...(checkedAvatarId(avatar) ? { avatarId: avatar } : {}),
});

type AvatarRow = {
  id: string;
  name: string | null;
  kind?: string;
  isDefault: boolean;
  analysed: boolean;
  sampleCount?: number;
};
type AvatarList = {
  avatars: AvatarRow[];
  defaultAvatarId: string | null;
  limit?: number;
  canManage?: boolean;
};

type ServiceContext = Pick<
  CapabilityRunContext,
  'organizationId' | 'userId' | 'role' | 'service'
>;

const readAvatars = async (ctx: ServiceContext): Promise<AvatarList> =>
  (await ctx.service(VoiceService).avatars(actorOf(ctx))) as unknown as AvatarList;

/** The avatar a call is about: the one named, else the flagged default. */
const avatarAbout = async (
  ctx: ServiceContext,
  avatar?: string
): Promise<AvatarRow | null> => {
  if (avatar !== undefined && !AVATAR_ID_SHAPE.test(avatar)) return null;
  return (
    (await readAvatars(ctx)).avatars.find((one) =>
      avatar ? one.id === avatar : one.isDefault
    ) ?? null
  );
};

/**
 * The avatar a call acts on, resolved to its id now: the one named (refused
 * when it is not in this workspace), else the flagged default (refused when
 * there is none). Confirm-class calls act on this id, and their approval is
 * bound to it (`approvalContent`), so a default changed between the card and
 * «Да» shows the card again instead of acting on another avatar (review
 * W3-18 F1).
 */
const avatarActedOn = async (ctx: ServiceContext, avatar?: string): Promise<AvatarRow> => {
  const found = await avatarAbout(ctx, avatar);
  if (!found) throw avatarMissing(avatar);
  return found;
};

/** What a confirm call's «Да» is bound to: the avatar it resolves to now. */
const boundAvatar = async (ctx: ServiceContext, input: { avatarId?: string }) => ({
  avatarId: (await avatarAbout(ctx, input.avatarId).catch(() => null))?.id ?? null,
});

/** The approval line for an avatar that is not there to act on. */
const noAvatarLine = (avatar: string | undefined, ru: boolean) =>
  avatar
    ? ru
      ? `Аватара ${avatar.slice(0, 64)} в этом пространстве нет — ничего не изменится`
      : `There is no avatar ${avatar.slice(0, 64)} in this workspace — nothing will change`
    : ru
      ? 'В пространстве нет аватара по умолчанию — ничего не изменится'
      : 'This workspace has no default avatar — nothing will change';

/**
 * Whether an avatar id names an avatar of the caller's workspace — the check
 * the chat door makes on a samples receipt before the model reads it (review
 * W3-18 F3).
 */
export const avatarInWorkspace = async (
  services: ServiceContext['service'],
  identity: Omit<ServiceContext, 'service'>,
  avatar: string
): Promise<boolean> => !!(await avatarAbout({ ...identity, service: services }, avatar));

/** The persisted avatar card: the panel opens the avatar's own screen by id. */
const avatarCard = (output: { avatarId: string | null; name?: string | null }) =>
  output.avatarId
    ? {
        kind: 'avatar' as const,
        id: output.avatarId,
        ...(output.name ? { name: output.name } : {}),
      }
    : null;

/** An avatar named for the person on an approval card. */
const avatarWords = (avatar: AvatarRow | null, ru: boolean) => {
  const name = avatar?.name?.trim();
  return name ? (ru ? `«${name}»` : `“${name}”`) : ru ? 'без имени' : 'without a name';
};

type ReadinessLine = {
  ready: boolean;
  sampleCount: number;
  charCount: number;
  missingChars: number;
  missingSamples: number;
};
const readinessLine = (value: unknown): ReadinessLine => {
  const r = (value ?? {}) as Record<string, unknown>;
  const count = (key: string) =>
    typeof r[key] === 'number' && Number.isFinite(r[key]) ? (r[key] as number) : 0;
  return {
    ready: r.ready === true,
    sampleCount: count('sampleCount'),
    charCount: count('charCount'),
    missingChars: count('missingChars'),
    missingSamples: count('missingSamples'),
  };
};

type FieldLine = { key: string; text: string; status: string };
const fieldLines = (proposal: unknown): FieldLine[] => {
  const fields = (proposal as { fields?: unknown })?.fields;
  return (Array.isArray(fields) ? fields : []).map((field) => ({
    key: String(field?.key ?? ''),
    text: typeof field?.text === 'string' ? field.text : '',
    status: String(field?.status ?? ''),
  }));
};

/* ---- Reading ------------------------------------------------------------- */

export const avatarList = defineCapability({
  id: 'avatar.list',
  group: 'avatar',
  label: { ru: 'Аватары', en: 'Avatars' },
  description:
    'List the avatars (voices) of the workspace: id, name, person or brand, whether it is the default, whether it writes (analysed and switched on) and how many texts its analysis read; also the limit and whether this person may change avatars. Free.',
  input: z.object({}),
  risk: 'read',
  door: door(BrandVoiceController, 'avatars'),
  // Names are typed by whoever created the avatar.
  untrusted: ['workspace-text'],
  run: async (ctx) => {
    const list = await readAvatars(ctx);
    return {
      avatars: list.avatars.map((one) => ({
        id: one.id,
        name: one.name,
        kind: one.kind === 'BRAND' ? 'brand' : 'person',
        isDefault: one.isDefault,
        writes: one.analysed,
        ...(typeof one.sampleCount === 'number' ? { sampleCount: one.sampleCount } : {}),
      })),
      defaultAvatarId: list.defaultAvatarId,
      limit: list.limit ?? null,
      canManage: list.canManage ?? isOrganizationEditor(ctx.role),
    };
  },
  summarize: (output) => ({ ...output }),
});

type AvatarStanding = {
  avatarId: string | null;
  hasVoice: boolean;
  samples: ReadinessLine;
  /** Where to go on (`2q28.34`, the screen's own rule). */
  resumeAt: ResumeStep;
  measuredAt: string | null;
  canManage: boolean;
};

export const avatarOverview = defineCapability({
  id: 'avatar.overview',
  group: 'avatar',
  label: { ru: 'Где аватар сейчас', en: 'Where the avatar stands' },
  description:
    'Read where an avatar stands, free: whether it has a voice in force, the samples collected (count, characters, whether enough for an analysis and what is missing), and `resumeAt` — where to go on: `samples` (add texts, or run the analysis if `samples.ready`; the analysis is paid), `waiting` (an analysis is still finishing on the server — do not run it again, look again in a few minutes), `analysis` (numbers are stored but the proposal did not arrive — running it again is paid, about five minutes: ask the person), `proposal` (a proposal is ready — read it with avatar.proposal; nothing to pay).',
  input: z.object(avatarScope),
  risk: 'read',
  door: door(BrandVoiceController, 'overview'),
  untrusted: [],
  run: async (ctx, input): Promise<AvatarStanding> => {
    const voice = ctx.service(VoiceService);
    const actor = actorOf(ctx, input.avatarId);
    // The two reads the avatar screen opens with: the overview and, for a
    // person who comes back, the stored run (`GET …/analysis`, `2q28.34`).
    const [overview, analysis] = await Promise.all([
      voice.overview(actor),
      voice.analysis(actor),
    ]);
    const standing = analysis as { measuredAt?: string };
    return {
      avatarId: input.avatarId ?? null,
      hasVoice: overview.hasVoice === true,
      samples: readinessLine(overview.readiness),
      resumeAt: resumeStepFor(analysis, Date.now()),
      measuredAt: typeof standing.measuredAt === 'string' ? standing.measuredAt : null,
      canManage: actor.canManage,
    };
  },
  summarize: (output) => ({ ...output }),
});

type ProposalRead = {
  avatarId: string | null;
  name: string | null;
  mode: 'assist' | 'manual';
  outcome: 'ready' | 'insufficient';
  fields: FieldLine[];
  /** Filled lines of the hand-written draft, or accepted ones of a proposal. */
  done: number;
  portrait: boolean;
  grounds: number;
  activated: boolean;
  samples?: ReadinessLine;
};

const readProposal = async (
  ctx: ServiceContext,
  input: { avatarId?: string },
  mode: 'assist' | 'manual'
): Promise<ProposalRead> => {
  const voice = ctx.service(VoiceService);
  const actor = actorOf(ctx, input.avatarId);
  const [proposal, avatar] = await Promise.all([
    mode === 'manual' ? voice.manualProposal(actor) : voice.proposal(actor),
    avatarAbout(ctx, input.avatarId),
  ]);
  const base = {
    avatarId: avatar?.id ?? input.avatarId ?? null,
    name: avatar?.name ?? null,
    mode,
  };
  if (proposal.outcome !== 'ready') {
    return {
      ...base,
      outcome: 'insufficient',
      fields: [],
      done: 0,
      portrait: false,
      grounds: 0,
      activated: false,
      samples: readinessLine(proposal.readiness),
    };
  }
  const fields = fieldLines(proposal);
  return {
    ...base,
    outcome: 'ready',
    fields,
    done: fields.filter((field) =>
      mode === 'manual' ? field.text.trim() : field.status === 'ACCEPTED' && field.text.trim()
    ).length,
    portrait: Boolean(proposal.portrait?.text),
    grounds: Array.isArray(proposal.observations) ? proposal.observations.length : 0,
    activated: Boolean(proposal.activatedAt),
  };
};

const proposalSummary = (output: ProposalRead) => {
  const { name: _name, ...rest } = output;
  return rest;
};

export const avatarProposal = defineCapability({
  id: 'avatar.proposal',
  group: 'avatar',
  label: { ru: 'Предложение голоса', en: 'Voice proposal' },
  description:
    'Read the voice proposal the analysis wrote for an avatar: its lines (`WHO_SPEAKS`, `TONE`, `AUDIENCE`, `SENTENCE_LENGTH`, `NEVER_SAY`, `TOPICS`) with their text and status (`ACCEPTED`, `EDITING`, `UNDECIDED`), whether it has a portrait and how many quotes ground it. Free. The proposal opens beside the chat as a card; do not retype it, name what to look at.',
  input: z.object(avatarScope),
  risk: 'read',
  card: 'avatar',
  door: door(BrandVoiceController, 'proposal'),
  // Lines written from the person's samples and edited by hand.
  untrusted: ['workspace-text'],
  run: async (ctx, input) => readProposal(ctx, input, 'assist'),
  summarize: proposalSummary,
  cardOf: (output) => (output.outcome === 'ready' ? avatarCard(output) : null),
});

export const avatarManual = defineCapability({
  id: 'avatar.manual',
  group: 'avatar',
  label: { ru: 'Строки вручную', en: 'Lines by hand' },
  description:
    'Read the lines of an avatar filled by hand (the path without samples; six: WHO_SPEAKS, TONE, AUDIENCE, SENTENCE_LENGTH, NEVER_SAY, TOPICS): each line with its text, empty when not written yet, and how many are filled. Free.',
  input: z.object(avatarScope),
  risk: 'read',
  card: 'avatar',
  door: door(BrandVoiceController, 'manualProposal'),
  untrusted: ['workspace-text'],
  run: async (ctx, input) => readProposal(ctx, input, 'manual'),
  summarize: proposalSummary,
  cardOf: avatarCard,
});

/** Samples the model is shown at most: codes to name, never their texts. */
const SAMPLES_SHOWN = 30;

export const avatarSamples = defineCapability({
  id: 'avatar.samples',
  group: 'avatar',
  label: { ru: 'Образцы аватара', en: 'Avatar samples' },
  description:
    'List the samples (the person\'s own texts) an avatar is analysed on: code, title, where it came from and its length, plus readiness for the analysis. Free. The texts themselves are not returned. Use the codes to delete samples.',
  input: z.object(avatarScope),
  risk: 'read',
  door: door(BrandVoiceController, 'samples'),
  // Titles are the first words of posts, a Telegram export or a file.
  untrusted: ['workspace-text', 'telegram-export', 'uploaded-file'],
  run: async (ctx, input) => {
    const answer = (await ctx
      .service(VoiceService)
      .samples(actorOf(ctx, input.avatarId))) as {
      samples?: Array<{ code: string; title: string; origin: string; charCount: number }>;
      readiness?: unknown;
    };
    const rows = answer.samples ?? [];
    return {
      avatarId: input.avatarId ?? null,
      total: rows.length,
      samples: rows.slice(0, SAMPLES_SHOWN).map((row) => ({
        code: row.code,
        title: String(row.title ?? '').slice(0, 80),
        origin: row.origin,
        charCount: row.charCount,
      })),
      readiness: readinessLine(answer.readiness),
    };
  },
  summarize: (output) => ({ ...output }),
});

type LearningRead = {
  avatarId: string | null;
  pending: number;
  minPairs: number;
  rules: Array<{ id: string; text: string; pairs: number }>;
  /** How many rules there are when more than are shown. */
  rulesTotal?: number;
  lastRunAt: string | null;
};
/**
 * What the model is shown of the learned rules, at most (review W3-18 F11):
 * the service keeps ten, a column written by hand could hold more.
 */
const RULES_SHOWN = 12;
const RULE_CHARS = 300;

const learningLine = (avatar: string | undefined, answer: unknown): LearningRead => {
  const record = (answer ?? {}) as Record<string, any>;
  const rules = Array.isArray(record.rules) ? record.rules : [];
  return {
    avatarId: avatar ?? null,
    pending: Number(record.pending) || 0,
    minPairs: Number(record.minPairs) || 0,
    rules: rules.slice(0, RULES_SHOWN).map((rule: any) => {
      const text = String(rule?.text ?? '');
      return {
        id: String(rule?.id ?? '').slice(0, 128),
        text: text.length > RULE_CHARS ? `${text.slice(0, RULE_CHARS - 1).trimEnd()}…` : text,
        pairs: Number(rule?.pairs) || 0,
      };
    }),
    ...(rules.length > RULES_SHOWN ? { rulesTotal: rules.length } : {}),
    lastRunAt: typeof record.lastRunAt === 'string' ? record.lastRunAt : null,
  };
};

export const avatarLearning = defineCapability({
  id: 'avatar.learning',
  group: 'avatar',
  label: { ru: 'Чему аватар научился', en: 'What the avatar learned' },
  description:
    'Read what an avatar learned from the person\'s edits of its drafts: the rules with their ids, how many new edits are waiting (`pending`) and how many a learning run needs (`minPairs`). Free.',
  input: z.object(avatarScope),
  risk: 'read',
  door: door(BrandVoiceController, 'learning'),
  // Rules are written by the AI from the person's edits.
  untrusted: ['workspace-text'],
  run: async (ctx, input) =>
    learningLine(
      input.avatarId,
      await ctx.service(VoiceService).learning(actorOf(ctx, input.avatarId))
    ),
  summarize: (output) => ({ ...output }),
});

/* ---- Changing ------------------------------------------------------------ */

export const avatarCreate = defineCapability({
  id: 'avatar.create',
  group: 'avatar',
  label: { ru: 'Создать аватар', en: 'Create an avatar' },
  description:
    'Create a new avatar: `person` — a person\'s own voice (default), `brand` — a company\'s voice. A name is optional and can be given later on the consent card. The first avatar of a workspace becomes its default. Next: samples (a file or a Telegram export attached in the chat, or pasted texts) and the analysis, or the six lines by hand.',
  input: z.object({
    kind: z
      .enum(['person', 'brand'])
      .optional()
      .describe('person — a person\'s own voice (default); brand — a company\'s voice'),
    name: z.string().trim().min(1).max(120).optional().describe('The name the person gave, verbatim'),
  }),
  risk: 'write',
  card: 'avatar',
  door: door(BrandVoiceController, 'createAvatar'),
  untrusted: [],
  run: async (ctx, input) => {
    const after = (await ctx.service(VoiceService).createAvatar(actorOf(ctx), {
      kind: input.kind === 'brand' ? 'BRAND' : 'PERSON',
      ...(input.name ? { name: input.name } : {}),
    })) as unknown as AvatarList & { createdAvatarId?: string };
    // The id the service created, not a diff of two lists another editor
    // could change in between (review W3-18 F11).
    const created = after.createdAvatarId
      ? after.avatars.find((one) => one.id === after.createdAvatarId)
      : undefined;
    if (!created) {
      throw codedFailure('CAPABILITY_FAILED', 'The avatar was not found after it was created.');
    }
    // The name echoed is the one this call wrote, not a stored string.
    return {
      avatarId: created.id,
      name: input.name ?? null,
      kind: input.kind ?? 'person',
      isDefault: created.isDefault,
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

export const avatarRename = defineCapability({
  id: 'avatar.rename',
  group: 'avatar',
  label: { ru: 'Переименовать аватар', en: 'Rename an avatar' },
  description: 'Rename an avatar. Reversible.',
  input: z.object({
    avatarId,
    name: z.string().trim().min(1).max(120).describe('The new name, verbatim'),
  }),
  risk: 'write',
  card: 'avatar',
  door: door(BrandVoiceController, 'updateAvatar'),
  untrusted: [],
  run: async (ctx, input) => {
    await ctx
      .service(VoiceService)
      .updateAvatar(actorOf(ctx), { avatarId: checkedAvatarId(input.avatarId) as string, name: input.name });
    return { avatarId: input.avatarId, name: input.name };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

export const avatarDefault = defineCapability({
  id: 'avatar.default',
  group: 'avatar',
  label: { ru: 'Сделать аватаром по умолчанию', en: 'Make the default avatar' },
  description:
    'Make an avatar the workspace default: it writes whenever nobody names another. Only an avatar that writes (analysed and switched on) can be the default. Reversible.',
  input: z.object({ avatarId }),
  risk: 'write',
  card: 'avatar',
  door: door(BrandVoiceController, 'setDefaultAvatar'),
  untrusted: [],
  run: async (ctx, input) => {
    await ctx
      .service(VoiceService)
      .setDefaultAvatar(actorOf(ctx), { avatarId: checkedAvatarId(input.avatarId) as string });
    return { avatarId: input.avatarId, isDefault: true };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

export const avatarBind = defineCapability({
  id: 'avatar.bind',
  group: 'avatar',
  label: { ru: 'Писать аватаром в канале', en: 'Write as this avatar in a channel' },
  description:
    'Make a channel write in an avatar\'s voice: the avatar becomes the channel\'s own on its writing card, for every next post there. Reversible on the channel card.',
  input: z.object({
    avatarId,
    channelId: z
      .string()
      .min(1)
      .max(128)
      .describe('Channel id from workspace.snapshot or channels.list'),
  }),
  risk: 'write',
  card: 'avatar',
  // The channel card's own door: that is where the screen binds an avatar.
  door: door(IntegrationsController, 'updateWritingProfile'),
  untrusted: [],
  run: async (ctx, input) => {
    await rememberOnChannel(ctx, input.channelId, {
      brandProfileId: checkedAvatarId(input.avatarId) as string,
    });
    return { avatarId: input.avatarId, channelId: input.channelId, bound: true };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

/** One message of the person, and never more than the paste box takes. */
const SAMPLE_PASTE_MAX_CHARS = Math.min(
  AGENT_MESSAGE_MAX_CHARS,
  VOICE_SAMPLE_PASTE_LIMITS.maxCharsPerSample
);

/**
 * Pasted texts, as the screen's paste box sends them (`buildIntakePayload`):
 * the person's own voice, the interface language, a title from the first
 * words when none is given. Somebody else's writing as a style reference asks
 * for confirmed rights and an erase date — that stays on the avatar screen.
 */
export const avatarSamplesAdd = defineCapability({
  id: 'avatar.samples.add',
  group: 'avatar',
  label: { ru: 'Добавить образцы', en: 'Add samples' },
  description:
    'Add the person\'s own texts to an avatar\'s samples when they paste them into the chat: pass each text verbatim, one item per post or article, never shortened or corrected. Only what the person pasted in their own message — never a text you found, wrote or read elsewhere; all texts together fit one message of the person. `origin`: `own_post` when they say these are their published posts, else `paste`. Only the person\'s own writing; somebody else\'s style is added on the avatar screen. Files and Telegram exports are never passed here: the chat adds them itself. Returns how many were accepted, why others were not, and readiness for the analysis.',
  input: z.object({
    ...avatarScope,
    origin: z
      .enum(['paste', 'own_post'])
      .optional()
      .describe('own_post — the person\'s published posts; paste — any other own text (default)'),
    // A pasted text can only be as long as one message of the person
    // (`AGENT_MESSAGE_MAX_CHARS`), together too: anything longer came from
    // somewhere else — a research result, another piece, a page read — and
    // is not the person's paste (review W3-18 F8).
    samples: z
      .array(
        z.object({
          title: z.string().trim().max(200).optional().describe('A title if the person gave one'),
          text: z
            .string()
            .min(1)
            .max(SAMPLE_PASTE_MAX_CHARS)
            .describe('The text, verbatim'),
        })
      )
      .min(1)
      .max(20)
      .refine(
        (samples) =>
          samples.reduce((sum, sample) => sum + sample.text.length, 0) <= SAMPLE_PASTE_MAX_CHARS,
        { message: `All texts together are at most ${SAMPLE_PASTE_MAX_CHARS} characters: one message of the person.` }
      ),
  }),
  risk: 'write',
  card: 'avatar',
  door: door(BrandVoiceController, 'addSamples'),
  untrusted: [],
  run: async (ctx, input) => {
    const answer = (await ctx.service(VoiceService).intake(actorOf(ctx, input.avatarId), {
      origin: input.origin === 'own_post' ? 'OWN_POST' : 'PASTE',
      usagePurpose: 'OWN_VOICE',
      language: ctx.language,
      items: input.samples.map((sample) => ({
        title: sample.title?.trim() || sample.text.trim().slice(0, 60),
        text: sample.text,
      })),
    })) as { accepted?: unknown[]; rejected?: Array<{ reason?: string }>; readiness?: unknown };
    const refused: Record<string, number> = {};
    for (const one of answer.rejected ?? []) {
      const reason = String(one?.reason ?? 'UNREADABLE');
      refused[reason] = (refused[reason] ?? 0) + 1;
    }
    const avatar = input.avatarId ? null : await avatarAbout(ctx);
    return {
      avatarId: input.avatarId ?? avatar?.id ?? null,
      accepted: (answer.accepted ?? []).length,
      refused,
      samples: readinessLine(answer.readiness),
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

const fieldKey = z
  .enum(PROFILE_FIELDS_V2)
  .describe('WHO_SPEAKS, TONE, AUDIENCE, SENTENCE_LENGTH, NEVER_SAY or TOPICS');

export const avatarProposalField = defineCapability({
  id: 'avatar.proposal.field',
  group: 'avatar',
  label: { ru: 'Строка предложения голоса', en: 'A line of the voice proposal' },
  description:
    'Decide one line of the voice proposal, one at a time: `accept` keeps the proposed text, `save` replaces it with the person\'s own words (verbatim) and accepts it. A line the analysis could not ground (often WHO_SPEAKS or AUDIENCE) can only be written with `save`. The other lines are untouched. Reversible.',
  input: z.object({
    ...avatarScope,
    field: fieldKey,
    action: z.enum(['accept', 'save']).describe('accept — keep the proposed text; save — the person\'s words'),
    text: z.string().trim().min(1).max(600).optional().describe('For save: the person\'s words, verbatim'),
  }),
  risk: 'write',
  card: 'avatar',
  door: door(BrandVoiceController, 'proposalField'),
  untrusted: ['workspace-text'],
  run: async (ctx, input) => {
    const answer = await ctx.service(VoiceService).proposalField(actorOf(ctx, input.avatarId), {
      key: input.field,
      action: input.action === 'save' ? 'SAVE' : 'ACCEPT',
      ...(input.text ? { text: input.text } : {}),
    });
    const fields = fieldLines(answer);
    const avatar = input.avatarId ? null : await avatarAbout(ctx);
    return {
      avatarId: input.avatarId ?? avatar?.id ?? null,
      field: input.field,
      accepted: fields.filter((one) => one.status === 'ACCEPTED' && one.text.trim()).length,
      fields,
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

/**
 * The lines by hand, several in one call (W3 live walk 28.09.2026, P2-B): the
 * walk's «five lines in one message» took one step per line and the turn ran
 * out of steps before the consent card. The draft's door takes one line; the
 * lines are written one after another through it, each a revision-checked
 * write over the same draft (correctness review F4):
 *
 * - a line refused does not stop the others; the answer says which lines
 *   were saved (`written`) and which were not (`refused`, with the reason),
 *   so the model never says «nothing saved» when some were;
 * - when no line could be saved, the first refusal is the answer, as before;
 * - the older shape `{ field, text }` (one line) is still taken: MCP clients
 *   and threads from before `lines` call it that way.
 */
const MANUAL_LINES_MAX = PROFILE_FIELDS_V2.length;

const manualLineText = z
  .string()
  .trim()
  .min(1)
  .max(600)
  .describe('The person\'s words for this line, verbatim');

type ManualLineRefusal = { field: string; code: string; reason: string };

const manualLineRefusal = (field: string, error: unknown): ManualLineRefusal => {
  const code = (error as { code?: unknown })?.code;
  const message = (error as { message?: unknown })?.message;
  const known = isProductErrorCode(code);
  return {
    field,
    code: known ? (code as string) : 'CAPABILITY_FAILED',
    reason: known && typeof message === 'string' && message ? message.slice(0, 300) : 'This line was not saved.',
  };
};

export const avatarManualField = defineCapability({
  id: 'avatar.manual.field',
  group: 'avatar',
  label: { ru: 'Строки аватара вручную', en: 'Avatar lines by hand' },
  description: `Write lines of an avatar by hand (the path without samples), all the person gave in one call: \`lines\`, each line with the person's words verbatim (one line may also come as \`field\` + \`text\`). There are ${MANUAL_LINES_MAX} lines — WHO_SPEAKS, TONE, AUDIENCE, SENTENCE_LENGTH, NEVER_SAY, TOPICS; when all are filled, the avatar can be switched on (avatar.activate with mode manual). Lines not passed stay as they are. The answer lists the lines saved (\`written\`) and any not saved (\`refused\`, with the reason): say which were saved and which not, and send again only the refused ones. Reversible.`,
  input: z.object({
    ...avatarScope,
    lines: z
      .array(z.object({ field: fieldKey, text: manualLineText }))
      .min(1)
      .max(MANUAL_LINES_MAX)
      .refine((lines) => new Set(lines.map((line) => line.field)).size === lines.length, {
        message: 'Each line at most once.',
      })
      .optional()
      .describe('The lines the person gave, each once'),
    field: fieldKey.optional().describe('One line only (older shape; prefer `lines`)'),
    text: manualLineText.optional(),
  }),
  risk: 'write',
  card: 'avatar',
  door: door(BrandVoiceController, 'manualProposalField'),
  untrusted: ['workspace-text'],
  run: async (ctx, input) => {
    const voice = ctx.service(VoiceService);
    const actor = actorOf(ctx, input.avatarId);
    const single = input.field !== undefined || input.text !== undefined;
    if (input.lines ? single : !(input.field && input.text)) {
      throw codedFailure(
        'CAPABILITY_INPUT_INVALID',
        'Pass `lines`, or one `field` with its `text` — not both. Nothing was written.'
      );
    }
    const lines = input.lines ?? [{ field: input.field!, text: input.text! }];
    let answer: unknown = null;
    const written: string[] = [];
    const refused: ManualLineRefusal[] = [];
    let firstError: unknown = null;
    for (const line of lines) {
      try {
        answer = await voice.manualField(actor, { key: line.field, text: line.text });
        written.push(line.field);
      } catch (error) {
        firstError ??= error;
        refused.push(manualLineRefusal(line.field, error));
      }
    }
    // Nothing saved: the refusal itself is the answer, as for one line.
    if (!written.length) throw firstError;
    const fields = fieldLines(answer);
    const avatar = input.avatarId ? null : await avatarAbout(ctx);
    return {
      avatarId: input.avatarId ?? avatar?.id ?? null,
      written,
      ...(refused.length ? { refused } : {}),
      filled: fields.filter((one) => one.text.trim()).length,
      total: fields.length,
      fields,
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

/* ---- Paid ---------------------------------------------------------------- */

type Analysed = {
  avatarId: string | null;
  /**
   * `proposal` — a proposal is ready; `running` — a run is still finishing
   * on the server; `proposal-missing` — numbers stored, the AI did not
   * finish; `insufficient` — not enough samples yet.
   */
  outcome: 'proposal' | 'running' | 'proposal-missing' | 'insufficient';
  /** Whether this call ran the paid analysis; `false` — nothing was spent. */
  spent: boolean;
  sampleCount?: number;
  samples?: ReadinessLine;
};

/**
 * One run of the streaming door: the same generator, its events forwarded as
 * transient progress. The run is read to its end even when nobody listens any
 * more — the door keeps writing to a closed response the same way — so a
 * dropped chat still stores the proposal, and the next call finds it instead
 * of paying again.
 */
const analysisPass = async (
  ctx: CapabilityRunContext,
  actor: VoiceActor,
  emit: CapabilityEmit
) => {
  const voice = ctx.service(VoiceService);
  voice.assertAnalysisAllowed(actor);
  let listening = true;
  let final: { outcome?: string; readiness?: unknown; sampleCount?: number } | null = null;
  // The screen's body: the interface language, with the AI's proposal.
  for await (const event of voice.analysisStream(actor, {
    language: ctx.language,
    withAssist: true,
  })) {
    const named = event as { name: string } & Record<string, any>;
    if (named.name === 'done') {
      final = named.analysis ?? null;
      continue;
    }
    if (!listening) continue;
    try {
      await emit({
        kind: 'progress',
        data: { capability: 'avatar.analyse', stage: `voice-${named.name}` },
        transient: true,
      });
    } catch {
      listening = false;
    }
  }
  return final;
};

export const avatarAnalyse = defineCapability({
  id: 'avatar.analyse',
  group: 'avatar',
  label: { ru: 'Разобрать образцы', en: 'Analyse the samples' },
  description:
    'Analyse an avatar\'s samples and have the AI write the voice proposal. Paid (about five minutes for eight texts); runs without asking. It first reads what is stored for these texts and never pays twice: a ready proposal is returned as is (`spent: false`), a run still finishing on the server is left to finish (`running`), and a stored run whose proposal did not arrive (`proposal-missing`) is run again only with `rerun: true` — pass it only after the person agreed to the new paid run. Changed samples start a new run. `insufficient` means not enough samples yet: say what is missing.',
  input: z.object({
    ...avatarScope,
    rerun: z
      .boolean()
      .optional()
      .describe('true only when the person agreed to run again after `proposal-missing`'),
  }),
  risk: 'paid',
  card: 'avatar',
  door: door(BrandVoiceController, 'runAnalysisStream'),
  untrusted: [],
  run: async (ctx, input, emit): Promise<Analysed> => {
    const voice = ctx.service(VoiceService);
    const actor = actorOf(ctx, input.avatarId);
    const avatarOf = async () =>
      input.avatarId ?? (await avatarAbout(ctx))?.id ?? null;
    // «Дальше — разбор», which pays only when it has to (`2q28.34`): the
    // stored run is read first, with the screen's own rule.
    const stored = await voice.analysis(actor);
    const step = resumeStepFor(stored, Date.now());
    const count = (stored as { sampleCount?: number }).sampleCount;
    if (step === 'proposal') {
      return { avatarId: await avatarOf(), outcome: 'proposal', spent: false, ...(count ? { sampleCount: count } : {}) };
    }
    if (step === 'waiting') {
      return { avatarId: await avatarOf(), outcome: 'running', spent: false };
    }
    if (step === 'analysis' && input.rerun !== true) {
      return { avatarId: await avatarOf(), outcome: 'proposal-missing', spent: false, ...(count ? { sampleCount: count } : {}) };
    }
    const final = await analysisPass(ctx, actor, emit);
    if (!final) {
      throw codedFailure('VOICE_ANALYSIS_FAILED', 'The analysis ended without a result.');
    }
    if (final.outcome === 'insufficient') {
      return {
        avatarId: await avatarOf(),
        outcome: 'insufficient',
        spent: false,
        samples: readinessLine(final.readiness),
      };
    }
    // What the run stored, read back the way a returning screen reads it.
    const after = resumeStepFor(await voice.analysis(actor), Date.now());
    return {
      avatarId: await avatarOf(),
      outcome: after === 'proposal' ? 'proposal' : 'proposal-missing',
      spent: true,
      ...(typeof final.sampleCount === 'number' ? { sampleCount: final.sampleCount } : {}),
    };
  },
  // A stored proposal, a run still finishing, a missing proposal not rerun
  // and too few samples pay for nothing: the slot goes back (W3-18 F4).
  spentNothing: (output) => !output.spent,
  summarize: (output) => ({ ...output }),
  cardOf: (output) => (output.outcome === 'proposal' ? avatarCard(output) : null),
});

export const avatarLearn = defineCapability({
  id: 'avatar.learn',
  group: 'avatar',
  label: { ru: 'Научить на правках', en: 'Learn from edits' },
  description:
    'Teach an avatar from the person\'s edits of its drafts: one paid AI call over the edits collected since the last run. Needs at least `minPairs` edits (avatar.learning says how many wait); fewer is refused with the count. Returns the rules it knows now.',
  input: z.object(avatarScope),
  risk: 'paid',
  card: 'avatar',
  door: door(BrandVoiceController, 'learnFromEdits'),
  untrusted: ['workspace-text'],
  run: async (ctx, input) => {
    const learned = learningLine(
      input.avatarId,
      await ctx.service(VoiceService).learnFromEdits(actorOf(ctx, input.avatarId))
    );
    const avatar = input.avatarId ? null : await avatarAbout(ctx);
    return { ...learned, avatarId: learned.avatarId ?? avatar?.id ?? null };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

/* ---- Asking first -------------------------------------------------------- */

const plural = (count: number, [one, few, many]: [string, string, string]) => {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
};

type SampleLine = { code: string; title: string };

/** The samples of one avatar, as its samples door lists them. */
const samplesOf = async (ctx: ServiceContext, avatar: string): Promise<SampleLine[]> => {
  const answer = (await ctx.service(VoiceService).samples(actorOf(ctx, avatar))) as {
    samples?: Array<{ code?: unknown; title?: unknown }>;
  };
  return (answer.samples ?? []).map((row) => ({
    code: String(row.code ?? ''),
    title: String(row.title ?? ''),
  }));
};

/** A sample's first words for the card: short, on one line. */
const EXCERPT_CHARS = 40;
const SAMPLES_ON_CARD = 5;
const excerptOf = (title: string) => {
  const line = title.replace(/\s+/g, ' ').trim();
  return line.length > EXCERPT_CHARS ? `${line.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : line;
};

export const avatarSamplesDelete = defineCapability({
  id: 'avatar.samples.delete',
  group: 'avatar',
  label: { ru: 'Удалить образцы', en: 'Delete samples' },
  description:
    'Delete samples of one avatar by their codes (from avatar.samples of that same avatar). The person approves on a card first. Their texts are gone for good, and an analysis that read them is marked out of date. Codes of another avatar are refused.',
  input: z.object({
    ...avatarScope,
    // Taken as written: «Да» is bound to exactly these arguments.
    codes: z.array(z.string().min(1).max(32)).min(1).max(50).describe('Sample codes, e.g. smp-02'),
  }),
  risk: 'confirm',
  door: door(BrandVoiceController, 'deleteSamples'),
  untrusted: [],
  // Bound to the avatar the codes resolve to and to which of them are its
  // own now (review W3-18 F1, F7).
  approvalContent: async (ctx, input) => {
    const { avatarId: bound } = await boundAvatar(ctx, input);
    if (!bound) return { avatarId: null };
    const own = new Set((await samplesOf(ctx, bound)).map((one) => one.code));
    return { avatarId: bound, owned: [...new Set(input.codes)].filter((code) => own.has(code)) };
  },
  describeApproval: async (ctx: ApprovalDescribeContext, input) => {
    const ru = ctx.language === 'ru';
    const avatar = await avatarAbout(ctx, input.avatarId);
    if (!avatar) return noAvatarLine(input.avatarId, ru);
    const codes = [...new Set(input.codes)];
    const byCode = new Map((await samplesOf(ctx, avatar.id)).map((one) => [one.code, one]));
    const foreign = codes.filter((code) => !byCode.has(code));
    if (foreign.length) {
      const named = foreign.slice(0, SAMPLES_ON_CARD).join(', ') + (foreign.length > SAMPLES_ON_CARD ? ', …' : '');
      return ru
        ? `У аватара ${avatarWords(avatar, true)} нет ${foreign.length === 1 ? 'образца' : 'образцов'} ${named} — ничего не удалится`
        : `Avatar ${avatarWords(avatar, false)} has no sample${foreign.length === 1 ? '' : 's'} ${named} — nothing will be deleted`;
    }
    const shown = codes
      .slice(0, SAMPLES_ON_CARD)
      .map((code) => {
        const excerpt = excerptOf(byCode.get(code)?.title ?? '');
        return excerpt ? `${code} ${ru ? `«${excerpt}»` : `“${excerpt}”`}` : code;
      })
      .join(', ') + (codes.length > SAMPLES_ON_CARD ? ', …' : '');
    const one = codes.length === 1;
    return ru
      ? `Удалить насовсем ${codes.length} ${plural(codes.length, ['образец', 'образца', 'образцов'])} аватара ${avatarWords(avatar, true)} (${shown}): ${
          one ? 'его текст уйдёт из набора, а разбор, который его читал,' : 'их тексты уйдут из набора, а разбор, который их читал,'
        } будет помечен устаревшим`
      : `Delete ${codes.length} sample${one ? '' : 's'} of avatar ${avatarWords(avatar, false)} for good (${shown}): ${
          one ? 'its text leaves the set, and an analysis that read it' : 'their texts leave the set, and an analysis that read them'
        } is marked out of date`;
  },
  run: async (ctx, input) => {
    const avatar = await avatarActedOn(ctx, input.avatarId);
    const codes = [...new Set(input.codes)];
    // The service finds codes across the workspace; only this avatar's go.
    const own = new Set((await samplesOf(ctx, avatar.id)).map((one) => one.code));
    const foreign = codes.filter((code) => !own.has(code));
    if (foreign.length) {
      throw codedFailure(
        'VOICE_SAMPLE_NOT_FOUND',
        `Avatar ${avatar.id} has no sample ${foreign.slice(0, SAMPLES_ON_CARD).join(', ')}; nothing was deleted. Read its codes with avatar.samples.`
      );
    }
    await ctx.service(VoiceService).deleteSamples(actorOf(ctx, avatar.id), { codes });
    return { avatarId: avatar.id, deleted: codes.length };
  },
  summarize: (output) => ({ ...output }),
});

export const avatarDelete = defineCapability({
  id: 'avatar.delete',
  group: 'avatar',
  label: { ru: 'Удалить аватар', en: 'Delete an avatar' },
  description:
    'Delete an avatar. The person approves on a card first. Its learned edits go with it. `successorId` names the avatar that takes over its samples (and, for the default avatar, the default — deleting the default without a successor is refused while other avatars exist).',
  input: z.object({
    avatarId,
    successorId: avatarId.optional().describe('Avatar that takes over the samples and the default'),
  }),
  risk: 'confirm',
  door: door(BrandVoiceController, 'deleteAvatar'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const list = await readAvatars(ctx);
    const target = list.avatars.find((one) => one.id === input.avatarId) ?? null;
    if (!target) {
      return ru
        ? `Удалить аватар ${input.avatarId} — в этом пространстве его нет, удалять нечего`
        : `Delete avatar ${input.avatarId} — there is no such avatar in this workspace`;
    }
    const successor = input.successorId
      ? list.avatars.find((one) => one.id === input.successorId) ?? null
      : null;
    if (ru) {
      return `Удалить аватар ${avatarWords(target, true)} насовсем вместе с правками, на которых он учился; ${
        successor ? `образцы перейдут к аватару ${avatarWords(successor, true)}` : 'его образцы ни к кому не перейдут'
      }`;
    }
    return `Delete avatar ${avatarWords(target, false)} for good with the edits it learned from; ${
      successor ? `its samples go to avatar ${avatarWords(successor, false)}` : 'its samples go to no other avatar'
    }`;
  },
  run: async (ctx, input) => {
    await ctx.service(VoiceService).deleteAvatar(actorOf(ctx), {
      avatarId: checkedAvatarId(input.avatarId) as string,
      ...(input.successorId ? { successorId: checkedAvatarId(input.successorId) } : {}),
    });
    return { avatarId: input.avatarId, deleted: true, successorId: input.successorId ?? null };
  },
  summarize: (output) => ({ ...output }),
});

export const avatarRuleForget = defineCapability({
  id: 'avatar.rule.forget',
  group: 'avatar',
  label: { ru: 'Забыть правило', en: 'Forget a learned rule' },
  description:
    'Make an avatar forget one rule it learned from edits (rule id from avatar.learning). The person approves on a card first. The edits it came from are not learned again.',
  input: z.object({
    ...avatarScope,
    ruleId: z.string().min(1).max(128).describe('Rule id from avatar.learning'),
  }),
  risk: 'confirm',
  door: door(BrandVoiceController, 'forgetLearnedRule'),
  untrusted: [],
  // «Да» is for the avatar the card named (review W3-18 F1).
  approvalContent: boundAvatar,
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const avatar = await avatarAbout(ctx, input.avatarId);
    if (!avatar) return noAvatarLine(input.avatarId, ru);
    const learning = await ctx.service(VoiceService).learning(actorOf(ctx, avatar.id));
    const rule = learningLine(avatar.id, learning).rules.find((one) => one.id === input.ruleId);
    if (!rule) {
      return ru
        ? `Забыть правило ${input.ruleId} — у аватара ${avatarWords(avatar, true)} такого правила нет`
        : `Forget rule ${input.ruleId} — avatar ${avatarWords(avatar, false)} has no such rule`;
    }
    const text = rule.text.length > 120 ? `${rule.text.slice(0, 119).trimEnd()}…` : rule.text;
    return ru
      ? `Забыть правило аватара ${avatarWords(avatar, true)} «${text}»: оно перестанет действовать, а правки, из которых оно выведено, заново не разберутся`
      : `Make avatar ${avatarWords(avatar, false)} forget “${text}”: it stops applying, and the edits it came from are not learned again`;
  },
  run: async (ctx, input) => {
    const avatar = await avatarActedOn(ctx, input.avatarId);
    await ctx
      .service(VoiceService)
      .forgetLearnedRule(actorOf(ctx, avatar.id), { ruleId: input.ruleId });
    return { avatarId: avatar.id, ruleId: input.ruleId, forgotten: true };
  },
  summarize: (output) => ({ ...output }),
});

export const avatarRetire = defineCapability({
  id: 'avatar.retire',
  group: 'avatar',
  label: { ru: 'Вывести голос из использования', en: 'Take the voice out of use' },
  description:
    'Take an avatar\'s voice out of use: it stops writing and texts go out in a neutral style. The person approves on a card first. Its versions and samples stay; the voice can be restored on the avatar screen.',
  input: z.object(avatarScope),
  risk: 'confirm',
  card: 'avatar',
  door: door(BrandVoiceController, 'deleteProfile'),
  untrusted: [],
  // «Да» is for the avatar the card named (review W3-18 F1).
  approvalContent: boundAvatar,
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const avatar = await avatarAbout(ctx, input.avatarId);
    if (!avatar) return noAvatarLine(input.avatarId, ru);
    return ru
      ? `Вывести из использования голос аватара ${avatarWords(avatar, true)}: он перестанет писать, тексты пойдут в нейтральном стиле. Версии и образцы останутся — вернуть голос можно на экране аватара`
      : `Take the voice of avatar ${avatarWords(avatar, false)} out of use: it stops writing and texts go out in a neutral style. Its versions and samples stay — the voice can be restored on the avatar screen`;
  },
  run: async (ctx, input) => {
    const avatar = await avatarActedOn(ctx, input.avatarId);
    await ctx.service(VoiceService).deleteProfile(actorOf(ctx, avatar.id));
    return { avatarId: avatar.id, retired: true };
  },
  summarize: (output) => ({ ...output }),
  cardOf: avatarCard,
});

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
  /**
   * The avatar's name now, for the card's name field (W3 walk P3-F): a name
   * given at creation or renamed a step earlier is already there.
   */
  avatarName: z.string().nullable().optional(),
  /** Whose voice (W3 walk P3-G): a brand is not «моя манера». */
  avatarKind: z.enum(['person', 'brand']).optional(),
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
/** The same question for an avatar that already has a name (W3 walk P3-F). */
const QUESTION_NAMED = {
  ru: 'Включить этот аватар? Подтвердите, что у вас есть право писать этим голосом.',
  en: 'Switch this avatar on? Confirm that you have the right to write in this voice.',
};

type Activation = {
  avatarId: string | null;
  activated: boolean;
  /** The name given on the card, for the avatar's line (kcxz.29, D12). */
  name?: string | null;
  /** What the model reads: on and nothing waits, or off (W3 recheck R-1). */
  message?: string;
};

/**
 * What the model reads after the consent card (W3 recheck R-1): the answer
 * is the consent, the avatar is on, nothing waits.
 */
const activationDone = (name: string | null, language: 'ru' | 'en') => {
  const line =
    language === 'en'
      ? name ? `Avatar “${name}” is on.` : 'The avatar is on.'
      : name ? `Аватар «${name}» включён.` : 'Аватар включён.';
  return `Switched on: the person gave their consent on the card, nothing waits for a confirmation. Say it in one line, e.g. ${line} Never ask them to confirm or to look at the card again.`;
};
const ACTIVATION_DECLINED =
  'Not switched on: the person did not give their consent on the card. Say in one line that the avatar stays off.';

export const avatarActivate = defineCapability({
  id: 'avatar.activate',
  group: 'avatar',
  label: { ru: 'Включить аватар', en: 'Switch an avatar on' },
  description:
    'Switch on the proposed avatar (voice) after its analysis or after its lines were filled by hand. First checks the avatar is ready: if it is not, it refuses with the reason (for example lines still empty) and asks nothing — tell the person what to finish. When ready, shows the person a consent card and waits for their answer; the avatar is switched on only if they consent.',
  input: z.object({
    // The shared id, shape-checked in `actorOf` (review W3-18 F10).
    avatarId: avatarScope.avatarId,
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
      const blocker = await ctx
        .service(VoiceService)
        .activationBlocker(actorOf(ctx, input.avatarId), input.mode ?? 'assist');
      if (blocker) throw blocker;
      // The name and kind are a courtesy of the card: a failed read asks
      // for a name, as before, and never blocks the consent.
      const avatar = await avatarAbout(ctx, input.avatarId).catch(() => null);
      await ctx.suspend({
        question: (avatar?.name?.trim() ? QUESTION_NAMED : QUESTION)[ctx.language],
        avatarId: input.avatarId ?? null,
        mode: input.mode ?? 'assist',
        avatarName: avatar?.name?.trim() || null,
        avatarKind: avatar?.kind === 'BRAND' ? 'brand' : 'person',
        canDecideForPerson: false,
      });
      return undefined;
    }
    if (!answer.data.consentGiven) {
      return {
        avatarId: input.avatarId ?? null,
        activated: false,
        message: ACTIVATION_DECLINED,
      };
    }
    await ctx.service(VoiceService).activateProposal(
      actorOf(ctx, input.avatarId),
      {
        version: 2,
        consentGiven: true,
        avatarName: answer.data.avatarName,
        mode: input.mode,
      }
    );
    const name = answer.data.avatarName?.trim() || null;
    return {
      avatarId: input.avatarId ?? null,
      activated: true,
      name,
      message: activationDone(name, ctx.language),
    };
  },
  // `message` says the consent is done (W3 recheck R-1: after `activated:
  // true` the agent still asked to «подтвердите включение»).
  summarize: (output) => ({
    avatarId: output.avatarId,
    activated: output.activated,
    ...(output.name ? { name: output.name } : {}),
    message: output.message,
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
