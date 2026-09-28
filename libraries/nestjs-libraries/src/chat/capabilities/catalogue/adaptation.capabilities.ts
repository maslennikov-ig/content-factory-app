import { z } from 'zod';
import { ContentPieceController } from '@contentfactory/backend/api/routes/content-piece.controller';
import { IntegrationsController } from '@contentfactory/backend/api/routes/integrations.controller';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { EMOJI_STOPS } from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';
import { AGENT_DECIDE_FOR_PERSON_KEY } from '../agent-parts.contract';
import {
  defineCapability,
  door,
  type CapabilityEmit,
  type CapabilityRunContext,
} from '../capability.types';
import {
  changeAnswer,
  changeSelection,
  proposeThenAccept,
  reviewSummary,
  type Reviewed,
} from './core.capabilities';
import { QUOTED_QUESTION_MAX, codedFailure, eventFailure, shortQuestion } from './selection';
import { proposalTarget } from '../capability.context';

/**
 * Adaptations (spec §5.2 «Контент», `kcxz.14`): writing a piece for a
 * channel with its interview, variants, «Убрать следы ИИ» / «Проверить
 * факты» / «Переписать…» with the changes card, the hand edit, the picture,
 * deleting, and «…и запомнить для канала». Every capability calls the method
 * its door calls, with the body the piece page sends (`piece.container.tsx`,
 * `pieces.adapter.ts` `buildAdaptPayload`, `buildAdaptationPatch`,
 * `rememberedProfilePayload`).
 */

const pieceId = z.string().min(1).max(128).describe('Piece id');
const adaptationId = z.string().min(1).max(128).describe('Adaptation id from piece.adapt or piece.open');
const channelId = z.string().min(1).max(128).describe('Channel id from workspace.snapshot or channels.list');

/** The kinds the page writes today (`ADAPTATION_KINDS_LATER` are not yet). */
const ADAPT_KINDS = ['post', 'caption', 'article', 'newsletter'] as const;

/* Fields of a post that the person can ask for in words (§3.4 «Для этого поста»). */
// The five densities and `auto`, as the page's post panel offers them.
// Shared with the channel card's own capability (`channel.writing`, kcxz.19).
export const EMOJI = z.enum([...EMOJI_STOPS, 'auto']);
export const LINKS = z.enum(['none', 'end', 'inline', 'auto']);
export const HASHTAGS = z.enum(['none', 'end_1_3', 'free', 'auto']);
export const CTA = z.enum(['auto', 'none', 'question', 'comment', 'link', 'subscribe', 'reply']);
const postFields = {
  emojiLevel: EMOJI.optional().describe('Emoji density, only when the person asked'),
  hashtagPolicy: HASHTAGS.optional().describe('Hashtags, only when the person asked'),
  linkPolicy: LINKS.optional().describe('Links in the text, only when the person asked'),
  ctaKind: CTA.optional().describe('Call to action, only when the person asked'),
  avatarId: z.string().min(1).max(128).optional().describe('Another avatar for this post, id from the snapshot'),
};

/* ---- The interview card --------------------------------------------------- */

/**
 * The adaptation interview (`AgentInterviewQuestionPayload`): the model's
 * questions for this channel, each with the suggested answer, finite options
 * and why it is asked; the person answers some in their words, confirms a
 * suggestion («Так и есть»), gives some to us, or all («Решите за меня»).
 */
const interviewQuestion = z.object({
  kind: z.literal('interview'),
  question: z.string(),
  questions: z.array(
    z.object({
      key: z.string(),
      question: z.string(),
      suggested: z.string().nullable(),
      options: z.array(z.string()).optional(),
      why: z.string().optional(),
    })
  ),
  canDecideForPerson: z.literal(true),
  channel: z.object({ id: z.string(), name: z.string(), provider: z.string() }).nullable(),
  /**
   * Server only (stripped from what the browser sees): the person consented
   * to the autopilot queue on this call, before these questions.
   */
  afterConsent: z.literal(true).optional(),
});
type InterviewQuestion = z.infer<typeof interviewQuestion>;

/**
 * The interview card's answer, strict (review W2 F3): a consent answer, or
 * anything else, never parses as an interview answer.
 */
