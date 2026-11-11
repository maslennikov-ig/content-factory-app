import { startNativeAdaptationSeries, resumeNativeAdaptationSeries } from '../../conductor/native-adaptation-series';
import { z } from 'zod';
import { McpMediaUploadServiceV1 } from '@contentfactory/nestjs-libraries/chat/media/mcp-media-upload.service.v1';
import { writingSettingsWithinLimit, writingLengthOptionsSchema } from '@contentfactory/helpers/utils/writing-settings';
import { questionCardView } from '../question-card';
import { writingSettingsQuestionFields, writingSettingsAnswerSchema, writingSettingsCheckpoint, channelWritingSettings, hasWritingProposal, proposedWritingSettings, settingsProfileFingerprint, writingSettingsDiffer, writingSettingsOverrides } from '../writing-settings-proposal';
import { domainQuestionSchema, domainQuestionAnswer, isDomainQuestionCard, createDomainQuestionCard, domainQuestionRevision, continueDomainQuestions, type ManualDomainQuestion } from '../domain-questions';
import { ContentPieceController } from '@contentfactory/backend/api/routes/content-piece.controller';
import { IntegrationsController } from '@contentfactory/backend/api/routes/integrations.controller';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import { readResolvedWritingSelection } from '../../conductor/work-context';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { EMOJI_STOPS } from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';
import { CHANNEL_MIN_IDEAL_LENGTH } from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile';
import { POST_LINK_MAX, POST_LINK_PATTERN, POST_LINK_TEXT_MAX } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/post-link';
import {
  AGENT_DECIDE_FOR_PERSON_KEY,
  type BrandVoiceFactScoreSummary,
} from '../agent-parts.contract';
import { scoreBrandVoiceAndFacts } from '../../scorers/brand-voice-facts.scorer';
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
import { QUOTED_QUESTION_MAX, codedFailure, eventFailure, shortQuestion, unspentFailure } from './selection';
import { ConfirmationNeeded } from '../mcp-confirmation';
import { wrapUntrusted } from '../untrusted-data';
import { originalAuthorRequestSchema, proposalTarget } from '../capability.context';
import { withAdaptationOpening } from '@contentfactory/nestjs-libraries/agent/adaptation-coverage';
import { adaptationReferenceUrls } from '@contentfactory/nestjs-libraries/agent/generator-run-input';
import type { AdaptationQualityReviewV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

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
const postAdaptFields = {
  length: z.enum(['shorter', 'channel', 'longer']).optional().describe('Relative to the channel length; lengthPolicy takes precedence when both are supplied.'),
  takeaway: z.string().max(500).optional().describe('A takeaway grounded in the actual task and material; preserve the author’s views.'),
  postLink: z.string().max(POST_LINK_MAX).regex(POST_LINK_PATTERN).optional().describe('A supplied or selected-source http(s) link appropriate to the request, or none when requested; preserve an explicit existing link and never invent a promotional link.'),
  postLinkText: z.string().max(POST_LINK_TEXT_MAX).optional().describe('Anchor text for the selected post link; preserve explicit author wording, or omit for the writer to choose.'),
  lengthPolicy: z.enum(['auto', 'range']).optional().describe('Per-post length: auto lets the model choose for the material; range uses lengthRange. Follow the actual author task and technical platform limit; the channel numeric default is only an explicit fallback in native chat.'),
  lengthRange: z.object({
    idealMin: z.number().int().min(CHANNEL_MIN_IDEAL_LENGTH).nullable().optional(),
    idealMax: z.number().int().min(CHANNEL_MIN_IDEAL_LENGTH),
    hardMax: z.number().int().min(CHANNEL_MIN_IDEAL_LENGTH).max(100_000).nullable().optional(),
  }).optional().describe('For lengthPolicy range: idealMin may be omitted or null for no minimum; hardMax is an optional explicit ceiling.'),
};

/* ---- The interview card --------------------------------------------------- */

/**
 * The adaptation interview (`AgentInterviewQuestionPayload`): the model's
 * questions for this channel, each with the suggested answer, finite options
 * and why it is asked; the person answers some in their words, confirms a
 * suggestion («Так и есть»), gives some to us, or all («Решите за меня»).
 */
const authorReferences = z.array(z.string().min(1).max(2_000)).max(64).optional();
const writingCheckpoint = z.object({ channelId: channelId, avatarId: z.string().min(1).max(128).optional() }).strict();
const adaptationContinuation = z.object({
  currentAuthorRequest: originalAuthorRequestSchema.shape.text.optional(), writingSelection: writingCheckpoint.optional(), skipInterview: z.boolean().optional(),
  settingsDecision: writingSettingsCheckpoint.optional(),
  settingsProposal: z.object({pieceId: z.string(), profileFingerprint: z.string(), sourceRevision: z.string()}).strict().optional(),
});
const writingSettingsQuestion = z.object({...writingSettingsQuestionFields,
  continuation: adaptationContinuation, authorReferenceUrls: authorReferences,
});

const interviewQuestion = z.object({
  kind: z.literal('interview'),
  continuation: adaptationContinuation.optional(),
  /** Trusted server payload only, never taken from the person's card answer. */
  authorReferenceUrls: authorReferences,
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
const adaptAnswer = z.union([autopilotAnswer, interviewAnswer, domainQuestionAnswer, writingSettingsAnswerSchema]);

/**
 * Consent to write into an autopilot channel (spec §1.4, premortem A1): the
 * new post would take its place in the queue and go out without a further
 * act. Only the person answers; there is no «Решите за меня». The answer key
 * rides in the payload, so a reloaded card knows it.
 */
const autopilotQuestion = z.object({
  kind: z.literal('consent'),
  continuation: adaptationContinuation.optional(),
  authorReferenceUrls: authorReferences,
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
const adaptQuestion = z.union([autopilotQuestion, interviewQuestion, domainQuestionSchema, writingSettingsQuestion]);

const INTERVIEW_TEXT = {
  ru: 'Пара вопросов, чтобы пост получился вашим. Ответьте или явно выберите «Решите за меня».',
  en: 'A couple of questions so the post sounds like you. Answer or explicitly choose “Decide for me”.',
};

type AdaptPending = { pieceId: string; runId: string; status: string; generated: boolean; nativeStatus?: string; saved: false; saveFailure?: unknown };
const isPending = (value: Adapted | AdaptDeclined | AdaptPending): value is AdaptPending => 'saved' in value && value.saved === false;

type SavedSeriesPart = Awaited<ReturnType<PieceService['persistSeriesAdaptation']>>['parts'][number];

type Adapted = {
  writingSettings?: {scope: 'post' | 'drafts'; action: 'apply' | 'keep-channel'; current: z.infer<typeof writingSettingsCheckpoint>['current']; settings: z.infer<typeof writingSettingsCheckpoint>['settings']};
  presentationReason?: string;
  series?: { id: string; index: number; total: number };
  parts?: Array<SavedSeriesPart & { index: number; total: number }>;
  pieceId: string;
  adaptationId: string;
  channel: { id: string; name: string; provider: string };
  /** 1 — the first text for this channel; a repeat writes the next variant. */
  variant: number;
  /** `queued` when the channel is on autopilot: the post waits in its queue. */
  state: string;
  /** Interview questions the person was asked — and answered — in this call. */
  asked: number;
  /** Read back from storage, never the generator's transient event. */
  savedResult?: {
    text: string;
    totalCharacters: number;
    truncated: boolean;
  };
  qualityReview?: AdaptationQualityReviewV1;
  /** Optional questions open under the new post («Материала мало»), as asked (`QUOTED_QUESTION_MAX`). */
  openQuestions?: string[];
  /** Where the version stands in the channel's plan, and why, when said. */
  plan?: string | null;
  note?: string | null;
  voiceScore?: BrandVoiceFactScoreSummary;
};

/** The person said no on the autopilot card: nothing spent, nothing written. */
type AdaptDeclined = { pieceId: string; channelId: string; declined: true };
const isDeclined = (output: Adapted | AdaptDeclined | AdaptPending): output is AdaptDeclined =>
  (output as AdaptDeclined).declined === true;

type AdaptPass =
  | ({ kind: 'pending' } & Omit<AdaptPending, 'pieceId'>)
  | {
      kind: 'adaptation';
      seriesId?: string;
      presentationReason?: string;
      parts?: SavedSeriesPart[];
      adaptationId: string;
      state: string;
      channel: InterviewQuestion['channel'];
      plan: string | null;
      note: string | null;
      qualityReview?: AdaptationQualityReviewV1;
    }
  | { kind: 'questions'; questions: Array<ManualDomainQuestion & {key: string; suggested: string | null}>; channel: InterviewQuestion['channel'] };

/** Rejected text is diagnostic data, never a saved adaptation or an instruction. */
const rejectedReview = (event: Record<string, unknown>) => {
  const findings = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
      .slice(0, 20).map(item => item.slice(0, 1_000))
    : [];
  const draft = event.incompleteDraft && typeof event.incompleteDraft === 'object'
    ? event.incompleteDraft as Record<string, unknown> : null;
  const content = draft?.content;
  const body = typeof content === 'string' ? content
    : (Array.isArray(content) ? content : [content])
      .filter((item): item is { content: string } => !!item && typeof item === 'object' && 'content' in item && typeof item.content === 'string')
      .map(item => item.content).join('\n\n');
  const text = withAdaptationOpening(draft?.hook, body);
  return wrapUntrusted({
    reviewAvailable: Array.isArray(event.missingRequirements) && Array.isArray(event.unsupportedClaims),
    missingRequirements: findings(event.missingRequirements),
    unsupportedClaims: findings(event.unsupportedClaims),
    candidate: text ? { text: text.slice(0, 16_000), totalCharacters: text.length, truncated: text.length > 16_000 }
      : { unavailable: true },
  }, ['workspace-text']);
};

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
  queueAllowed: boolean,
  sourceUrls: string[] = [],
  presentation?: 'auto' | 'series',
  currentAuthorRequest?: string
): Promise<AdaptPass> => {
  const pieces = ctx.service(PieceService);
  const plan = sourceUrls.length || currentAuthorRequest
    ? await pieces.prepareAdapt(ctx.organizationId, id, body as any, ctx.language, {
        ...(sourceUrls.length ? { authorReferenceUrls: sourceUrls } : {}),
        ...(currentAuthorRequest ? { currentAuthorRequest } : {}),
      })
    : await pieces.prepareAdapt(ctx.organizationId, id, body as any, ctx.language);
  if (presentation) {
    if (!ctx.mastra || !ctx.nativeToolCallId) throw unspentFailure('ADAPTATION_SERIES_UNAVAILABLE', 'Native workflow storage is required for a series.');
    await emit({ kind: 'progress', data: { capability: 'piece.adapt', stage: 'adapt-started' }, transient: true });
    const outcome = await startNativeAdaptationSeries(ctx.mastra, {
      organizationId: ctx.organizationId, userId: ctx.userId, plan, presentation,
    }, ctx.nativeToolCallId, ctx.requestContext, ctx.abortSignal);
    if (outcome.status !== 'success') return { kind: 'pending', ...outcome };
    const saved = outcome.result;
    const channel = { id: plan.channel.id, name: plan.channel.name, provider: plan.channel.providerIdentifier };
    if (saved.kind === 'questions') return { kind: 'questions', questions: saved.questions, channel };
    return { kind: 'adaptation', adaptationId: saved.parts[0].adaptationId, parts: saved.parts,
      seriesId: saved.seriesId, channel, state: 'draft', plan: null, note: null,
      ...(saved.presentationReason ? { presentationReason: saved.presentationReason } : {}),
      ...(saved.qualityReview ? { qualityReview: saved.qualityReview } : {}) };
  }
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
          ...(typeof one?.ownOption === 'string' ? { ownOption: one.ownOption } : {}),
          ...(one?.selectionMode === 'multiple' ? { selectionMode: 'multiple' as const } : {}),
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
        ...(named.qualityReview ? { qualityReview: named.qualityReview } : {}),
      };
    }
    if (named.name === 'error') {
      if (named.code === 'CONTENT_ADAPTATION_INCOMPLETE') {
        // Unlike transient progress, preserve the actual failed review in the
        // native thread so a generic tool refusal cannot erase its evidence.
        await emit({ kind: 'progress', data: {
          capability: 'piece.adapt', stage: 'error', code: named.code, saved: false,
          qualityReview: rejectedReview(named),
        } });
      }
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
  const saved = index >= 0 ? rows[index] : null;
  const text = typeof saved?.body === 'string' ? saved.body : '';
  const core = (detail as any).core;
  let voiceScore: BrandVoiceFactScoreSummary | undefined = (saved as { voiceScore?: BrandVoiceFactScoreSummary } | null)?.voiceScore;
  if (!voiceScore && saved?.checks) {
    voiceScore = await scoreBrandVoiceAndFacts(
      {
        organizationId: ctx.organizationId,
        locale: ctx.language,
        platform: saved?.platform ?? 'core',
        facts: Array.isArray(core?.brief?.facts) ? core.brief.facts : 0,
        voiceCheck: saved.checks.voice ?? null,
      },
      {
        text,
        entityId: written,
        entityType: 'adaptation',
      }
    );
  }
  return {
    variant: index < 0 ? rows.length : index + 1,
    openQuestions: questions,
    ...(ask?.adaptationId === written && ask.questions?.length
      ? { materialAsk: ask, questionRevision: domainQuestionRevision(detail, {kind: 'adaptation', channelId: channel}) } : {}),
    ...(text ? { savedResult: {
      text: text.slice(0, 16_000),
      totalCharacters: text.length,
      truncated: text.length > 16_000,
    } } : {}),
    ...(voiceScore ? { voiceScore } : {}),
  };
};

export const pieceAdapt = defineCapability({
  id: 'piece.adapt',
  group: 'content',
  label: { ru: 'Адаптировать под канал', en: 'Adapt for a channel' },
  description:
    'Write a piece for one channel («Адаптировать»). Use presentation auto to choose one post or a semantic series from the complete material, save each as a separate DRAFT without queueing. Use series for an explicit series; single opts into the legacy one-post placement/consent flow below. Never reduce research scope or omit author views just to fit one post. If saving is pending, use piece.series.resume with its runId; do not generate again. Paid. In chat, propose lengthOptions tailored to the task before generation; the channel numeric default is for manual generation and is not the primary agent choice or ceiling. Other writing preferences start from the channel. Per-post setting changes pause on an editable human card before spending; never answer it yourself. Autopilot also asks separately: into a channel on autopilot, where the person first consents, because the post would go out by itself: on a card in the web chat (a «no» ends the call, nothing written); over MCP the call answers `needsConfirmation` with a question you ask the person, and after their «да» you call again with its `confirmation` code. The first text for a channel may ask the person a few questions on a card (they answer or say «Решите за меня»); you never answer them. Adapting again for the same channel writes a new variant; the old one stays. You may propose per-post length, emoji, hashtags, link placement and call to action with settingsReason explaining the benefit. The human card selects or edits the task-specific size and other proposed settings. Omit other style fields to retain those preferences; never omit the native length proposal merely to inherit the channel range. A wish or delegated editorial choice is not silent permission to change configured values. Apply only to this post; use channel.writing only after a separate explicit request to save channel defaults. Preserve explicit author requirements and technical platform limits. Let the person explicitly choose the manual channel length only as a fallback; do not anchor all proposals to it. Put an actual author wish in `wish`. Ground the takeaway and links in the task and supplied sources; preserve the author’s views, explicit link and avatar choices, and never invent a promotional link. After consent the post waits in the channel queue (`state: queued`): say so. Even with consent it may stay planned (`plan: reserved` with a `note`, e.g. an earlier version the person scheduled stays queued): say the note as given and do not call it queued. Without consent on this call it never queues — if the channel went on autopilot meanwhile, the post stays planned (`plan: reserved` with a `note`); offer plan.schedule, which the person approves. Returns ids, the variant number, the state and the plan; the text is on the card. qualityReview is advisory: partial or unavailable review does not undo the saved draft. The existing pre-save Telegram review may correct generated text and returns applied corrections separately from remaining findings. Report those actual results; do not repeat paid checks to chase a passing verdict. Assess the task, headline, useful detail and requested depth before generation; propose 2–3 distinct suitable numeric lengthOptions with one recommendation, rather than treating the channel range as a ceiling. If an exact numeric size was already requested, propose that range directly. Reuse the same card for choice, editing and confirmation; never ask twice. An unresolved length conflict should lead to that specific settings choice, not only a warning. Never bypass the card or alter channel defaults. `answeredOnCard` counts questions already answered in this call — none of them waits. `openQuestions` is what waits under the post: optional questions for more material, with their exact count; when you mention them, say that count, that they are optional, and quote them in «» word for word, as given.',
  input: z.object({
    pieceId,
    channelId: channelId.optional(),
    presentation: z.enum(['auto', 'series', 'single']).optional().describe('auto chooses one post or a semantic series from the complete material; series requests multiple posts. Both save separate drafts without scheduling. single preserves one-post placement behavior.'),
    kind: z.enum(ADAPT_KINDS).optional().describe('post (default), caption, article or newsletter'),
    skipInterview: z.boolean().optional().describe('When the person asks to skip questions to the author, skip both the interview and optional material questions for this adaptation. This does not suppress a question addressed to readers in the post or override the channel CTA.'),
    wish: z.string().max(500).optional().describe('The person’s wish for this post, verbatim; it does not override approved numeric/settings constraints'),
    settingsReason: z.string().trim().min(1).max(1000).optional().describe('Explain why the proposed settings suit this post; shown beside before/after values for human approval.'),
    lengthOptions: writingLengthOptionsSchema.optional().describe('In chat, offer 2–3 distinct numeric ranges tailored to this material, each with a useful label and tradeoff; recommend exactly one. The person chooses or edits on the existing card before generation. Channel default length does not constrain these options; respect only the provider limit and the actual request. For an already explicit numeric request use lengthPolicy range/lengthRange, or auto when the person explicitly delegates size.'),
    ...postFields,
    emojiLevel: EMOJI.optional().describe('Per-post emoji density; choose when delegated, respecting the author and channel.'),
    hashtagPolicy: HASHTAGS.optional().describe('Per-post hashtag policy; choose when delegated, respecting the author and channel.'),
    linkPolicy: LINKS.optional().describe('Per-post link placement; choose when delegated, respecting the author and channel.'),
    ctaKind: CTA.optional().describe('Per-post call to action; choose when delegated, respecting the author and channel.'),
    ...postAdaptFields,
  }),
  risk: 'paid',
  // Over MCP the autopilot consent is asked in the conversation (`kcxz.49`).
  mcpConfirm: 'ask',
  card: 'adaptation',
  door: door(ContentPieceController, 'adapt'),
  untrusted: [],
  suspendSchema: adaptQuestion,
  resumeSchema: adaptAnswer,
  run: async (ctx, input, emit): Promise<Adapted | AdaptDeclined | AdaptPending | undefined> => {
    const selected = ctx.entrance === 'chat' ? readResolvedWritingSelection(ctx.requestContext) : undefined;
    const storedQuestion = ctx.resumeData !== undefined ? adaptQuestion.safeParse(ctx.suspendPayload) : null;
    const savedWriting = storedQuestion?.success ? writingCheckpoint.safeParse(storedQuestion.data.continuation?.writingSelection) : null;
    const targetChannel = (savedWriting?.success ? savedWriting.data.channelId : undefined) || input.channelId || selected?.selection.channelId;
    if (!targetChannel) throw unspentFailure('CAPABILITY_INPUT_INVALID', 'A channel selection is required. Read channels.list, then ask the person to select the destination through ask_user before continuing this adaptation. Nothing was generated.');
    const avatarId = savedWriting?.success ? savedWriting.data.avatarId : input.avatarId || selected?.selection.avatarId;
    const range = input.lengthRange;
    if ((input.lengthPolicy === 'range') !== Boolean(range) ||
        (range && ((range.idealMin != null && range.idealMin > range.idealMax) ||
          (range.hardMax != null && range.hardMax < range.idealMax)))) {
      throw unspentFailure('CAPABILITY_INPUT_INVALID', 'Use lengthRange only with range; keep idealMin <= idealMax <= hardMax when those bounds are present.');
    }
    const pieces = ctx.service(PieceService);
    const presentation = input.presentation === 'single' ? undefined : input.presentation;
    // Native author text is read by the owned-chat resolver, never reconstructed
    // from a shortened tool wish. Server-stored references survive question resumes.
    const author = ctx.entrance === 'chat' ? await ctx.resolveAuthorRequest?.({}) : null;
    // A resume's current author record may be the answer (e.g. "yes"), not
    // the original assignment. Only the server-held checkpoint can carry it.
    const storedContinuation = storedQuestion?.success ? storedQuestion.data.continuation : undefined;
    const skipInterview = typeof storedContinuation?.skipInterview === 'boolean'
      ? storedContinuation.skipInterview : input.skipInterview === true;
    const storedRequest = storedContinuation?.currentAuthorRequest;
    const currentAuthorRequest = ctx.entrance === 'chat'
      ? ctx.resumeData === undefined ? author?.text : typeof storedRequest === 'string' ? storedRequest : undefined
      : undefined;
    let settingsDecision = writingSettingsCheckpoint.safeParse(storedContinuation?.settingsDecision);
    const requestMetadata = { ...(currentAuthorRequest ? { currentAuthorRequest } : {}), skipInterview,
      ...(ctx.entrance === 'chat' ? { writingSelection: { channelId: targetChannel, ...(avatarId ? { avatarId } : {}) } } : {}) };
    const sourceUrls = ctx.entrance === 'chat' && ctx.resolveAuthorRequest ? adaptationReferenceUrls(
      ...(storedQuestion?.success ? storedQuestion.data.authorReferenceUrls || [] : []), ...(author ? [author.text] : [])
    ) : [];
    const referenceMetadata = sourceUrls.length ? { authorReferenceUrls: sourceUrls } : {};
    const wish = input.wish?.trim();
    let settingsAnswered = false;
    let approvedOverrides: ReturnType<typeof writingSettingsOverrides> = {};
    const settingsCard = writingSettingsQuestion.safeParse(ctx.suspendPayload);
    // Current native chat has an exact author-request record. Legacy snapshots
    // without that record retain their existing continuation; manual/API callers
    // still use the channel profile. A model cannot opt out of native provenance.
    const taskLengthChoice = ctx.entrance === 'chat' && Boolean(currentAuthorRequest);
    if (taskLengthChoice && ctx.resumeData === undefined && !settingsDecision.success &&
        !input.lengthOptions && !input.lengthPolicy) {
      throw unspentFailure('CAPABILITY_INPUT_INVALID', 'Before generating, propose 2–3 task-specific lengthOptions with one recommendation. Do not inherit the manual channel length. If the person already specified an exact size, provide lengthPolicy range/lengthRange; if they explicitly delegated size, propose auto. The person confirms on the native card. Nothing was generated.');
    }
    if (input.lengthOptions && !writingLengthOptionsSchema.safeParse(input.lengthOptions).success) {
      throw unspentFailure('CAPABILITY_INPUT_INVALID', 'Provide 2–3 distinct valid lengthOptions with unique ids and exactly one recommendation.');
    }
    if (settingsDecision.success || hasWritingProposal(input) || settingsCard.success) {
      const integrations = ctx.service(IntegrationService);
      const read = await integrations.getWritingProfile(ctx.organizationId, targetChannel);
      const current = channelWritingSettings(read.profile);
      const fingerprint = settingsProfileFingerprint(read.profile);
      const maxCharacters = read.provider.maxLength;
      if (settingsDecision.success) {
        const saved = settingsDecision.data;
        if (saved.pieceId !== input.pieceId || saved.channelId !== targetChannel || saved.profileFingerprint !== fingerprint || !writingSettingsWithinLimit(saved.settings, maxCharacters)) {
          throw unspentFailure('INPUT_NEEDS_PERSON', 'The channel settings changed. Propose the current values again before generating.');
        }
        approvedOverrides = writingSettingsOverrides(saved.current, saved.settings);
      } else if (ctx.resumeData !== undefined && settingsCard.success) {
        const proposal = settingsCard.data.continuation.settingsProposal;
        const answer = writingSettingsAnswerSchema.safeParse(ctx.resumeData);
        const detail = await pieces.detail(ctx.organizationId, input.pieceId, ctx.language);
        if (!answer.success || !proposal || proposal.pieceId !== input.pieceId || proposal.profileFingerprint !== fingerprint ||
          proposal.sourceRevision !== domainQuestionRevision(detail, {kind: 'piece'})) {
          throw unspentFailure('INPUT_NEEDS_PERSON', 'The material or channel settings changed, or the answer does not fit this card. Propose the current values again.');
        }
        const settings = answer.data.action === 'apply' ? answer.data.settings : current;
        if (!writingSettingsWithinLimit(settings, maxCharacters)) throw unspentFailure('INPUT_NEEDS_PERSON', `The range exceeds the platform limit of ${maxCharacters} characters. Edit the range before generating.`);
        settingsDecision = writingSettingsCheckpoint.safeParse({scope: settingsCard.data.scope, pieceId: input.pieceId, channelId: targetChannel,
          profileFingerprint: fingerprint, current, settings, action: answer.data.action});
        approvedOverrides = writingSettingsOverrides(current, settings);
        settingsAnswered = true;
        await emit({kind: 'progress', data: {capability: 'piece.adapt', stage: 'writing-settings-confirmed',
          question: questionCardView(settingsCard.data), answer: answer.data}});
      } else {
        const proposed = proposedWritingSettings(current, input);
        if (input.lengthOptions?.some(option => !writingSettingsWithinLimit({...current, lengthPolicy: 'range', lengthRange: option.lengthRange}, maxCharacters))) {
          throw unspentFailure('CAPABILITY_INPUT_INVALID', `Every length option must fit the platform limit of ${maxCharacters} characters per post. Propose a coherent series when the material needs more, not a range beyond the platform limit.`);
        }
        if (writingSettingsDiffer(current, proposed) || input.lengthOptions || taskLengthChoice) {
          if (!ctx.suspend || ctx.resumeData !== undefined) throw unspentFailure('INPUT_NEEDS_PERSON', 'Approve the proposed per-post settings in the chat card, or omit overrides to follow the channel. Nothing was generated.');
          const rows = await integrations.getIntegrationsForChannelList(ctx.organizationId);
          const channel = rows.find(row => row.id === targetChannel);
          const detail = await pieces.detail(ctx.organizationId, input.pieceId, ctx.language);
          await ctx.suspend({kind: 'writing-settings', scope: presentation ? 'drafts' : 'post', maxCharacters,
            question: ctx.language === 'ru' ? 'Какой объём выберем для этого материала?' : 'How much detail should this material have?',
            reason: input.settingsReason || (ctx.language === 'ru' ? 'Выберите подходящий объём или задайте свой перед генерацией. Настройки длины канала используются только по вашему выбору.' : 'Choose a suitable size or edit it before generation. The channel length applies only if you choose it.'),
            ...(input.lengthOptions ? {lengthOptions: input.lengthOptions} : {}),
            current, proposed, channel: {id: targetChannel, name: channel?.name || targetChannel, provider: read.providerIdentifier},
            canDecideForPerson: false, ...referenceMetadata,
            continuation: {...requestMetadata, settingsProposal: {pieceId: input.pieceId, profileFingerprint: fingerprint,
              sourceRevision: domainQuestionRevision(detail, {kind: 'piece'})}},
          });
          return undefined;
        }
      }
    }
    // A trusted checkpoint survives every later interview/autopilot suspension.
    const continuedRequestMetadata = {...requestMetadata, ...(settingsDecision.success ? {settingsDecision: settingsDecision.data} : {})};
    // `buildAdaptPayload` with `adaptOverrides`: only what differs from the
    // channel, which is what the person named.
    const overrides = {
      ...approvedOverrides,
      ...(avatarId ? { brandProfileId: avatarId } : {}),
      ...(input.takeaway ? { takeaway: input.takeaway } : {}),
      ...(input.postLink ? { postLink: input.postLink } : {}),
      ...(input.postLinkText ? { postLinkText: input.postLinkText } : {}),
      ...(wish ? { wish } : {}),
    };
    const body = (extra: Record<string, unknown> = {}) => ({
      integrationId: targetChannel,
      kind: input.kind ?? 'post',
      ...(skipInterview ? { skipInterview: true } : {}),
      ...extra,
      ...(Object.keys(overrides).length ? { overrides } : {}),
    });
    const finished = async (pass: AdaptPass, asked: number, skipQuestions = skipInterview): Promise<Adapted | AdaptPending | undefined> => {
      if (pass.kind === 'pending') return { pieceId: input.pieceId, runId: pass.runId, status: pass.status, generated: pass.generated, nativeStatus: pass.nativeStatus, saved: false, saveFailure: pass.saveFailure };
      if (pass.kind !== 'adaptation') {
        throw codedFailure('GENERATION_FAILED', 'The adaptation could not be written.');
      }
      const written = await writtenOf(ctx, input.pieceId, targetChannel, pass.adaptationId);
      const result: Adapted = {
        pieceId: input.pieceId,
        ...(settingsDecision.success ? {writingSettings: {scope: settingsDecision.data.scope, action: settingsDecision.data.action, current: settingsDecision.data.current, settings: settingsDecision.data.settings}} : {}),
        ...(pass.presentationReason ? { presentationReason: pass.presentationReason } : {}),
        ...(pass.parts && pass.seriesId ? {
          series: { id: pass.seriesId, index: 1, total: pass.parts.length },
          parts: pass.parts.map((part, index) => ({ ...part, index: index + 1, total: pass.parts!.length })),
        } : {}),
        adaptationId: pass.adaptationId,
        channel: (pass.channel as Adapted['channel'] | null) ?? { id: targetChannel, name: '', provider: '' },
        variant: written.variant,
        state: pass.state,
        asked,
        ...(written.savedResult ? { savedResult: written.savedResult } : {}),
        ...(!skipQuestions && written.openQuestions.length ? { openQuestions: written.openQuestions } : {}),
        ...(written.voiceScore ? { voiceScore: written.voiceScore } : {}),
        ...(pass.qualityReview ? { qualityReview: pass.qualityReview } : {}),
        plan: pass.plan,
        note: pass.note,
      };
      if (result.parts && result.series) {
        for (const part of result.parts.slice(1)) await emit({ kind: 'adaptation', data: {
          id: part.adaptationId, pieceId: result.pieceId, channel: result.channel,
          series: { id: result.series.id, index: part.index, total: part.total },
        } });
      }
      if (!skipQuestions && ctx.suspend && written.materialAsk) {
        await emit({kind: 'adaptation', data: {id: result.adaptationId, pieceId: result.pieceId,
          ...(result.qualityReview ? { qualityReview: wrapUntrusted(result.qualityReview, ['workspace-text']) } : {})}});
        await ctx.suspend(createDomainQuestionCard({kind: 'adaptation', pieceId: input.pieceId, channelId: targetChannel,
          revision: written.questionRevision!}, written.materialAsk.questions,
          ctx.language === 'ru' ? 'Черновик сохранён. Можно дополнить материал — ответьте или выберите «Решите за меня», чтобы оставить пробелы без выдуманных фактов.'
            : 'The draft is saved. Add material by answering, or choose “Decide for me” to retain the gaps without inventing facts.',
          { ...referenceMetadata, continuation: {operation: 'adaptation-material', adaptationId: result.adaptationId, result, ...continuedRequestMetadata} }));
        return undefined;
      }
      return result;
    };
    // «Решите всё за меня» on the page: the interview is skipped. A second
    // question round lands here too, as the page's limit of two rounds does:
    // that is a second service admission inside the call's one paid slot.
    const decideAll = async (asked: number, queueAllowed: boolean) =>
      finished(await adaptPass(ctx, input.pieceId, body({ skipInterview: true }), emit, queueAllowed, sourceUrls, presentation, currentAuthorRequest), asked, true);

    // The first request of the page, or the interview pause after it.
    const askInterview = async (pass: Extract<AdaptPass, {kind: 'questions'}>, queueAllowed: boolean,
      previousAnswers: unknown[] = [], previousDecideKeys: string[] = []): Promise<undefined> => {
      const detail = await pieces.detail(ctx.organizationId, input.pieceId, ctx.language);
      await ctx.suspend!(createDomainQuestionCard({kind: 'adaptation', pieceId: input.pieceId, channelId: targetChannel,
        revision: domainQuestionRevision(detail, {kind: 'adaptation', channelId: targetChannel})}, pass.questions,
        INTERVIEW_TEXT[ctx.language], {
          ...referenceMetadata,
          ...(queueAllowed ? {afterConsent: true as const} : {}),
          continuation: {operation: 'adaptation-interview', channel: pass.channel, previousAnswers, previousDecideKeys, ...continuedRequestMetadata},
        }));
      return undefined;
    };
    const firstPass = async (queueAllowed: boolean): Promise<Adapted | AdaptPending | undefined> => {
      const pass = await adaptPass(ctx, input.pieceId, body(), emit, queueAllowed, sourceUrls, presentation, currentAuthorRequest);
      if (pass.kind !== 'questions') return finished(pass, 0);
      if (!pass.questions.length) return decideAll(0, queueAllowed);
      return askInterview(pass, queueAllowed);
    };

    if (ctx.resumeData !== undefined && !settingsAnswered) {
      if (isDomainQuestionCard(ctx.suspendPayload)) {
        const card = await continueDomainQuestions(ctx);
        if (!card) return undefined;
        if (card.source.kind === 'adaptation' && card.source.pieceId === input.pieceId &&
          card.source.channelId === targetChannel && card.continuation?.operation === 'adaptation-material') {
          const answers = card.answers.filter(answer => answer.mode !== 'delegate').map(answer => ({key: answer.key as any, text: answer.text!}));
          const adaptationId = String(card.continuation.adaptationId);
          const applied = await pieces.materialQuestions(ctx.organizationId, input.pieceId, targetChannel,
            answers.length ? {adaptationId, answers} : {adaptationId, dismiss: true}, ctx.language);
          if (!answers.length || applied.state !== 'answered') {
            const {openQuestions: _closed, ...saved} = card.continuation.result as Adapted;
            return {...saved, asked: saved.asked + card.questions.length};
          }
          // The standalone manual flow applies the whole material batch, then rebuilds and adapts once.
          await pieces.rebuildCore(ctx.organizationId, input.pieceId, ctx.language);
          return finished(await adaptPass(ctx, input.pieceId, body({skipInterview: true}), emit, false, sourceUrls, presentation, currentAuthorRequest), card.questions.length, true);
        }
        if (card.source.kind !== 'adaptation' || card.source.pieceId !== input.pieceId ||
          card.source.channelId !== targetChannel || card.continuation?.operation !== 'adaptation-interview') {
          throw codedFailure('INPUT_NEEDS_PERSON', 'The questions do not belong to this adaptation.');
        }
        const queueAllowed = card.afterConsent === true;
        const previousAnswers = Array.isArray(card.continuation.previousAnswers) ? card.continuation.previousAnswers : [];
        const previousDecideKeys = Array.isArray(card.continuation.previousDecideKeys) ? card.continuation.previousDecideKeys as string[] : [];
        const byKey = new Map(card.questions.map(question => [question.key, question]));
        const answers = [...previousAnswers, ...card.answers.filter(answer => answer.mode !== 'delegate').map(answer => ({
          key: answer.key, text: answer.text!, origin: answer.mode === 'confirmed' ? 'confirmed' : 'person',
          ...(answer.key.startsWith('ask-') ? {question: byKey.get(answer.key)!.question} : {}),
        }))];
        const decideKeys = [...new Set([...previousDecideKeys, ...card.answers.filter(answer => answer.mode === 'delegate').map(answer => answer.key)])];
        if (!answers.length) return decideAll(card.questions.length, queueAllowed);
        const pass = await adaptPass(ctx, input.pieceId, body({answers, ...(decideKeys.length ? {decideKeys} : {})}), emit, queueAllowed, sourceUrls, presentation, currentAuthorRequest);
        if (pass.kind === 'questions') return askInterview(pass, queueAllowed, answers, decideKeys);
        return finished(pass, card.questions.length);
      }
      const consent = autopilotQuestion.safeParse(ctx.suspendPayload);
      if (consent.success) {
        const answer = autopilotAnswer.safeParse(ctx.resumeData);
        if (!answer.success) {
          throw codedFailure('INPUT_NEEDS_PERSON', 'The answer on the autopilot card was not understood; nothing was written.');
        }
        if (!answer.data.consentGiven) {
          return { pieceId: input.pieceId, channelId: targetChannel, declined: true };
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
      if (card.questions.some(question => !answers.some(answer => answer.key === question.key) && !decideKeys.includes(question.key))) {
        throw codedFailure('INPUT_NEEDS_PERSON', 'Answer or explicitly delegate every question; unanswered questions are not delegated.');
      }
      if (!answers.length && !decideKeys.length) throw codedFailure('INPUT_NEEDS_PERSON', 'No question was answered or delegated.');
      const pass = await adaptPass(
        ctx,
        input.pieceId,
        body({
          ...(answers.length ? { answers } : {}),
          ...(decideKeys.length ? { decideKeys } : {}),
        }),
        emit,
        queueAllowed,
        sourceUrls, presentation, currentAuthorRequest
      );
      // A second round is past the page's limit of two: we decide the rest.
      return pass.kind === 'questions' ? decideAll(asked, queueAllowed) : finished(pass, asked);
    }

    // Autopilot: the post would leave without a further act — the person
    // consents first, before anything is spent (spec §1.4, premortem A1).
    if (presentation) return ctx.suspend ? firstPass(false) : decideAll(0, false);
    const mode = await pieces.adaptPlanMode(ctx.organizationId, input.pieceId, targetChannel);
    if (mode === 'autopilot') {
      const channel = await ctx
        .service(IntegrationService)
        .getIntegrationsForChannelList(ctx.organizationId)
        .then((all: any[]) => all.find((one) => one.id === targetChannel))
        .catch(() => null);
      if (!ctx.suspend) {
        // MCP (`kcxz.49`): the same question, asked by the assistant in the
        // conversation; the repeat call carries the code of the person's «да».
        if (ctx.confirmed) return decideAll(0, true);
        if (ctx.entrance === 'mcp') {
          throw new ConfirmationNeeded(AUTOPILOT_TEXT[ctx.language](String(channel?.name || targetChannel)));
        }
        throw codedFailure(
          'AUTOPILOT_NEEDS_CONSENT',
          'The channel is on autopilot: the post would go out by itself, so the person consents on a card first. Nothing was spent.'
        );
      }
      await ctx.suspend({
        kind: 'consent',
        ...referenceMetadata,
        ...(Object.keys(continuedRequestMetadata).length ? { continuation: continuedRequestMetadata } : {}),
        subject: 'autopilot',
        question: AUTOPILOT_TEXT[ctx.language](String(channel?.name || targetChannel)),
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
    isPending(output) ? { ...output, ...(output.generated ? { recovery: { capability: 'piece.series.resume', pieceId: output.pieceId, runId: output.runId } } : {}), instruction: output.generated ? 'Generation is retained. Do not generate again; resume saving these drafts.' : 'Generation has no completed checkpoint. Do not claim that drafts exist or start generation again automatically. Report the actual failure or interruption.' } :
    isDeclined(output)
      ? { pieceId: output.pieceId, channelId: output.channelId, declined: true }
      : {
          pieceId: output.pieceId,
          adaptationId: output.adaptationId,
          ...(output.writingSettings ? {writingSettings: output.writingSettings} : {}),
          channelId: output.channel.id,
          variant: output.variant,
          ...(output.parts ? { parts: output.parts.map(part => ({ ...part, title: part.title ? wrapUntrusted(part.title, ['workspace-text']) : null })), series: output.series, savedPostCount: output.parts.length } : {}),
          ...(output.presentationReason ? { presentationReason: wrapUntrusted(output.presentationReason, ['workspace-text']) } : {}),
          state: output.state,
          ...(output.qualityReview ? { qualityReview: wrapUntrusted(output.qualityReview, ['workspace-text']) } : {}),
          savedResult: output.savedResult
            ? {
                data: wrapUntrusted(output.savedResult, ['workspace-text']),
              }
            : {
                unavailable: true,
                read: { capability: 'piece.read', part: 'adaptation', pieceId: output.pieceId, adaptationId: output.adaptationId },
              },
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
    isPending(output) ? null :
    isDeclined(output)
      ? null
      : {
          kind: 'adaptation',
          id: output.adaptationId,
          pieceId: output.pieceId,
          channel: output.channel,
          variant: output.variant,
          ...(output.series ? { series: output.series } : {}),
          ...(output.voiceScore ? { voiceScore: output.voiceScore } : {}),
          ...(output.qualityReview ? { qualityReview: wrapUntrusted(output.qualityReview, ['workspace-text']) } : {}),
        },
});

/** Recovery consumes only a server-retained generated result and cannot call a model. */
export const pieceSeriesResume = defineCapability({
  id: 'piece.series.resume', group: 'content', entrances: ['chat'],
  label: { ru: 'Сохранить серию черновиков', en: 'Save the draft series' },
  description: 'Resume only saving a previously generated series, using runId from piece.adapt or piece.open. Free; never regenerates content, never queues or publishes. Report pending persistence honestly. A generation without a saved checkpoint cannot be recovered here.',
  input: z.object({ pieceId, runId: z.string().min(1).max(256) }), risk: 'write',
  door: door(ContentPieceController, 'adapt'), untrusted: [],
  run: async (ctx, input, emit) => {
    if (!ctx.mastra) throw codedFailure('ADAPTATION_SERIES_UNAVAILABLE', 'Native workflow storage is required.');
    await ctx.service(PieceService).detail(ctx.organizationId, input.pieceId, ctx.language);
    const outcome = await resumeNativeAdaptationSeries(ctx.mastra, { organizationId: ctx.organizationId,
      userId: ctx.userId, pieceId: input.pieceId }, input.runId, ctx.requestContext, ctx.abortSignal);
    if (outcome.status === 'success' && outcome.result.kind === 'adaptation') {
      const result = outcome.result;
      for (const [index, part] of result.parts.entries()) await emit({ kind: 'adaptation', data: {
        id: part.adaptationId, pieceId: input.pieceId, channel: result.channel,
        series: { id: result.seriesId, index: index + 1, total: result.parts.length },
      } });
      return { status: 'success', runId: outcome.runId, seriesId: result.seriesId, parts: result.parts, state: 'draft',
        ...(result.presentationReason ? { presentationReason: result.presentationReason } : {}) };
    }
    return { status: outcome.status, runId: outcome.runId, saved: false };
  },
  summarize: output => 'parts' in output ? ({ ...output,
    parts: output.parts.map(part => ({ ...part, title: part.title ? wrapUntrusted(part.title, ['workspace-text']) : null })),
    savedPostCount: output.parts.length,
    ...(output.presentationReason ? { presentationReason: wrapUntrusted(output.presentationReason, ['workspace-text']) } : {}),
  }) : output,
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
    'Check a draft adaptation: `ai_traces` — «Убрать следы ИИ» (clichés and AI tells), `facts` — «Проверить факты» against web sources. Paid; runs without asking. The person reviews the complete candidate and accepts or declines it on the card; you never choose for them. Returns final counts: `applied` of `offered` went in, `declined` were left out; nothing waits after it (`waitingOnCard: 0`).',
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
    'Rewrite a draft adaptation by the person’s instruction («Переписать…»). Paid; runs without asking. Pass the instruction in their words. The person reviews the complete candidate and accepts or declines it on the card; you never choose for them. To write a fresh variant instead, use piece.adapt again.',
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
    'Attach an owned image or video from the workspace library by mediaId, or remove it with mediaId:null. Optional post-specific alt, owned thumbnailMediaId (null clears cover) and thumbnailTimestamp (milliseconds, null clears) follow platform support. Never pass URLs or filesystem paths. Returns a private member post previewUrl and a temporary media preview; this edits the draft and does not publish or change publication confirmations.',
  input: z.object({
    pieceId,
    adaptationId,
    mediaId: z.string().min(1).max(128).nullable().describe('Media library id; null takes the picture off'),
    alt: z.string().max(5000).optional(),
    thumbnailMediaId: z.string().uuid().nullable().optional(),
    thumbnailTimestamp: z.number().int().min(0).max(24 * 60 * 60 * 1000).nullable().optional(),
  }),
  risk: 'write',
  card: 'adaptation',
  door: door(ContentPieceController, 'editAdaptation'),
  untrusted: [],
  run: async (ctx, input) => {
    // `buildAdaptationPatch({ image })`: only the library id goes.
    const edited = await ctx.service(PieceService).editAdaptation(
      ctx.organizationId,
      input.pieceId,
      input.adaptationId,
      { image: input.mediaId ? { id: input.mediaId,
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(input.thumbnailMediaId !== undefined ? { thumbnailMediaId: input.thumbnailMediaId } : {}),
        ...(input.thumbnailTimestamp !== undefined ? { thumbnailTimestamp: input.thumbnailTimestamp } : {}),
      } : null },
      ctx.language
    );
    const media = input.mediaId && ctx.entrance === 'mcp'
      ? await ctx.service(McpMediaUploadServiceV1).metadata(ctx, input.mediaId) : null;
    return { pieceId: input.pieceId, adaptationId: input.adaptationId, image: input.mediaId !== null,
      ...(media ? { media } : {}),
      ...(ctx.entrance === 'mcp' && edited?.adaptation?.postId && process.env.FRONTEND_URL
        ? { previewUrl: `${process.env.FRONTEND_URL.replace(/\/$/, '')}/p/${encodeURIComponent(edited.adaptation.postId)}` } : {}) };
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
  // Before parking an approval card, verify the adaptation exists in this workspace (A27).
  beforeApproval: async (ctx, input) => {
    const detail = await ctx
      .service(PieceService)
      .detail(ctx.organizationId, input.pieceId, ctx.language)
      .catch(() => null);
    const row = detail?.adaptations?.find((one: any) => one.id === input.adaptationId) as any;
    if (!detail || !row) {
      throw codedFailure(
        'ADAPTATION_NOT_FOUND',
        `That adaptation (${input.adaptationId}) is not in this workspace; check the id before trying again.`
      );
    }
    return null;
  },
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
      ? `Удалить адаптацию черновика ${detail.piece.code} для канала «${channel}» вместе с её черновиком`
      : `Delete the adaptation of piece ${detail.piece.code} for “${channel}” with its draft`;
  },
  run: async (ctx, input) => {
    await ctx.service(PieceService).deleteAdaptation(ctx.organizationId, input.pieceId, input.adaptationId);
    return { pieceId: input.pieceId, adaptationId: input.adaptationId, deleted: true };
  },
  summarize: (output) => ({ ...output }),
});
