import type { IntakeRequestV2, IntakeEventV2, BriefFilledV2 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/intake-v2.contract';
/**
 * Провод между экраном входа и дверью `/content-intelligence/intake`.
 *
 * `content-factory-next-tu3k.4`. Здесь нет ни одного React-импорта нарочно:
 * разбор события стрима, сборка тела запроса и решение «на что это похоже»
 * проверяются без документа, а экран остаётся тем, что рисует.
 *
 * Типы берутся из `voice-wiring.contract.ts` и не переписываются. Второй
 * экземпляр `IntakeEventV1` рядом с первым — это ровно тот способ, каким
 * событие сервера и его чтение расходятся на третьем поле.
 */

import { INTAKE_INPUT_MIN_CHARS, INTAKE_MAX_CHANNELS, INTAKE_ROUTES, type AntiCopyReportV1, type BriefFieldOriginV1, type BriefFilledFactV1, type BriefFilledV1, type IntakeClaimV1, type IntakeEventNameV1, type IntakeEventV1, type IntakeFormatV1, type IntakeInputKindV1, type IntakeOptionsV1, type IntakeQuestionV1, type IntakeRequestV1, type PieceAnswerInputV1, type PieceCreateRequestV1, type PieceQuestionKeyV1, type PieceQuestionV1, type SlopFindingV1, type SlopReportV1, type SlopVerdictV1, type AdaptationChecksV1, type VoiceCheckReportV1, type ZagotovkaCoreV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { type ChannelWritingProfileResponseV2 as ChannelWritingProfileResponseV1, type ChannelWritingProfileV2 as ChannelWritingProfileV1 } from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile.v2.contract';
import type { BriefField } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';

export type {
  AntiCopyReportV1,
  BriefField,
  BriefFieldOriginV1,
  BriefFilledFactV1,
  BriefFilledV1,
  ChannelWritingProfileResponseV1,
  ChannelWritingProfileV1,
  IntakeClaimV1,
  IntakeEventNameV1,
  IntakeEventV1,
  IntakeFormatV1,
  IntakeInputKindV1,
  IntakeOptionsV1,
  IntakeQuestionV1,
  IntakeRequestV1,
  PieceAnswerInputV1,
  PieceCreateRequestV1,
  PieceQuestionKeyV1,
  PieceQuestionV1,
  SlopFindingV1,
  SlopReportV1,
  SlopVerdictV1,
  ZagotovkaCoreV1,
};

export {
  INTAKE_INPUT_MIN_CHARS,
  INTAKE_MAX_CHANNELS,
};

/** Адреса, по одному месту на каждый. */
export const INTAKE_API = {
  intake: INTAKE_ROUTES.intake.path,
  slopCheck: INTAKE_ROUTES.slopCheck.path,
  writingProfile: INTAKE_ROUTES.writingProfile,
} as const;

/* -------------------------------------------------------------------------
 * Отказ, который экран может напечатать
 * ---------------------------------------------------------------------- */

/**
 * Ответ, который нельзя прочитать как событие стрима.
 *
 * Отдельный класс, а не `Error`: контейнер отличает «сервер отказал словами»
 * от «пришло что-то, чего в контракте нет», и во втором случае говорит прямо
 * — ничего не сохранено. Тот же приём, что у
 * `GeneratorStreamContractError` в `new-launch/store.ts`.
 */
export class IntakeContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'IntakeContractError';
    this.code = code;
  }
}

/* -------------------------------------------------------------------------
 * Чтение событий
 * ---------------------------------------------------------------------- */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const KNOWN_ORIGINS: readonly BriefFieldOriginV1[] = [
  'input',
  'person',
  'avatar',
  'memory',
  'search',
  'model',
];

export const readOrigin = (value: unknown): BriefFieldOriginV1 =>
  KNOWN_ORIGINS.includes(value as BriefFieldOriginV1)
    ? (value as BriefFieldOriginV1)
    : 'model';

const KNOWN_KINDS: readonly IntakeInputKindV1[] = ['thought', 'link', 'foreign_post'];

export const readInputKind = (value: unknown): IntakeInputKindV1 =>
  KNOWN_KINDS.includes(value as IntakeInputKindV1)
    ? (value as IntakeInputKindV1)
    : 'thought';