const interviewAnswer = z
  .object({
    answers: z
      .array(
        z
          .object({
            key: z.string().max(40),
            text: z.string().max(2000),
            origin: z.enum(['person', 'confirmed']).optional(),
          })
          .strict()
      )
      .max(20)
      .optional(),
    decideKeys: z.array(z.string().max(40)).max(20).optional(),
    [AGENT_DECIDE_FOR_PERSON_KEY]: z.boolean().optional(),
  })
  .strict();

/** The autopilot consent card's answer: the person's own yes or no, nothing else. */
const autopilotAnswer = z.object({ consentGiven: z.boolean() }).strict();

/** What `piece.adapt` takes on resume: one of its two cards' answers. */
const adaptAnswer = z.union([autopilotAnswer, interviewAnswer]);

/**
 * Consent to write into an autopilot channel (spec §1.4, premortem A1): the
 * new post would take its place in the queue and go out without a further
 * act. Only the person answers; there is no «Решите за меня». The answer key
 * rides in the payload, so a reloaded card knows it.
 */
const autopilotQuestion = z.object({
  kind: z.literal('consent'),
  subject: z.literal('autopilot'),
  question: z.string(),
  answerKey: z.literal('consentGiven'),
  canDecideForPerson: z.literal(false),
  channel: z.object({ id: z.string(), name: z.string(), provider: z.string() }).nullable(),
});
type AutopilotQuestion = z.infer<typeof autopilotQuestion>;

const AUTOPILOT_TEXT = {
  ru: (channel: string) =>
    `Канал «${channel}» на автопилоте: адаптация сразу встанет в очередь и выйдет сама. Писать?`,
  en: (channel: string) =>
    `“${channel}” is on autopilot: the adaptation will join the queue at once and go out by itself. Write it?`,
};

/** Both cards of `piece.adapt`: the autopilot consent first, the interview after. */
const adaptQuestion = z.union([autopilotQuestion, interviewQuestion]);

const INTERVIEW_TEXT = {
  ru: 'Пара вопросов, чтобы пост получился вашим. Ответьте, что знаете, остальное решим за вас.',
  en: 'A couple of questions so the post sounds like you. Answer what you know; we decide the rest.',
};

type Adapted = {
  pieceId: string;
  adaptationId: string;
  channel: { id: string; name: string; provider: string };
  /** 1 — the first text for this channel; a repeat writes the next variant. */
  variant: number;
  /** `queued` when the channel is on autopilot: the post waits in its queue. */
  state: string;
  /** Interview questions the person was asked — and answered — in this call. */
  asked: number;
  /** Optional questions open under the new post («Материала мало»), as asked (`QUOTED_QUESTION_MAX`). */
  openQuestions?: string[];
  /** Where the version stands in the channel's plan, and why, when said. */
  plan?: string | null;
  note?: string | null;
};

/** The person said no on the autopilot card: nothing spent, nothing written. */
type AdaptDeclined = { pieceId: string; channelId: string; declined: true };
const isDeclined = (output: Adapted | AdaptDeclined): output is AdaptDeclined =>
  (output as AdaptDeclined).declined === true;

type AdaptPass =
  | {
      kind: 'adaptation';
      adaptationId: string;
      state: string;
      channel: InterviewQuestion['channel'];
      plan: string | null;
      note: string | null;
    }
  | { kind: 'questions'; questions: InterviewQuestion['questions']; channel: InterviewQuestion['channel'] };

/**
 * One request of the adapt door: its generator, events as transient progress.
 * `queueAllowed` is the person's consent to the autopilot queue on this call;
 * the service re-reads the mode under the channel lock and keeps a reserve
 * without it (review W2 F2).
 */
