/**
 * The gate between a brief and a draft, and the radar that suggests what to
 * put in the brief.
 *
 * Three decisions live here and nothing else does. Whether a brief is finished
 * — decided by `evaluateBrief`, which this file calls and does not re-implement.
 * Whether a fact is grounded — decided by whether a reader could check it, with
 * one exception: a fact carried from the workspace's own memory arrives with a
 * `factId`, and that id is verified against *this* workspace before it counts.
 * And what is worth writing about — candidates from the facts on hand and from
 * what the workspace has already published, ranked by `scoreTopics`, which
 * hands back the reason for each rank rather than a bare number.
 *
 * The draft this produces is a draft. Nothing here reaches a platform: the post
 * is written through the repository every other post is written through, in the
 * `DRAFT` state, and `PostsService` and the providers deliver it when a person
 * says so. That is the rule `docs/product/migration-map.md` states.
 */

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ContentFactService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service';
import {
  evaluateBrief,
  scoreTopics,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';
import type {
  Brief,
  BriefFact,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';
import type {
  BriefDraftResponseV1,
  BriefRequestV1,
  BriefResponseV1,
  RadarTopicV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { ContentBriefRepository } from './content-brief.repository';
import { ContentBriefError } from './content-brief.errors';
import {
  RADAR_FAILED_NOTICE,
  radarNotice,
  topicCandidates,
} from './content-brief.radar';
import type { RadarFactV1, RadarLanguage } from './content-brief.radar';
import { briefTitle, composeBriefDraft } from './content-brief.compose';
import { materialFormat } from '@contentfactory/nestjs-libraries/content-intelligence/materials/material-presentation';

/**
 * The language the questions and the reasons are written in.
 *
 * Not in `voice-wiring.contract.ts`, which has no language on this surface, so
 * it is a parameter with a Russian default rather than a field of the request.
 */
export type BriefLanguage = RadarLanguage;

/** A fact whose ground was withdrawn is not a fact any more either. */
const UNUSABLE_FACT_STATUSES = ['TOMBSTONED', 'RETRACTED', 'SUPERSEDED'];

const BRIEF_ECHO_FIELDS = [
  'goal',
  'thesis',
  'channel',
  'format',
  'position',
  'disagreement',
  'audience',
] as const;

const MESSAGES = {
  ungrounded: {
    ru: 'Факт ссылается на память рабочего пространства, но такого факта здесь нет. Приложите ссылку, которую можно проверить.',
    en: 'The fact points at the workspace memory and no such fact is there. Give a source a reader can check.',
  },
  radarUnavailable: {
    ru: 'Радар тем сейчас не собирается. Бриф и его ответы это не затрагивает.',
    en: 'The topic radar cannot be built right now. The brief and its answers are unaffected.',
  },
  noChannel: {
    ru: 'В рабочем пространстве нет ни одного канала, в который можно положить черновик.',
    en: 'The workspace has no channel a draft could be written into.',
  },
  unknownChannel: {
    ru: 'Не удалось понять, в какой канал готовить черновик. Назовите канал так же, как он называется в разделе каналов.',
    en: 'The channel for this draft could not be resolved. Name it the way it is named in the channels section.',
  },
  draftFailed: {
    ru: 'Черновик не создался. Бриф сохранён, попробуйте ещё раз.',
    en: 'The draft was not created. The brief is kept; try again.',
  },
} as const;

type RadarResult = {
  topics: RadarTopicV1[];
  notice?: string;
  failed: boolean;
};

@Injectable()
export class ContentBriefService {
  private readonly now: () => Date;

  constructor(
    @Inject(ContentBriefRepository)
    private readonly repository: ContentBriefRepository,
    @Inject(ContentFactService)
    private readonly facts: ContentFactService,
    @Optional() now: () => Date = () => new Date()
  ) {
    this.now = now || (() => new Date());
  }

  /**
   * The radar on its own, before anything has been typed.
   *
   * The five questions come back with it: an empty brief really is missing all
   * five, and showing them from the start is what makes the gate a form to fill
   * rather than a refusal that appears at the end.
   */
  async radar(
    organizationId: string,
    language: BriefLanguage = 'ru'
  ): Promise<BriefResponseV1> {
    const radar = await this.buildRadar(organizationId, language);
    if (radar.failed) {
      throw new ContentBriefError(
        'RADAR_UNAVAILABLE',
        503,
        MESSAGES.radarUnavailable[language]
      );
    }
    const verdict = evaluateBrief({});

    return {
      state: radar.topics.length ? 'default' : 'empty',
      ready: verdict.ready,
      missing: verdict.missing,
      questions: verdict.questions.map((row) => ({
        field: row.field,
        question: row.question[language],
      })),
      ungroundedFacts: [],
      topics: radar.topics,
      notice: radar.notice,
    };
  }

  /** What is still missing, what carries nothing checkable, and the topics. */
  async evaluate(
    organizationId: string,
    request: BriefRequestV1,
    language: BriefLanguage = 'ru'
  ): Promise<BriefResponseV1> {
    const brief = await this.groundedBrief(organizationId, request, language);
    const verdict = evaluateBrief(brief);
    const radar = await this.buildRadar(organizationId, language);

    return {
      state: radar.failed ? 'error' : verdict.ready ? 'success' : 'default',
      ready: verdict.ready,
      missing: verdict.missing,
      questions: verdict.questions.map((row) => ({
        field: row.field,
        question: row.question[language],
      })),
      ungroundedFacts: verdict.ungroundedFacts,
      brief: this.echo(request),
      topics: radar.topics,
      notice: radar.failed ? RADAR_FAILED_NOTICE[language] : radar.notice,
    };
  }

  /**
   * A draft, or the questions that stand between the brief and one.
   *
   * `insufficient` is a result rather than a failure, and it is the reason this
   * route exists: a model asked to write from an empty brief produces something
   * fluent that says nothing, and the questions are the only useful answer.
   */
  async draft(
    organizationId: string,
    request: BriefRequestV1,
    language: BriefLanguage = 'ru',
    actorUserId?: string
  ): Promise<BriefDraftResponseV1> {
    const brief = await this.groundedBrief(organizationId, request, language);
    const verdict = evaluateBrief(brief);

    if (!verdict.ready) {
      return {
        outcome: 'insufficient',
        questions: verdict.questions.map((row) => ({
          field: row.field,
          question: row.question[language],
        })),
      };
    }

    const channel = await this.resolveChannel(organizationId, request, language);
    const content = composeBriefDraft(brief, language);
    const postId = await this.repository.createDraft(organizationId, {
      channelId: channel.id,
      providerIdentifier: channel.providerIdentifier,
      content,
      date: this.now().toISOString(),
    });

    if (!postId) {
      throw new ContentBriefError(
        'BRIEF_DRAFT_FAILED',
        500,
        MESSAGES.draftFailed[language]
      );
    }

    /**
     * The same text, kept as a piece the library can recut.
     *
     * `migration-map.md` has a Content Variant between the brief and the post
     * for a reason: the text is written once and cut per platform after. This
     * path wrote only the post, so `ContentPiece` had no writer anywhere in the
     * product and the Material tab could never fill (`vme.21.6`).
     *
     * Only when the caller is known: `ContentPiece.createdByUserId` is not
     * nullable, and inventing an author for a library row is worse than a
     * library row that is not there.
     */
    const pieceId = actorUserId
      ? await this.repository.recordPiece(organizationId, {
          postId,
          integrationId: channel.id,
          platform: channel.providerIdentifier,
          title: briefTitle(brief, language),
          body: content,
          // The same word the library prints in its own format column, from
          // the same function: two ways to name one cut is how «длинный» and
          // «longform» end up describing the same row.
          format: materialFormat(content, null, language),
          language,
          createdByUserId: actorUserId,
          brandProfileVersionId:
            await this.repository.activeVoiceVersionId(organizationId),
        })
      : null;

    return { outcome: 'ready', postId, ...(pieceId ? { pieceId } : {}) };
  }

  /**
   * The brief with its memory-backed facts verified.
   *
   * A fact with a `factId` this workspace does not hold is refused rather than
   * quietly downgraded: it is a claim of having been checked, and an unchecked
   * claim of being checked is worse than a fact with no source at all, which
   * only comes back as a question.
   */
  private async groundedBrief(
    organizationId: string,
    request: BriefRequestV1,
    language: BriefLanguage
  ): Promise<Brief> {
    const facts: BriefFact[] = (request.facts || []).map((fact) => ({
      statement: fact.statement,
      sourceUrl: fact.sourceUrl ?? null,
      factId: fact.factId ?? null,
    }));
    const claimed = [
      ...new Set(
        facts
          .map((fact) => fact.factId?.trim())
          .filter((id): id is string => Boolean(id))
      ),
    ];

    if (claimed.length) {
      const remembered = await this.repository.findFactsByIds(
        organizationId,
        claimed
      );
      const usable = new Set(
        remembered
          .filter((row) => !UNUSABLE_FACT_STATUSES.includes(row.status))
          .map((row) => row.id)
      );
      const impostor = facts.find(
        (fact) => fact.factId?.trim() && !usable.has(fact.factId.trim())
      );
      if (impostor) {
        throw new ContentBriefError(
          'BRIEF_FACT_UNGROUNDED',
          422,
          MESSAGES.ungrounded[language],
          impostor.statement
        );
      }
    }

    return {
      goal: request.goal,
      thesis: request.thesis,
      channel: request.channel,
      format: request.format,
      facts,
      position: request.position,
      disagreement: request.disagreement,
      audience: request.audience,
    };
  }

  /** Candidates from the workspace's own material, ranked with their reasons. */
  private async buildRadar(
    organizationId: string,
    language: BriefLanguage
  ): Promise<RadarResult> {
    try {
      const [remembered, posts] = await Promise.all([
        this.facts.listFacts(organizationId),
        this.repository.listPublishedPosts(organizationId),
      ]);
      const facts = remembered as RadarFactV1[];
      const candidates = topicCandidates(facts, posts, this.now());
      const topics = scoreTopics(candidates).map((topic) => ({
        id: topic.id,
        title: topic.title,
        score: topic.score,
        evidenceCount: topic.evidenceCount,
        reasons: topic.reasons.map((reason) => reason[language]),
      }));

      return {
        topics,
        notice: radarNotice(facts, candidates, language),
        failed: false,
      };
    } catch {
      // The radar is a suggestion. A brief already typed does not lose its
      // answers because the suggestion could not be assembled.
      return { topics: [], failed: true };
    }
  }

  /**
   * Which channel the draft is written into.
   *
   * The brief names a channel in the author's words, so it is matched against
   * the workspace's own channels; a single channel needs no naming at all. When
   * neither settles it the answer is a question, not a guess — a draft written
   * into the wrong channel is found later, by somebody else.
   */
  private async resolveChannel(
    organizationId: string,
    request: BriefRequestV1,
    language: BriefLanguage
  ) {
    const channels = await this.repository.listChannels(organizationId);
    if (!channels.length) {
      throw new ContentBriefError(
        'BRIEF_CHANNEL_UNKNOWN',
        422,
        MESSAGES.noChannel[language]
      );
    }

    const wanted = (request.channel || '').trim().toLocaleLowerCase();
    if (wanted) {
      const match = channels.find(
        (channel) =>
          channel.id === request.channel ||
          channel.providerIdentifier.toLocaleLowerCase() === wanted ||
          channel.name.trim().toLocaleLowerCase() === wanted
      );
      if (match) return match;
    }

    if (channels.length === 1) return channels[0];

    throw new ContentBriefError(
      'BRIEF_CHANNEL_UNKNOWN',
      422,
      MESSAGES.unknownChannel[language],
      request.channel
    );
  }

  /** The brief as the screen prints it back: the fields a person filled in. */
  private echo(request: BriefRequestV1): Record<string, string> {
    const written: Record<string, string> = {};
    for (const field of BRIEF_ECHO_FIELDS) {
      const value = request[field];
      if (typeof value === 'string' && value.trim()) {
        written[field] = value.trim();
      }
    }
    return written;
  }
}