/**
 * Событие стрима, прочитанное как размеченное объединение контракта.
 *
 * Имя, которого в контракте нет, не выбрасывается и не роняет экран: оно
 * становится шагом (`step`). Сервер волен добавить событие аддитивно — так
 * сказано в шапке самого контракта, — и экран, падающий на неизвестном имени,
 * превратил бы это разрешение в поломку. А вот строка, которая не разбирается
 * как JSON, или событие без имени вовсе — это уже неполный ответ, и о нём
 * говорят вслух.
 */
/**
 * Что вход добавил в волне заготовок (`content-factory-next-tu3k.9`).
 *
 * Заготовка записывается до цикла по каналам, поэтому её событие приходит
 * раньше черновиков, а вопросы при создании приходят со своим именем —
 * `piece-questions`, — потому что у них есть ответ модели, а у старых
 * `questions` его нет. Отдельный союз, а не расширение `IntakeEventV1`:
 * контракт объявил их так же и по той же причине — старые читатели не
 * ломаются.
 */
export type IntakePieceReadEventV1 =
  | { name: 'piece'; pieceId: string; code: string; core: ZagotovkaCoreV1 | null }
  | { name: 'piece-questions'; questions: PieceQuestionV1[]; round: number };

export type IntakeReading =
  | { kind: 'event'; event: Exclude<IntakeEventV2, {name: 'piece'}> }
  | { kind: 'piece'; event: IntakePieceReadEventV1 }
  | { kind: 'step'; name: string };

/** Вопрос интервью заготовки: у него всегда есть ответ модели или честное `null`. */
export const readPieceQuestions = (value: unknown): PieceQuestionV1[] =>
  asArray(value).flatMap((entry) => {
    const question = asRecord(entry);
    if (!question || typeof question.key !== 'string') return [];
    return [
      {
        key: question.key as PieceQuestionKeyV1,
        question: asText(question.question),
        suggested:
          typeof question.suggested === 'string' && question.suggested.trim()
            ? question.suggested
            : null,
        ...(typeof question.field === 'string'
          ? { field: question.field as BriefField }
          : {}),
        ...(Array.isArray(question.options)
          ? {
              options: question.options.filter(
                (option): option is string => typeof option === 'string'
              ),
            }
          : {}),
        ...(typeof question.why === 'string' ? { why: question.why } : {}),
      },
    ];
  });

export function readIntakeEvent(line: string): IntakeReading | null {
  if (!line.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new IntakeContractError(
      'INTAKE_STREAM_INVALID',
      'The intake response was incomplete.'
    );
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new IntakeContractError(
      'INTAKE_STREAM_INVALID',
      'The intake response was incomplete.'
    );
  }

  if (record.name === 'heartbeat') return null;

  // Ошибка узнаётся по флагу, а не по имени: граф генератора пробрасывается
  // как есть и метит отказ именно так (`store.ts`).
  if (record.error === true || record.name === 'error') {
    return {
      kind: 'event',
      event: {
        name: 'error',
        error: true,
        code: asText(record.code, asText(record.errorCode, 'INTAKE_FAILED')),
        message: asText(record.message, 'Failed to write the text.'),
        ...(typeof record.integrationId === 'string'
          ? { integrationId: record.integrationId }
          : {}),
      },
    };
  }

  // Transport keep-alives do not change the current product stage.
  if (record.name === 'heartbeat') return null;

  const name = asText(record.name);
  if (!name) {
    throw new IntakeContractError(
      'INTAKE_STREAM_INVALID',
      'The intake response was incomplete.'
    );
  }

  switch (name) {
    case 'intake-started':
      return {
        kind: 'event',
        event: {
          name: 'intake-started',
          inputKind: readInputKind(record.inputKind),
          sources: asArray(record.sources).filter((source): source is 'foreign_post' | 'link' | 'thought' => source === 'foreign_post' || source === 'link' || source === 'thought'),
        },
      };

    case 'link-fetched':
      return {
        kind: 'event',
        event: {
          name: 'link-fetched',
          url: asText(record.url),
          title: typeof record.title === 'string' ? record.title : null,
          evidenceId: asText(record.evidenceId),
        },
      };

    case 'claims':
      return {
        kind: 'event',
        event: { name: 'claims', claims: readClaims(record.claims) },
      };

    case 'brief-filled': {
      const brief = readBrief(record.brief);
      if (!brief) {
        throw new IntakeContractError(
          'INTAKE_STREAM_INVALID',
          'The brief arrived without its fields.'
        );
      }
      return { kind: 'event', event: { name: 'brief-filled', brief } };
    }

    case 'questions':
      return {
        kind: 'event',
        event: {
          name: 'questions',
          questions: readQuestions(record.questions),
          ...(typeof record.round === 'number' ? { round: record.round } : {}),
        },
      };

    case 'piece':
      return {
        kind: 'piece',
        event: {
          name: 'piece',
          pieceId: asText(record.pieceId),
          code: asText(record.code),
          // Суть читается тем же разбором, что на странице заготовки, и её
          // отсутствие не роняет строку «Заготовка сохранена»: код и адрес
          // человеку нужнее, чем разобранный бриф.
          core: null,
        },
      };

    case 'piece-questions':
      return {
        kind: 'piece',
        event: {
          name: 'piece-questions',
          questions: readPieceQuestions(record.questions),
          round: Number(record.round) || 1,
        },
      };

    case 'done':
      return {
        kind: 'event',
        event: {
          name: 'done',
          pieceId: typeof record.pieceId === 'string' ? record.pieceId : null,
        },
      };

    default:
      // Аддитивное событие, о котором этот экран ничего не знает. Оно всё
      // равно означает «работа идёт», и это единственное, что нужно строке
      // прогресса.
      return { kind: 'step', name };
  }
}