const adaptPass = async (
  ctx: CapabilityRunContext,
  id: string,
  body: Record<string, unknown>,
  emit: CapabilityEmit,
  queueAllowed: boolean
): Promise<AdaptPass> => {
  const pieces = ctx.service(PieceService);
  const plan = await pieces.prepareAdapt(ctx.organizationId, id, body as any, ctx.language);
  let channel: InterviewQuestion['channel'] = null;
  let result: AdaptPass | null = null;
  for await (const event of pieces.adapt(ctx.organizationId, plan, ctx.userId, { queueAllowed })) {
    const named = event as { name: string } & Record<string, any>;
    await emit({ kind: 'progress', data: { capability: 'piece.adapt', stage: named.name }, transient: true });
    if (named.name === 'adapt-started' && named.channel) {
      channel = {
        id: String(named.channel.id),
        name: String(named.channel.name ?? ''),
        provider: String(named.channel.providerIdentifier ?? ''),
      };
    }
    if (named.name === 'questions') {
      result = {
        kind: 'questions',
        channel,
        questions: (Array.isArray(named.questions) ? named.questions : []).map((one: any) => ({
          key: String(one?.key ?? ''),
          question: String(one?.question ?? ''),
          suggested: typeof one?.suggested === 'string' ? one.suggested : null,
          ...(Array.isArray(one?.options) ? { options: one.options.map(String) } : {}),
          ...(typeof one?.why === 'string' ? { why: one.why } : {}),
        })),
      };
    }
    if (named.name === 'adaptation' && named.adaptation?.id) {
      result = {
        kind: 'adaptation',
        adaptationId: String(named.adaptation.id),
        state: String(named.adaptation.state ?? 'draft'),
        channel,
        plan: typeof named.adaptation.plan?.status === 'string' ? named.adaptation.plan.status : null,
        note: typeof named.adaptation.plan?.note === 'string' ? named.adaptation.plan.note : null,
      };
    }
    if (named.name === 'error') {
      throw eventFailure(named.code, named.message, 'GENERATION_FAILED', 'The adaptation could not be written.');
    }
  }
  if (!result) throw codedFailure('GENERATION_FAILED', 'The adaptation could not be written.');
  return result;
};

/**
 * What the page shows for the new text (W3 recheck R-4): which variant of the
 * channel it is (its place among the channel's rows) and the optional
 * questions open under it — «Материала мало» (`97dq.98`) — counted exactly.
 */
const writtenOf = async (ctx: CapabilityRunContext, id: string, channel: string, written: string) => {
  const detail = await ctx.service(PieceService).detail(ctx.organizationId, id, ctx.language);
  const rows = (detail.adaptations ?? []).filter((row: any) => row.integrationId === channel);
  const index = rows.findIndex((row: any) => row.id === written);
  const tab = ((detail as any).channels ?? []).find((one: any) => one?.integrationId === channel);
  const ask = tab?.materialAsk;
  const questions: string[] =
    ask && ask.adaptationId === written && Array.isArray(ask.questions)
      ? ask.questions
          .map((one: any) => (typeof one?.question === 'string' ? shortQuestion(one.question, QUOTED_QUESTION_MAX) : ''))
          .filter(Boolean)
      : [];
  return { variant: index < 0 ? rows.length : index + 1, openQuestions: questions };
};

