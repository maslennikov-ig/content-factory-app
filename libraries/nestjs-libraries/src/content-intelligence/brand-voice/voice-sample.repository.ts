import { Injectable, Optional } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import type { PreparedSample } from './sample-intake';
import type {
  BrandVoiceLocale,
  BrandVoiceMeasurementResult,
  CorpusSplit,
  LexiconEntry,
  PunctuationHabits,
  StyleScaleKey,
  StyleScaleResult,
} from './brand-voice.types';
import type { PostHabits } from './post-habits';
import type { PostLayout } from './post-layout';
import type { VoicePrint } from './voiceprint';
import type { VoiceCalibration } from './voice-calibration';
import type { ImpostorSet } from './impostors';
import {
  ANALYZER_VERSION,
  LOCALE_PACK_VERSION,
} from './voice-wiring.contract';

/**
 * The corpus and its measurements, in storage.
 *
 * Three rules the rest of the voice section depends on, and all three are
 * enforced here rather than asked for politely by a caller.
 *
 * A text arriving twice is stored once. The database says so —
 * `@@unique([organizationId, contentHash])` — and this file reads the
 * constraint violation as an answer rather than as a failure, because the same
 * post legitimately arrives by two paths and a duplicate does not merely
 * inflate a total: it pulls every corridor towards whatever happened to arrive
 * twice.
 *
 * A measurement is stored with the analyser and dictionary versions that
 * produced it. Without both, a corridor read back next year is a number the
 * generator obeys for no stated reason.
 *
 * A deleted sample leaves the listing and its text is erased, but the
 * measurements computed on it are marked stale rather than recomputed.
 * Recomputing moves corridors, and with them what the generator is allowed to
 * write, which is not a change to make while nobody is looking.
 */

type PrismaClientLike = Record<string, any>;