const readClaims = (value: unknown): IntakeClaimV1[] =>
  asArray(value).flatMap((entry) => {
    const claim = asRecord(entry);
    if (!claim || typeof claim.text !== 'string') return [];
    const status = claim.status;
    return [
      {
        text: claim.text,
        hasNumber: claim.hasNumber === true,
        status:
          status === 'verified' || status === 'unverified' || status === 'skipped'
            ? status
            : 'skipped',
        evidenceId: typeof claim.evidenceId === 'string' ? claim.evidenceId : null,
        sourceUrl: typeof claim.sourceUrl === 'string' ? claim.sourceUrl : null,
      },
    ];
  });

export const readQuestions = (value: unknown): IntakeQuestionV1[] =>
  asArray(value).flatMap((entry) => {
    const question = asRecord(entry);
    if (!question || typeof question.field !== 'string') return [];
    return [
      {
        field: question.field as BriefField,
        question: asText(question.question),
        options: asArray(question.options).filter(
          (option): option is string => typeof option === 'string'
        ),
        // `null` — модель честно не нашла ответа и просит слова человека. Это
        // не то же самое, что пустая строка, и подменять одно другим значит
        // напечатать «я думаю, вот так» с пустотой под этим.
        suggested:
          typeof question.suggested === 'string' && question.suggested.trim()
            ? question.suggested
            : null,
        ...(typeof question.why === 'string' ? { why: question.why } : {}),
      },
    ];
  });

const nullableText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'null' ? value : null;