export const pieceAdapt = defineCapability({
  id: 'piece.adapt',
  group: 'content',
  label: { ru: 'Адаптировать под канал', en: 'Adapt for a channel' },
  description:
    'Write a piece for one channel («Адаптировать»). Paid; runs without asking — except into a channel on autopilot, where the person first consents on a card, because the post would go out by itself (a «no» ends the call, nothing written). The first text for a channel may ask the person a few questions on a card (they answer or say «Решите за меня»); you never answer them. Adapting again for the same channel writes a new variant; the old one stays. Pass post fields only when the person asked for them in this request; a wish in their words goes to `wish`. After consent the post waits in the channel queue (`state: queued`): say so. Without consent on this call it never queues — if the channel went on autopilot meanwhile, the post stays planned (`plan: reserved` with a `note`); offer plan.schedule, which the person approves. Returns ids, the variant number, the state and the plan; the text is on the card. `answeredOnCard` counts questions already answered in this call — none of them waits. `openQuestions` is what waits under the post: optional questions for more material, with their exact count; when you mention them, say that count, that they are optional, and quote them in «» word for word, as given.',
  input: z.object({
    pieceId,
    channelId,
    kind: z.enum(ADAPT_KINDS).optional().describe('post (default), caption, article or newsletter'),
    wish: z.string().max(500).optional().describe('The person’s wish for this post, verbatim'),
    ...postFields,
  }),
  risk: 'paid',
  card: 'adaptation',
  door: door(ContentPieceController, 'adapt'),
  untrusted: [],
  suspendSchema: adaptQuestion,
  resumeSchema: adaptAnswer,
  run: async (ctx, input, emit): Promise<Adapted | AdaptDeclined | undefined> => {
    const pieces = ctx.service(PieceService);
    const wish = input.wish?.trim();
    // `buildAdaptPayload` with `adaptOverrides`: only what differs from the
    // channel, which is what the person named.
    const overrides = {
      ...(input.emojiLevel ? { emojiLevel: input.emojiLevel } : {}),
      ...(input.hashtagPolicy ? { hashtagPolicy: input.hashtagPolicy } : {}),
      ...(input.linkPolicy ? { linkPolicy: input.linkPolicy } : {}),
      ...(input.ctaKind ? { ctaKind: input.ctaKind } : {}),
      ...(input.avatarId ? { brandProfileId: input.avatarId } : {}),
      ...(wish ? { wish } : {}),
    };
    const body = (extra: Record<string, unknown> = {}) => ({
      integrationId: input.channelId,
      kind: input.kind ?? 'post',
      ...extra,
      ...(Object.keys(overrides).length ? { overrides } : {}),
    });
    const finished = async (pass: AdaptPass, asked: number): Promise<Adapted> => {
      if (pass.kind !== 'adaptation') {
        throw codedFailure('GENERATION_FAILED', 'The adaptation could not be written.');
      }
      const written = await writtenOf(ctx, input.pieceId, input.channelId, pass.adaptationId);
      return {
        pieceId: input.pieceId,
        adaptationId: pass.adaptationId,
        channel: (pass.channel as Adapted['channel'] | null) ?? { id: input.channelId, name: '', provider: '' },
        variant: written.variant,
        state: pass.state,
        asked,
        ...(written.openQuestions.length ? { openQuestions: written.openQuestions } : {}),
        plan: pass.plan,
        note: pass.note,
      };
    };
    // «Решите всё за меня» on the page: the interview is skipped. A second
    // question round lands here too, as the page's limit of two rounds does:
    // that is a second service admission inside the call's one paid slot.
    const decideAll = async (asked: number, queueAllowed: boolean) =>
      finished(await adaptPass(ctx, input.pieceId, body({ skipInterview: true }), emit, queueAllowed), asked);

    // The first request of the page, or the interview pause after it.
    const firstPass = async (queueAllowed: boolean): Promise<Adapted | undefined> => {
      const pass = await adaptPass(ctx, input.pieceId, body(), emit, queueAllowed);
      if (pass.kind === 'adaptation') return finished(pass, 0);
      if (!pass.questions.length) return decideAll(0, queueAllowed);
      await ctx.suspend!({
        kind: 'interview',
        question: INTERVIEW_TEXT[ctx.language],
        questions: pass.questions,
        canDecideForPerson: true,
        channel: pass.channel,
        ...(queueAllowed ? { afterConsent: true as const } : {}),
      } satisfies InterviewQuestion);
      return undefined;
    };

    if (ctx.resumeData !== undefined) {
      const consent = autopilotQuestion.safeParse(ctx.suspendPayload);
      if (consent.success) {
        const answer = autopilotAnswer.safeParse(ctx.resumeData);
        if (!answer.success) {
          throw codedFailure('INPUT_NEEDS_PERSON', 'The answer on the autopilot card was not understood; nothing was written.');
        }
        if (!answer.data.consentGiven) {
          return { pieceId: input.pieceId, channelId: input.channelId, declined: true };
        }
        // The person consented on this call: this call may queue.
        return firstPass(true);
      }
      const answer = interviewAnswer.safeParse(ctx.resumeData);
      const stored = interviewQuestion.safeParse(ctx.suspendPayload);
      if (!answer.success || !stored.success) {
        throw codedFailure('INPUT_NEEDS_PERSON', 'The answer on the questions card was not understood.');
      }
      const card = stored.data;
      const asked = card.questions.length;
      // The consent, if any, was given before these questions — read from
      // the stored card, never from the answer. The card may have waited for
      // days: without that consent the service keeps a reserve even if the
      // channel went on autopilot meanwhile, and the result says so.
      const queueAllowed = card.afterConsent === true;
      if (answer.data[AGENT_DECIDE_FOR_PERSON_KEY] === true) return decideAll(asked, queueAllowed);
      const byKey = new Map(card.questions.map((one) => [one.key, one]));
      // The page's answer body: only asked keys; the model's question rides
      // with a model-written key (`ask-N`), since the server keeps no round.
      const answers = (answer.data.answers ?? [])
        .filter((one) => byKey.has(one.key) && one.text.trim())
        .map((one) => ({
          key: one.key,
          text: one.text,
          origin: one.origin ?? 'person',
          ...(one.key.startsWith('ask-') ? { question: byKey.get(one.key)!.question } : {}),
        }));
      const decideKeys = (answer.data.decideKeys ?? []).filter((key) => byKey.has(key));
      if (!answers.length && !decideKeys.length) return decideAll(asked, queueAllowed);
      const pass = await adaptPass(
        ctx,
        input.pieceId,
        body({
          ...(answers.length ? { answers } : {}),
          ...(decideKeys.length ? { decideKeys } : {}),
        }),
        emit,
        queueAllowed
      );
      // A second round is past the page's limit of two: we decide the rest.
      return pass.kind === 'questions' ? decideAll(asked, queueAllowed) : finished(pass, asked);
    }

    // Autopilot: the post would leave without a further act — the person
    // consents first, before anything is spent (spec §1.4, premortem A1).
    const mode = await pieces.adaptPlanMode(ctx.organizationId, input.pieceId, input.channelId);
    if (mode === 'autopilot') {
      if (!ctx.suspend) {
        throw codedFailure(
          'AUTOPILOT_NEEDS_CONSENT',
          'The channel is on autopilot: the post would go out by itself, so the person consents on a card in the web chat first. Nothing was spent.'
        );
      }
      const channel = await ctx
        .service(IntegrationService)
        .getIntegrationsForChannelList(ctx.organizationId)
        .then((all: any[]) => all.find((one) => one.id === input.channelId))
        .catch(() => null);
      await ctx.suspend({
        kind: 'consent',
        subject: 'autopilot',
        question: AUTOPILOT_TEXT[ctx.language](String(channel?.name || input.channelId)),
        answerKey: 'consentGiven',
        canDecideForPerson: false,
        channel: channel
          ? { id: String(channel.id), name: String(channel.name ?? ''), provider: String(channel.providerIdentifier ?? '') }
          : null,
      } satisfies AutopilotQuestion);
      return undefined;
    }
    // No card to ask on (MCP): the product decides from the start, as «Решите
    // всё за меня» — one paid generation, not a question pass and then a
    // second one (review W2 F12).
    if (!ctx.suspend) return decideAll(0, false);
    // No consent was asked on this call: it never queues (review W2 F2). The
    // mode read above is only the reason to ask; the write re-reads it under
    // the channel lock.
    return firstPass(false);
  },
  summarize: (output) =>
    isDeclined(output)
      ? { pieceId: output.pieceId, channelId: output.channelId, declined: true }
      : {
          pieceId: output.pieceId,
          adaptationId: output.adaptationId,
          channelId: output.channel.id,
          variant: output.variant,
          state: output.state,
          // Answered on the card in this call: none of them is open now
          // (W3 recheck R-4 — the agent read `asked: 1` as «one question
          // waits on the post card»).
          answeredOnCard: output.asked,
          // What waits under the post is this, counted exactly and optional.
          openQuestions: output.openQuestions?.length
            ? {
                count: output.openQuestions.length,
                optional: true,
                questions: output.openQuestions,
              }
            : { count: 0 },
          ...(output.plan ? { plan: output.plan } : {}),
          ...(output.note ? { note: output.note } : {}),
        },
  cardOf: (output) =>
    isDeclined(output)
      ? null
      : {
          kind: 'adaptation',
          id: output.adaptationId,
          pieceId: output.pieceId,
          channel: output.channel,
          variant: output.variant,
        },
});

