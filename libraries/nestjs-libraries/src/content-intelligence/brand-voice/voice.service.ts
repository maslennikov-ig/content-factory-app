import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  BrandAvatarRowV1,
  BrandProfileContentV1,
  BrandProfileVersionRecordV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';
import { MAX_AVATARS_PER_SPACE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';
import { analyzeBrandVoice, corpusReadiness } from './analyzer';
import { PROFILE_FIELDS, type ProfileField } from './assist.contract';
import {
  isScaleValue,
  toReportLocale,
  type BrandVoiceLocale,
  type BrandVoiceMeasurementResult,
  type BrandVoiceSampleInput,
  type CorpusSplit,
  type StyleScaleKey,
  type StyleScaleResult,
  type StyleScaleValue,
} from './brand-voice.types';
import {
  MAX_SHARED_NGRAM,
  longestSharedRun,
  redactReference,
  type Redaction,
  type RedactionCategory,
} from './identity-barrier';
import { prepareSamples, type SampleOrigin, type SampleRightsState } from './sample-intake';
import { parseUploadedFiles, type FileUpload } from './file-intake';
import { checkText, planInjections, renderVoiceInjection } from './voice-retention';
import { htmlToPlainText } from './html-text';
import { RU_LOCALE_PACK } from './locale-pack.ru';
import type { PostHabitMetricKey } from './post-habits';
import { locateSentences } from './text-spots';
import { emptyLocalePack, packFor } from './locale-pack';
import { measureSimilarity } from './voiceprint';
import { impostorsFor } from './impostor-sets';
import { buildLineup, splitForeign } from './lineup';
import type { ImpostorSet } from './impostors';
import {
  calibrate,
  CALIBRATION_VERSION,
  isCalibrated,
  MIN_CALIBRATION_SAMPLES,
  UNCALIBRATED,
  type VoiceCalibration,
} from './voice-calibration';

/**
 * Сколько чужих текстов читается на разбор.
 *
 * Триста, и это измерено. Подставной — профиль частот, и собранный с десяти
 * текстов он разрежен: автор выигрывает у него слишком легко, но и генерация
 * тоже, так что запас съедается. Замер 27.08.2026, запас между потолком и
 * полом по трём корпусам:
 *
 * | чужих текстов | ≈знаков на подставного | owner | avetov | britva |
 * | --- | --- | --- | --- | --- |
 * | 60 | 7k | 65,6 | 39,0 | 26,8 |
 * | 150 | 16k | 54,5 | 58,4 | 39,9 |
 * | **300** | **29k** | **51,4** | **57,5** | **59,0** |
 * | 600 | 50k | 52,1 | 59,7 | 50,7 |
 *
 * Триста — там, где худший корпус перестаёт быть худшим втрое. Дальше растёт
 * только цена чтения.
 *
 * Из этих трёхсот каждый шестой уходит в отрицательные примеры и в шеренгу не
 * попадает — `splitForeign` объясняет, почему это обязательно.
 */
const CALIBRATION_FOREIGN_SAMPLES = 300;

/** Сколько своих отложенных текстов берётся, когда их больше. */
const CALIBRATION_OWN_SAMPLES = 100;

/**
 * Сколько переписанных черновиков берётся в отрицательные примеры.
 *
 * Двести — потолок `VoiceEditRepository.list`, и он же тот порядок, на котором
 * снят замер 28.08.2026 (112 генераций на корпус). Свежие первыми: голос
 * меняется вместе с корпусом, и черновик годовой давности написан другой
 * версией профиля, то есть отвечает на вопрос про другого автора.
 */
const CALIBRATION_DRAFT_SAMPLES = 200;

/**
 * Длина, на которой снимается точка.
 *
 * Восемьсот знаков — около медианы поста на измеренных каналах (823, 642, 724)
 * и выше четырёхсот, ниже которых голосование вообще отказывается судить.
 */
const CALIBRATION_CUT = 800;
import { deviationsForCorpus, type NormMetricKey } from './voice-norm';
import { phraseDeviation } from './voice-norm.phrasing';

import { normFor } from './voice-norm.sets';
import {
  buildRepairPrompt,
  extractFacts,
  judgeRepair,
} from './sentence-repair';
import { VoiceError } from './voice-errors';
import {
  buildMeasurementMetrics,
  VoiceSampleRepository,
  type CodedVoiceSample,
  type StoredVoiceMeasurement,
  type StoredVoiceProposalV1,
  type VoiceMeasurementMetricsV1,
} from './voice-sample.repository';
import { VoiceProfileRepository } from './voice-profile.repository';
import { VoiceEditRepository } from './voice-edit.repository';
import {
  LEARN_MIN_PAIRS,
  MAX_LEARNED_RULES,
  buildLearnPrompt,
  mergeLearnedRules,
  parseLearnedRules,
  withoutRule,
  type LearnedVoiceRulesV1,
} from './voice-learning';
import type { VoiceAssistPort } from './voice-assist.service';
import {
  ANALYZER_VERSION,
  LOCALE_PACK_VERSION,
  VOICE_CONTRACT_VERSION,
  type CorpusReadinessV1,
  type VoiceAnalysisRequestV1,
  type VoiceAvatarCreateRequestV1,
  type VoiceAvatarDefaultRequestV1,
  type VoiceAvatarDeleteRequestV1,
  type VoiceAvatarKindV1,
  type VoiceAvatarRowV1,
  type VoiceAvatarUpdateRequestV1,
  type VoiceAvatarsResponseV1,
  type VoiceAnalysisResponseV1,
  type VoiceInjectionPlanRequestV1,
  type VoiceInjectionPlanResponseV1,
  type VoiceLearnForgetRequestV1,
  type VoiceLearningResponseV1,
  VOICE_SAMPLE_PASTE_LIMITS,
  type VoiceOverviewResponseV1,
  type VoicePassportResponseV1,
  type VoicePathKeyV1,
  type VoicePathAvailabilityV1,
  type VoicePathsResponseV1,
  type VoicePermissionsV1,
  type VoiceProposalActivateRequestV1,
  type VoiceProposalFieldRequestV1,
  type VoiceProposalPortraitRequestV1,
  type VoiceProposalManualFieldRequestV1,
  type VoiceProposalModeV1,
  type VoiceProposalResponseV1,
  type VoiceRedactionsResponseV1,
  type VoiceRibbonResponseV1,
  type VoiceSampleDeleteRequestV1,
  type VoiceSampleFileIntakeRequestV1,
  type VoiceSampleIntakeRequestV1,
  type VoiceSampleIntakeResponseV1,
  type VoiceSampleRowV1,
  type VoiceSampleSourceV1,
  type VoiceScaleCorridorRequestV1,
  type VoiceScaleEntryV1,
  type VoiceScalesResponseV1,
  type VoiceScreenStateV1,
  type VoiceRepairRequestV1,
  type VoiceRepairResponseV1,
  type VoiceTextCheckRequestV1,
  type VoiceTextCheckResponseV1,
  type VoiceVersionSummaryV1,
  type VoiceVersionComparisonV1,
  type VoiceVersionsQueryV1,
  type VoiceVersionsResponseV1,
  type VoicePassportFieldRequestV1,
} from './voice-wiring.contract';
import { truncateChars } from './text-truncate';
import {
  selectVoiceExamples,
  toProfileExamples,
  MAX_VOICE_EXAMPLES,
} from './voice-examples';

/** The author's own posts inside a profile, as distinct from hand-written counter-examples. */
const voiceExamplesOf = (content: BrandProfileContentV1) =>
  (content.examples ?? []).filter((one) => one.kind === 'on_brand');

/**
 * Everything the eleven screens of the voice section ask the product for.
 *
 * The contract is the specification and this file is obliged to it rather than
 * to the database: a column is storage and a field is a promise to a screen,
 * and the mapping between them lives here so a migration is not a frontend
 * change.
 *
 * Four decisions are worth stating because they are the ones a reader would
 * otherwise assume the other way.
 *
 * A short corpus is a result. `insufficient` carries the two numbers still
 * missing and arrives on 200, because a workspace eight thousand characters
 * from the floor has done nothing wrong and "что-то пошло не так" would throw
 * away the only useful part of the answer.
 *
 * A refused model is an error. `VOICE_ASSIST_UNAVAILABLE` and
 * `VOICE_ASSIST_UNGROUNDED` exist so that a failed proposal never arrives as
 * an empty one — an empty profile reads as "your writing has no character",
 * which is a false statement about somebody's texts.
 *
 * A member without rights gets `restricted`, not an empty screen. The
 * difference matters: one says "you may not change this", the other says "the
 * workspace has nothing", and only one of them is true.
 *
 * The analysis never leaves the process. `analyzeBrandVoice` is arithmetic, so
 * a workspace with an exhausted AI budget still sees its own manner in
 * numbers.
 */

/** Who is asking, and what the policy layer decided they may do. */
export type VoiceActor = {
  organizationId: string;
  userId: string;
  /** Decided by `CheckPolicies` and the member's role, never by a request body. */
  canManage: boolean;
  locale?: BrandVoiceLocale;
  /**
   * Which avatar this request is about, when it is about a particular one.
   *
   * Absent means "the space's default", which is what every route meant while
   * `organizationId` was unique on the profile — so leaving it out preserves
   * the old behaviour exactly rather than approximating it. It rides on the
   * actor rather than on each request body because it answers the same
   * question `organizationId` does: whose voice is being read. A body field
   * would have to be added to fourteen DTOs and forgotten in one.
   *
   * Unlike `organizationId` it may safely come from the request: the avatar is
   * scoped to the organisation in every query, so naming somebody else's
   * avatar finds nothing rather than finding theirs.
   */
  avatarId?: string;
};

export type VoicePolicy = {
  /** An organisation may switch the reference path off entirely. */
  referencePathDisabled?: boolean;
};

/**
 * Injection tokens, declared by the consumer rather than by the provider.
 *
 * `VoiceAssistPort` is an interface, and an interface leaves nothing behind
 * for Nest to resolve. Declaring the token here is also what keeps this file's
 * import list free of a model client: the assist service is named by a string
 * and typed by `import type`, so the deterministic half of the section can be
 * loaded — and tested — without `openai` anywhere in its graph.
 */
export const VOICE_ASSIST_PORT = 'VOICE_ASSIST_PORT';
export const VOICE_POLICY = 'VOICE_POLICY';

/**
 * A corridor a person set by hand, and a scale they took out of the profile.
 *
 * Neither fits `StyleScaleValue`, which describes what was measured rather
 * than what was decided afterwards. Declared here rather than added to the
 * contract, and listed as such in the task report.
 */
type StoredScaleValue = StyleScaleValue & { excluded?: boolean };

const SAMPLE_ORIGINS: SampleOrigin[] = [
  'OWN_POST',
  'TELEGRAM_EXPORT',
  'PASTE',
  'FILE',
  'SOURCE_SNAPSHOT',
];

const ORIGIN_LABELS: Record<SampleOrigin, string> = {
  OWN_POST: 'Свои опубликованные посты',
  TELEGRAM_EXPORT: 'Экспорт Telegram',
  PASTE: 'Вставленный текст',
  FILE: 'Файл',
  SOURCE_SNAPSHOT: 'Снимок источника',
};

const SCALE_LABELS: Record<StyleScaleKey, string> = {
  sentenceLength: 'Длина предложения',
  sentenceSpread: 'Разброс длины',
  shortSentences: 'Доля коротких',
  listParagraphs: 'Абзацы со списком',
  questions: 'Вопросы',
  dashCopula: 'Тире вместо связки',
  firstPerson: 'От первого лица',
  nominalisation: 'Отглагольные существительные',
};

const FIELD_TO_TRAIT: Partial<Record<ProfileField, string>> = {
  WHO_SPEAKS: 'Кто говорит',
  TONE: 'Тон',
};

const EMPTY_CONTENT: BrandProfileContentV1 = {
  project: {
    name: 'Голос бренда',
    oneLineDescription: 'Профиль голоса, собранный по образцам текстов организации.',
    offerings: [],
    // Placeholders, not a guess at the workspace's real audience or goals —
    // the same role `oneLineDescription` above already plays. Without them a
    // first-ever voice activation (nothing published yet to inherit from)
    // produces a version the brand-profile form's own validation would
    // refuse, which is exactly the asymmetry vme.12 is about. Editable at
    // any time from the brand-profile form.
    audiences: [{ name: 'Аудитория организации' }],
    contentGoals: ['Публикации в голосе, который описывает этот профиль'],
  },
  voice: {
    defaultLanguage: 'ru',
    allowedLanguages: ['ru', 'en'],
    traits: [],
    pointOfView: 'company_we',
    formality: 'neutral',
    emojiPolicy: 'restrained',
    hashtagPolicy: 'none',
  },
  lexicon: { preferred: [], avoid: [] },
  guardrails: { prohibitedTopics: [], prohibitedClaims: [], requiredPhrases: [] },
  examples: [],
  platformOverrides: [],
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const formatDate = (value: Date, locale: BrandVoiceLocale): string =>
  new Date(value).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const toInput = (sample: CodedVoiceSample): BrandVoiceSampleInput => ({
  code: sample.code,
  text: sample.text,
  language: (sample.language as BrandVoiceLocale) ?? 'ru',
  contentHash: sample.contentHash,
  /**
   * Carried for the quotes and read by nothing that counts.
   *
   * `selectVoiceExamples` takes them from the author's most recent posts; the
   * analyser goes on measuring the whole corpus, because that is where the
   * length, the scales and the corridors come from and thirty posts make a
   * noisy corridor.
   */
  externalRef: sample.externalRef,
});

const toReadiness = (
  readiness: ReturnType<typeof corpusReadiness>
): CorpusReadinessV1 => ({
  ready: readiness.ready,
  charCount: readiness.charCount,
  sampleCount: readiness.sampleCount,
  missingChars: readiness.missingChars,
  missingSamples: readiness.missingSamples,
  requiredSamples: readiness.requiredSamples,
  confidence: readiness.confidence,
  confidenceReasons: readiness.confidenceReasons,
});

const metricsOf = (
  measurement: StoredVoiceMeasurement | null
): VoiceMeasurementMetricsV1 => {
  const raw = (measurement?.metrics ?? {}) as VoiceMeasurementMetricsV1;
  // A row written before the envelope existed carried the scales at the top
  // level. Reading both keeps an older measurement legible rather than blank.
  if (raw && typeof raw === 'object' && 'scales' in raw) return raw;
  return { scales: (raw ?? {}) as VoiceMeasurementMetricsV1['scales'] };
};

@Injectable()
export class VoiceService {
  constructor(
    private readonly _samples: VoiceSampleRepository,
    private readonly _profiles: VoiceProfileRepository,
    @Optional()
    @Inject(VOICE_ASSIST_PORT)
    private readonly _assist: VoiceAssistPort | null = null,
    @Optional()
    @Inject(VOICE_POLICY)
    private readonly _policy: VoicePolicy = {},
    @Optional() private readonly _now: () => Date = () => new Date(),
    /**
     * Правки автора в черновиках. Читаются только на удалении аватара.
     *
     * Последним в списке и необязательным, потому что до него сервис собирался
     * без него: место в списке — это то, что ломается у каждого, кто строит
     * его вручную, и таких мест в наборах много.
     */
    @Optional() private readonly _edits: VoiceEditRepository | null = null
  ) {}

  /* ---------------------------------------------------------------------
   * Policy
   * ------------------------------------------------------------------ */

  private referenceDisabled(): boolean {
    return (
      this._policy.referencePathDisabled ??
      process.env.VOICE_REFERENCE_PATH_DISABLED === 'true'
    );
  }

  private permissions(actor: VoiceActor): VoicePermissionsV1 {
    return {
      canRead: true,
      canCreate: actor.canManage,
      canEdit: actor.canManage,
      canDelete: actor.canManage,
      referencePathDisabled: this.referenceDisabled(),
    };
  }

  private assertCanManage(actor: VoiceActor) {
    if (actor.canManage) return;
    throw new VoiceError(
      'VOICE_FORBIDDEN',
      'Изменение голоса бренда — право редактора или администратора рабочего пространства.'
    );
  }

  private paths(actor: VoiceActor): VoicePathAvailabilityV1 {
    const disabledReasons: Partial<Record<VoicePathKeyV1, string>> = {};
    const referenceOff = this.referenceDisabled();
    const available: Record<VoicePathKeyV1, boolean> = {
      manual: actor.canManage,
      own: actor.canManage,
      reference: actor.canManage && !referenceOff,
    };
    if (!actor.canManage) {
      const reason =
        'Создание голоса — право редактора или администратора. Готовый голос виден всем участникам.';
      disabledReasons.manual = reason;
      disabledReasons.own = reason;
      disabledReasons.reference = reason;
    } else if (referenceOff) {
      disabledReasons.reference =
        'Организация отключила путь «по образцу чужого стиля».';
    }
    return { available, disabledReasons };
  }

  /* ---------------------------------------------------------------------
   * Screen 01 and 02
   * ------------------------------------------------------------------ */

  async overview(actor: VoiceActor): Promise<VoiceOverviewResponseV1> {
    const corpus = await this._samples.listActive(
      actor.organizationId,
      await this.corpusScope(actor)
    );
    const readiness = corpusReadiness(corpus.map(toInput));
    const { versions, activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const hasVoice = Boolean(activeVersion);
    const actors = await this._profiles.actorNames(
      versions.map((version) => version.updatedByUserId)
    );

    return {
      contractVersion: VOICE_CONTRACT_VERSION,
      hasVoice,
      state: hasVoice ? 'default' : 'empty',
      permissions: this.permissions(actor),
      note: actor.canManage
        ? undefined
        : 'Раздел открыт на чтение: изменить голос может редактор или администратор.',
      activeVersion: activeVersion
        ? this.versionSummary(activeVersion, activeVersion.id, actors)
        : undefined,
      readiness: toReadiness(readiness),
      paths: this.paths(actor),
    };
  }

  async pathsScreen(actor: VoiceActor): Promise<VoicePathsResponseV1> {
    const paths = this.paths(actor);
    return {
      state: actor.canManage ? 'default' : 'restricted',
      ...paths,
    };
  }

  /* ---------------------------------------------------------------------
   * Screen 03 — the corpus
   * ------------------------------------------------------------------ */

  private sampleRow(
    sample: CodedVoiceSample,
    locale: BrandVoiceLocale
  ): VoiceSampleRowV1 {
    const redactions = Array.isArray(sample.redactions)
      ? (sample.redactions as unknown[])
      : [];
    return {
      id: sample.id,
      code: sample.code,
      title: sample.title,
      origin: sample.origin as SampleOrigin,
      usagePurpose: sample.usagePurpose as VoiceSampleRowV1['usagePurpose'],
      charCount: sample.charCount,
      date: formatDate(sample.createdAt, locale),
      // The flag, never the value: what was removed is the point, what it was
      // is exactly what must not travel.
      ...(redactions.length ? { redacted: true } : {}),
    };
  }

  private sources(actor: VoiceActor): VoiceSampleSourceV1[] {
    return SAMPLE_ORIGINS.map((key) => ({
      key,
      available: actor.canManage,
      ...(actor.canManage
        ? {}
        : {
            unavailableReason: `«${ORIGIN_LABELS[key]}» — загрузка доступна редактору и администратору.`,
          }),
    }));
  }

  async samples(actor: VoiceActor, notice?: string) {
    const locale = actor.locale ?? 'ru';
    const corpus = await this._samples.listActive(
      actor.organizationId,
      await this.corpusScope(actor)
    );
    const readiness = corpusReadiness(corpus.map(toInput));
    return {
      state: (corpus.length
        ? 'default'
        : 'empty') as VoiceScreenStateV1,
      samples: corpus.map((sample) => this.sampleRow(sample, locale)),
      sources: this.sources(actor),
      readiness: toReadiness(readiness),
      ...(notice ? { notice } : {}),
    };
  }

  /**
   * The three refusals every intake owes, whatever the text arrived in.
   *
   * Checked once and in one place so the file route and the JSON route cannot
   * come to disagree about what a reference costs: the confirmed right and the
   * date the raw text is erased are the promise made to whoever wrote it, and
   * a second path quietly not asking for them would break that promise
   * silently.
   */
  private assertIntakeAllowed(
    actor: VoiceActor,
    usagePurpose: VoiceSampleIntakeRequestV1['usagePurpose'],
    body: { rightsConfirmed?: boolean; retentionUntil?: string }
  ): SampleRightsState {
    this.assertCanManage(actor);
    const reference = usagePurpose === 'STYLE_REFERENCE';
    if (reference && this.referenceDisabled()) {
      throw new VoiceError(
        'VOICE_REFERENCE_DISABLED',
        'Путь «по образцу чужого стиля» отключён в этой организации.'
      );
    }
    if (reference && !body.rightsConfirmed) {
      throw new VoiceError(
        'VOICE_RIGHTS_REQUIRED',
        'Для чужих текстов нужно подтвердить право на их использование.'
      );
    }
    if (reference && !body.retentionUntil) {
      throw new VoiceError(
        'VOICE_RIGHTS_REQUIRED',
        'Для чужих текстов нужен срок хранения: исходный текст стирается по его наступлении.'
      );
    }
    return reference ? 'RIGHTS_CONFIRMED' : 'OWN_CONTENT';
  }

  /**
   * The one number `ArrayMaxSize` on the DTO cannot state on its own: five
   * hundred items at two hundred thousand characters each is a hundred
   * million characters, and nothing bounds their sum until this does.
   *
   * Checked here rather than as a `class-validator` constraint on the DTO —
   * a live pass against the running backend caught the difference: a batch
   * over this ceiling but under the byte one answered
   * `{"message":["Сумма знаков ..."],"error":"Bad Request","statusCode":400}`,
   * the global `ValidationPipe`'s own shape, not `VoiceErrorBodyV1`. The
   * comment on `retentionUntil` two fields below already states the rule this
   * broke: a refusal that names a product limit needs the code the screen
   * branches on, and a validator only ever produces a shapeless 400.
   */
  private assertPasteBatchWithinCeiling(
    items: VoiceSampleIntakeRequestV1['items']
  ): void {
    const total = items.reduce(
      (sum, item) => sum + (item.text?.length ?? 0),
      0
    );
    if (total > VOICE_SAMPLE_PASTE_LIMITS.maxCharsPerRequest) {
      throw new VoiceError(
        'VOICE_PAYLOAD_TOO_LARGE',
        `Сумма знаков во всех образцах больше ${VOICE_SAMPLE_PASTE_LIMITS.maxCharsPerRequest}. Разделите вставку на несколько заходов.`
      );
    }
  }

  async intake(
    actor: VoiceActor,
    body: VoiceSampleIntakeRequestV1
  ): Promise<VoiceSampleIntakeResponseV1> {
    const rightsState = this.assertIntakeAllowed(
      actor,
      body.usagePurpose,
      body
    );
    this.assertPasteBatchWithinCeiling(body.items);
    const reference = body.usagePurpose === 'STYLE_REFERENCE';

    const prepared = prepareSamples(
      body.items.map((item) => ({
        origin: body.origin,
        title: item.title,
        text: item.text,
        language: body.language,
        sourceId: item.sourceId,
        postId: item.postId,
        externalRef: item.externalRef,
      })),
      {
        usagePurpose: body.usagePurpose,
        rightsState,
        language: body.language,
        knownHashes: await this._samples.knownHashes(
          actor.organizationId,
          await this.corpusScope(actor)
        ),
      }
    );

    return this.storePrepared(actor, prepared, {
      reference,
      retentionUntil: body.retentionUntil,
    });
  }

  /**
   * Everything that happens after a text is a text, whatever it arrived as.
   *
   * Pasted blocks, a Telegram export and the contents of a `.docx` differ only
   * in how they became strings; the redaction, the storage, the duplicate
   * check and the counting after that are one behaviour, and having two copies
   * of it is how a file upload ends up storing a reference nobody scrubbed.
   */
  private async storePrepared(
    actor: VoiceActor,
    prepared: ReturnType<typeof prepareSamples>,
    options: { reference: boolean; retentionUntil?: string }
  ): Promise<VoiceSampleIntakeResponseV1> {
    const reference = options.reference;
    const body = { retentionUntil: options.retentionUntil };
    // The identity barrier runs before storage, not before reading. A name
    // that reached the column has already left the source's control even if
    // nothing ever reads it back.
    const accepted = reference
      ? prepared.accepted.map((sample) => {
          const { redacted, redactions } = redactReference(
            sample.text,
            { people: [], organisations: [] },
            []
          );
          return {
            ...sample,
            text: redacted,
            redactions: [
              ...sample.redactions,
              ...redactions.map((one) => ({
                kind: 'SECRET' as const,
                count: one.occurrences,
                category: one.category,
                examples: one.examples,
              })),
            ],
          };
        })
      : prepared.accepted;

    const { created, duplicates } = await this._samples.addSamples(
      actor.organizationId,
      accepted,
      {
        retentionUntil: body.retentionUntil
          ? new Date(body.retentionUntil)
          : null,
        /**
         * Stamped on the way in, so a text never has to be guessed at later.
         *
         * A space with no avatar yet stores `null`, and the first avatar reads
         * those as its own by being the default — the intake screens work
         * before any profile does, and refusing an upload until somebody
         * creates an avatar would close the only door a new workspace has.
         */
        avatarId: (await this.corpusScope(actor)).avatarId ?? null,
      }
    );

    const coded = await this._samples.listAll(actor.organizationId);
    const byId = new Map(coded.map((sample) => [sample.id, sample]));
    const locale = actor.locale ?? 'ru';
    const corpus = coded.filter((sample) => !sample.deletedAt);

    return {
      accepted: created
        .map((row) => byId.get(row.id))
        .filter((row): row is CodedVoiceSample => Boolean(row))
        .map((row) => this.sampleRow(row, locale)),
      rejected: [
        ...prepared.rejected,
        ...duplicates.map((sample) => ({
          title: sample.title,
          reason: 'DUPLICATE' as const,
        })),
      ],
      readiness: toReadiness(corpusReadiness(corpus.map(toInput))),
    };
  }

  /**
   * Files, turned into texts and then into samples.
   *
   * Two layers can refuse a file and they refuse for different reasons: the
   * first cannot open it — a format nobody asked for, a password, a scan with
   * no text in it — and the second read it fine and found a fragment, a
   * duplicate or traces of generation. Both belong to the same upload, so both
   * come back in the order the files were picked. A person looking at four
   * lines under four file names should not have to work out which of them the
   * server answered in a different order.
   */
  async intakeFiles(
    actor: VoiceActor,
    files: readonly FileUpload[],
    body: VoiceSampleFileIntakeRequestV1
  ): Promise<VoiceSampleIntakeResponseV1> {
    const rightsState = this.assertIntakeAllowed(
      actor,
      body.usagePurpose,
      body
    );
    const reference = body.usagePurpose === 'STYLE_REFERENCE';

    const read = await parseUploadedFiles(files);
    const prepared = prepareSamples(
      read.candidates.map((candidate) => ({
        ...candidate,
        language: body.language,
      })),
      {
        usagePurpose: body.usagePurpose,
        rightsState,
        language: body.language,
        knownHashes: await this._samples.knownHashes(
          actor.organizationId,
          await this.corpusScope(actor)
        ),
      }
    );
    const stored = await this.storePrepared(actor, prepared, {
      reference,
      retentionUntil: body.retentionUntil,
    });

    // FIFO by name, and by layer: a file refused before it was opened never
    // reached the second layer, so its own reason comes first. Two files
    // sharing a literal name in one batch — the same file picked twice, most
    // plausibly — each keep their own line instead of one overwriting the
    // other, the same way `file-intake.ts` keeps them apart.
    const queues = new Map<
      string,
      VoiceSampleIntakeResponseV1['rejected']
    >();
    for (const entry of read.rejected) {
      const queue = queues.get(entry.name) ?? [];
      queue.push({
        title: entry.name,
        reason: entry.reason,
        ...(entry.detail ? { detail: entry.detail } : {}),
      });
      queues.set(entry.name, queue);
    }
    for (const entry of stored.rejected) {
      const queue = queues.get(entry.title) ?? [];
      queue.push(entry);
      queues.set(entry.title, queue);
    }

    const rejected: VoiceSampleIntakeResponseV1['rejected'] = [];
    for (const file of files) {
      const entry = queues.get(file.name)?.shift();
      if (entry) rejected.push(entry);
    }

    return { ...stored, rejected };
  }

  async deleteSamples(actor: VoiceActor, body: VoiceSampleDeleteRequestV1) {
    this.assertCanManage(actor);
    const all = await this._samples.listAll(actor.organizationId);
    const byCode = new Map(all.map((sample) => [sample.code, sample]));

    const targets: CodedVoiceSample[] = [];
    for (const code of body.codes) {
      const sample = byCode.get(code);
      if (!sample || sample.deletedAt) {
        throw new VoiceError(
          'VOICE_SAMPLE_NOT_FOUND',
          `Образец ${code} не найден.`,
          code
        );
      }
      targets.push(sample);
    }

    await this._samples.softDelete(
      actor.organizationId,
      targets.map((sample) => sample.id)
    );
    // The measurement is marked, not recomputed. Recomputing moves corridors,
    // and with them what the generator may write.
    const stale = await this._samples.markMeasurementsStale(
      actor.organizationId,
      targets.map((sample) => sample.code)
    );

    const notice = stale
      ? `Удалено образцов: ${targets.length}. Разбор помечен устаревшим — числа посчитаны на прежнем корпусе.`
      : `Удалено образцов: ${targets.length}.`;
    return this.samples(actor, notice);
  }

  /* ---------------------------------------------------------------------
   * Screen 04 — the analysis
   * ------------------------------------------------------------------ */

  /**
   * Whose corpus this request is about.
   *
   * Every read and every write of the corpus goes through here, because until
   * 2026-08-26 none of them did: `BrandVoiceSample` carried only
   * `organizationId`, so a space with three avatars measured all three over
   * everybody's texts and produced one averaged author three times. The screen
   * promised several authors in one space and the storage could not hold them
   * apart.
   *
   * Two facts come out of one read of the profile. `avatarId` is which avatar
   * the request is about — `actor.avatarId` when it names one, the space's
   * default when it does not. `inherited` says whether texts stored before
   * avatars existed belong to it: they do, to the default one, which is what
   * makes every corpus loaded until now read exactly as it did.
   *
   * A space with no profile at all scopes to nothing, and the corpus is the
   * whole space — the intake screens work before any avatar does, and those
   * texts are what the first avatar will be measured from.
   */
  private async corpusScope(
    actor: VoiceActor,
    usagePurpose?: 'OWN_VOICE' | 'STYLE_REFERENCE'
  ): Promise<{
    usagePurpose?: 'OWN_VOICE' | 'STYLE_REFERENCE';
    avatarId?: string;
    inherited?: boolean;
  }> {
    const { profile } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    if (!profile) return usagePurpose ? { usagePurpose } : {};
    return {
      ...(usagePurpose ? { usagePurpose } : {}),
      avatarId: profile.id,
      inherited: Boolean(profile.isDefault),
    };
  }

  private async corpusFor(actor: VoiceActor) {
    const own = await this._samples.listActive(
      actor.organizationId,
      await this.corpusScope(actor, 'OWN_VOICE')
    );
    if (own.length) return own;
    return this._samples.listActive(
      actor.organizationId,
      await this.corpusScope(actor, 'STYLE_REFERENCE')
    );
  }

  private measurementReady(
    measurement: StoredVoiceMeasurement
  ): Extract<VoiceAnalysisResponseV1, { outcome: 'ready' }> {
    // Read back rather than recomputed, so a reloaded screen says exactly what
    // the run said: a text dropped for an AI artefact stays dropped and named.
    const rejected = metricsOf(measurement).rejected ?? [];
    // The holdout is why a corpus of eight is measured on six. Counted from
    // the stored split rather than recomputed, for the same reason `rejected`
    // is read back: the screen has to say what this run did.
    const holdout = Object.values(measurement.corpusSplit ?? {}).filter(
      (part) => part === 'HOLDOUT'
    ).length;
    return {
      outcome: 'ready',
      ...(holdout ? { holdoutCount: holdout } : {}),
      measurementId: measurement.id,
      analyzerVersion: measurement.analyzerVersion,
      localePackVersion: measurement.localePackVersion,
      language: (measurement.language as BrandVoiceLocale) ?? 'ru',
      sampleCount: measurement.sampleCount,
      charCount: measurement.charCount,
      wordCount: measurement.wordCount,
      sentenceCount: measurement.sentenceCount,
      lexicon: measurement.lexicon ?? [],
      punctuation:
        measurement.punctuation ?? {
          dashInsteadOfCopula: null,
          colonBeforeList: null,
          questionAtEnd: null,
          exclamation: null,
        },
      rejected,
    };
  }

  /**
   * Где у этого автора проходят границы «похоже» и «не похоже».
   *
   * Считается сразу после разбора и на том же материале, потому что точка —
   * свойство пары «этот отпечаток, эта шеренга», и переживает ровно столько,
   * сколько переживает отпечаток.
   *
   * Положительные примеры — отложенная часть корпуса: тексты, которых
   * отпечаток не видел. Обучающая часть сюда не годится, она набирает больше,
   * чем наберёт следующий пост человека, и порог уехал бы вверх.
   *
   * Отрицательные — настоящие тексты других авторов системы. Никогда не
   * сгенерированные: генерация под голосом этого человека прячется лучше, чем
   * посторонний, и порог, снятый на посторонних, её местами пропускает. Замер
   * 27.08.2026 на трёх корпусах — 0%, 16% и 30% пропущенных генераций при 3%
   * пропущенных людей. Это известная слабость выбранной точки, а не свойство,
   * о котором никто не знает; сужается она собственными генерациями
   * пространства, когда те появятся.
   *
   * Отказ — обычный исход, а не ошибка: свежее пространство, единственный
   * аватар в системе или язык, на котором больше никто не писал, дают
   * `UNCALIBRATED`, и продукт тогда сообщает голос без вердикта.
   */
  /**
   * Черновики, которые продукт написал этому автору, а автор переписал.
   *
   * Второй противник рабочей точки, и настоящий: не чужой человек, а машина,
   * писавшая на темы этого автора. Что именно берётся и почему — в
   * `VoiceEditRepository.rewrittenDrafts`; здесь только то, что чтение не
   * имеет права уронить разбор.
   *
   * Разбор — это числа человека о его собственных текстах, и они нужны ему
   * независимо от того, набралось ли, с чем его сравнить. Пространство без
   * правок и пространство, чью таблицу не удалось прочитать, получают ровно
   * прежнее правило, снятое на одних чужих людях.
   */
  private async rewrittenDrafts(
    organizationId: string,
    avatarId: string | null,
    language: string
  ): Promise<string[]> {
    if (!this._edits || !avatarId) return [];
    try {
      return await this._edits.rewrittenDrafts(
        organizationId,
        avatarId,
        language,
        CALIBRATION_DRAFT_SAMPLES
      );
    } catch {
      return [];
    }
  }

  private async calibrationFor(
    actor: VoiceActor,
    avatarId: string | null,
    inputs: readonly BrandVoiceSampleInput[],
    result: BrandVoiceMeasurementResult
  ): Promise<{ calibration: VoiceCalibration; lineup: ImpostorSet | null }> {
    const nothing = (
      reason?: VoiceCalibration['reason']
    ): { calibration: VoiceCalibration; lineup: ImpostorSet | null } => ({
      calibration: reason ? { ...UNCALIBRATED, reason } : UNCALIBRATED,
      lineup: null,
    });
    if (!result.voicePrint?.ngrams) return nothing();
    const pack = packFor(result.language);
    if (!pack) return nothing();

    const holdout = inputs.filter(
      (one) => result.split[one.code] === 'HOLDOUT'
    );
    if (holdout.length < MIN_CALIBRATION_SAMPLES) {
      return nothing('TOO_FEW_OWN');
    }

    let foreign: string[] = [];
    try {
      foreign = await this._samples.foreignSamples(
        { organizationId: actor.organizationId, avatarId },
        result.language,
        CALIBRATION_FOREIGN_SAMPLES
      );
    } catch {
      /**
       * Чтение чужого материала не роняет разбор.
       *
       * Разбор — это числа человека о его собственных текстах, и они ему нужны
       * независимо от того, нашлось ли в системе, с чем его сравнить. Отказ
       * калибровки выглядит как её отсутствие, что и есть правда.
       */
      return nothing('TOO_FEW_FOREIGN');
    }

    /**
     * Шеренга и порог снимаются на одном и том же материале, и это обязательно.
     *
     * Голос — число относительно шеренги. Порог, снятый против одной шеренги и
     * применённый к голосу против другой, сравнивал бы две разные величины, и
     * ошибка была бы бесшумной: оба числа лежат в нуле-единице и оба выглядят
     * как доля голосов.
     */
    const parts = splitForeign(foreign);
    const lineup =
      buildLineup(parts.lineup, result.voicePrint.ngrams, result.language) ??
      impostorsFor(result.language);
    const impostors = lineup;
    /**
     * Обрезка одна на обе стороны и на всё дальнейшее.
     *
     * Длина — сама по себе громкая привычка: у длинного текста больше окон,
     * гистограмма ровнее, и каждое расстояние до него короче. Порог, снятый на
     * полной длине и применённый к обрезанному тексту, сравнивал бы две разные
     * величины.
     */
    const cut = CALIBRATION_CUT;
    const votesOf = (texts: readonly string[]) =>
      texts
        .map(
          (text) =>
            measureSimilarity(
              text.slice(0, cut),
              result.voicePrint,
              pack,
              impostors
            ).votes
        )
        .filter((one): one is number => one !== null);

    /**
     * Каждый k-й отложенный текст, а не все.
     *
     * Тысяча постов даёт триста отложенных, каждый из которых стоит шестидесяти
     * раундов голосования против шести подставных. Сотни хватает: пятипроцентный
     * допуск на ней это пять наблюдений, а разбор не должен идти минуты.
     */
    const step = Math.max(
      1,
      Math.ceil(holdout.length / CALIBRATION_OWN_SAMPLES)
    );
    const own = votesOf(
      holdout.filter((_, index) => index % step === 0).map((one) => one.text)
    );

    return {
      calibration: calibrate(
        own,
        votesOf(parts.negatives),
        votesOf(
          await this.rewrittenDrafts(
            actor.organizationId,
            avatarId,
            result.language
          )
        )
      ),
      /**
       * Шеренга едет с разбором только тогда, когда она его собственная.
       *
       * Если чужого материала не хватило и взят набор из сборки, хранить его
       * незачем — он и так лежит в образе, а копия в базе через полгода стала
       * бы вторым источником правды о том, кем судили.
       */
      lineup: lineup === impostorsFor(result.language) ? null : lineup,
    };
  }

  async runAnalysis(
    actor: VoiceActor,
    body: VoiceAnalysisRequestV1 = {}
  ): Promise<VoiceAnalysisResponseV1> {
    this.assertCanManage(actor);

    const corpus = await this.corpusFor(actor);
    const inputs = corpus.map(toInput);
    const readiness = corpusReadiness(inputs);
    if (!readiness.ready) {
      return { outcome: 'insufficient', readiness: toReadiness(readiness) };
    }

    let result;
    try {
      result = analyzeBrandVoice(inputs, { language: body.language });
    } catch (error) {
      throw new VoiceError(
        'VOICE_ANALYSIS_FAILED',
        'Разбор не удалось завершить.',
        error instanceof Error ? error.message : undefined
      );
    }

    const scope = await this.corpusScope(actor);
    const point = await this.calibrationFor(
      actor,
      scope.avatarId ?? null,
      inputs,
      result
    );
    result.calibration = point.calibration;
    result.lineup = point.lineup;

    /**
     * The arithmetic is saved before the model is asked, because it is the
     * person's and it survives the model.
     *
     * `VOICE_ASSIST_UNAVAILABLE` says «Числа разбора сохранены», and until
     * this it said so over a row that was never written: `saveMeasurement`
     * stood after the assist call, and a model that did not answer threw past
     * it. An eighteen-thousand-character corpus was then recounted from
     * nothing on the next attempt — and that attempt is a paid call. The
     * proposal is written onto the same row once it exists, so a run that
     * reaches the end still stores measurement and proposal together.
     */
    const measurement = await this._samples.saveMeasurement(
      actor.organizationId,
      {
        result,
        deviations: this.deviationsFor(corpus, result.language),
        // Whose analysis this is. Without it `latestMeasurement` hands the
        // newest run in the space to every avatar that asks.
        avatarId: scope.avatarId ?? null,
      }
    );

    let proposal: StoredVoiceProposalV1 | undefined;
    if (body.withAssist) {
      if (!this._assist) {
        throw new VoiceError(
          'VOICE_ASSIST_UNAVAILABLE',
          'Агентный слепок недоступен: модель не подключена.'
        );
      }
      const byCode = new Map(inputs.map((sample) => [sample.code, sample]));
      const outcome = await this._assist.propose({
        organizationId: actor.organizationId,
        samples: inputs,
        measurement: result,
        locale: toReportLocale(result.language),
      });
      proposal = {
        portrait: outcome.proposal.portrait
          ? {
              text: outcome.proposal.portrait.text,
              observationRefs: outcome.proposal.portrait.observationRefs,
              status: 'UNDECIDED',
            }
          : undefined,
        fields: outcome.proposal.fields.map((field) => ({
          key: field.field,
          text: field.text,
          status: 'UNDECIDED',
          observationRefs: field.observationRefs,
        })),
        observations: outcome.observations.map((observation, index) => ({
          ref: observation.ref,
          index: index + 1,
          field: observation.field,
          claim: observation.claim,
          quote: observation.quote,
          sampleCode: observation.sampleCode,
          metric: observation.metric ?? null,
        })),
        categories: {
          pointOfView: outcome.proposal.pointOfView,
          formality: outcome.proposal.formality,
          emojiPolicy: outcome.proposal.emojiPolicy,
          hashtagPolicy: outcome.proposal.hashtagPolicy,
          neverSay: outcome.proposal.neverSay,
        },
      };
      // Every quote is checked against the sample it names before it is
      // stored. `runAssist` already dropped the ungrounded ones; this refuses
      // a proposal whose grounds do not exist at all.
      proposal.observations = proposal.observations.filter((observation) =>
        byCode.has(observation.sampleCode)
      );

      const metrics = buildMeasurementMetrics(result, { proposal });
      await this._samples.updateMeasurement(
        actor.organizationId,
        measurement.id,
        { metrics }
      );
      return this.measurementReady({ ...measurement, metrics });
    }

    return this.measurementReady(measurement);
  }

  /**
   * Пересчитать числа действующего голоса, ничего не спрашивая у модели.
   *
   * ## Зачем это отдельное действие
   *
   * Мерка похожести — свойство пары «отпечаток, шеренга», и у голоса,
   * разобранного до 27.08.2026, её нет вовсе. Само это не проходит: продукт
   * не пересчитывает чужие разборы по расписанию и не должен. Единственной
   * дверью к границам оставался мастер, а он всегда зовёт модель — то есть
   * человек платил за портрет, который у него уже есть, ради арифметики,
   * которая ничего не стоит. `withAssist: false` сервис умел с самого начала;
   * не было входа.
   *
   * ## Почему одного разбора мало
   *
   * `textCheck` читает не свежий разбор, а тот, что проштампован на
   * действующей версии голоса. Разбор, оставленный без штампа, лёг бы в базу
   * и не изменил на экране ничего — кнопка сообщала бы об успехе, а вердикт
   * молчал бы дальше. Поэтому штамп переставляется здесь же, и оба шага —
   * одно действие человека.
   *
   * Переставить штамп на месте, а не завести версию, — потому что голос не
   * меняется: те же пять полей, тот же digest. Продукт и так предпочитает
   * свежий разбор среди версий с одинаковым содержимым (`measurementFor`
   * берёт последний по времени), так что новая версия отличалась бы от старой
   * ровно ничем и засоряла бы историю строкой, которой никто не делал.
   *
   * ## Что меняется на экранах
   *
   * Числа паспорта и коридоры шкал — они пересчитываются по нынешнему
   * корпусу, а он мог вырасти с тех пор, как голос активировали. Слова голоса
   * не трогаются: портрет, поля и примеры остаются теми, что человек принял.
   */
  async refreshMeasure(
    actor: VoiceActor
  ): Promise<VoiceAnalysisResponseV1> {
    this.assertCanManage(actor);

    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    if (!activeVersion) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Действующего голоса нет: пересчитывать числа не для чего.'
      );
    }

    /**
     * Шкалы, которые человек подвинул рукой, — до того как разбор их заменит.
     *
     * Разбор делает НОВОЕ измерение, а подвинутые границы лежат на старом,
     * так что без этого шага они молча исчезали бы. Пока границу правили в
     * форме под сгибом, это было умозрительно; с тех пор как её тянут мышью
     * прямо на полосе, это случится.
     *
     * Перенос, а не сброс, потому что это разные вещи: разбор — измерение, а
     * подвинутая граница — мнение человека о своей же шкале. Честная система
     * хранит обе и показывает, что они разошлись, а не выбирает за него.
     */
    const before = metricsOf(
      await this.measurementForActiveVersion(actor.organizationId, activeVersion)
    ).scales;
    const moved = Object.entries(before).filter(
      ([, scale]) => isScaleValue(scale) && scale.corridorSource === 'MANUAL'
    );

    const outcome = await this.runAnalysis(actor, { withAssist: false });
    /**
     * Корпуса не хватило — отвечаем тем же, чем отвечает разбор.
     *
     * Штамповать тут нечего: измерения не случилось. Экран показывает ту же
     * недостачу, что показал бы мастер, и человек видит настоящую причину, а
     * не «не удалось».
     */
    if (outcome.outcome !== 'ready') return outcome;

    if (moved.length) {
      const fresh = await this._samples.getMeasurement(
        actor.organizationId,
        outcome.measurementId
      );
      const metrics = metricsOf(fresh);
      for (const [key, scale] of moved) {
        const measured = metrics.scales[key as StyleScaleKey];
        if (!isScaleValue(scale) || !isScaleValue(measured)) continue;
        const kept = scale as StoredScaleValue;
        metrics.scales[key as StyleScaleKey] = {
          ...measured,
          low: kept.low,
          high: kept.high,
          corridorSource: 'MANUAL',
          ...(kept.excluded === undefined ? {} : { excluded: kept.excluded }),
          /**
           * Что намерил свежий разбор под перенесённой границей.
           *
           * Без этого экран не может предложить «принять измеренное»: он видит
           * только то, что человек поставил сам, и вернуть его к продуктовому
           * числу было бы некуда.
           */
          measuredLow: measured.low,
          measuredHigh: measured.high,
        };
      }
      await this._samples.updateMeasurement(
        actor.organizationId,
        outcome.measurementId,
        { metrics }
      );
    }

    await this._profiles.stampMeasurement(
      actor.organizationId,
      activeVersion.id,
      outcome.measurementId
    );
    return outcome;
  }

  /**
   * Where this author sits against the norm, measured the way the norm was.
   *
   * The same statistic on both sides, and that is the whole of the method: the
   * norm is the median of `measureSingleText` over reference posts, so the
   * author's side has to be the median of `measureSingleText` over their posts.
   * Comparing a corpus-level aggregate — which pools every sentence of every
   * text — against a distribution of per-post values would be comparing two
   * different numbers and calling the difference a position.
   *
   * `null` where the language has no norm. That reads as "no position stated",
   * which is what the screens draw, and never as «как обычно».
   */
  private deviationsFor(
    corpus: readonly CodedVoiceSample[],
    language: BrandVoiceLocale
  ): VoiceMeasurementMetricsV1['deviations'] {
    const pack = packFor(language);
    if (!pack) return undefined;
    return (
      deviationsForCorpus(corpus, pack, normFor(language)) ?? undefined
    );
  }

  /**
   * The stored deviations, turned into the sentences a version carries.
   *
   * Phrased here rather than in the block, so the screen and the generator
   * read one string and cannot come to describe the same author differently.
   * Ordered by how far the author is from the norm: what is most unlike an
   * ordinary post is what a reader most needs first, and what the model has
   * least chance of guessing.
   */
  private directionsFrom(
    measurement: StoredVoiceMeasurement | null,
    locale: BrandVoiceLocale
  ): BrandProfileContentV1['voice']['directions'] {
    const stored = metricsOf(measurement).deviations;
    if (!stored?.byMetric) return undefined;
    const said = Object.entries(stored.byMetric)
      .map(([metric, value]) => {
        const phrased = phraseDeviation(
          metric as NormMetricKey,
          {
            band: value.band as never,
            z: value.z,
            raw: value.raw,
            /**
             * Число эталона из самого измерения, а не `null`.
             *
             * До 28.08.2026 здесь стоял `null`, и предложение теряло ту часть,
             * которая отличает двух авторов внутри одной полосы. У измерений,
             * снятых раньше этой даты, поля нет — тогда сравнение просто не
             * произносится, а не выдумывается.
             */
            normMedian: value.normMedian ?? null,
          },
          locale
        );
        return phrased.text
          ? {
              metric,
              band: value.band,
              text: phrased.text,
              detail: phrased.detail,
            }
          : null;
      })
      .filter((one): one is NonNullable<typeof one> => Boolean(one))
      .sort((left, right) => {
        const far = (band: string) =>
          band === 'far-above' || band === 'far-below' ? 0 : 1;
        return far(left.band) - far(right.band);
      });
    return said.length ? said : undefined;
  }

  async analysis(actor: VoiceActor): Promise<VoiceAnalysisResponseV1> {
    const measurement = await this._samples.latestMeasurement(
      actor.organizationId,
      await this.corpusScope(actor)
    );
    if (!measurement) {
      const corpus = await this.corpusFor(actor);
      return {
        outcome: 'insufficient',
        readiness: toReadiness(corpusReadiness(corpus.map(toInput))),
      };
    }
    return this.measurementReady(measurement);
  }

  /* ---------------------------------------------------------------------
   * Screen 05 — the proposal
   * ------------------------------------------------------------------ */

  private async latestWithProposal(actor: VoiceActor) {
    const measurement = await this._samples.latestMeasurement(
      actor.organizationId,
      await this.corpusScope(actor)
    );
    if (!measurement) return { measurement: null, proposal: null };
    return { measurement, proposal: metricsOf(measurement).proposal ?? null };
  }

  async proposal(actor: VoiceActor): Promise<VoiceProposalResponseV1> {
    const { measurement, proposal } = await this.latestWithProposal(actor);
    if (!measurement) {
      const corpus = await this.corpusFor(actor);
      return {
        outcome: 'insufficient',
        readiness: toReadiness(corpusReadiness(corpus.map(toInput))),
      };
    }
    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );

    const fields = (proposal?.fields ?? []).filter((field) =>
      (PROFILE_FIELDS as readonly string[]).includes(field.key)
    );

    return {
      outcome: 'ready',
      state: fields.length ? 'default' : 'empty',
      mode: 'assist',
      ...(proposal?.portrait
        ? {
            portrait: {
              text: proposal.portrait.text,
              status: proposal.portrait.status,
              observationRefs: proposal.portrait.observationRefs,
            },
          }
        : {}),
      fields: fields.map((field) => ({
        key: field.key as ProfileField,
        text: field.text,
        status: field.status,
        observationRefs: field.observationRefs,
      })),
      observations: (proposal?.observations ?? []).map((observation) => ({
        ref: observation.ref,
        index: observation.index,
        field: observation.field as ProfileField,
        claim: observation.claim,
        quote: observation.quote,
        sampleCode: observation.sampleCode,
        ...(observation.metric
          ? {
              metric: observation.metric as
                | StyleScaleKey
                | PostHabitMetricKey,
            }
          : {}),
      })),
      ...(activeVersion?.label ? { profileLabel: activeVersion.label } : {}),
      ...(proposal?.activatedAt ? { activatedAt: proposal.activatedAt } : {}),
      ...(measurement.stale
        ? {
            notice:
              'Разбор помечен устаревшим: часть образцов удалена после подсчёта.',
          }
        : !fields.length
        ? {
            notice:
              'Числа посчитаны, предложение голоса ещё не составлено. Запустите агентный слепок.',
          }
        : {}),
    };
  }

  async proposalField(
    actor: VoiceActor,
    body: VoiceProposalFieldRequestV1
  ): Promise<VoiceProposalResponseV1> {
    this.assertCanManage(actor);
    const { measurement, proposal } = await this.latestWithProposal(actor);
    if (!measurement || !proposal) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Предложения голоса нет: сначала запустите разбор.'
      );
    }
    let field = proposal.fields.find((one) => one.key === body.key);
    if (!field) {
      /**
       * A line the corpus could not ground is still a line the person writes.
       *
       * Observations are tied to counted metrics, and nothing counts «кто
       * говорит» or «к кому обращаемся» — so those three lines can never be
       * proposed, however good the corpus is. Refusing to save them left the
       * assist path activating a voice whose «Кто говорит» was empty and whose
       * audience was the `EMPTY_CONTENT` placeholder, with nothing on screen
       * saying so (`content-factory-next-vme.21.11`). Written by hand, it is
       * accepted like any other; only `SAVE` may create it, because `ACCEPT`
       * of a line nobody wrote would accept an empty string.
       */
      if (body.action !== 'SAVE' || !body.text?.trim()) {
        throw new VoiceError(
          'VOICE_PROFILE_NOT_FOUND',
          `Поле ${body.key} не предложено: у корпуса нет для него основания. Напишите его сами — оно сохранится вместе с остальными.`,
          body.key
        );
      }
      field = {
        key: body.key,
        text: '',
        status: 'UNDECIDED',
        // No grounds, and the panel says exactly that rather than borrowing
        // somebody else's quotes.
        observationRefs: [],
      };
      proposal.fields.push(field);
    }

    // Editing one field restarts nothing: the other four keep their state and
    // the numbers underneath are untouched.
    if (body.action === 'ACCEPT') field.status = 'ACCEPTED';
    if (body.action === 'EDIT') field.status = 'EDITING';
    if (body.action === 'SAVE') {
      if (typeof body.text === 'string' && body.text.trim()) {
        field.text = body.text.trim();
      }
      field.status = 'ACCEPTED';
    }

    await this.persistProposal(actor, measurement, proposal);
    return this.proposal(actor);
  }

  /**
   * The portrait, decided the way a field is decided — with one difference.
   *
   * A field the corpus could not ground may still be written by hand, because
   * nothing counts «кто говорит». A portrait may not: it is prose about a
   * person, and a portrait typed into a profile the model never wrote one for
   * would be a description with nothing behind it, which is the failure the
   * grounding rules exist to prevent. So `SAVE` edits an existing portrait and
   * never creates one, and a space with no portrait is told to re-run the
   * analysis rather than handed an empty box.
   */
  async proposalPortrait(
    actor: VoiceActor,
    body: VoiceProposalPortraitRequestV1
  ): Promise<VoiceProposalResponseV1> {
    this.assertCanManage(actor);
    const { measurement, proposal } = await this.latestWithProposal(actor);
    if (!measurement || !proposal) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Предложения голоса нет: сначала запустите разбор.'
      );
    }
    if (!proposal.portrait) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Портрет не составлен: у разбора не нашлось для него основания. Запустите агентный слепок заново.'
      );
    }

    const portrait = proposal.portrait;
    if (body.action === 'ACCEPT') portrait.status = 'ACCEPTED';
    if (body.action === 'EDIT') portrait.status = 'EDITING';
    if (body.action === 'SAVE') {
      const text = body.text?.trim();
      if (text) portrait.text = truncateChars(text, 1_200);
      portrait.status = 'ACCEPTED';
    }

    await this.persistProposal(actor, measurement, proposal);
    return this.proposal(actor);
  }

  private persistProposal(
    actor: VoiceActor,
    measurement: StoredVoiceMeasurement,
    proposal: StoredVoiceProposalV1
  ) {
    const metrics = metricsOf(measurement);
    return this._samples.updateMeasurement(
      actor.organizationId,
      measurement.id,
      { metrics: { ...metrics, proposal } }
    );
  }

  /**
   * The proposal, written into a profile version.
   *
   * The voice fields land where the rest of the product already reads them
   * from, so a generation started an hour later carries the same words. The
   * previous active version is the base: activating a voice must not silently
   * erase a project description nobody was editing.
   */
  private contentFrom(
    proposal: StoredVoiceProposalV1,
    base: BrandProfileContentV1 | null,
    examples: readonly { kind: 'on_brand'; text: string }[] = [],
    postLength?: { median: number; low: number; high: number },
    directions?: BrandProfileContentV1['voice']['directions'],
    bringsOwnMeasurements?: { share: number; of: number },
    postLayout?: BrandProfileContentV1['voice']['postLayout']
  ): BrandProfileContentV1 {
    const content = clone(base ?? EMPTY_CONTENT);
    /**
     * The habits, said as directions against the norm.
     *
     * Written onto the version rather than recomputed when the block is built,
     * for the reason the norm carries a version at all: it changes every
     * number a person has already read, and a version that re-described itself
     * on every read would rewrite its own history quietly.
     */
    if (directions?.length) content.voice.directions = directions;
    /**
     * The length this author actually writes at.
     *
     * Measured by `post-habits.ts` and, until this, kept only for a screen: the
     * generator was told «Post should be long» whoever it was writing as. The
     * owner writes 823 characters and the product produced 1800–2944.
     */
    if (postLength) content.voice.postLength = postLength;
    /**
     * Как часто автор приносит собственное измеренное число.
     *
     * Не инструкция и в промпт не идёт: приносить модели нечего, и требовать
     * от неё числа значило бы просить их выдумать. Нужна после черновика —
     * `draft-gaps.ts` решает по ней, предлагать ли человеку добавить свою
     * цифру, и по ней же молчит, когда привычки нет.
     */
    if (bringsOwnMeasurements) {
      content.voice.bringsOwnMeasurements = bringsOwnMeasurements;
    }
    /**
     * Как этот автор ломает абзац — измерено, а не спрошено.
     *
     * На тех же правах, что и `postLength`: число, а не прилагательное. В
     * промпт пока не идёт — тем же основанием, что и у `bringsOwnMeasurements`:
     * помогает ли это как правило, ещё не измерено.
     */
    if (postLayout) content.voice.postLayout = postLayout;
    /**
     * The author's own posts, which the field was built for and never held.
     *
     * Demonstrations beat descriptions and descriptions beat numbers — both
     * answers of the research, and DITTO's +19 points at fewer than ten
     * demonstrations. Somebody's hand-written examples are not overwritten: a
     * person who typed their own is telling the product something the corpus
     * cannot.
     */
    if (examples.length && !(content.examples ?? []).length) {
      content.examples = toProfileExamples(examples);
    }
    /**
     * The portrait, on the same terms as every other field: accepted or absent.
     *
     * `kind` is carried over from whatever the profile already said, and
     * defaults to a person. A space that set itself to `BRAND` and then
     * re-analysed should not silently become a human being again.
     */
    if (proposal.portrait?.status === 'ACCEPTED') {
      content.persona = {
        kind: content.persona?.kind ?? 'PERSON',
        portrait: truncateChars(proposal.portrait.text.trim(), 1_200),
        portraitRefs: proposal.portrait.observationRefs,
      };
    }

    const accepted = proposal.fields.filter(
      (field) => field.status === 'ACCEPTED'
    );
    const text = (key: ProfileField) =>
      accepted.find((field) => field.key === key)?.text?.trim();

    const traits = [...(content.voice.traits ?? [])];
    for (const key of ['WHO_SPEAKS', 'TONE'] as ProfileField[]) {
      const value = text(key);
      const name = FIELD_TO_TRAIT[key]!;
      if (!value) continue;
      const existing = traits.findIndex((trait) => trait.name === name);
      const trait = { name, guidance: truncateChars(value, 1_000) };
      if (existing >= 0) traits[existing] = trait;
      else traits.push(trait);
    }
    content.voice.traits = traits.slice(0, 5);

    const sentenceLength = text('SENTENCE_LENGTH');
    if (sentenceLength)
      content.voice.sentenceStyle = truncateChars(sentenceLength, 1_000);

    const audience = text('AUDIENCE');
    if (audience) {
      content.project.audiences = [
        {
          name: truncateChars(audience, 120),
          need: truncateChars(audience, 1_000),
        },
      ];
    }

    const neverSay = text('NEVER_SAY');
    const listed = [
      ...(proposal.categories?.neverSay ?? []),
      ...(neverSay ? neverSay.split(/\s*[;\n]\s*/u) : []),
    ]
      .map((one) => one.trim())
      .filter(Boolean);
    if (listed.length) {
      content.guardrails.prohibitedClaims = [...new Set(listed)].slice(0, 50);
    }

    const categories = proposal.categories ?? {};
    if (categories.pointOfView) {
      content.voice.pointOfView =
        categories.pointOfView as BrandProfileContentV1['voice']['pointOfView'];
    }
    if (categories.formality) {
      content.voice.formality =
        categories.formality as BrandProfileContentV1['voice']['formality'];
    }
    if (categories.emojiPolicy) {
      content.voice.emojiPolicy =
        categories.emojiPolicy as BrandProfileContentV1['voice']['emojiPolicy'];
    }
    if (categories.hashtagPolicy) {
      content.voice.hashtagPolicy =
        categories.hashtagPolicy as BrandProfileContentV1['voice']['hashtagPolicy'];
    }

    return content;
  }

  /**
   * The author's own posts for the profile's example field.
   *
   * Taken from the training half of the analysis the voice is being activated
   * from — the holdout half is what the profile is checked against, and an
   * example drawn from it would be a post the voice has seen judged as a post
   * the voice has never seen. The corpus is read live rather than from the
   * measurement, because the measurement stores numbers and not the writing.
   *
   * A failure here does not stop an activation. The examples are a lever, not
   * a field a person filled in, and refusing to turn a voice on because the
   * corpus could not be read would be the product losing the person's work over
   * its own improvement.
   */
  private async examplesFor(
    actor: VoiceActor,
    measurement: StoredVoiceMeasurement
  ): Promise<{ kind: 'on_brand'; text: string }[]> {
    try {
      const split = (measurement.corpusSplit ?? {}) as Record<
        string,
        CorpusSplit
      >;
      if (!Object.keys(split).length) return [];
      const corpus = await this._samples.listActive(
        actor.organizationId,
        await this.corpusScope(actor)
      );
      return selectVoiceExamples(corpus.map(toInput), split);
    } catch {
      return [];
    }
  }

  /**
   * The five lines read back out of a profile, which is where they live.
   *
   * The exact inverse of `contentFrom`, and written beside it for that reason:
   * the hand-filled path writes through one and reads through the other, and
   * the day they stop agreeing a person's own words come back as somebody
   * else's field.
   */
  private fieldsFromContent(
    content: BrandProfileContentV1
  ): Record<ProfileField, string> {
    const trait = (name: string) =>
      content.voice.traits?.find((one) => one.name === name)?.guidance ?? '';
    return {
      WHO_SPEAKS: trait(FIELD_TO_TRAIT.WHO_SPEAKS!),
      TONE: trait(FIELD_TO_TRAIT.TONE!),
      AUDIENCE: VoiceService.audienceLine(content),
      SENTENCE_LENGTH: content.voice.sentenceStyle ?? '',
      NEVER_SAY: (content.guardrails.prohibitedClaims ?? []).join('; '),
    };
  }

  /**
   * The profile a hand-filled draft starts from: everything except the voice.
   *
   * The five voice fields are emptied and the rest of the profile — the project
   * description, the offerings, the lexicon, the platform overrides — is kept.
   * Starting from a copy of the active voice would put somebody else's
   * sentences under «Заполню сам» and let them be activated as the person's
   * own; starting from nothing at all would quietly drop a project description
   * nobody was editing.
   */
  private strippedVoiceContent(
    base: BrandProfileContentV1 | null
  ): BrandProfileContentV1 {
    const content = clone(base ?? EMPTY_CONTENT);
    const named = new Set(Object.values(FIELD_TO_TRAIT));
    content.voice.traits = (content.voice.traits ?? []).filter(
      (trait) => !named.has(trait.name)
    );
    delete content.voice.sentenceStyle;
    content.project.audiences = [];
    content.guardrails.prohibitedClaims = [];
    return content;
  }

  /** The five lines as a proposal, so one mapping writes both paths. */
  private manualAsProposal(
    fields: Record<ProfileField, string>
  ): StoredVoiceProposalV1 {
    return {
      fields: PROFILE_FIELDS.map((key) => ({
        key,
        text: fields[key],
        // Everything written by hand is accepted by the act of writing it:
        // there is nobody else's suggestion here to agree with.
        status: 'ACCEPTED' as const,
        observationRefs: [],
      })),
      observations: [],
    };
  }

  private manualResponse(
    fields: Record<ProfileField, string>,
    profileLabel?: string
  ): VoiceProposalResponseV1 {
    const written = PROFILE_FIELDS.filter((key) => fields[key].trim());
    return {
      outcome: 'ready',
      state: written.length ? 'default' : 'empty',
      mode: 'manual',
      fields: PROFILE_FIELDS.map((key) => ({
        key,
        text: fields[key],
        // A line that has text is decided; an empty one is the work left.
        // Nothing here is `EDITING`: on this path every line is always
        // writable, and a third state would only describe the cursor.
        status: fields[key].trim()
          ? ('ACCEPTED' as const)
          : ('UNDECIDED' as const),
        observationRefs: [],
      })),
      observations: [],
      ...(profileLabel ? { profileLabel } : {}),
      ...(written.length === PROFILE_FIELDS.length
        ? {}
        : {
            notice: `Заполнено ${written.length} из ${PROFILE_FIELDS.length}. Активация откроется, когда все пять строк будут написаны.`,
          }),
    };
  }

  /**
   * The hand-filled voice, read.
   *
   * Nothing is written here, and that is deliberate: a `GET` that created a
   * draft row would leave one behind for every person who opened the path and
   * changed their mind. The draft appears at the first saved line, and until
   * then the five empty strings are exactly the truth about what is stored.
   */
  async manualProposal(actor: VoiceActor): Promise<VoiceProposalResponseV1> {
    const draft = await this._profiles.manualDraft(actor.organizationId);
    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const fields = draft
      ? this.fieldsFromContent(draft.content)
      : this.fieldsFromContent(this.strippedVoiceContent(null));
    return this.manualResponse(fields, activeVersion?.label ?? undefined);
  }

  /**
   * One hand-written line, saved into the draft.
   *
   * The draft is created on the first save, from the active profile with the
   * five voice fields emptied, and every save after that is a
   * revision-checked write over the same row — so a second tab filling the same
   * voice is refused by name instead of overwriting the first.
   */
  async manualField(
    actor: VoiceActor,
    body: VoiceProposalManualFieldRequestV1
  ): Promise<VoiceProposalResponseV1> {
    this.assertCanManage(actor);
    const text = (body.text ?? '').trim();
    if (!text) {
      throw new VoiceError(
        'VOICE_FIELDS_INCOMPLETE',
        'Пустая строка не сохраняется: напишите текст или оставьте поле как есть.',
        body.key
      );
    }

    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const draft =
      (await this._profiles.manualDraft(actor.organizationId)) ??
      (await this._profiles.createManualDraft(
        actor.organizationId,
        actor.userId,
        this.strippedVoiceContent(activeVersion?.content ?? null),
        undefined,
        actor.avatarId
      ));

    const fields = this.fieldsFromContent(draft.content);
    fields[body.key] = text;
    await this._profiles.updateDraft(
      actor.organizationId,
      actor.userId,
      draft.id,
      this.contentFrom(this.manualAsProposal(fields), draft.content),
      draft.revision,
      draft.label ?? undefined
    );

    return this.manualResponse(fields, activeVersion?.label ?? undefined);
  }

  /**
   * The hand-filled draft, activated.
   *
   * The five lines are laid over the profile in force *now* rather than over
   * the copy the draft started from: the draft may have been open for a
   * quarter of an hour, and anything else edited meanwhile — a project
   * description, a lexicon — would be silently rolled back by activating it.
   */
  private async activateManual(
    actor: VoiceActor,
    body: VoiceProposalActivateRequestV1
  ): Promise<VoicePassportResponseV1> {
    const draft = await this._profiles.manualDraft(actor.organizationId);
    if (!draft) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Ручной голос ещё не начат: заполните строки и сохраните их.'
      );
    }

    const fields = this.fieldsFromContent(draft.content);
    const missing = PROFILE_FIELDS.filter((key) => !fields[key].trim());
    if (missing.length) {
      throw new VoiceError(
        'VOICE_FIELDS_INCOMPLETE',
        `Голос нельзя включить, пока пусто строк: ${missing.length}. Заполните их и повторите.`,
        missing.join(', ')
      );
    }

    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    await this._profiles.updateDraft(
      actor.organizationId,
      actor.userId,
      draft.id,
      this.contentFrom(
        this.manualAsProposal(fields),
        activeVersion?.content ?? null
      ),
      draft.revision,
      body.label ?? draft.label ?? undefined
    );
    await this._profiles.activate(
      actor.organizationId,
      actor.userId,
      draft.id
    );

    return this.passport(actor);
  }

  /**
   * The name a person gave the avatar as they switched it on.
   *
   * Written only over an avatar that has none. A person who renamed an avatar
   * and then reactivated it means the name they typed in the list, not the one
   * still sitting in a wizard field — and silently overwriting it would make
   * activation a rename nobody asked for
   * (`content-factory-next-fn33.46`).
   *
   * A failure here costs the name, never the activation: the voice is on, and
   * «Без имени» with a rename in the row's own menu is recoverable in a way a
   * refused activation is not.
   */
  private async nameAvatar(actor: VoiceActor, name?: string) {
    const wanted = name?.trim();
    if (!wanted) return;
    try {
      const { profile } = await this._profiles.overview(
        actor.organizationId,
        actor.avatarId
      );
      if (!profile || profile.name?.trim()) return;
      await this._profiles.updateAvatar(
        actor.organizationId,
        actor.userId,
        profile.id,
        { name: wanted }
      );
    } catch {
      return;
    }
  }

  async activateProposal(
    actor: VoiceActor,
    body: VoiceProposalActivateRequestV1
  ): Promise<VoicePassportResponseV1> {
    this.assertCanManage(actor);
    if (!body.consentGiven) {
      throw new VoiceError(
        'VOICE_RIGHTS_REQUIRED',
        'Активация голоса требует явного согласия рядом с флажком.'
      );
    }
    // One activation for both paths, so consent is asked, checked and refused
    // in a single place. What differs after this line is only where the five
    // fields came from.
    const mode: VoiceProposalModeV1 = body.mode ?? 'assist';
    if (mode === 'manual') {
      const passport = await this.activateManual(actor, body);
      await this.nameAvatar(actor, body.avatarName);
      return passport;
    }

    const { measurement, proposal } = await this.latestWithProposal(actor);
    if (!measurement || !proposal) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Предложения голоса нет: сначала запустите разбор.'
      );
    }

    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const habits = metricsOf(measurement).postHabits;
    const layout = metricsOf(measurement).postLayout;
    const content = this.contentFrom(
      proposal,
      activeVersion?.content ?? null,
      await this.examplesFor(actor, measurement),
      habits?.length
        ? {
            median: Math.round(habits.length.median),
            low: Math.round(habits.length.low),
            high: Math.round(habits.length.high),
          }
        : undefined,
      this.directionsFrom(measurement, actor.locale ?? 'ru'),
      /**
       * Привычка приносить свои числа — доля и знаменатель.
       *
       * `null` у языка без словаря единиц: там вопрос «есть ли рядом с цифрой
       * единица измерения» не задаётся вовсе, и ноль означал бы «автор так
       * никогда не делает», то есть утверждение об авторе вместо правды о
       * продукте.
       */
      habits && habits.carriesOwnMeasurement !== null
        ? {
            share: habits.carriesOwnMeasurement,
            of: habits.sampleCount,
          }
        : undefined,
      layout
        ? {
            softBreakRate: layout.softBreakRate,
            blockBreakRate: layout.blockBreakRate,
            meanBlockChars: layout.meanBlockChars,
            oneSentenceBlockShare: layout.oneSentenceBlockShare,
          }
        : undefined
    );
    const draft = await this._profiles.createDraft(
      actor.organizationId,
      actor.userId,
      content,
      body.label,
      actor.avatarId
    );
    const activated = await this._profiles.activate(
      actor.organizationId,
      actor.userId,
      draft.id
    );

    proposal.activatedVersionId = activated.version.id;
    proposal.activatedAt = this._now().toISOString();
    // Which analysis explains this voice is written on the version, because
    // one analysis becomes as many versions as somebody activates from it —
    // accept three fields, then four, then edit one, and each activation is a
    // new version explained by the same numbers.
    await this._profiles.stampMeasurement(
      actor.organizationId,
      activated.version.id,
      measurement.id
    );
    await this._samples.updateMeasurement(actor.organizationId, measurement.id, {
      metrics: { ...metricsOf(measurement), proposal },
      // Set once and never moved again. It is what an older image reads, and
      // moving it is what made the previously activated voice read as never
      // analysed — the second activation overwrote the first one's only
      // record of itself.
      ...(measurement.profileVersionId
        ? {}
        : { profileVersionId: activated.version.id }),
    });

    // Both paths end here for the same reason: the avatar becomes something a
    // person refers to at the moment it starts writing, and until now neither
    // path asked what to call it (`content-factory-next-fn33.46`).
    await this.nameAvatar(actor, body.avatarName);

    return this.passport(actor);
  }

  /**
   * The measurement that explains the ACTIVE version, and only that one.
   *
   * `latestMeasurement` answers "what was analysed most recently" — the right
   * question for the wizard, screens 04 and 05, where there is no active
   * version yet to explain. Everything past this point describes a voice
   * already in force, and that is a different question: which analysis
   * produced THIS version. A measurement from an older corpus, or from a run
   * nobody activated, is not that answer — printing its numbers beside a
   * hand-written or differently-measured voice would be quietly wrong, which
   * is the bug vme.11 exists to close.
   */
  private measurementForActiveVersion(
    organizationId: string,
    activeVersion: BrandProfileVersionRecordV1 | null
  ): Promise<StoredVoiceMeasurement | null> {
    if (!activeVersion) return Promise.resolve(null);
    return this.measurementFor(organizationId, activeVersion);
  }

  /**
   * The measurement that explains this version's content, wherever in its own
   * history it was stamped.
   *
   * Restoring writes a new version rather than moving the pointer back, so a
   * voice a person just restored carries content that was measured under a
   * different id. `peersWithSameContent` names every version holding this
   * exact content, and one query asks all their stamps at once. Content that
   * differs by a single field has a different digest and borrows nothing.
   *
   * The second query is the pre-vme.18 shape: versions activated while the
   * stamp lived on the measurement have nothing on their own row, and the old
   * column is the only place their analysis can still be found. It runs only
   * when the first found nothing, so a workspace that has activated a voice
   * since costs one query, not two.
   */
  private async measurementFor(
    organizationId: string,
    version: BrandProfileVersionRecordV1
  ): Promise<StoredVoiceMeasurement | null> {
    const { versionIds, measurementIds } =
      await this._profiles.peersWithSameContent(organizationId, version);
    const stamped = await this._samples.measurementByIds(
      organizationId,
      measurementIds
    );
    return (
      stamped ??
      (await this._samples.measurementForVersions(organizationId, versionIds))
    );
  }

  /* ---------------------------------------------------------------------
   * Screen 06 — the passport
   * ------------------------------------------------------------------ */

  /**
   * The audience line as the person wrote it, not as it was filed.
   *
   * One written line becomes two fields: `name` is a 120-character label and
   * `need` keeps the sentence. Reading the label back cut a person's own text
   * mid-word — «…но не в маркетин» — and the wizard offered that cut version
   * for editing, so saving it again would have destroyed the rest. A label
   * that is a prefix of the sentence is the cut half of one line; a label the
   * model wrote alongside a different sentence is not, and stays.
   */
  private static audienceLine(content: BrandProfileContentV1): string {
    const first = content.project.audiences?.[0];
    if (!first) return '';
    const name = first.name ?? '';
    const need = first.need ?? '';
    if (need && name && need.startsWith(name)) return need;
    return name || need;
  }

  async passport(actor: VoiceActor): Promise<VoicePassportResponseV1> {
    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    if (!activeVersion) {
      // Not an error and not a hole: a workspace generating in an explicit
      // neutral style is a working state, and the card says so.
      return { state: 'empty', voice: null };
    }
    const measurement = await this.measurementForActiveVersion(
      actor.organizationId,
      activeVersion
    );
    const scales = metricsOf(measurement).scales;
    const sentence = scales.sentenceLength;
    const dash = scales.dashCopula;
    const content = activeVersion.content;
    const trait = (name: string) =>
      content.voice.traits?.find((one) => one.name === name)?.guidance ?? '';

    return {
      state: 'default',
      voice: {
        whoSpeaks: trait(FIELD_TO_TRAIT.WHO_SPEAKS!),
        tone: trait(FIELD_TO_TRAIT.TONE!),
        audience: VoiceService.audienceLine(content),
        neverSay: content.guardrails.prohibitedClaims ?? [],
        ...(content.voice.sentenceStyle
          ? { sentenceStyle: content.voice.sentenceStyle }
          : {}),
        versionLabel: activeVersion.label ?? `v${activeVersion.versionNumber}`,
        activeSince: formatDate(
          activeVersion.publishedAt ?? activeVersion.createdAt,
          actor.locale ?? 'ru'
        ),
        // Omitted, not zeroed, when there is no measurement: `0` would claim
        // the corpus was counted and found empty, which can be false — the
        // organisation may hold samples that simply measure a different
        // version. Absence is the honest answer to "what explains this one".
        ...(measurement
          ? {
              sampleCount: measurement.sampleCount,
              charCount: measurement.charCount,
              confidence: (measurement.charCount >= 35_000
                ? 'NORMAL'
                : 'LOW') as 'LOW' | 'NORMAL',
            }
          : {}),
        ...(isScaleValue(sentence)
          ? {
              sentenceLength: {
                value: String(sentence.raw),
                low: sentence.low,
                high: sentence.high,
              },
            }
          : {}),
        ...(isScaleValue(dash) ? { dashShare: `${dash.raw}%` } : {}),
        // Only the on-brand ones: an off-brand example is a counter-example
        // somebody wrote by hand, and it is not the author's own writing.
        ...(voiceExamplesOf(content).length
          ? { examples: voiceExamplesOf(content).map((one) => ({ text: one.text })) }
          : {}),
      },
    };
  }

  /**
   * The author's own posts a person may remove or have picked again.
   *
   * An empty list means "pick them again from the corpus": the field is filled
   * by the product and a person who empties it is asking for a different set,
   * not for none. Somebody who wants none removes them one at a time and the
   * last removal leaves the field empty on purpose — which is why the two paths
   * are told apart by `refresh` rather than by the list being empty.
   */
  async setExamples(
    actor: VoiceActor,
    body: { texts?: string[]; refresh?: boolean }
  ): Promise<VoicePassportResponseV1> {
    this.assertCanManage(actor);
    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    if (!activeVersion) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Голос ещё не включён: примеры появятся после активации.'
      );
    }

    let examples: { kind: 'on_brand'; text: string }[];
    if (body.refresh) {
      const measurement = await this.measurementForActiveVersion(
        actor.organizationId,
        activeVersion
      );
      if (!measurement) {
        throw new VoiceError(
          'VOICE_PROFILE_NOT_FOUND',
          'Подобрать примеры не из чего: этот голос собран без разбора корпуса.'
        );
      }
      examples = toProfileExamples(await this.examplesFor(actor, measurement));
    } else {
      examples = (body.texts ?? [])
        .map((one) => one.trim())
        .filter(Boolean)
        .slice(0, MAX_VOICE_EXAMPLES)
        .map((text) => ({ kind: 'on_brand' as const, text }));
    }

    const content = clone(activeVersion.content);
    const kept = (content.examples ?? []).filter(
      (one) => one.kind !== 'on_brand'
    );
    content.examples = [...examples, ...kept];
    const draft = await this._profiles.createDraft(
      actor.organizationId,
      actor.userId,
      content,
      activeVersion.label ?? undefined,
      actor.avatarId
    );
    await this._profiles.activate(
      actor.organizationId,
      actor.userId,
      draft.id
    );
    return this.passport(actor);
  }

  /**
   * One line of the passport, rewritten where a person reads it.
   *
   * The five voice fields had exactly one editor: a separate form, under a
   * separate heading, filling a draft that had to be completed in full and
   * consented to before any of it counted. Fixing two words of «Каким тоном»
   * meant finding that form and agreeing again to the whole voice. So the edit
   * moved to the card that shows the field, and this is what it writes.
   *
   * It goes through the same door as `setExamples` for the same reason: a new
   * version carrying the previous content with one field replaced, activated
   * at once. The history therefore records the edit as a version — which is
   * what the version list beneath the card is for — instead of mutating a row
   * that older posts still point at.
   *
   * The manual path is untouched and still does something else: it builds a
   * voice out of nothing, demands all five lines, and asks for consent. There
   * is no consent to ask for here — the voice is already in force, and this
   * changes one sentence of it.
   */
  async setPassportField(
    actor: VoiceActor,
    body: VoicePassportFieldRequestV1
  ): Promise<VoicePassportResponseV1> {
    this.assertCanManage(actor);
    const text = (body.text ?? '').trim();
    if (!text) {
      throw new VoiceError(
        'VOICE_FIELDS_INCOMPLETE',
        'Пустая строка не сохраняется: напишите текст или оставьте поле как есть.',
        body.key
      );
    }

    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    if (!activeVersion) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Править нечего: голос ещё не включён. Соберите его в мастере.'
      );
    }

    const fields = this.fieldsFromContent(activeVersion.content);
    if (fields[body.key] === text) return this.passport(actor);
    fields[body.key] = text;

    const draft = await this._profiles.createDraft(
      actor.organizationId,
      actor.userId,
      // The five lines are laid over the version in force rather than over a
      // stripped copy: a project description, a lexicon and platform overrides
      // nobody was editing must survive an edit to one sentence of the voice.
      this.contentFrom(
        this.manualAsProposal(fields),
        activeVersion.content
      ),
      activeVersion.label ?? undefined,
      actor.avatarId
    );
    await this._profiles.activate(
      actor.organizationId,
      actor.userId,
      draft.id
    );
    return this.passport(actor);
  }

  /* ---------------------------------------------------------------------
   * Screen 07 — the eight scales
   * ------------------------------------------------------------------ */

  private scaleEntry(
    key: StyleScaleKey,
    scale: StyleScaleResult,
    corpus: CodedVoiceSample[]
  ): VoiceScaleEntryV1 {
    if (!isScaleValue(scale)) {
      // A scale that could not be computed is a gap. Zero would read as "this
      // writer never asks questions", which is a different and false claim.
      return { kind: 'gap', reason: scale.reason, positives: scale.positives };
    }
    const value = scale as StoredScaleValue;
    return {
      kind: 'value',
      raw: value.raw,
      display: value.display,
      low: value.low,
      high: value.high,
      observations: value.observations,
      sampleCount: value.sampleCount,
      exampleText: value.exampleText,
      exampleSampleCode: value.exampleSampleCode,
      ...(value.corridorSource === 'MANUAL' ? { manualCorridor: true } : {}),
      ...(value.excluded ? { excluded: true } : {}),
    };
  }

  async scales(actor: VoiceActor): Promise<VoiceScalesResponseV1> {
    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const measurement = await this.measurementForActiveVersion(
      actor.organizationId,
      activeVersion
    );
    const scales = metricsOf(measurement).scales;
    const corpus = await this._samples.listActive(
      actor.organizationId,
      await this.corpusScope(actor)
    );

    const mapped: VoiceScalesResponseV1['scales'] = {};
    for (const [key, scale] of Object.entries(scales)) {
      if (!scale) continue;
      mapped[key as StyleScaleKey] = this.scaleEntry(
        key as StyleScaleKey,
        scale,
        corpus
      );
    }

    /**
     * Whether measuring the same texts again would move these numbers.
     *
     * The ruler has moved twice — `character-ngrams/1.1.0` on 27.08 and
     * `1.2.0` on 28.08 — and a voice keeps whichever one was current the day
     * it was analysed. Comparing the stamp on the measurement with the one
     * this build ships is the whole of the question; a measurement taken
     * before calibration existed at all has no stamp and counts as behind.
     */
    const stamp = metricsOf(measurement).calibration?.version ?? null;
    const behind = Boolean(measurement) && stamp !== CALIBRATION_VERSION;
    const movedByHand = Object.values(scales).filter(
      (scale) => isScaleValue(scale) && scale.corridorSource === 'MANUAL'
    ).length;

    return {
      state: measurement ? 'default' : 'empty',
      scales: mapped,
      ...(activeVersion?.label ? { profileLabel: activeVersion.label } : {}),
      ...(activeVersion
        ? { versionLabel: activeVersion.label ?? `v${activeVersion.versionNumber}` }
        : {}),
      ...(measurement ? { sampleCount: measurement.sampleCount } : {}),
      canEditCorridors: actor.canManage,
      ...(behind ? { recalibration: { movedByHand } } : {}),
    };
  }

  async setCorridor(
    actor: VoiceActor,
    body: VoiceScaleCorridorRequestV1
  ): Promise<VoiceScalesResponseV1> {
    this.assertCanManage(actor);
    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const measurement = await this.measurementForActiveVersion(
      actor.organizationId,
      activeVersion
    );
    if (!measurement) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        // What to do next, not just what is missing. A hand-written voice
        // has no measurement by design, and a workspace can hold one that
        // measures a different version — in both cases the way out is the
        // same and the person cannot be expected to work it out.
        'Разбора под действующий голос нет: коридор задавать не на чем. Соберите голос заново из ваших текстов — коридоры считаются по тому разбору, которым собран действующий голос.'
      );
    }
    const metrics = metricsOf(measurement);
    const scale = metrics.scales[body.key];
    if (!scale || !isScaleValue(scale)) {
      throw new VoiceError(
        'VOICE_ANALYSIS_FAILED',
        `Шкала ${body.key} не посчитана — коридор задавать не на чем.`,
        body.key
      );
    }
    const value = scale as StoredScaleValue;
    if (typeof body.low === 'number') value.low = body.low;
    if (typeof body.high === 'number') value.high = body.high;
    if (typeof body.excluded === 'boolean') value.excluded = body.excluded;
    if (body.manual !== false && (body.low !== undefined || body.high !== undefined)) {
      // A hand-set corridor survives recomputation; that is what marks it.
      value.corridorSource = 'MANUAL';
    }

    await this._samples.updateMeasurement(
      actor.organizationId,
      measurement.id,
      { metrics }
    );
    return this.scales(actor);
  }

  /* ---------------------------------------------------------------------
   * Screen 08 — what stayed out of a reference
   * ------------------------------------------------------------------ */

  async redactions(actor: VoiceActor): Promise<VoiceRedactionsResponseV1> {
    const references = await this._samples.listActive(
      actor.organizationId,
      await this.corpusScope(actor, 'STYLE_REFERENCE')
    );
    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const measurement = await this.measurementForActiveVersion(
      actor.organizationId,
      activeVersion
    );
    const scales = metricsOf(measurement).scales;

    const byCategory = new Map<RedactionCategory, Redaction>();
    for (const sample of references) {
      const stored = Array.isArray(sample.redactions)
        ? (sample.redactions as Array<{
            category?: RedactionCategory;
            count?: number;
            occurrences?: number;
            examples?: string[];
          }>)
        : [];
      for (const one of stored) {
        if (!one.category) continue;
        const entry = byCategory.get(one.category) ?? {
          category: one.category,
          occurrences: 0,
          examples: [],
        };
        entry.occurrences += one.count ?? one.occurrences ?? 0;
        for (const example of one.examples ?? []) {
          if (entry.examples.length < 3) entry.examples.push(example);
        }
        byCategory.set(one.category, entry);
      }
    }

    const kept = Object.entries(scales)
      .filter(([, scale]) => isScaleValue(scale))
      .slice(0, 6)
      .map(([key, scale]) => ({
        label: SCALE_LABELS[key as StyleScaleKey] ?? key,
        value: String((scale as StyleScaleValue).raw),
      }));

    // The reference profile was never shaped to carry text, so the longest run
    // shared with a source is measured against what the profile does hold —
    // its examples — and for a reference that is nothing at all.
    const profileExamples = activeVersion?.content.examples ?? [];
    const longestMatch = references.reduce(
      (longest, sample) =>
        Math.max(
          longest,
          ...profileExamples.map((example) =>
            longestSharedRun(example.text, sample.text)
          ),
          0
        ),
      0
    );

    return {
      state: references.length ? 'default' : 'empty',
      redactions: [...byCategory.values()],
      kept,
      referenceCount: references.length,
      finishedAt: formatDate(
        measurement?.createdAt ?? this._now(),
        actor.locale ?? 'ru'
      ),
      longestMatch,
      ...(longestMatch > MAX_SHARED_NGRAM
        ? {
            notice: `Совпадение длиннее ${MAX_SHARED_NGRAM} слов подряд — профиль перенёс формулировку, а не приём.`,
          }
        : {}),
    };
  }

  /* ---------------------------------------------------------------------
   * Screen 09 — versions
   * ------------------------------------------------------------------ */

  private versionSummary(
    version: BrandProfileVersionRecordV1,
    activeVersionId: string | null,
    actors: Map<string, string>
  ): VoiceVersionSummaryV1 {
    return {
      id: version.id,
      label: version.label ?? `v${version.versionNumber}`,
      lifecycle: version.lifecycle,
      ...(version.id === activeVersionId ? { active: true } : {}),
      changedAt: new Date(version.updatedAt).toISOString(),
      actor: actors.get(version.updatedByUserId) ?? version.updatedByUserId,
    };
  }

  /** The field-by-field table between two versions, older on the left. */
  private compare(
    older: BrandProfileVersionRecordV1,
    newer: BrandProfileVersionRecordV1
  ): VoiceVersionComparisonV1 {
    /**
     * The same mapping the hand-filled path reads through, not a second one.
     *
     * `voiceFieldsOf` was that second one: the same five fields, keyed by
     * Russian display names. Two mappings over one shape is how the audience
     * line came to be cut mid-word in one of them and whole in the other —
     * fixed once, in the wrong copy. There is one now.
     */
    const before = this.fieldsFromContent(older.content);
    const became = this.fieldsFromContent(newer.content);
    return {
      from: older.label ?? `v${older.versionNumber}`,
      to: newer.label ?? `v${newer.versionNumber}`,
      fields: PROFILE_FIELDS.map((field) => ({
        field,
        was: before[field],
        became: became[field],
        changed: before[field] !== became[field],
      })),
    };
  }

  /**
   * @param pair которые две версии сравнить. Раньше сравнивались две последние
   *   и выбор на экране ни на что не влиял: человек ставил галочки, а таблица
   *   под ними описывала другую пару или не появлялась вовсе. Пара пришла в
   *   запрос, и теперь отмеченное и сравниваемое — одно и то же.
   */
  async versions(
    actor: VoiceActor,
    pair?: VoiceVersionsQueryV1
  ): Promise<VoiceVersionsResponseV1> {
    const { versions, activeVersion, profile } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const actors = await this._profiles.actorNames(
      versions.map((version) => version.updatedByUserId)
    );
    const ordered = [...versions].sort(
      (left, right) => right.versionNumber - left.versionNumber
    );

    // A draft is never one end of a comparison. A hand-filled voice sits in
    // the list as a draft for as long as somebody is writing it, and comparing
    // against it would report every still-empty line as a field that "changed"
    // to nothing — which is a statement about an unfinished form, not about
    // the voice.
    const comparable = ordered.filter(
      (version) => version.lifecycle !== 'DRAFT'
    );
    const named = [pair?.from, pair?.to].filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    );

    let comparison: VoiceVersionComparisonV1 | undefined;
    let comparisonNotice: string | undefined;

    if (named.length === 2) {
      const picked = named.map((id) =>
        comparable.find((version) => version.id === id)
      );
      if (picked[0] && picked[1] && picked[0].id !== picked[1].id) {
        // The order on screen is the reader's; the order in the table is
        // chronological, so «Было» is always the older of the two whichever
        // row was ticked first.
        const [older, newer] = [picked[0], picked[1]].sort(
          (left, right) => left.versionNumber - right.versionNumber
        );
        comparison = this.compare(older!, newer!);
      } else {
        comparisonNotice = ordered.some(
          (version) =>
            named.includes(version.id) && version.lifecycle === 'DRAFT'
        )
          ? 'Черновик не сравнивается: в нём ещё пустые строки, и они прочитались бы как изменения. Выберите две действовавшие версии.'
          : 'Одну из выбранных версий не удалось прочитать. Выберите две версии из списка.';
      }
    } else if (named.length === 0) {
      const [newest, previous] = comparable;
      if (newest && previous) comparison = this.compare(previous, newest);
    } else {
      comparisonNotice = 'Выбрана одна версия. Сравнение показывается для двух.';
    }

    return {
      state: ordered.length ? 'default' : 'empty',
      versions: ordered.map((version) =>
        this.versionSummary(version, profile?.activeVersionId ?? null, actors)
      ),
      ...(comparison ? { comparison } : {}),
      ...(comparisonNotice ? { comparisonNotice } : {}),
      ...(activeVersion?.label ? { profileLabel: activeVersion.label } : {}),
      canRestore: actor.canManage,
    };
  }

  async restoreVersion(
    actor: VoiceActor,
    versionId: string
  ): Promise<VoiceVersionsResponseV1> {
    this.assertCanManage(actor);
    // Restoring writes a new version. The history is a record of what
    // happened, and rewriting it would lose the fact that a return happened.
    await this._profiles.restoreAsNewVersion(
      actor.organizationId,
      actor.userId,
      versionId
    );
    return this.versions(actor);
  }

  /**
   * Taking the voice out of use.
   *
   * Three things happen and one deliberately does not. The active pointer is
   * cleared, so generation goes back to the explicit neutral style the empty
   * passport describes. The versions stay, because posts already written point
   * at them. The measurements stay too, and stay honest: each carries the
   * analyser version, the locale pack and the number of samples it counted, so
   * a corridor obeyed last week can still be explained next year.
   *
   * What does not happen is erasing the corpus. A person deleting their voice
   * has not necessarily asked to delete their writing, and the two are
   * separate actions on separate screens.
   */
  async deleteProfile(actor: VoiceActor): Promise<VoicePassportResponseV1> {
    this.assertCanManage(actor);
    await this._profiles.deactivate(
      actor.organizationId,
      actor.userId,
      actor.avatarId
    );
    return this.passport(actor);
  }

  /* ---------------------------------------------------------------------
   * Screen 12 — the avatars of a space
   *
   * One card shape for a person and for a brand. `kind` is the whole
   * difference between them and it is a value inside the card, not a column
   * the list is split by: two lists would need the same defect fixed twice and
   * would make a reader learn where a brand lives before finding the name they
   * came for.
   * ------------------------------------------------------------------ */

  /**
   * One avatar as the list draws it.
   *
   * `analysed` is `Boolean(activeVersionId)` and nothing subtler. An avatar
   * with a corpus, a measurement and no activated version cannot write, and
   * calling it analysed would put a name on a card whose generation falls
   * back to a neutral style.
   */
  private async avatarRow(
    actor: VoiceActor,
    avatar: BrandAvatarRowV1
  ): Promise<VoiceAvatarRowV1> {
    const locale = actor.locale ?? 'ru';
    const active = avatar.activeVersion;
    const measurement = await this.measurementForActiveVersion(
      actor.organizationId,
      active
    );
    return {
      id: avatar.id,
      name: avatar.name?.trim() || null,
      kind: (avatar.kind ?? 'PERSON') as VoiceAvatarKindV1,
      isDefault: Boolean(avatar.isDefault),
      analysed: Boolean(avatar.activeVersionId && active),
      ...(active
        ? {
            versionLabel: active.label ?? `v${active.versionNumber}`,
            activeSince: formatDate(active.updatedAt, locale),
            ...(active.content.persona?.portrait
              ? { hasPortrait: true }
              : {}),
          }
        : {}),
      ...(measurement ? { sampleCount: measurement.sampleCount } : {}),
      createdAt: formatDate(avatar.createdAt, locale),
    };
  }

  /**
   * Every avatar of the space, with the one that writes named separately.
   *
   * `defaultAvatarId` is the avatar that is both flagged and able to write.
   * The flag alone would be enough if the two could not come apart, and they
   * can: an avatar created while the space had nothing analysed carries the
   * flag from the moment it exists. Reporting it as the writer would tell a
   * person somebody is writing their texts when nothing is.
   */
  async avatars(actor: VoiceActor): Promise<VoiceAvatarsResponseV1> {
    const rows = await this._profiles.listAvatars(actor.organizationId);
    const avatars = await Promise.all(
      rows.map((avatar) => this.avatarRow(actor, avatar))
    );
    const writingDefault = avatars.find((one) => one.isDefault && one.analysed);
    return {
      state: avatars.length ? 'default' : 'empty',
      avatars,
      defaultAvatarId: writingDefault?.id ?? null,
      limit: MAX_AVATARS_PER_SPACE,
      canManage: actor.canManage,
      ...(actor.canManage
        ? {}
        : {
            notice:
              'Аватары заводит редактор или администратор. Список виден всем, выбрать аватар в черновике можно, править нельзя.',
          }),
    };
  }

  async createAvatar(
    actor: VoiceActor,
    body: VoiceAvatarCreateRequestV1
  ): Promise<VoiceAvatarsResponseV1> {
    this.assertCanManage(actor);
    await this._profiles.createAvatar(actor.organizationId, actor.userId, {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.kind === undefined ? {} : { kind: body.kind }),
    });
    return this.avatars(actor);
  }

  async updateAvatar(
    actor: VoiceActor,
    body: VoiceAvatarUpdateRequestV1
  ): Promise<VoiceAvatarsResponseV1> {
    this.assertCanManage(actor);
    await this._profiles.updateAvatar(
      actor.organizationId,
      actor.userId,
      body.avatarId,
      {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.kind === undefined ? {} : { kind: body.kind }),
      }
    );
    return this.avatars(actor);
  }

  async setDefaultAvatar(
    actor: VoiceActor,
    body: VoiceAvatarDefaultRequestV1
  ): Promise<VoiceAvatarsResponseV1> {
    this.assertCanManage(actor);
    await this._profiles.setDefaultAvatar(
      actor.organizationId,
      actor.userId,
      body.avatarId
    );
    const answer = await this.avatars(actor);
    return { ...answer, state: 'success' };
  }

  async deleteAvatar(
    actor: VoiceActor,
    body: VoiceAvatarDeleteRequestV1
  ): Promise<VoiceAvatarsResponseV1> {
    this.assertCanManage(actor);
    await this._profiles.deleteAvatar(
      actor.organizationId,
      actor.userId,
      body.avatarId,
      body.successorId
    );
    /**
     * The corpus follows the avatar, to the successor the same request names.
     *
     * After the profile is gone rather than before it: `deleteAvatar` is what
     * validates the successor and refuses a space left without a default, and
     * moving somebody's writing on the strength of an unvalidated id would be
     * the one step here that a failure cannot take back.
     */
    if (body.successorId) {
      await this._samples.reassignAvatar(
        actor.organizationId,
        body.avatarId,
        body.successorId
      );
    }
    /**
     * Правки уходят вместе с автором, а не к наследнику.
     *
     * Корпус — это тексты, которые человек написал, и они переживают аватар:
     * их можно измерить заново для кого угодно. Правка — это пара «что
     * предложили ЭТОМУ голосу и что вместо этого отправили», и у наследника
     * она означала бы, что кто-то другой поправил его черновик. Такой
     * отрицательный пример сдвинул бы его порог в сторону чужой манеры.
     */
    await this._edits?.eraseForAvatar(actor.organizationId, body.avatarId);
    const answer = await this.avatars(actor);
    return { ...answer, state: 'success' };
  }

  /* ---------------------------------------------------------------------
   * Чему аватар научился на правках
   *
   * Решение владельца 05.09.2026: аватар становится похожим на основе того,
   * что человек в его черновиках исправил. Пары «было/стало» копятся и так —
   * их пишет `VoiceEditRepository` на каждом сохранении поста. Здесь только
   * три действия над ними: посмотреть, сколько накопилось; заплатить один раз
   * за пачку; и отменить правило, которое человеку не подошло.
   *
   * Ни одно из трёх не переписывает текст человека и не трогает версии
   * голоса: выученное живёт на самом аватаре и переживает пересборку голоса,
   * потому что принадлежит автору, а не одному замеру.
   * ------------------------------------------------------------------ */

  /** Аватар, о котором идёт речь, и то, что он уже выучил. */
  private async learnedFor(
    actor: VoiceActor
  ): Promise<{ profileId: string; current: LearnedVoiceRulesV1 }> {
    const { profile } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    if (!profile) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Учиться пока некому: аватара с голосом здесь нет.'
      );
    }
    const current = parseLearnedRules(
      await this._profiles.learnedRules(actor.organizationId, profile.id)
    );
    return { profileId: profile.id, current };
  }

  /**
   * Ответ экрана. `pending` — существенные пары ПОСЛЕ последнего прогона:
   * оплаченное второй раз не показывается как новый материал.
   */
  private async learningAnswer(
    actor: VoiceActor,
    profileId: string,
    current: LearnedVoiceRulesV1
  ): Promise<VoiceLearningResponseV1> {
    const since = current.lastRunAt ? new Date(current.lastRunAt) : null;
    const pending = this._edits
      ? await this._edits.substantiveCount(
          actor.organizationId,
          profileId,
          since
        )
      : 0;
    return {
      pending,
      rules: current.rules,
      minPairs: LEARN_MIN_PAIRS,
      maxRules: MAX_LEARNED_RULES,
      canLearn: actor.canManage,
      lastRunAt: current.lastRunAt,
    };
  }

  async learning(actor: VoiceActor): Promise<VoiceLearningResponseV1> {
    const { profileId, current } = await this.learnedFor(actor);
    return this.learningAnswer(actor, profileId, current);
  }

  /**
   * Один вызов модели на пачку правок.
   *
   * Порог обязателен и для нажатия рукой: кнопка решает «когда», а не «на
   * чём», и правило, выведенное из двух правок, описывает настроение.
   *
   * Отметка `lastRunAt` ставится вместе с правилами и только при успехе.
   * Прогон, который не состоялся, не съедает материал: те же пары уйдут в
   * следующий, и человек не платит дважды за то, что не получил.
   */
  async learnFromEdits(
    actor: VoiceActor
  ): Promise<VoiceLearningResponseV1> {
    this.assertCanManage(actor);
    const { profileId, current } = await this.learnedFor(actor);

    const assist = this._assist;
    if (!this._edits || !assist?.learn) {
      throw new VoiceError(
        'VOICE_LEARN_UNAVAILABLE',
        'Обучение на правках в этой сборке не подключено.'
      );
    }

    const since = current.lastRunAt ? new Date(current.lastRunAt) : null;
    const pairs = await this._edits.substantivePairs(
      actor.organizationId,
      profileId,
      since
    );
    if (pairs.length < LEARN_MIN_PAIRS) {
      throw new VoiceError(
        'VOICE_LEARN_NOT_ENOUGH',
        `Правок пока ${pairs.length} из ${LEARN_MIN_PAIRS}. Одна-две правки — это настроение, а не привычка.`
      );
    }

    const answer = await assist.learn({
      organizationId: actor.organizationId,
      prompt: buildLearnPrompt(
        pairs.map((one) => ({
          proposedText: one.proposedText,
          sentText: one.sentText,
        })),
        current.rules,
        // Язык запроса — один из двух, на которых продукт говорит о голосе;
        // корпус может быть на любом из шестнадцати.
        toReportLocale(actor.locale ?? 'ru')
      ),
    });

    /**
     * Отметка встаёт по последней ВЗЯТОЙ паре, а не по времени прогона.
     *
     * Пары приходят по возрастанию времени и обрезаны окном, поэтому остаток
     * — всё, что новее последней взятой, — остаётся `pending` и уходит
     * следующим прогоном. `createdAt` у строки есть всегда; страховка на
     * `this._now()` нужна только для памяти, где пару могли положить руками.
     */
    const last = pairs[pairs.length - 1]?.createdAt;
    const next = mergeLearnedRules(
      current,
      answer,
      pairs.length,
      this._now(),
      last ? new Date(last) : this._now()
    );
    await this._profiles.saveLearnedRules(
      actor.organizationId,
      profileId,
      next
    );
    return this.learningAnswer(actor, profileId, next);
  }

  /**
   * Отменить одно правило.
   *
   * `lastRunAt` при этом не двигается: человек убрал вывод, а не материал, и
   * пары, на которых он был сделан, уже оплачены.
   */
  async forgetLearnedRule(
    actor: VoiceActor,
    body: VoiceLearnForgetRequestV1
  ): Promise<VoiceLearningResponseV1> {
    this.assertCanManage(actor);
    const { profileId, current } = await this.learnedFor(actor);
    const next = withoutRule(current, (body?.ruleId ?? '').trim());
    if (!next) {
      throw new VoiceError(
        'VOICE_LEARN_RULE_NOT_FOUND',
        'Такого правила у аватара нет: возможно, его уже отменили.',
        body?.ruleId
      );
    }
    await this._profiles.saveLearnedRules(
      actor.organizationId,
      profileId,
      next
    );
    return this.learningAnswer(actor, profileId, next);
  }

  /* ---------------------------------------------------------------------
   * Screen 10 — the applied-voice strip
   * ------------------------------------------------------------------ */

  async ribbon(actor: VoiceActor): Promise<VoiceRibbonResponseV1> {
    const { profile, activeVersion, versions } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    // The choice travels with every state, including the one where nothing is
    // applied: «нет аватара» is the state in which a person most needs to be
    // able to pick one, and a strip that only offers the menu once a voice is
    // already in force offers it exactly when it is least needed.
    const choice = await this.avatars(actor);
    if (!activeVersion) {
      return {
        state: 'no-profile',
        details: {},
        avatars: choice.avatars,
        defaultAvatarId: choice.defaultAvatarId,
      };
    }

    const { snapshot, piece } = await this._profiles.latestUsage(
      actor.organizationId
    );
    const currentLabel =
      activeVersion.label ?? `v${activeVersion.versionNumber}`;
    const usedId =
      piece?.brandProfileVersionId ?? snapshot?.brandProfileVersionId ?? null;
    const used = usedId
      ? versions.find((version) => version.id === usedId)
      : undefined;
    const usedLabel = used
      ? used.label ?? `v${used.versionNumber}`
      : currentLabel;

    const ageDays = snapshot
      ? Math.max(
          0,
          Math.floor(
            (this._now().getTime() - new Date(snapshot.builtAt).getTime()) /
              86_400_000
          )
        )
      : undefined;

    const details = {
      versionLabel: usedLabel,
      ...(usedId && usedId !== activeVersion.id
        ? { currentVersionLabel: currentLabel }
        : {}),
      ...(snapshot
        ? {
            contextLabel: snapshot.purpose,
            contextAgeDays: ageDays,
            factCount: snapshot.selectedFactCount,
            evidenceCount: snapshot.selectedEvidenceCount,
          }
        : {}),
      // Only when it says something the version label does not. A profile
      // with no name of its own borrows the version's, and the strip would
      // then print «v3 · v3» — two fields, one fact.
      ...(activeVersion.label && activeVersion.label !== usedLabel
        ? { profileLabel: activeVersion.label }
        : {}),
      // Who, and not only which version. Two avatars can both be on v3, and
      // «v3» then answers a question nobody asked while leaving the one they
      // did ask — whose voice is this — one expand away.
      ...(profile
        ? {
            avatarId: profile.id,
            ...(profile.name?.trim() ? { avatarName: profile.name.trim() } : {}),
            avatarKind: (profile.kind ?? 'PERSON') as VoiceAvatarKindV1,
          }
        : {}),
    };

    const answer = {
      details,
      avatars: choice.avatars,
      defaultAvatarId: choice.defaultAvatarId,
    };
    if (usedId && usedId !== activeVersion.id) {
      return { state: 'voice-moved', ...answer };
    }
    if (snapshot && new Date(snapshot.expiresAt).getTime() < this._now().getTime()) {
      return { state: 'stale-context', ...answer };
    }
    return { state: 'fresh', ...answer };
  }

  async injectionPlan(
    actor: VoiceActor,
    body: VoiceInjectionPlanRequestV1
  ): Promise<VoiceInjectionPlanResponseV1> {
    const { versions, activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const version = body.versionId
      ? versions.find((one) => one.id === body.versionId)
      : activeVersion;
    if (!version) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Активного голоса нет: подставлять в генерацию нечего.',
        body.versionId
      );
    }
    // The explicitly named version, not whatever is active: a caller that
    // asked for `body.versionId` is asking what that version would inject,
    // and the active version's measurement would answer a different question.
    const measurement = await this.measurementFor(
      actor.organizationId,
      version
    );
    const sentence = metricsOf(measurement).scales.sentenceLength;
    const content = version.content;

    const block = renderVoiceInjection({
      pointOfView: content.voice.pointOfView,
      formality: content.voice.formality,
      ...(isScaleValue(sentence)
        ? {
            sentenceLength: {
              value: sentence.raw,
              low: sentence.low,
              high: sentence.high,
            },
          }
        : {}),
      neverSay: content.guardrails.prohibitedClaims ?? [],
      prose: content.voice.sentenceStyle,
      examples: content.examples ?? [],
    });

    return { injections: planInjections(block, body.boundaries) };
  }

  /**
   * Ответ проверки, когда мерить не по чему.
   *
   * Ни одной выдуманной цифры: восемь шкал не считаны, значит `total` ноль, а
   * не восемь из восьми. Вердикта нет, и причина названа — человеку остаётся
   * решить, собирать ли голос из текстов, а не гадать, что сломалось.
   */
  private silentCheck(
    actor: VoiceActor,
    text: string
  ): VoiceTextCheckResponseV1 {
    const english = actor.locale === 'en';
    return {
      inCorridor: 0,
      total: 0,
      outside: [],
      summary: english
        ? 'This avatar was filled in by hand, so there is no analysis to measure the text against. Nothing is wrong — the check simply has nothing to say.'
        : 'Аватар заполнен вручную, поэтому разбора, с которым сверять текст, нет. Это не поломка: проверке просто не с чем сравнивать.',
      similarity: {
        verdict: 'UNKNOWN',
        reason: 'NO_PROFILE',
        distance: null,
        threshold: null,
        selfMedian: null,
        divergingTerms: [],
        functionWordDistance: null,
        functionWordThreshold: null,
        decidedBy: 'NONE',
      },
      spots: [],
      plainText: htmlToPlainText(text),
      calibrationErrors: null,
      silenceHint: english
        ? 'To have the text measured, build the avatar from your own writing: the check compares what was written against the numbers of that analysis.'
        : 'Чтобы текст было с чем сверять, соберите аватар из ваших текстов — проверка сравнивает написанное с числами того разбора.',
    };
  }

  async textCheck(
    actor: VoiceActor,
    body: VoiceTextCheckRequestV1
  ): Promise<VoiceTextCheckResponseV1> {
    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const measurement = await this.measurementForActiveVersion(
      actor.organizationId,
      activeVersion
    );
    if (!measurement) {
      /**
       * Нечего сравнивать — это ответ, а не отказ.
       *
       * `content-factory-next-fn33.70`: путь «Заполнить вручную» обещает
       * «Ничего не читаем и не разбираем», и разбора у такого аватара быть не
       * может по устройству. Роут отвечал на это 404 при каждом открытии
       * окна поста и советовал «Соберите голос заново из ваших текстов» —
       * совет, невыполнимый ровно для того, кто выбрал этот путь.
       *
       * Молчание уже описано контрактом: `verdict: 'UNKNOWN'` с причиной
       * `NO_PROFILE` и `silenceHint` — своя строка на каждое молчание. Здесь
       * используется она, а не пятое устройство рядом.
       */
      return this.silentCheck(actor, body.text);
    }
    const metrics = metricsOf(measurement);
    const check = checkText(
      body.text,
      {
        analyzerVersion: measurement.analyzerVersion,
        localePackVersion: measurement.localePackVersion,
        language: (measurement.language as BrandVoiceLocale) ?? 'ru',
        sampleCount: measurement.sampleCount,
        charCount: measurement.charCount,
        wordCount: measurement.wordCount,
        sentenceCount: measurement.sentenceCount,
        // An excluded scale is one the workspace took out of its own profile.
        // Reporting it anyway would be a style guide nobody asked for.
        scales: Object.fromEntries(
          Object.entries(metrics.scales).filter(
            ([, scale]) => !(scale as StoredScaleValue)?.excluded
          )
        ),
        lexicon: measurement.lexicon ?? [],
        punctuation:
          measurement.punctuation ?? {
            dashInsteadOfCopula: null,
            colonBeforeList: null,
            questionAtEnd: null,
            exclamation: null,
          },
        rejected: [],
        split: measurement.corpusSplit ?? {},
        // Absent on every measurement written before 2026-08-24. The check
        // then answers "cannot tell", which is the truth, rather than falling
        // back on the eight scales and calling their share a verdict.
        voicePrint: metrics.voicePrint ?? null,
        // Тоже отсутствует до 27.08.2026, и тоже читается как «не могу
        // сказать»: без границ, снятых на этом авторе, голос сообщается, а
        // вердикт не выносится.
        calibration: metrics.calibration ?? null,
        // Кем судили. Без шеренги границы нечитаемы: голос это число
        // относительно неё, и порог, снятый против одной, к голосу против
        // другой неприменим.
        lineup: metrics.lineup ?? null,
        // The check never reads these; they exist for the model's explanation.
        // Passed through so the shape is the analyser's own and not a partial
        // copy that drifts the next time a field is added.
        postHabits: metrics.postHabits ?? null,
        postLayout: metrics.postLayout ?? null,
      },
      // The language the product answers in, which is not the language the
      // corpus is written in. A German corpus is still reported on in Russian
      // or English, because those are the two the voice copy exists in.
      actor.locale === 'en' ? 'en' : 'ru'
    );

    return {
      inCorridor: check.inCorridor,
      total: check.total,
      outside: check.outside.map((one) => ({
        key: one.key,
        value: one.value,
        low: one.low,
        high: one.high,
        placement: one.placement as 'above' | 'below',
      })),
      summary: check.summary,
      similarity: check.similarity,
      spots: check.spots,
      plainText: check.plainText,
      /**
       * Две доли ошибок и подсказка на случай молчания — из того же разбора.
       *
       * Считает их `checkText`, а не роут: строка «из 30 чужих приняли 1»
       * относится к тем границам, против которых посчитан этот голос, и
       * собранная отдельно она однажды разъедется с вердиктом, который
       * объясняет.
       */
      calibrationErrors: check.calibrationErrors,
      silenceHint: check.silenceHint,
    };
  }

  /**
   * Чем судить черновик, написанный этой версией голоса.
   *
   * Порт для графа генерации (`agent/draft-pick.ts`): наружу уходит функция и
   * одно число, а не отпечаток с шеренгой. Так вторая сборка мерки не заводится
   * — голос это число относительно шеренги, и порог, снятый против одной
   * шеренги и применённый к голосу против другой, сравнивал бы две разные
   * величины. Обе лежат в нуле-единице и обе выглядят как доля голосов, так что
   * ошибка была бы бесшумной; ровно этой ошибкой стенд однажды мерил месяц.
   *
   * Обрезка — та же `CALIBRATION_CUT`, на которой снята сама точка. Судить по
   * ней необрезанный черновик значило бы читать голос одной длины по границам
   * другой: длина — самая громкая привычка, у длинного текста больше окон, и
   * доля прошедших меняется от одного этого с 12% до 6% на одном корпусе и с
   * 31% до 69% на другом.
   *
   * `null` — судить нечем: версии нет, разбора под неё нет, отпечаток не
   * собрался или границы для этого автора ещё не сняты. Вызывающий читает это
   * как «отбора не будет», и никогда как «черновик не похож».
   */
  async draftJudge(
    organizationId: string,
    versionId: string
  ): Promise<{ score(text: string): number | null; accepts: number } | null> {
    const version = await this._profiles.getVersion(organizationId, versionId);
    if (!version) return null;
    const measurement = await this.measurementFor(organizationId, version);
    if (!measurement) return null;
    const metrics = metricsOf(measurement);
    const print = metrics.voicePrint ?? null;
    const calibration = metrics.calibration ?? null;
    if (!print?.ngrams || !isCalibrated(calibration)) return null;
    const language = (measurement.language as BrandVoiceLocale) ?? 'ru';
    const pack = packFor(language) ?? emptyLocalePack(language);
    const lineup = metrics.lineup ?? impostorsFor(language);
    return {
      accepts: calibration!.high!,
      score: (text: string) =>
        measureSimilarity(text.slice(0, CALIBRATION_CUT), print, pack, lineup)
          .votes,
    };
  }

  /**
   * One sentence rewritten, with the rest of the text untouched by
   * construction.
   *
   * The model is handed the sentence, its two neighbours and the author's own
   * corridor, and nothing else of the draft. That is the owner's decision of
   * 2026-08-24 in code: a regeneration loses the facts and the order of thought
   * the text was written for, costs a full call instead of a short one, and can
   * carry the style further away on the second pass than the first did.
   *
   * Nothing is applied here. The answer goes back as a proposal beside the
   * original, and the person decides.
   */
  async repairSentence(
    actor: VoiceActor,
    body: VoiceRepairRequestV1
  ): Promise<VoiceRepairResponseV1> {
    if (!this._assist?.repair) {
      throw new VoiceError(
        'VOICE_ASSIST_UNAVAILABLE',
        'Правка предложения требует модели, а она не подключена. Текст не изменён.'
      );
    }

    const { activeVersion } = await this._profiles.overview(
      actor.organizationId,
      actor.avatarId
    );
    const measurement = await this.measurementForActiveVersion(
      actor.organizationId,
      activeVersion
    );
    if (!measurement) {
      throw new VoiceError(
        'VOICE_PROFILE_NOT_FOUND',
        'Разбора под действующий голос нет: править предложение не под что.'
      );
    }

    const plain = htmlToPlainText(body.text);
    const pack = RU_LOCALE_PACK;
    const located = locateSentences(plain, pack);
    const target = located.find((one) => one.text === body.sentence.trim());
    if (!target) {
      throw new VoiceError(
        'VOICE_SENTENCE_NOT_FOUND',
        'Это предложение больше не найдено в тексте — похоже, текст изменился. Проверьте заново.'
      );
    }
    const index = located.indexOf(target);
    const facts = extractFacts(target.text);

    const scales = metricsOf(measurement).scales;
    const sentenceLength = scales.sentenceLength;
    const corridor = isScaleValue(sentenceLength)
      ? { low: sentenceLength.low, high: sentenceLength.high }
      : null;

    const prompt = buildRepairPrompt({
      sentence: target.text,
      before: index > 0 ? located[index - 1].text : null,
      after: index + 1 < located.length ? located[index + 1].text : null,
      note: body.note?.trim() || 'Фраза расходится с обычной манерой автора.',
      corridor,
      // The author's own sentences, from the scales that kept an example. A
      // rule list does not teach a manner; a line of the person's own writing
      // does, and these are already stored beside the numbers.
      examples: Object.values(scales)
        .filter(isScaleValue)
        .map((scale) => scale.exampleText)
        .filter((one): one is string => !!one)
        .slice(0, 3),
      facts,
      locale: actor.locale ?? 'ru',
    });

    let last: { proposal: string; reason?: string } | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const answer = await this._assist.repair({
        organizationId: actor.organizationId,
        prompt,
      });
      const proposal = answer.sentence.trim();
      const judged = judgeRepair(target.text, proposal, facts);
      if (judged.ok) {
        return {
          sentence: target.text,
          proposal,
          note: answer.note,
          keptFacts: judged.verdict.kept,
        };
      }
      last = { proposal, reason: judged.reason };
      // `UNCHANGED` is the model agreeing there is nothing to fix. Asking twice
      // for the same sentence would only spend the quota again.
      if (judged.reason === 'UNCHANGED') break;
    }

    throw new VoiceError(
      'VOICE_REPAIR_UNGROUNDED',
      last?.reason === 'UNCHANGED'
        ? 'Модель вернула то же предложение: править нечего. Текст не изменён.'
        : 'Правка теряла числа или имена из вашего предложения. Показывать её не будем — исходное предложение осталось как было.',
      target.text
    );
  }
}

export { ANALYZER_VERSION, LOCALE_PACK_VERSION };