export function readBrief(value: unknown): BriefFilledV2 | null {
  const record = asRecord(value);
  if (!record) return null;
  const origins = asRecord(record.origins) ?? {};
  const format = record.format;
  return {
    inputKind: readInputKind(record.inputKind),
    inputSources: asArray(record.inputSources).flatMap((source) => {
      const item = asRecord(source);
      if (!item || !['thought', 'foreign_post', 'link'].includes(asText(item.kind))) return [];
      return [{ kind: item.kind as 'thought' | 'foreign_post' | 'link', ...(typeof item.url === 'string' ? { url: item.url } : {}), ...(typeof item.evidenceId === 'string' ? { evidenceId: item.evidenceId } : {}) }];
    }),
    goal: nullableText(record.goal),
    thesis: nullableText(record.thesis),
    position: nullableText(record.position),
    disagreement: nullableText(record.disagreement),
    audience: nullableText(record.audience),
    format: FORMATS.includes(format as IntakeFormatV1)
      ? (format as IntakeFormatV1)
      : null,
    facts: asArray(record.facts).flatMap((entry) => {
      const fact = asRecord(entry);
      if (!fact || typeof fact.statement !== 'string') return [];
      return [
        {
          statement: fact.statement,
          sourceUrl: typeof fact.sourceUrl === 'string' ? fact.sourceUrl : null,
          factId: typeof fact.factId === 'string' ? fact.factId : null,
          evidenceId: typeof fact.evidenceId === 'string' ? fact.evidenceId : null,
          origin: readOrigin(fact.origin),
          verified: fact.verified === true,
          ...(['own', 'external', 'found'].includes(asText(fact.kind)) ? { kind: fact.kind as 'own' | 'external' | 'found' } : {}),
          ...(['confirmed', 'conflicting', 'not_found', 'unverified'].includes(asText(fact.status)) ? { status: fact.status as 'confirmed' | 'conflicting' | 'not_found' | 'unverified' } : {}),
          ...(typeof fact.selected === 'boolean' ? { selected: fact.selected } : {}),
        },
      ];
    }),
    origins: Object.fromEntries(
      RECEIPT_FIELDS.filter((field) => field in origins).map((field) => [
        field,
        readOrigin(origins[field]),
      ])
    ),
    ungrounded: asArray(record.ungrounded).filter(
      (entry): entry is string => typeof entry === 'string'
    ),
  };
}

export function readSlopReport(value: unknown): SlopReportV1 | null {
  const record = asRecord(value);
  if (!record) return null;
  const verdict = record.verdict;
  if (verdict !== 'clean' && verdict !== 'review' && verdict !== 'rewrite') {
    return null;
  }
  return {
    ...(record as unknown as SlopReportV1),
    verdict,
    findings: asArray(record.findings).flatMap((entry) => {
      const finding = asRecord(entry);
      if (!finding) return [];
      const hint = asRecord(finding.hint) ?? {};
      return [
        {
          ruleId: asText(finding.ruleId),
          severity: finding.severity === 'error' ? 'error' : 'warn',
          start: Number(finding.start) || 0,
          end: Number(finding.end) || 0,
          excerpt: asText(finding.excerpt),
          hint: { ru: asText(hint.ru), en: asText(hint.en) },
          ...(typeof finding.count === 'number' ? { count: finding.count } : {}),
        },
      ];
    }),
  };
}

/* -------------------------------------------------------------------------
 * Проверки текста, свёрнутые в одну строку
 * ---------------------------------------------------------------------- */

/**
 * Похоже ли это на вас — один ответ выше восьми шкал.
 *
 * Тип объявлен здесь, а не взят из контракта, нарочно. Дверь голоса отвечает
 * `VoiceTextCheckResponseV1`, где вердикт лежит внутри `similarity`, а в
 * `checks` черновика он приезжает отдельным полем: два места, одна мысль.
 * Строка качества читает обе формы через `readVoiceCheck`, поэтому ей нужен
 * ровно этот минимум, а не весь ответ мерки.
 */
export type VoiceCheckV1 = VoiceCheckReportV1;

/** Проверки, приехавшие вместе с текстом: даром, при его сборке. */
export type QualityChecksV1 = AdaptationChecksV1;

const SILENCE_CODES = new Set([
  'TOO_SHORT',
  'NO_PROFILE',
  'CANNOT_TELL',
  'UNCALIBRATED',
]);

/** Коды молчания — не слова для человека, и наружу они не выходят. */
export const isSilenceCode = (reason: string | undefined): boolean =>
  !!reason && SILENCE_CODES.has(reason);

const asSilenceCode = (
  value: unknown
): VoiceCheckReportV1['reason'] | undefined =>
  typeof value === 'string' && SILENCE_CODES.has(value)
    ? (value as VoiceCheckReportV1['reason'])
    : undefined;

/**
 * Вердикт похожести из любой из двух форм ответа.
 *
 * `{ similarity: { verdict } }` — дверь `voice/text-check`; `{ verdict }` —
 * поле `checks.voice` черновика. Всё остальное отбрасывается: строке качества
 * нужны вердикт и причина, а восемь шкал и две доли ошибок живут на экране
 * голоса.
 */