/* ---- «…и запомнить для канала» ------------------------------------------- */

type StoredProfile = {
  lengthPolicy: unknown;
  emojiLevel: string;
  linkPolicy: string;
  hashtagPolicy: string;
  ctaKind: string;
  formatPreference: string;
  notes?: string | null;
  brandProfileId?: string | null;
  /** «Как в аватаре» · на «ты» · на «вы»; sent only when a call names it. */
  addressForm?: string;
};

/**
 * The writing-profile door's body from the stored profile, as the page's
 * `buildWritingProfilePayload` makes it (the frontend cannot be imported; a
 * test holds the two together).
 */
const profilePayload = (profile: StoredProfile) => {
  const notes = (profile.notes ?? '').trim().slice(0, 500);
  const common = {
    emojiLevel: profile.emojiLevel,
    linkPolicy: profile.linkPolicy,
    hashtagPolicy: profile.hashtagPolicy,
    ctaKind: profile.ctaKind,
    formatPreference: profile.formatPreference,
    ...(notes ? { notes } : {}),
    ...(profile.brandProfileId !== undefined ? { brandProfileId: profile.brandProfileId } : {}),
  };
  if (typeof profile.lengthPolicy === 'string') return { lengthPolicy: profile.lengthPolicy, ...common };
  const { idealMin, idealMax, hardMax } = profile.lengthPolicy as {
    /** `null` — «до N знаков», no minimum (review F5). */
    idealMin: number | null;
    idealMax: number;
    hardMax?: number | null;
  };
  return {
    lengthPolicy: 'range',
    length: { idealMin, idealMax, ...(typeof hardMax === 'number' ? { hardMax } : {}) },
    ...common,
  };
};

