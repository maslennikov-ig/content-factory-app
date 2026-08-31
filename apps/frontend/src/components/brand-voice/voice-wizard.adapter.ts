/**
 * The wizard's half of the wire: routes, refusals, and the sentences the
 * container owns.
 *
 * The screens of `36r` own the pixels and `voice-copy.ts` owns their words.
 * What is left over is what a container has to say for itself — that a refusal
 * happened, that an analysis is running, that two texts were refused on the way
 * in — and it lives here rather than inside JSX so it can be read by a test
 * without rendering anything.
 *
 * The refusal mapping is not invented: `VOICE_ERROR_CODES` in the wiring
 * contract already says which code puts a screen into `restricted` and which
 * into `error`, and a second table in the frontend is how the two sides start
 * disagreeing about what a 403 means.
 */

import {
  VOICE_API_BASE,
  VOICE_ERROR_CODES,
  VOICE_SAMPLE_FILES_FIELD,
  VOICE_SAMPLE_FILE_LIMITS,
  type CorpusReadinessV1,
  type VoiceErrorCode,
  type VoiceOverviewResponseV1,
  type VoicePathAvailabilityV1,
  type VoicePathKeyV1,
  type VoiceProposalModeV1,
  type VoiceProposalResponseV1,
  type VoiceSampleIntakeRequestV1,
  type VoiceSampleIntakeResponseV1,
  type VoiceSamplesResponseV1,
  type VoiceScreenStateV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type {
  ProposalField,
  ProposalFieldKey,
  ProposalObservation,
  ProposalPortrait,
} from './voice-proposal.screen';
import type { SampleOriginLabel, SampleRow, SampleSource } from './voice-samples.screen';
import type { VoicePathsAvailability } from './voice-paths.screen';
import type {
  AnalysisLexiconRow,
  AnalysisPunctuationRow,
  AnalysisRejectedRow,
} from './voice-analysis.screen';
import {
  MIN_CORPUS_SAMPLES,
  formatChars,
  plural,
  type VoiceLocale,
} from './voice-copy';

export const VOICE_ROUTES = Object.freeze({
  overview: `${VOICE_API_BASE}/overview`,
  paths: `${VOICE_API_BASE}/paths`,
  samples: `${VOICE_API_BASE}/samples`,
  samplesFiles: `${VOICE_API_BASE}/samples/files`,
  analysis: `${VOICE_API_BASE}/analysis`,
  proposal: `${VOICE_API_BASE}/proposal`,
  proposalField: `${VOICE_API_BASE}/proposal/field`,
  proposalPortrait: `${VOICE_API_BASE}/proposal/portrait`,
  proposalManual: `${VOICE_API_BASE}/proposal/manual`,
  proposalManualField: `${VOICE_API_BASE}/proposal/manual/field`,
  proposalActivate: `${VOICE_API_BASE}/proposal/activate`,
});

/** Which pair of routes screen 05 is on, decided by the path that was chosen. */
export const proposalRoutesFor = (path: VoicePathKeyV1 | undefined) =>
  path === 'manual'
    ? { read: VOICE_ROUTES.proposalManual, write: VOICE_ROUTES.proposalManualField }
    : { read: VOICE_ROUTES.proposal, write: VOICE_ROUTES.proposalField };

/** How long an analysis may run before the wizard stops waiting for it. */
export const ANALYSIS_TIMEOUT_MS = 120_000;

/** How long the wizard waits between two readings of a running analysis. */
export const ANALYSIS_POLL_MS = 2_000;

/** A pause that ends when the wait is over or when the run is cut off. */
export const pause = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asText = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '';

const asCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/* -------------------------------------------------------------------------
 * The container's own words
 * ---------------------------------------------------------------------- */

export const wizardCopy = {
  ru: {
    analysing: 'Разбираем ваши тексты',
    analysingMeasuring: 'считаем длину фраз, пунктуацию и повторы',
    analysingAssisting: 'составляем предложение голоса',
    unknownFailure:
      'Запрос не дошёл до сервера. Ничего не потеряно — образцы и принятые поля хранятся на сервере.',
    shortfallChars: (missing: string) => `Не хватает ${missing} знаков`,
    shortfallSamples: (missing: number) =>
      `${missing} ${plural(missing, ['образец', 'образца', 'образцов'])}`,
    shortfallLead: 'Разбор пока не запускается.',
    back: 'Назад',
    intakeTitle: 'Добавить текст',
    intakeTitleLabel: 'Как назвать образец',
    intakeTextLabel: 'Текст образца',
    intakeSubmit: 'Добавить в набор',
    intakeCancel: 'Отменить',
    intakeRights: 'Подтверждаю право использовать этот текст для разбора',
    intakeRetention: 'Стереть исходный текст после',
    // An event, not a running total. «Добавлено образцов: 1» sat above a table
    // headed «Набранные образцы · 8» and read as a contradiction.
    accepted: (count: number) =>
      count === 1
        ? 'Добавлен 1 образец.'
        : `Добавлено ${count} ${plural(count, [
            'образец',
            'образца',
            'образцов',
          ])}.`,
    rejected: 'Не принято:',
    activated: 'Голос активирован. Новые тексты собираются им.',
    uploadFailed:
      'Файлы не дошли до сервера. Ничего не потеряно — выберите их снова и повторите.',
    /**
     * Fourteen reasons, one line each: what happened to *this* file, and one
     * thing to do about it. No code and no mechanism — «нет текстового слоя»
     * is true and useless, «это скан» is what a person can act on.
     */
    reasons: {
      EMPTY: 'пусто — в файле не оказалось текста',
      TOO_SHORT: 'слишком короткий: добавьте текст подлиннее',
      AI_ARTEFACT: 'следы генерации: нужен текст, написанный человеком',
      DUPLICATE: 'такой текст уже есть в наборе',
      UNREADABLE: 'не читается: пришлите текст другим способом',
      EXTENSION: 'такой формат не читаем: подойдут txt, md, docx, pdf',
      TOO_LARGE: 'слишком большой: разделите на части поменьше',
      BINARY: 'внутри не текст, а двоичные данные: проверьте, тот ли это файл',
      PASSWORD_PROTECTED: 'файл под паролем: снимите пароль и пришлите снова',
      CORRUPTED: 'файл повреждён: пересохраните его и пришлите снова',
      NO_TEXT_LAYER:
        'это скан: страницы есть, а текста в них нет — распознайте или пришлите исходный текст',
      DECOMPRESSION_LIMIT:
        'внутри слишком много данных для своего размера: пересохраните файл',
      PARSE_TIMEOUT: 'читался слишком долго: разделите на части поменьше',
      PARSE_CRASHED: 'прочитать не удалось: пересохраните файл и повторите',
    },
    pickedTooLarge: (limit: string) => `тяжелее ${limit}`,
    pickedTooMany: (limit: number) => `сверх ${limit} файлов за раз`,
    pickedBatchTooLarge: (limit: string) => `партия тяжелее ${limit}`,
    pickedExtension: 'формат не читается: txt, md, docx, pdf',
  },
  en: {
    analysing: 'Reading your texts',
    analysingMeasuring: 'counting sentence length, punctuation and repetition',
    analysingAssisting: 'drafting the voice proposal',
    unknownFailure:
      'The request did not reach the server. Nothing is lost — samples and decided fields are kept on the server.',
    shortfallChars: (missing: string) => `${missing} characters short`,
    shortfallSamples: (missing: number) =>
      `${missing} ${missing === 1 ? 'sample' : 'samples'} short`,
    shortfallLead: 'The analysis does not start yet.',
    back: 'Back',
    intakeTitle: 'Add a text',
    intakeTitleLabel: 'What to call this sample',
    intakeTextLabel: 'Sample text',
    intakeSubmit: 'Add to the corpus',
    intakeCancel: 'Cancel',
    intakeRights: 'I confirm the right to use this text for analysis',
    intakeRetention: 'Erase the source text after',
    accepted: (count: number) => `Samples added: ${count}.`,
    rejected: 'Not accepted:',
    activated: 'The voice is active. New texts are written in it.',
    uploadFailed:
      'The files did not reach the server. Nothing is lost — pick them again and retry.',
    reasons: {
      EMPTY: 'empty — there was no text in the file',
      TOO_SHORT: 'too short: send a longer piece',
      AI_ARTEFACT: 'traces of generation: this needs text a person wrote',
      DUPLICATE: 'this text is already in the corpus',
      UNREADABLE: 'unreadable: send the text another way',
      EXTENSION: 'this format is not read: txt, md, docx and pdf are',
      TOO_LARGE: 'too large: split it into smaller parts',
      BINARY: 'the contents are binary, not text: check this is the right file',
      PASSWORD_PROTECTED: 'the file has a password: remove it and send again',
      CORRUPTED: 'the file is damaged: re-save it and send again',
      NO_TEXT_LAYER:
        'this is a scan: there are pages but no text in them — run recognition or send the source text',
      DECOMPRESSION_LIMIT:
        'it holds far more data than its size suggests: re-save the file',
      PARSE_TIMEOUT: 'it took too long to read: split it into smaller parts',
      PARSE_CRASHED: 'it could not be read: re-save the file and retry',
    },
    pickedTooLarge: (limit: string) => `heavier than ${limit}`,
    pickedTooMany: (limit: number) => `beyond ${limit} files at a time`,
    pickedBatchTooLarge: (limit: string) => `the batch is heavier than ${limit}`,
    pickedExtension: 'this format is not read: txt, md, docx, pdf',
  },
} as const;


/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

export type VoiceFailure = {
  code: VoiceErrorCode | null;
  message: string;
  subject?: string;
  status: number | null;
  screenState: 'error' | 'restricted';
};

const isErrorCode = (value: unknown): value is VoiceErrorCode =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(VOICE_ERROR_CODES, value);

/**
 * What the screen is told, out of what the server said.
 *
 * A named code keeps its message, because the server wrote that sentence for a
 * reader. Anything else — a dropped connection, a proxy, a parse failure — has
 * no sentence worth showing, and the fallback says what is true of all of them:
 * the request did not arrive, and nothing was lost.
 */
export function voiceFailureFrom(
  error: unknown,
  locale: VoiceLocale
): VoiceFailure {
  const body = asRecord(error);
  const code = isErrorCode(body.code) ? body.code : null;
  const status =
    typeof body.status === 'number'
      ? body.status
      : code
      ? VOICE_ERROR_CODES[code].status
      : null;
  return {
    code,
    message: code ? asText(body.message) || wizardCopy[locale].unknownFailure : wizardCopy[locale].unknownFailure,
    ...(asText(body.subject) ? { subject: asText(body.subject) } : {}),
    status,
    screenState: code ? VOICE_ERROR_CODES[code].screenState : 'error',
  };
}

/**
 * The refusal a failed response becomes.
 *
 * Reading the body is the whole point: the status alone cannot tell a member
 * without rights from a reference path an organisation switched off, and the
 * screens draw those two differently.
 */
export async function voiceHttpError(response: {
  status: number;
  json: () => Promise<unknown>;
}): Promise<Error> {
  let body: JsonRecord = {};
  try {
    body = asRecord(await response.json());
  } catch {
    body = {};
  }
  const error = new Error(asText(body.message) || `Voice request failed: ${response.status}`);
  return Object.assign(error, {
    status: response.status,
    ...(typeof body.code === 'string' ? { code: body.code } : {}),
    ...(typeof body.subject === 'string' ? { subject: body.subject } : {}),
  });
}

/* -------------------------------------------------------------------------
 * Readings of the four responses
 * ---------------------------------------------------------------------- */

const SCREEN_STATES: readonly VoiceScreenStateV1[] = [
  'default',
  'loading',
  'empty',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
];

const asScreenState = (
  value: unknown,
  fallback: VoiceScreenStateV1
): VoiceScreenStateV1 =>
  SCREEN_STATES.includes(value as VoiceScreenStateV1)
    ? (value as VoiceScreenStateV1)
    : fallback;

export const emptyReadiness = (): CorpusReadinessV1 => ({
  ready: false,
  charCount: 0,
  sampleCount: 0,
  missingChars: 0,
  missingSamples: 0,
  requiredSamples: MIN_CORPUS_SAMPLES,
  confidence: 'LOW',
  confidenceReasons: ['FEW_CHARS', 'FEW_SAMPLES'],
});

export function readReadiness(value: unknown): CorpusReadinessV1 {
  const readiness = asRecord(value);
  return {
    ready: readiness.ready === true,
    charCount: asCount(readiness.charCount),
    sampleCount: asCount(readiness.sampleCount),
    missingChars: asCount(readiness.missingChars),
    missingSamples: asCount(readiness.missingSamples),
    // An older server does not send it; the floor is the honest fallback,
    // never a number that would claim the corpus needs less than it does.
    requiredSamples: Math.max(
      MIN_CORPUS_SAMPLES,
      asCount(readiness.requiredSamples)
    ),
    confidence: readiness.confidence === 'NORMAL' ? 'NORMAL' : 'LOW',
    confidenceReasons: Array.isArray(readiness.confidenceReasons)
      ? (readiness.confidenceReasons.filter(
          (one) => one === 'FEW_CHARS' || one === 'FEW_SAMPLES'
        ) as CorpusReadinessV1['confidenceReasons'])
      : [],
  };
}

export type OverviewReading = {
  state: VoiceScreenStateV1;
  hasVoice: boolean;
  note?: string;
  permissions: VoiceOverviewResponseV1['permissions'];
  readiness: CorpusReadinessV1;
  paths: VoicePathAvailabilityV1;
};

export function readOverview(value: unknown): OverviewReading {
  const overview = asRecord(value);
  const permissions = asRecord(overview.permissions);
  return {
    state: asScreenState(overview.state, 'empty'),
    hasVoice: overview.hasVoice === true,
    ...(asText(overview.note) ? { note: asText(overview.note) } : {}),
    permissions: {
      canRead: permissions.canRead !== false,
      canCreate: permissions.canCreate === true,
      canEdit: permissions.canEdit === true,
      canDelete: permissions.canDelete === true,
      referencePathDisabled: permissions.referencePathDisabled === true,
    },
    readiness: readReadiness(overview.readiness),
    paths: readPathAvailability(overview.paths),
  };
}

function readPathAvailability(value: unknown): VoicePathAvailabilityV1 {
  const paths = asRecord(value);
  const available = asRecord(paths.available);
  const reasons = asRecord(paths.disabledReasons);
  const disabledReasons: Partial<Record<VoicePathKeyV1, string>> = {};
  for (const key of ['manual', 'own', 'reference'] as const) {
    if (asText(reasons[key])) disabledReasons[key] = asText(reasons[key]);
  }
  return {
    available: {
      manual: available.manual === true,
      own: available.own === true,
      reference: available.reference === true,
    },
    disabledReasons,
  };
}

export type PathsReading = {
  state: VoiceScreenStateV1;
  available: VoicePathsAvailability;
  disabledReasons: Partial<Record<VoicePathKeyV1, string>>;
};

/**
 * `/paths` answers screen 02, and `/overview` already answered it once.
 *
 * The overview's copy is the fallback rather than a second source: a screen
 * that renders three open doors while the paths request is still in flight
 * would offer a door the organisation closed.
 */
export function readPaths(
  value: unknown,
  fallback: VoicePathAvailabilityV1
): PathsReading {
  const paths = asRecord(value);
  const availability = paths.available
    ? readPathAvailability(paths)
    : fallback;
  return {
    state: asScreenState(paths.state, 'default'),
    available: availability.available,
    disabledReasons: availability.disabledReasons,
  };
}

export type SamplesReading = {
  state: VoiceScreenStateV1;
  samples: readonly SampleRow[];
  sources: readonly SampleSource[];
  readiness: CorpusReadinessV1;
  notice?: string;
};

export function readSamples(value: unknown): SamplesReading {
  const envelope = asRecord(value) as Partial<VoiceSamplesResponseV1> &
    JsonRecord;
  const samples = asArray(envelope.samples).map((entry) => {
    const sample = asRecord(entry);
    return {
      code: asText(sample.code),
      title: asText(sample.title),
      origin: asText(sample.origin) as SampleOriginLabel,
      charCount: asCount(sample.charCount),
      date: asText(sample.date),
      ...(sample.redacted === true ? { redacted: true } : {}),
    } satisfies SampleRow;
  });
  return {
    state: asScreenState(envelope.state, samples.length ? 'default' : 'empty'),
    samples,
    sources: asArray(envelope.sources).map((entry) => {
      const source = asRecord(entry);
      return {
        key: asText(source.key) as SampleOriginLabel,
        available: source.available === true,
        ...(asText(source.unavailableReason)
          ? { unavailableReason: asText(source.unavailableReason) }
          : {}),
      } satisfies SampleSource;
    }),
    readiness: readReadiness(envelope.readiness),
    ...(asText(envelope.notice) ? { notice: asText(envelope.notice) } : {}),
  };
}

export type AnalysisReading =
  | { outcome: 'insufficient'; readiness: CorpusReadinessV1 }
  | { outcome: 'pending'; progress: number; stage: 'MEASURING' | 'ASSISTING' }
  | {
      outcome: 'ready';
      measurementId: string;
      sampleCount: number;
      charCount: number;
      /** Accepted samples the analysis deliberately kept out of the count. */
      holdoutCount?: number;
      wordCount: number;
      sentenceCount: number;
      lexicon: readonly AnalysisLexiconRow[];
      punctuation: AnalysisPunctuationRow;
      rejected: readonly AnalysisRejectedRow[];
    };

const asPercentOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function readAnalysis(value: unknown): AnalysisReading {
  const analysis = asRecord(value);
  if (analysis.outcome === 'insufficient') {
    return {
      outcome: 'insufficient',
      readiness: readReadiness(analysis.readiness),
    };
  }
  if (analysis.outcome === 'pending') {
    return {
      outcome: 'pending',
      progress: asCount(analysis.progress),
      stage: analysis.stage === 'ASSISTING' ? 'ASSISTING' : 'MEASURING',
    };
  }
  const punctuationSource = asRecord(analysis.punctuation);
  return {
    outcome: 'ready',
    measurementId: asText(analysis.measurementId),
    sampleCount: asCount(analysis.sampleCount),
    charCount: asCount(analysis.charCount),
    // Absent on a measurement stored before the field existed, and absent
    // when nothing was held back; both mean the same thing to the screen.
    ...(asCount(analysis.holdoutCount)
      ? { holdoutCount: asCount(analysis.holdoutCount) }
      : {}),
    wordCount: asCount(analysis.wordCount),
    sentenceCount: asCount(analysis.sentenceCount),
    lexicon: asArray(analysis.lexicon).map((entry) => {
      const row = asRecord(entry);
      return { term: asText(row.term), count: asCount(row.count) };
    }),
    punctuation: {
      dashInsteadOfCopula: asPercentOrNull(punctuationSource.dashInsteadOfCopula),
      colonBeforeList: asPercentOrNull(punctuationSource.colonBeforeList),
      questionAtEnd: asPercentOrNull(punctuationSource.questionAtEnd),
      exclamation: asPercentOrNull(punctuationSource.exclamation),
    },
    rejected: asArray(analysis.rejected).map((entry) => {
      const row = asRecord(entry);
      const reason = asText(row.reason);
      return {
        code: asText(row.code),
        reason:
          reason === 'AI_ARTEFACT' || reason === 'LANGUAGE'
            ? reason
            : ('TOO_SHORT' as const),
      };
    }),
  };
}

export type ProposalReading =
  | { outcome: 'insufficient'; readiness: CorpusReadinessV1 }
  | {
      outcome: 'ready';
      state: VoiceScreenStateV1;
      mode: VoiceProposalModeV1;
      portrait?: ProposalPortrait;
      fields: readonly ProposalField[];
      observations: readonly ProposalObservation[];
      profileLabel?: string;
      activatedAt?: string;
      notice?: string;
    };

export function readProposal(value: unknown): ProposalReading {
  const proposal = asRecord(value) as Partial<VoiceProposalResponseV1> &
    JsonRecord;
  if (proposal.outcome === 'insufficient') {
    return {
      outcome: 'insufficient',
      readiness: readReadiness(proposal.readiness),
    };
  }
  const fields = asArray(proposal.fields).map((entry) => {
    const field = asRecord(entry);
    return {
      key: asText(field.key) as ProposalFieldKey,
      text: asText(field.text),
      status:
        field.status === 'ACCEPTED' || field.status === 'EDITING'
          ? field.status
          : ('UNDECIDED' as const),
      observationRefs: asArray(field.observationRefs).map((ref) => asText(ref)),
    } satisfies ProposalField;
  });
  return {
    outcome: 'ready',
    // The server says whose lines these are. Deriving it from the path the
    // person clicked would show writable fields over a model's proposal the
    // first time the two disagreed.
    mode: proposal.mode === 'manual' ? 'manual' : 'assist',
    state: asScreenState(proposal.state, fields.length ? 'default' : 'empty'),
    /**
     * Read only where the server sent one. An analysis from before portraits
     * existed sends nothing, and a default empty portrait would put an empty
     * box on screen that reads like one waiting to be written.
     */
    ...(() => {
      const portrait = asRecord(proposal.portrait);
      const text = asText(portrait.text);
      if (!text) return {};
      return {
        portrait: {
          text,
          status:
            portrait.status === 'ACCEPTED' || portrait.status === 'EDITING'
              ? portrait.status
              : ('UNDECIDED' as const),
          observationRefs: asArray(portrait.observationRefs).map((ref) =>
            asText(ref)
          ),
        } satisfies ProposalPortrait,
      };
    })(),
    fields,
    observations: asArray(proposal.observations).map((entry) => {
      const observation = asRecord(entry);
      return {
        ref: asText(observation.ref),
        index: asCount(observation.index),
        field: asText(observation.field) as ProposalFieldKey,
        claim: asText(observation.claim),
        quote: asText(observation.quote),
        sampleCode: asText(observation.sampleCode),
        ...(asText(observation.metric)
          ? { metric: asText(observation.metric) }
          : {}),
      } satisfies ProposalObservation;
    }),
    ...(asText(proposal.profileLabel)
      ? { profileLabel: asText(proposal.profileLabel) }
      : {}),
    ...(asText(proposal.activatedAt)
      ? { activatedAt: asText(proposal.activatedAt) }
      : {}),
    ...(asText(proposal.notice) ? { notice: asText(proposal.notice) } : {}),
  };
}

/* -------------------------------------------------------------------------
 * Sentences the container says
 * ---------------------------------------------------------------------- */

/**
 * The shortfall, in the two units that gate it.
 *
 * The numbers come from the server rather than from the rows on screen: the
 * floor is measured over the corpus the analysis will actually read, and a
 * count made in the browser would disagree with it the moment a reference text
 * sits beside an own one.
 */
export function shortfallText(
  readiness: Pick<CorpusReadinessV1, 'missingChars' | 'missingSamples'>,
  locale: VoiceLocale
): string {
  const t = wizardCopy[locale];
  const parts: string[] = [];
  if (readiness.missingChars > 0) {
    parts.push(t.shortfallChars(formatChars(readiness.missingChars, locale)));
  }
  if (readiness.missingSamples > 0) {
    parts.push(t.shortfallSamples(readiness.missingSamples));
  }
  if (!parts.length) return '';
  return `${parts.join(locale === 'ru' ? ' и ещё ' : ', ')}. ${t.shortfallLead}`;
}

/** What arrived and what did not. Nothing vanishes silently. */
export function intakeNotice(
  response: unknown,
  locale: VoiceLocale
): string {
  const t = wizardCopy[locale];
  const envelope = asRecord(response) as Partial<VoiceSampleIntakeResponseV1> &
    JsonRecord;
  const accepted = asArray(envelope.accepted).length;
  const rejected = asArray(envelope.rejected).map((entry) => {
    const item = asRecord(entry);
    const reason = asText(item.reason) as keyof (typeof t)['reasons'];
    return `«${asText(item.title)}» — ${t.reasons[reason] ?? t.reasons.UNREADABLE}`;
  });
  return [
    t.accepted(accepted),
    rejected.length ? `${t.rejected} ${rejected.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/* -------------------------------------------------------------------------
 * Adding texts
 * ---------------------------------------------------------------------- */

export type IntakeDraft = {
  origin: SampleOriginLabel;
  title: string;
  text: string;
  rightsConfirmed: boolean;
  retentionUntil: string;
};

export const emptyIntake = (origin: SampleOriginLabel): IntakeDraft => ({
  origin,
  title: '',
  text: '',
  rightsConfirmed: false,
  retentionUntil: '',
});

/* -------------------------------------------------------------------------
 * Files
 * ---------------------------------------------------------------------- */

/** The four the parsers read, and the extension `.md` also answers to. */
/**
 * `json` is the Telegram Desktop export the corpus card has always offered.
 * The card promised it; the picker refused it until `vme.21.13`.
 */
export const VOICE_FILE_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'docx',
  'pdf',
  'json',
];

export type PickedFileRefusal = {
  name: string;
  reason: 'EXTENSION' | 'TOO_LARGE' | 'TOO_MANY' | 'BATCH_TOO_LARGE';
};

/**
 * What of a selection is worth sending, decided here rather than by the server.
 *
 * Refusing in the browser is not a second opinion: `file-intake.ts` refuses the
 * same extensions and `multer` the same sizes, and both still do. What this
 * adds is the file's name in the refusal — a twenty-megabyte ceiling hit after
 * a two-minute upload tells a person the batch failed; hit before it, it tells
 * them which file to drop.
 *
 * The four rules are checked in the order they can be explained: what this
 * cannot read, what is too heavy on its own, what is beyond the count, and
 * what pushed the batch past its weight.
 */
export function chooseFiles(files: readonly File[]): {
  picked: File[];
  refused: PickedFileRefusal[];
} {
  const picked: File[] = [];
  const refused: PickedFileRefusal[] = [];
  let bytes = 0;

  for (const file of files) {
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    if (!VOICE_FILE_EXTENSIONS.includes(extension)) {
      refused.push({ name: file.name, reason: 'EXTENSION' });
      continue;
    }
    if (file.size > VOICE_SAMPLE_FILE_LIMITS.maxFileBytes) {
      refused.push({ name: file.name, reason: 'TOO_LARGE' });
      continue;
    }
    if (picked.length >= VOICE_SAMPLE_FILE_LIMITS.maxFilesPerBatch) {
      refused.push({ name: file.name, reason: 'TOO_MANY' });
      continue;
    }
    if (bytes + file.size > VOICE_SAMPLE_FILE_LIMITS.maxBatchBytes) {
      refused.push({ name: file.name, reason: 'BATCH_TOO_LARGE' });
      continue;
    }
    bytes += file.size;
    picked.push(file);
  }

  return { picked, refused };
}

/** The refusal, as the sentence printed beside the file it belongs to. */
export function pickedRefusalNote(
  refusal: PickedFileRefusal,
  locale: VoiceLocale
): string {
  const t = wizardCopy[locale];
  const megabytes = (bytes: number) =>
    `${Math.round(bytes / (1024 * 1024))} ${locale === 'ru' ? 'МБ' : 'MB'}`;
  switch (refusal.reason) {
    case 'EXTENSION':
      return t.pickedExtension;
    case 'TOO_LARGE':
      return t.pickedTooLarge(
        megabytes(VOICE_SAMPLE_FILE_LIMITS.maxFileBytes)
      );
    case 'TOO_MANY':
      return t.pickedTooMany(VOICE_SAMPLE_FILE_LIMITS.maxFilesPerBatch);
    default:
      return t.pickedBatchTooLarge(
        megabytes(VOICE_SAMPLE_FILE_LIMITS.maxBatchBytes)
      );
  }
}

/**
 * The multipart body: the files under one field, the rest as text beside them.
 *
 * `origin` is not sent. A file's origin is `FILE`, the server knows it, and a
 * body that could say otherwise is a body that could file a `.docx` under
 * somebody's published posts.
 */
export function buildFilePayload(
  files: readonly File[],
  draft: Pick<IntakeDraft, 'rightsConfirmed' | 'retentionUntil'>,
  path: VoicePathKeyV1 | undefined,
  locale: VoiceLocale
): FormData {
  const reference = path === 'reference';
  const form = new FormData();
  for (const file of files) form.append(VOICE_SAMPLE_FILES_FIELD, file);
  form.append('usagePurpose', reference ? 'STYLE_REFERENCE' : 'OWN_VOICE');
  form.append('language', locale);
  if (reference) {
    form.append('rightsConfirmed', draft.rightsConfirmed ? 'true' : 'false');
    if (draft.retentionUntil) {
      form.append(
        'retentionUntil',
        new Date(draft.retentionUntil).toISOString()
      );
    }
  }
  return form;
}

/**
 * One request shape for every intake path.
 *
 * The chosen path decides what the text is *for*, and that is the only thing
 * the payload takes from it: a reference is somebody else's writing, so it
 * carries the confirmed right and the date its raw text is erased, and an own
 * text carries neither because neither would be true.
 */
export function buildIntakePayload(
  draft: IntakeDraft,
  path: VoicePathKeyV1 | undefined,
  locale: VoiceLocale
): VoiceSampleIntakeRequestV1 {
  const reference = path === 'reference';
  return {
    origin: draft.origin as VoiceSampleIntakeRequestV1['origin'],
    usagePurpose: reference ? 'STYLE_REFERENCE' : 'OWN_VOICE',
    language: locale,
    items: [
      {
        title: draft.title.trim() || draft.text.trim().slice(0, 60),
        text: draft.text,
      },
    ],
    ...(reference
      ? {
          rightsConfirmed: draft.rightsConfirmed,
          ...(draft.retentionUntil
            ? { retentionUntil: new Date(draft.retentionUntil).toISOString() }
            : {}),
        }
      : {}),
  };
}