export function readVoiceCheck(value: unknown): VoiceCheckV1 | null {
  const outer = asRecord(value);
  if (!outer) return null;
  const record = asRecord(outer.similarity) ?? outer;
  const verdict = record.verdict;
  if (verdict !== 'CLOSE' && verdict !== 'FAR' && verdict !== 'UNKNOWN') {
    return null;
  }
  const reason = asSilenceCode(record.reason);
  return { verdict, ...(reason ? { reason } : {}) };
}

/**
 * `checks` события стрима — одним разбором на оба стрима.
 *
 * Вход и заготовка читали три поля дважды слово в слово, и `voice` пришлось
 * бы добавлять в оба. Второй экземпляр того же разбора — это ровно тот
 * способ, каким два стрима расходятся на третьем поле.
 */
export function readQualityChecks(value: unknown): QualityChecksV1 {
  const record = asRecord(value) ?? {};
  /*
    Ответ без `voice` (строка списка, старый ответ) читается как «не знаем»,
    а не как пробел в типе: контракт держит поле обязательным, и строка
    качества на `UNKNOWN` молчит ровно так же, как на отсутствие.
  */
  const voice = readVoiceCheck(record.voice) ?? { verdict: 'UNKNOWN' as const };
  return {
    antiCopy: (asRecord(record.antiCopy) ?? null) as AntiCopyReportV1 | null,
    slop: readSlopReport(record.slop),
    voice,
  };
}

/* -------------------------------------------------------------------------
 * Поля квитанции
 * ---------------------------------------------------------------------- */

export const RECEIPT_FIELDS = [
  'thesis',
  'position',
  'disagreement',
  'audience',
  'goal',
  'format',
] as const;

export type ReceiptField = (typeof RECEIPT_FIELDS)[number];

export const FORMATS: readonly IntakeFormatV1[] = [
  'auto',
  'opinion',
  'announcement',
  'list',
  'expert',
  'case',
  'story',
];

/* -------------------------------------------------------------------------
 * Запрос
 * ---------------------------------------------------------------------- */

/**
 * На что похож ввод — ровно одно решение и только про ссылку.
 *
 * Клиент отличает URL и больше ничего: разница между мыслью и чужим постом
 * держится на языке, а не на форме, и второе мнение об этом на экране — это
 * подсказка, которая расходится с тем, что сервер потом решит на самом деле.
 * Поэтому `undefined` здесь честнее «мысли»: экран молчит, сервер решает.
 */
export function detectInputKind(input: string): IntakeInputKindV1 | undefined {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? 'link'
      : undefined;
  } catch {
    return undefined;
  }
}

export type IntakeAnswer = { field: BriefField; text: string };

export function buildIntakePayload(input: {
  input: string;
  integrationIds?: readonly string[];
  language: 'ru' | 'en';
  answers?: readonly IntakeAnswer[];
  decide?: readonly BriefField[];
  briefOverrides?: Partial<Record<ReceiptField, string>>;
  inputKind?: IntakeInputKindV1;
  options?: IntakeOptionsV1;
  sourceLeadId?: string;
  /** Ответы интервью заготовки; сервер ставит им время и происхождение шага. */
  interview?: readonly PieceAnswerInputV1[];
  /** «Реши сама» по ключам вопросов заготовки. */
  decideKeys?: readonly PieceQuestionKeyV1[];
  /** Интервью пропущено целиком одной кнопкой. */
  skipInterview?: boolean;
}): IntakeRequestV2 {
  const kind = input.inputKind ?? detectInputKind(input.input);
  const overrides = Object.fromEntries(
    Object.entries(input.briefOverrides ?? {}).filter(
      ([, value]) => typeof value === 'string' && value.trim()
    )
  );

  return {
    input: input.input.trim(),
    ...(kind ? { inputKind: kind } : {}),
    language: input.language,
    ...(input.answers?.length ? { answers: [...input.answers] } : {}),
    ...(input.decide?.length ? { decide: [...input.decide] } : {}),
    ...(Object.keys(overrides).length
      ? { briefOverrides: overrides as IntakeRequestV1['briefOverrides'] }
      : {}),
    ...(input.options ? { options: input.options } : {}),
    ...(input.sourceLeadId ? { sourceLeadId: input.sourceLeadId } : {}),
    ...(input.interview?.length ? { interview: [...input.interview] } : {}),
    ...(input.decideKeys?.length ? { decideKeys: [...input.decideKeys] } : {}),
    ...(input.skipInterview ? { skipInterview: true } : {}),
  };
}