/**
 * The channel's writing card with some fields over it, written through the
 * card's own door (`IntegrationsController.updateWritingProfile`): the stored
 * card is read first, so what is not named stays as it was
 * (`rememberedProfilePayload`). One step for «…и запомнить для канала», for
 * binding an avatar to a channel (`avatar.bind`, kcxz.18) and for the card's
 * own fields from the chat (`channel.writing`, kcxz.19).
 */
export const rememberOnChannel = async (
  ctx: Pick<CapabilityRunContext, 'organizationId' | 'service'>,
  channelId: string,
  /**
   * The fields to change, or a function of the stored card that names them.
   * `saved: false` — the card was never saved and `current` is the platform's
   * defaults, not the person's numbers (final recheck F-2a).
   */
  change:
    | Partial<StoredProfile>
    | ((current: StoredProfile, card: { saved: boolean }) => Partial<StoredProfile>)
) => {
  const integrations = ctx.service(IntegrationService);
  const read = await integrations.getWritingProfile(ctx.organizationId, channelId);
  const current = read.profile as unknown as StoredProfile;
  const overrides =
    typeof change === 'function' ? change(current, { saved: read.stored !== false }) : change;
  // The address form has no field on the card's screen; the door keeps the
  // stored one when the body does not name it, so it goes only when asked
  // (`channel.writing`, kcxz.19).
  return integrations.updateWritingProfile(ctx.organizationId, channelId, {
    ...profilePayload({ ...current, ...overrides }),
    ...(overrides.addressForm !== undefined ? { addressForm: overrides.addressForm } : {}),
  } as any);
};

export const channelWritingRemember = defineCapability({
  id: 'channel.writing.remember',
  group: 'channels',
  label: { ru: 'Запомнить для канала', en: 'Remember for the channel' },
  description:
    'Make post fields the channel’s own for every next post («…и запомнить для канала»): emoji, hashtags, links, call to action, avatar. Use it when the person says to remember or always write so for the channel, then adapt again. Reversible: the channel card can be changed back.',
  input: z.object({ channelId, ...postFields }),
  risk: 'write',
  door: door(IntegrationsController, 'updateWritingProfile'),
  untrusted: [],
  run: async (ctx, input) => {
    await rememberOnChannel(ctx, input.channelId, {
      ...(input.emojiLevel ? { emojiLevel: input.emojiLevel } : {}),
      ...(input.hashtagPolicy ? { hashtagPolicy: input.hashtagPolicy } : {}),
      ...(input.linkPolicy ? { linkPolicy: input.linkPolicy } : {}),
      ...(input.ctaKind ? { ctaKind: input.ctaKind } : {}),
      ...(input.avatarId ? { brandProfileId: input.avatarId } : {}),
    });
    const remembered = ['emojiLevel', 'hashtagPolicy', 'linkPolicy', 'ctaKind', 'avatarId'].filter(
      (key) => (input as Record<string, unknown>)[key] !== undefined
    );
    return { channelId: input.channelId, remembered };
  },
  summarize: (output) => ({ channelId: output.channelId, remembered: output.remembered }),
});