export type StoredVoiceSample = {
  id: string;
  organizationId: string;
  origin: string;
  usagePurpose: string;
  title: string;
  text: string;
  contentHash: string;
  charCount: number;
  wordCount: number;
  language: string;
  rightsState: string;
  retentionUntil: Date | null;
  sourceId: string | null;
  postId: string | null;
  externalRef: string | null;
  /** Whose text this is. `null` predates avatars — the default one reads it. */
  avatarId: string | null;
  redactions: unknown;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A stored sample with the short code the screens print beside it. */
export type CodedVoiceSample = StoredVoiceSample & { code: string };

export type StoredVoiceMeasurement = {
  id: string;
  organizationId: string;
  profileVersionId: string | null;
  /** Whose texts were counted. `null` predates avatars — the default reads it. */
  avatarId: string | null;
  analyzerVersion: string;
  localePackVersion: string;
  language: string;
  sampleCount: number;
  charCount: number;
  wordCount: number;
  sentenceCount: number;
  metrics: VoiceMeasurementMetricsV1;
  lexicon: LexiconEntry[] | null;
  punctuation: PunctuationHabits | null;
  corpusSplit: Record<string, CorpusSplit> | null;
  holdoutResult: unknown;
  stale: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * What the `metrics` column carries.
 *
 * The scales are the column's stated purpose. The proposal rides with them
 * because it is the same measurement seen through the model's explanation:
 * recomputing the numbers invalidates the words about them, and a proposal
 * stored anywhere else would outlive the corridors it describes. The schema
 * has no model of its own for it — that is written down in the task report as
 * a gap rather than fixed here, because the schema is applied and frozen.
 */
export type VoiceMeasurementMetricsV1 = {
  scales: Partial<Record<StyleScaleKey, StyleScaleResult>>;
  proposal?: StoredVoiceProposalV1;
  /**
   * Samples dropped before counting, with the reason.
   *
   * Stored because `GET /analysis` has to answer the same shape `POST` did.
   * A screen reloaded an hour later showing no rejections would be claiming
   * every text was counted, which is a different and false statement.
   */
  rejected?: Array<{
    code: string;
    reason: 'AI_ARTEFACT' | 'TOO_SHORT' | 'LANGUAGE';
  }>;
  /**
   * Whose the writing is, beside what its habits are.
   *
   * In this column and not in one of its own for the same reason the proposal
   * is: the print is this measurement seen from another angle, it is void the
   * moment the corridors are recomputed, and the schema is applied and frozen.
   * Absent on every row written before 2026-08-24, which the reader treats as
   * "cannot tell" and never as "not you".
   */
  voicePrint?: VoicePrint;
  /**
   * Где у этого автора проходят границы «похоже» и «не похоже».
   *
   * Рядом с отпечатком и по той же причине: точка снята для этого корпуса и
   * умирает вместе с ним. Пересчёт коридоров пересчитывает отпечаток, отпечаток
   * меняет голоса, голоса двигают границы — всё три величины одного разбора.
   *
   * Отсутствует на каждой строке до 27.08.2026 и на каждом авторе, для
   * которого в системе не нашлось чужих текстов. Читается как «вердикта нет»,
   * и никогда как «похоже»: константа `2/3`, стоявшая тут раньше, отвергала до
   * 71% собственных отложенных постов настоящих авторов.
   */
  calibration?: VoiceCalibration;
  /**
   * Кем судили: шеренга, собранная под этот отпечаток из настоящих коротких
   * текстов других авторов системы.
   *
   * Здесь, а не в сборке, потому что это не константа продукта: чужие тексты
   * принадлежат конкретным людям, и любой из них завтра может оказаться
   * автором, для которого шеренга строится. Веса лежат позиционно по окнам
   * отпечатка — `lineup.ts` объясняет, почему этого достаточно и почему это
   * весит столько же, сколько отпечаток.
   *
   * Отсутствует, когда чужого материала не набралось: тогда судил набор из
   * сборки, он и так в образе, и копия здесь была бы вторым источником правды.
   */
  lineup?: ImpostorSet;
  /** The post-level habits the model explains. Absent on older rows. */
  postHabits?: PostHabits;
  /**
   * The post's layout — soft breaks, blank lines, block length, one-sentence
   * blocks — the model explains on the same terms as `postHabits`.
   *
   * Absent on every row written before `analyzerVersion`
   * `brand-voice-analyzer/1.1.0`. Read as "not measured", never as zero: a
   * zero `softBreakRate` would claim this author never breaks a line softly,
   * where the truth is that this run predates the measure.
   */
  postLayout?: PostLayout;
  /**
   * Where this author sits against the norm, and which norm that was.
   *
   * Stored rather than recomputed on read, for the reason the norm is
   * versioned at all: it changes every number a person has already seen. A
   * description written in August has to stay explainable in December, and it
   * can only be explained against the norm it was actually computed from.
   *
   * Absent on every row written before 2026-08-25 and on every language whose
   * norm has not been built. Both read as "no position stated" — never as
   * «как обычно», which would be a comparison the product never made.
   */
  deviations?: {
    normVersion: string;
    /**
     * Keyed by `NormMetricKey`; the band, the robust z and the reference's own
     * middle. The last is absent on every row written before 2026-08-28, and a
     * sentence rebuilt from such a row simply omits the comparison rather than
     * inventing one.
     */
    byMetric: Record<
      string,
      { band: string; z: number | null; raw: number; normMedian?: number | null }
    >;
  };
};

export type StoredVoiceProposalV1 = {
  /**
   * The portrait, kept beside the fields rather than inside them.
   *
   * It carries a status for the same reason they do — nothing reaches a
   * published voice until a person accepted it — but it is not one of the five
   * `PROFILE_FIELDS`: those are one line each and are read back by code that
   * branches on them, while this is up to 1200 characters of prose that only
   * the prompt ever reads. Folding it in would have widened every field's
   * bounds to fit the one that is not a field.
   */
  portrait?: {
    text: string;
    observationRefs: string[];
    status: 'ACCEPTED' | 'EDITING' | 'UNDECIDED';
  };
  fields: Array<{
    key: string;
    text: string;
    status: 'ACCEPTED' | 'EDITING' | 'UNDECIDED';
    observationRefs: string[];
  }>;
  observations: Array<{
    ref: string;
    index: number;
    field: string;
    claim: string;
    quote: string;
    sampleCode: string;
    metric?: string | null;
  }>;
  categories?: {
    pointOfView?: string;
    formality?: string;
    emojiPolicy?: string;
    hashtagPolicy?: string;
    neverSay?: string[];
  };
  activatedVersionId?: string;
  activatedAt?: string;
};

/** `smp-02`, the short code the screen prints beside an example. */
export const voiceSampleCode = (index: number): string =>
  `smp-${String(index + 1).padStart(2, '0')}`;

const prismaCode = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;

/**
 * Codes are assigned over every row the workspace ever added, deleted ones
 * included.
 *
 * Numbering only the surviving rows would renumber the table after a deletion,
 * and `smp-04` in yesterday's analysis would point at a different text today.
 */
const withCodes = (rows: StoredVoiceSample[]): CodedVoiceSample[] =>
  rows.map((row, index) => ({ ...row, code: voiceSampleCode(index) }));

/**
 * The `metrics` envelope, built in one place.
 *
 * It was built in two — once when the measurement is saved and once when the
 * model's proposal is written back onto it — and the second one listed the
 * fields it knew about rather than carrying over what was there. Adding a
 * field to the analyser therefore silently lost it on every workspace that ran
 * the assist path, which is every workspace that has a voice. One builder, and
 * a new field reaches both writers or neither.
 */
export function buildMeasurementMetrics(
  result: BrandVoiceMeasurementResult,
  extras: {
    proposal?: StoredVoiceProposalV1;
    deviations?: VoiceMeasurementMetricsV1['deviations'];
  } = {}
): VoiceMeasurementMetricsV1 {
  return {
    scales: result.scales,
    rejected: result.rejected,
    ...(result.voicePrint ? { voicePrint: result.voicePrint } : {}),
    ...(result.calibration ? { calibration: result.calibration } : {}),
    ...(result.lineup ? { lineup: result.lineup } : {}),
    ...(result.postHabits ? { postHabits: result.postHabits } : {}),
    ...(result.postLayout ? { postLayout: result.postLayout } : {}),
    ...(extras.proposal ? { proposal: extras.proposal } : {}),
    ...(extras.deviations ? { deviations: extras.deviations } : {}),
  };
}

/**
 * The `where` clause that says "this avatar's rows", and the one shape Prisma
 * accepts for it.
 *
 * `{ avatarId: { in: [id, null] } }` reads correctly and is refused at runtime:
 * `in` takes a list of values and `null` is not one — Prisma answers
 * `PrismaClientValidationError`, which no type check catches, because the
 * repository's client is typed `Record<string, any>`. It cost a 500 on the
 * first real upload after the split. `OR` is how a nullable column is asked
 * about, and it lives here so both callers ask the same way.
 */
const avatarWhere = (scope: { avatarId?: string; inherited?: boolean }) => {
  if (!scope.avatarId) return {};
  return scope.inherited
    ? { OR: [{ avatarId: scope.avatarId }, { avatarId: null }] }
    : { avatarId: scope.avatarId };
};

@Injectable()
export class VoiceSampleRepository {
  constructor(
    private readonly _database: PrismaRepository<any>,
    private readonly _transaction: PrismaTransaction,
    @Optional() private readonly _now: () => Date = () => new Date()
  ) {}

  private client(): PrismaClientLike {
    return this._database.model as PrismaClientLike;
  }

  /** Every row, deleted included, in the order codes are assigned in. */
  async listAll(organizationId: string): Promise<CodedVoiceSample[]> {
    const rows = (await this.client().brandVoiceSample.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })) as StoredVoiceSample[];
    return withCodes(rows);
  }

  /**
   * The corpus as the screens and the analyser see it: without the deleted,
   * and belonging to one avatar.
   *
   * A deleted sample is gone from every list and every count. Its code is not
   * reused, which is why `listAll` is what numbering runs over — and why codes
   * stay assigned across the whole workspace rather than per avatar: a code is
   * how an analysis names the text it counted, and renumbering per avatar
   * would make `smp-04` in yesterday's split point at somebody else's post.
   *
   * `scope.avatarId` absent means every text in the space, which is what this
   * method meant before 2026-08-26 and what the retention sweep and the
   * corpus history still want. A caller measuring or quoting an author passes
   * one, and then `inherited` decides whether the texts that predate avatars
   * come along — the default avatar takes them, the others do not.
   */
  /**
   * Тексты, которых этот автор не писал, — для рабочей точки его мерки.
   *
   * ## Зачем читать чужое
   *
   * Порог голосования выбирается на двух распределениях сразу: своём и чужом.
   * Собственного мало — замер 27.08.2026 на трёх настоящих корпусах показал,
   * что пятый перцентиль голосов автора на его же отложенных постах равен
   * нулю, и правило, построенное на одном этом распределении, пропускает сто
   * процентов сгенерированного текста. Чужие настоящие авторы — единственный
   * бесплатный отрицательный материал, который в системе уже есть.
   *
   * ## Что при этом не пересекает границу
   *
   * Текст. Он читается здесь, превращается в число голосов против отпечатка
   * этого автора и дальше не едет: наружу уходит распределение баллов, а в
   * `metrics.calibration` ложатся две границы и две доли ошибок. Ни одного
   * чужого предложения не сохраняется, не показывается и не попадает в
   * промпт. Это межарендаторная обработка персональных данных, и она обязана
   * быть названа в документах о данных прежде, чем поедет на боевую —
   * `content-factory-next-saas.6`.
   *
   * ## Кого сюда не берут
   *
   * Самого автора — иначе он сравнивается с собой и порог уезжает вниз без
   * единого признака неисправности. Другой язык — пять символов не одна и та
   * же единица в двух письменностях, и порог, снятый на английском, к русскому
   * отпечатку неприменим; оба ресерча 27.08.2026 отвечают на это одинаково.
   *
   * Чужие пространства идут первыми, а другие аватары того же пространства —
   * только если первых не хватило. Пространство это один клиент, и два его
   * аватара могут оказаться одним человеком в двух регистрах; такой «чужой»
   * сделал бы порог мягче, чем он есть.
   *
   * @param limit сколько текстов вернуть; больше не нужно — точка снимается на
   *   десятках, а каждый текст стоит шестидесяти раундов голосования
   */
  async foreignSamples(
    exclude: { organizationId: string; avatarId: string | null },
    language: string,
    limit = 60
  ): Promise<string[]> {
    const common: Record<string, unknown> = {
      deletedAt: null,
      language,
      usagePurpose: 'OWN_VOICE',
    };
    const pick = (rows: { text: string }[], count: number) => {
      if (rows.length <= count) return rows.map((one) => one.text);
      /**
       * Каждый k-й, а не первые k.
       *
       * Строки лежат по времени, и первые k — это начало чужих каналов. Порог,
       * снятый на том, как несколько человек писали в самом начале, был бы
       * порогом про их прошлое.
       */
      const step = Math.ceil(rows.length / count);
      const out: string[] = [];
      for (let index = 0; index < rows.length && out.length < count; index += step) {
        out.push(rows[index].text);
      }
      return out;
    };

    const others = (await this.client().brandVoiceSample.findMany({
      where: { ...common, organizationId: { not: exclude.organizationId } },
      select: { text: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })) as { text: string }[];
    const taken = pick(others, limit);
    if (taken.length >= limit || !exclude.avatarId) return taken;

    const neighbours = (await this.client().brandVoiceSample.findMany({
      where: {
        ...common,
        organizationId: exclude.organizationId,
        /**
         * Два условия вместо одного `not`, и это не многословие.
         *
         * Что делает `{ not: 'x' }` с колонкой, допускающей `NULL`, зависит от
         * версии клиента: где-то это `col <> 'x'`, отбрасывающее `NULL` по
         * трёхзначной логике, где-то `col <> 'x' OR col IS NULL`. Разница
         * решает судьбу строк без аватара — а они принадлежат аватару по
         * умолчанию, то есть, возможно, тому самому человеку, для которого
         * снимается порог. Пусть будет сказано прямо: аватар проставлен и он
         * не этот.
         */
        AND: [
          { avatarId: { not: null } },
          { avatarId: { not: exclude.avatarId } },
        ],
      },
      select: { text: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })) as { text: string }[];
    return [...taken, ...pick(neighbours, limit - taken.length)];
  }

  async listActive(
    organizationId: string,
    scope: {
      usagePurpose?: 'OWN_VOICE' | 'STYLE_REFERENCE';
      avatarId?: string;
      /** Whether `avatarId IS NULL` rows belong to this avatar. */
      inherited?: boolean;
    } = {}
  ): Promise<CodedVoiceSample[]> {
    const all = await this.listAll(organizationId);
    return all.filter((sample) => {
      if (sample.deletedAt) return false;
      if (scope.usagePurpose && sample.usagePurpose !== scope.usagePurpose) {
        return false;
      }
      if (!scope.avatarId) return true;
      if (sample.avatarId === scope.avatarId) return true;
      return !sample.avatarId && scope.inherited === true;
    });
  }

  /**
   * The hashes an intake checks itself against, scoped the way the unique
   * index is.
   *
   * Both have to answer the same question or the intake reports a duplicate
   * the database would have accepted: since 2026-08-26 dedup is per avatar, so
   * a second avatar quoting the same post is a new text and not a repeat.
   */
  async knownHashes(
    organizationId: string,
    scope: { avatarId?: string; inherited?: boolean } = {}
  ): Promise<string[]> {
    const rows = (await this.client().brandVoiceSample.findMany({
      where: { organizationId, ...avatarWhere(scope) },
      select: { contentHash: true },
    })) as Array<{ contentHash: string }>;
    return rows.map((row) => row.contentHash);
  }

  /**
   * Adding prepared texts, one row at a time and on purpose.
   *
   * A batch insert would make one duplicate reject the whole intake, and the
   * screen's promise is the opposite: what arrived is listed, what did not is
   * named with its reason.
   */
  async addSamples(
    organizationId: string,
    prepared: readonly PreparedSample[],
    options: { retentionUntil?: Date | null; avatarId?: string | null } = {}
  ): Promise<{
    created: StoredVoiceSample[];
    duplicates: PreparedSample[];
  }> {
    const created: StoredVoiceSample[] = [];
    const duplicates: PreparedSample[] = [];

    for (const sample of prepared) {
      try {
        const row = (await this.client().brandVoiceSample.create({
          data: {
            organizationId,
            origin: sample.origin,
            usagePurpose: sample.usagePurpose,
            title: sample.title,
            text: sample.text,
            contentHash: sample.contentHash,
            charCount: sample.charCount,
            wordCount: sample.wordCount,
            language: sample.language,
            rightsState: sample.rightsState,
            retentionUntil: options.retentionUntil ?? null,
            sourceId: sample.sourceId ?? null,
            postId: sample.postId ?? null,
            externalRef: sample.externalRef ?? null,
            /**
             * Whose text this is, decided by the intake and never by the body
             * of the request: the avatar rides on the actor, exactly as the
             * organisation does.
             */
            avatarId: options.avatarId ?? null,
            redactions: sample.redactions.length ? sample.redactions : null,
          },
        })) as StoredVoiceSample;
        created.push(row);
      } catch (error) {
        // The unique index is the dedup, not a check this file performs before
        // it. Two intakes racing on the same text still store it once.
        if (prismaCode(error) !== 'P2002') throw error;
        duplicates.push(sample);
      }
    }

    return { created, duplicates };
  }

  /**
   * A deletion removes the row from the corpus and the words from the column.
   *
   * `deletedAt` alone would leave someone's writing in the database after they
   * asked for it to go; erasing `text` alone would lose the fact that the
   * corpus once held it. Both, so the history survives and the words do not.
   */
  async softDelete(
    organizationId: string,
    ids: readonly string[]
  ): Promise<number> {
    if (!ids.length) return 0;
    const changed = await this.client().brandVoiceSample.updateMany({
      where: { organizationId, id: { in: [...ids] }, deletedAt: null },
      data: { deletedAt: this._now(), text: '' },
    });
    return changed.count;
  }

  /**
   * The texts of a deleted avatar, handed to the one that takes over from it.
   *
   * Deleting an avatar already names its successor in the same request,
   * because a space cannot be left without a default. Its corpus travels the
   * same way and in the same transaction-shaped step: the alternative is a
   * person's writing surviving as rows nobody can read, which is worse than
   * either keeping it or erasing it.
   *
   * Deleted rows travel too. They carry no words — `softDelete` erased the
   * column — and leaving them behind would make the corpus history of the
   * successor disagree with the codes its own measurements name.
   */
  async reassignAvatar(
    organizationId: string,
    fromAvatarId: string,
    toAvatarId: string
  ): Promise<number> {
    const changed = await this.client().brandVoiceSample.updateMany({
      where: { organizationId, avatarId: fromAvatarId },
      data: { avatarId: toAvatarId },
    });
    return changed.count;
  }

  /**
   * A reference corpus erasing itself on the date it was given.
   *
   * The row survives, its words do not, and the measurement derived from it is
   * left alone — deliberately, and not for the same reason a deletion marks
   * measurements stale. A deletion is somebody changing their mind about text
   * the analysis counted; an expiry is the agreement working exactly as it was
   * written, and what the agreement promised would remain is the numbers.
   *
   * Runs for every organisation at once. A retention date is a promise about a
   * calendar, and a promise that only comes true when somebody opens a page is
   * not one.
   */
  async purgeExpiredReferences(now: Date = this._now()): Promise<number> {
    const changed = await this.client().brandVoiceSample.updateMany({
      where: {
        usagePurpose: 'STYLE_REFERENCE',
        retentionUntil: { lte: now },
        text: { not: '' },
      },
      data: { text: '' },
    });
    return changed.count;
  }

  /**
   * A measurement computed on a sample that no longer exists says so.
   *
   * `corpusSplit` names every sample the analysis counted, which is what makes
   * this answerable without a join table. Marking rather than recomputing is
   * the decision the schema comment states.
   */
  async markMeasurementsStale(
    organizationId: string,
    codes: readonly string[]
  ): Promise<number> {
    if (!codes.length) return 0;
    const measurements = (await this.client().brandVoiceMeasurement.findMany({
      where: { organizationId, stale: false },
    })) as StoredVoiceMeasurement[];
    const affected = measurements.filter((measurement) =>
      codes.some((code) =>
        Object.prototype.hasOwnProperty.call(
          measurement.corpusSplit ?? {},
          code
        )
      )
    );
    if (!affected.length) return 0;
    const changed = await this.client().brandVoiceMeasurement.updateMany({
      where: {
        organizationId,
        id: { in: affected.map((measurement) => measurement.id) },
      },
      data: { stale: true },
    });
    return changed.count;
  }

  async saveMeasurement(
    organizationId: string,
    input: {
      result: BrandVoiceMeasurementResult;
      proposal?: StoredVoiceProposalV1;
      profileVersionId?: string | null;
      deviations?: VoiceMeasurementMetricsV1['deviations'];
      /** Whose texts were counted. `null` only where no avatar exists yet. */
      avatarId?: string | null;
    }
  ): Promise<StoredVoiceMeasurement> {
    const { result } = input;
    const metrics = buildMeasurementMetrics(result, {
      proposal: input.proposal,
      deviations: input.deviations,
    });
    return (await this.client().brandVoiceMeasurement.create({
      data: {
        organizationId,
        profileVersionId: input.profileVersionId ?? null,
        avatarId: input.avatarId ?? null,
        // Not `result.analyzerVersion` by accident: the contract's constants
        // are what the screens and a later recomputation read back, and a
        // measurement stored under a version nobody else names is
        // unexplainable a year later.
        analyzerVersion: ANALYZER_VERSION,
        localePackVersion: LOCALE_PACK_VERSION,
        language: result.language,
        sampleCount: result.sampleCount,
        charCount: result.charCount,
        wordCount: result.wordCount,
        sentenceCount: result.sentenceCount,
        metrics,
        lexicon: result.lexicon,
        punctuation: result.punctuation,
        corpusSplit: result.split,
        stale: false,
      },
    })) as StoredVoiceMeasurement;
  }

  /**
   * The newest analysis of one avatar's texts.
   *
   * Scoped for the same reason the corpus is: until 2026-08-26 this asked
   * "what was analysed most recently in this space", so a second avatar's run
   * silently became the first one's passport, corridors and scales — the
   * numbers a person reads about themselves, computed from somebody else.
   */
  async latestMeasurement(
    organizationId: string,
    scope: { avatarId?: string; inherited?: boolean } = {}
  ): Promise<StoredVoiceMeasurement | null> {
    return (await this.client().brandVoiceMeasurement.findFirst({
      where: { organizationId, ...avatarWhere(scope) },
      orderBy: { createdAt: 'desc' },
    })) as StoredVoiceMeasurement | null;
  }

  /**
   * The measurements a version names, newest first.
   *
   * The version says which analysis explains it, so this is a plain lookup by
   * primary key. `VoiceService` decides which versions to ask about — this
   * repository knows measurements, not how versions relate to each other.
   */
  async measurementByIds(
    organizationId: string,
    ids: readonly string[]
  ): Promise<StoredVoiceMeasurement | null> {
    if (!ids.length) return null;
    return (await this.client().brandVoiceMeasurement.findFirst({
      where: { organizationId, id: { in: [...ids] } },
      orderBy: { createdAt: 'desc' },
    })) as StoredVoiceMeasurement | null;
  }

  /**
   * The old way round, kept for rows written before the stamp changed sides.
   *
   * Until vme.18 the pointer lived here, on the measurement, and activation
   * moved it. Versions activated under that code carry no stamp of their own
   * and can only be answered from this column; nothing writes the version side
   * retroactively, because a stamp that was moved is not recoverable — the
   * value it held before the move was overwritten in place. A version with no
   * measurement on either side — a hand-written voice — answers `null`, which
   * is the honest answer: no analysis explains this version's numbers.
   */
  async measurementForVersions(
    organizationId: string,
    profileVersionIds: readonly string[]
  ): Promise<StoredVoiceMeasurement | null> {
    if (!profileVersionIds.length) return null;
    return (await this.client().brandVoiceMeasurement.findFirst({
      where: { organizationId, profileVersionId: { in: [...profileVersionIds] } },
      orderBy: { createdAt: 'desc' },
    })) as StoredVoiceMeasurement | null;
  }

  async getMeasurement(
    organizationId: string,
    id: string
  ): Promise<StoredVoiceMeasurement | null> {
    return (await this.client().brandVoiceMeasurement.findFirst({
      where: { organizationId, id },
    })) as StoredVoiceMeasurement | null;
  }

  /**
   * Rewriting the measurement's own JSON: a hand-set corridor, an accepted
   * field, the version a proposal became.
   */
  async updateMeasurement(
    organizationId: string,
    id: string,
    data: {
      metrics?: VoiceMeasurementMetricsV1;
      profileVersionId?: string | null;
    }
  ): Promise<number> {
    const changed = await this.client().brandVoiceMeasurement.updateMany({
      where: { organizationId, id },
      data,
    });
    return changed.count;
  }
}

export type { BrandVoiceLocale };