/**
 * Повод из «Откуда идеи», превращённый в первый экран входа.
 *
 * До 06.09.2026 «Взять в работу» открывало вкладку «Бриф» и оставляло
 * человека перед пустой формой из восьми полей — ровно та жалоба, из которой
 * выросла эта волна. Заголовок и выдержка склеиваются в один текст, потому
 * что вход принимает один текст; ссылка идёт третьей строкой, чтобы сервер
 * увидел её и взял страницу как источник.
 */
export function leadToIntakePrefill(lead: {
  title: string;
  excerpt?: string | null;
  sourceUrl?: string;
  id?: string;
}): { input: string; sourceLeadId?: string } {
  const parts = [lead.title.trim()];
  if (lead.excerpt && lead.excerpt.trim()) parts.push(lead.excerpt.trim());
  if (lead.sourceUrl && lead.sourceUrl.trim()) parts.push(lead.sourceUrl.trim());
  return {
    input: parts.filter(Boolean).join('\n\n'),
    ...(lead.id ? { sourceLeadId: lead.id } : {}),
  };
}

/* -------------------------------------------------------------------------
 * Состояние экрана
 * ---------------------------------------------------------------------- */

export type IntakeScreenState =
  | 'checking'
  | 'restricted'
  | 'read-only'
  | 'no-channel'
  | 'idle'
  | 'streaming'
  | 'draft'
  | 'error';

/**
 * Одно место, где решается, что человек видит.
 *
 * Порядок здесь — это порядок отказов, а не порядок красоты: сначала то, о чём
 * ещё нет ответа (`checking`), затем то, чего человеку нельзя
 * (`restricted`/`read-only`), затем то, чего нет у пространства
 * (`no-channel`), и только потом сама работа. Экран, который решает это в
 * пяти тернарниках по дороге, рано или поздно покажет форму тому, кому она
 * ничего не даст.
 */
export function screenState(input: {
  availability: 'checking' | 'available' | 'unavailable' | 'unknown';
  canWrite: boolean;
  hasChannel: boolean;
  busy: boolean;
  draft: boolean;
  failed: boolean;
}): IntakeScreenState {
  if (input.availability === 'checking') return 'checking';
  if (input.availability === 'unavailable') return 'restricted';
  if (!input.canWrite) return 'read-only';
  /*
    Пустого пространства без каналов здесь больше нет.
    `content-factory-next-tu3k.9`: без канала получается заготовка, и это
    полноценный исход, а не недостающий шаг. Ветка `no-channel` осталась —
    её показывают экраны, которым канал действительно нужен, и сцена обзора.
  */
  if (input.busy) return 'streaming';
  if (input.failed) return 'error';
  if (input.draft) return 'draft';
  return 'idle';
}

/** Почему кнопка не нажимается, или `null`, когда нажимается. */
export type IntakeBlockReason = 'input' | 'channel' | 'checking' | null;

/**
 * Канал перестал быть обязательным (`content-factory-next-tu3k.9`, 06.09.2026).
 *
 * До волны заготовок без канала писать было незачем: текст пишется под
 * площадку. Теперь без канала получается заготовка — нейтральная суть, — и
 * требовать канал ради неё значит просить человека решить, куда он это
 * положит, раньше, чем он решил, что он вообще хочет сказать. Значение
 * `'channel'` осталось в союзе: его печатают экраны, где канал всё ещё нужен.
 */
export function blockReason(input: {
  availability: 'checking' | 'available' | 'unavailable' | 'unknown';
  input: string;
  selected: readonly string[];
}): IntakeBlockReason {
  if (input.availability === 'checking') return 'checking';
  if (input.input.trim().length < INTAKE_INPUT_MIN_CHARS) return 'input';
  return null;
}

/** Legacy callers still receive the neutral action label. */
export function intakeActionLabel(
  selected: readonly string[],
  nameOf: (id: string) => string | undefined,
  words: {
    makePiece: string;
  }
): string {
  return words.makePiece;
}