/* ---- Checks and rewrite of an adaptation --------------------------------- */

const adaptationCard = (output: { pieceId: string; adaptationId: string }) => ({
  kind: 'adaptation' as const,
  id: output.adaptationId,
  pieceId: output.pieceId,
});

type AdaptationReviewed = Reviewed & { adaptationId: string };

/** `proposeThenAccept` on an adaptation, the result naming it for the card. */
const onAdaptation =
  (capability: string, body: (input: any) => Record<string, unknown>) =>
  async (ctx: CapabilityRunContext, input: any, emit: CapabilityEmit) => {
    const reviewed = await proposeThenAccept(capability, body, (one) => one.adaptationId)(ctx, input, emit);
    return reviewed ? { ...reviewed, adaptationId: input.adaptationId as string } : undefined;
  };

/** «Убрать следы ИИ» and «Проверить факты» — the page's two checks of a post. */
const REVIEW_KINDS = { ai_traces: { mode: 'slop' }, facts: { mode: 'web', confirmWebSpend: true } } as const;

export const adaptationReview = defineCapability({
  id: 'adaptation.review',
  group: 'content',
  label: { ru: 'Проверить адаптацию', en: 'Check an adaptation' },
  description:
    'Check a draft adaptation: `ai_traces` — «Убрать следы ИИ» (clichés and AI tells), `facts` — «Проверить факты» against web sources. Paid; runs without asking. The person accepts the proposed changes on a card (or «Решите за меня»); you never choose them. Returns final counts: `applied` of `offered` went in, `declined` were left out; nothing waits after it (`waitingOnCard: 0`).',
  input: z.object({
    pieceId,
    adaptationId,
    check: z.enum(['ai_traces', 'facts']).describe('ai_traces — «Убрать следы ИИ»; facts — «Проверить факты»'),
  }),
  risk: 'paid',
  card: 'adaptation',
  door: door(ContentPieceController, 'review'),
  untrusted: [],
  suspendSchema: changeSelection,
  resumeSchema: changeAnswer,
  // The page's body (`adaptation-review.tsx` `run`).
  run: onAdaptation('adaptation.review', (input) => ({ ...REVIEW_KINDS[input.check as keyof typeof REVIEW_KINDS] })),
  proposes: (input) => proposalTarget(input.pieceId, input.adaptationId),
  summarize: (output: AdaptationReviewed) => reviewSummary(output),
  cardOf: (output: AdaptationReviewed) => (output.applied ? adaptationCard(output) : null),
});

export const adaptationRewrite = defineCapability({
  id: 'adaptation.rewrite',
  group: 'content',
  label: { ru: 'Переписать адаптацию', en: 'Rewrite an adaptation' },
  description:
    'Rewrite a draft adaptation by the person’s instruction («Переписать…»). Paid; runs without asking. Pass the instruction in their words. The person accepts the proposed changes on a card (or «Решите за меня»); you never choose them. To write a fresh variant instead, use piece.adapt again.',
  input: z.object({
    pieceId,
    adaptationId,
    instruction: z.string().min(1).max(2000).describe('What to change, in the person’s words'),
  }),
  risk: 'paid',
  card: 'adaptation',
  door: door(ContentPieceController, 'rewriteAdaptation'),
  untrusted: [],
  suspendSchema: changeSelection,
  resumeSchema: changeAnswer,
  run: onAdaptation('adaptation.rewrite', (input) => ({ instruction: String(input.instruction).trim() })),
  proposes: (input) => proposalTarget(input.pieceId, input.adaptationId),
  summarize: (output: AdaptationReviewed) => reviewSummary(output),
  cardOf: (output: AdaptationReviewed) => (output.applied ? adaptationCard(output) : null),
});

/* ---- Hand edit, picture, delete ------------------------------------------ */

export const adaptationEdit = defineCapability({
  id: 'adaptation.edit',
  group: 'content',
  label: { ru: 'Заменить текст адаптации', en: 'Replace an adaptation’s text' },
  description:
    'Replace the text of a draft adaptation with a text the person gave, verbatim (the hand edit). Not for writing: to change it with AI use adaptation.rewrite.',
  input: z.object({
    pieceId,
    adaptationId,
    text: z.string().min(1).max(20000).describe('The new post text, the person’s words verbatim'),
  }),
  risk: 'write',
  card: 'adaptation',
  door: door(ContentPieceController, 'editAdaptation'),
  untrusted: [],
  run: async (ctx, input) => {
    // `buildAdaptationPatch({ body })`.
    await ctx
      .service(PieceService)
      .editAdaptation(ctx.organizationId, input.pieceId, input.adaptationId, { body: input.text }, ctx.language);
    return { pieceId: input.pieceId, adaptationId: input.adaptationId, edited: true };
  },
  summarize: (output) => ({ ...output }),
  cardOf: adaptationCard,
});

export const adaptationImage = defineCapability({
  id: 'adaptation.image',
  group: 'media',
  label: { ru: 'Картинка к адаптации', en: 'Picture for an adaptation' },
  description:
    'Set a picture from the workspace media library on a draft adaptation, by media id, or take it off with `mediaId: null`. The server takes the file from the library itself.',
  input: z.object({
    pieceId,
    adaptationId,
    mediaId: z.string().min(1).max(128).nullable().describe('Media library id; null takes the picture off'),
  }),
  risk: 'write',
  card: 'adaptation',
  door: door(ContentPieceController, 'editAdaptation'),
  untrusted: [],
  run: async (ctx, input) => {
    // `buildAdaptationPatch({ image })`: only the library id goes.
    await ctx.service(PieceService).editAdaptation(
      ctx.organizationId,
      input.pieceId,
      input.adaptationId,
      { image: input.mediaId ? { id: input.mediaId } : null },
      ctx.language
    );
    return { pieceId: input.pieceId, adaptationId: input.adaptationId, image: input.mediaId !== null };
  },
  summarize: (output) => ({ ...output }),
  cardOf: adaptationCard,
});

export const adaptationDelete = defineCapability({
  id: 'adaptation.delete',
  group: 'content',
  label: { ru: 'Удалить адаптацию', en: 'Delete an adaptation' },
  description:
    'Delete one adaptation of a piece for good, with its draft post. The person approves it on a card first. A published adaptation cannot be deleted.',
  input: z.object({ pieceId, adaptationId }),
  risk: 'confirm',
  door: door(ContentPieceController, 'deleteAdaptation'),
  untrusted: [],
  // What and where from the stored rows, in the caller's workspace.
  describeApproval: async (ctx, input) => {
    const ru = ctx.language === 'ru';
    const detail = await ctx
      .service(PieceService)
      .detail(ctx.organizationId, input.pieceId, ctx.language)
      .catch(() => null);
    const row = detail?.adaptations?.find((one: any) => one.id === input.adaptationId) as any;
    if (!detail || !row) {
      return ru
        ? `Удалить адаптацию ${input.adaptationId} — в этом пространстве её нет, удалять нечего`
        : `Delete adaptation ${input.adaptationId} — there is no such adaptation in this workspace`;
    }
    const channel = String(row.integrationName || row.platform || (ru ? 'канал' : 'channel'));
    return ru
      ? `Удалить адаптацию заготовки ${detail.piece.code} для канала «${channel}» вместе с её черновиком`
      : `Delete the adaptation of piece ${detail.piece.code} for “${channel}” with its draft`;
  },
  run: async (ctx, input) => {
    await ctx.service(PieceService).deleteAdaptation(ctx.organizationId, input.pieceId, input.adaptationId);
    return { pieceId: input.pieceId, adaptationId: input.adaptationId, deleted: true };
  },
  summarize: (output) => ({ ...output }),
});
