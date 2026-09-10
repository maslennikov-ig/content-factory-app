/**
 * The wire between the Content section's screens and the product behind them.
 *
 * `content-factory-next-36r` built eleven screens, eight scales, the identity
 * barrier, the material library and the brief gate — as components and pure
 * functions. Nothing of it has a route. This file is the one place both sides
 * of that gap agree on, so the backend and the frontend of
 * `content-factory-next-07h` can be built at the same time.
 *
 * It is derived from the screens rather than invented: a screen knows what it
 * has to show, and the contract is obliged to hand exactly that over. The
 * registry at the bottom writes that derivation down field by field, and
 * `tests/brand-voice.wiring-contract.test.cjs` reads it against the components'
 * own prop types.
 *
 * Three things it deliberately does *not* do. It holds no Prisma types: a
 * column is storage and a field is a promise to a screen, and tying them makes
 * every migration a frontend change. It holds no `class-validator` DTO: those
 * live in `dtos/content-intelligence/` where the rest of them are, and they are
 * shaped by these types. And it reaches no platform — a recut prepares text,
 * `PostsService` and the providers deliver it, which is the rule
 * `docs/product/migration-map.md` states.
 */

import type {
  BrandVoiceLocale,
  LexiconEntry,
  PunctuationHabits,
  StyleScaleKey,
} from './brand-voice.types';
import type { ProfileField, ProfileFieldV2 } from './assist.contract';
import type { PostHabitMetricKey } from './post-habits';
import type { PostLayoutMetricKey } from './post-layout';
import type { RecutPlatform } from './recut';
import type { SampleOrigin, SampleUsagePurpose } from './sample-intake';
import type { RedactionCategory } from './identity-barrier';
import type { BriefField } from './brief-gate';
import type { BrandProfileSelectionV1 } from '../contracts';
import type { VoiceSampleFileIntakeResponseV2 as FileIntakeResponseV2 } from './voice-intake-v2.contract';

/** Kept in this registry's exported type set while its implementation stays separate. */
export type VoiceSampleFileIntakeResponseV2 = FileIntakeResponseV2;

/**
 * The versions a measurement is read back with a year later.
 *
 * Re-exported here rather than imported from two places by two teams: a
 * corridor whose provenance is unclear is a number the generator obeys for no
 * stated reason.
 */
export const ANALYZER_VERSION = 'brand-voice-analyzer/1.1.0' as const;
export const LOCALE_PACK_VERSION = 'ru-2026-08-24' as const;

export const VOICE_CONTRACT_VERSION = 'brand-voice-wiring/v1' as const;

/** Everything in this contract hangs off one prefix. */
export const VOICE_API_BASE = '/content-intelligence/voice' as const;
export const MATERIALS_API_BASE = '/content-intelligence/materials' as const;
export const BRIEF_API_BASE = '/content-intelligence/brief' as const;

/* -------------------------------------------------------------------------
 * Outcomes and refusals
 * ---------------------------------------------------------------------- */

/**
 * The three ways a voice request ends.
 *
 * `insufficient` is a result, not a failure, and that distinction is the whole
 * reason this union exists. A workspace eight thousand characters short of the
 * floor has done nothing wrong; telling it "something went wrong" loses the
 * only useful part of the answer, which is the number still missing.
 */
export const VOICE_OUTCOMES = ['ready', 'insufficient', 'pending'] as const;
export type VoiceOutcome = (typeof VOICE_OUTCOMES)[number];

/**
 * Every code a screen may be handed, with the status it arrives on and the
 * state the screen goes into when it does.
 *
 * `restricted` is a state, not an error message: a member without the right to
 * change a voice still sees it, and an empty screen would be a lie about what
 * the workspace holds.
 */
export const VOICE_ERROR_CODES = {
  VOICE_FORBIDDEN: { status: 403, screenState: 'restricted' },
  VOICE_REFERENCE_DISABLED: { status: 403, screenState: 'restricted' },
  VOICE_RIGHTS_REQUIRED: { status: 409, screenState: 'error' },
  /**
   * The hand-filled voice was activated with a line still empty.
   *
   * Its own code rather than `VOICE_RIGHTS_REQUIRED`: consent and completeness
   * are two different things to be missing, and the screen unlocks a different
   * control for each — the checkbox for one, the empty field for the other.
   */
  VOICE_FIELDS_INCOMPLETE: { status: 409, screenState: 'error' },
  VOICE_PROFILE_NOT_FOUND: { status: 404, screenState: 'error' },
  VOICE_VERSION_NOT_FOUND: { status: 404, screenState: 'error' },
  /**
   * The version moved while someone was looking at it — two tabs, two
   * restores, or a row whose content no longer matches its own digest. The
   * layer underneath calls all of these a conflict; without this code they
   * left as a bare 500 and the screen could only say «что-то пошло не так».
   */
  VOICE_VERSION_CONFLICT: { status: 409, screenState: 'error' },
  VOICE_SAMPLE_NOT_FOUND: { status: 404, screenState: 'error' },
  VOICE_SAMPLE_UNREADABLE: { status: 422, screenState: 'error' },
  /**
   * The batch was refused before anything in it was read: too many files, too
   * many bytes together, or one file over the ceiling that got past the
   * browser. Refused as a whole, and named as a whole — a per-file reason
   * would claim something was read that never was.
   */
  VOICE_UPLOAD_REJECTED: { status: 413, screenState: 'error' },
  /**
   * The pasted-text route's own request was over one of its two ceilings —
   * the same shape of refusal `VOICE_UPLOAD_REJECTED` is, for the route
   * beside it. Two different layers answer with this code for two different
   * ceilings: `createVoicePasteBodyLimiter` (`brand-voice.paste.ts`, mounted
   * by `main.ts`) for the body's byte size, checked inside the parser itself
   * rather than downstream of it; and `VoiceService.intake` for the batch's
   * combined character count, which `class-validator` cannot bound because
   * it looks at one property at a time and would answer with a shapeless 400
   * if it tried. Without this code either refusal arrived unnamed — a bare
   * `413` with no body from express, or the global `ValidationPipe`'s own
   * `400` with no code on it.
   */
  VOICE_PAYLOAD_TOO_LARGE: { status: 413, screenState: 'error' },
  VOICE_ANALYSIS_FAILED: { status: 500, screenState: 'error' },
  /** The model was asked and did not answer. Never a blank profile. */
  VOICE_ASSIST_UNAVAILABLE: { status: 502, screenState: 'error' },
  /** It answered without a quote from the corpus, twice. */
  VOICE_ASSIST_UNGROUNDED: { status: 502, screenState: 'error' },
  VOICE_AVATAR_NOT_FOUND: { status: 404, screenState: 'error' },
  /**
   * The space already holds `MAX_AVATARS_PER_SPACE` of them.
   *
   * A refusal rather than a silently disabled button, because the button is
   * disabled on the screen the person is looking at and not on the second tab
   * they left open half an hour ago.
   */
  VOICE_AVATAR_LIMIT: { status: 409, screenState: 'error' },
  /**
   * An avatar with no analysis cannot be the one that writes by default.
   *
   * It is the same rule the card states — «по умолчанию нельзя без разбора» —
   * said by the server. Held here rather than only in the interface: a default
   * pointing at an avatar with no version would make every generation fall
   * back to a neutral style while the screen showed a name.
   */
  VOICE_AVATAR_NOT_ANALYSED: { status: 409, screenState: 'error' },
  /**
   * The default was deleted and nobody was named to take over.
   *
   * Only raised while another avatar could have taken it: deleting the last
   * one is allowed and answers with a space that writes neutrally, which is
   * what its confirmation promises.
   */
  VOICE_AVATAR_SUCCESSOR_REQUIRED: { status: 409, screenState: 'error' },
  /**
   * Просят учиться, а учиться пока не на чем.
   *
   * Свой код, а не «пусто»: экран говорит, сколько пар не хватает, и это
   * ответ, а не поломка. Кнопка на экране уже выключена — но выключена она на
   * той вкладке, которую человек смотрит, а не на второй, открытой полчаса
   * назад.
   */
  VOICE_LEARN_NOT_ENOUGH: { status: 409, screenState: 'error' },
  /**
   * Модель не ответила, или ответила не по схеме. Ничего не выучено и ничего
   * не потеряно: пары остаются на месте и уйдут в следующий прогон.
   */
  VOICE_LEARN_UNAVAILABLE: { status: 502, screenState: 'error' },
  /** Отменяют правило, которого у аватара нет: две вкладки, одна отмена. */
  VOICE_LEARN_RULE_NOT_FOUND: { status: 404, screenState: 'error' },
  MATERIAL_NOT_FOUND: { status: 404, screenState: 'error' },
  MATERIAL_PLATFORM_UNSUPPORTED: { status: 422, screenState: 'error' },
  BRIEF_FACT_UNGROUNDED: { status: 422, screenState: 'error' },
  RADAR_UNAVAILABLE: { status: 503, screenState: 'error' },
} as const satisfies Record<
  string,
  { status: number; screenState: 'error' | 'restricted' }
>;

export type VoiceErrorCode = keyof typeof VOICE_ERROR_CODES;

/**
 * What `safeHttpError` puts on the wire, and what the screen reads.
 *
 * The code is what a screen branches on; the message is what a person reads.
 * A screen printing "что-то пошло не так" over a server that named the reason
 * is a lost reason, not a tidy interface.
 */
export type VoiceErrorBodyV1 = {
  code: VoiceErrorCode;
  message: string;
  /** Present where the refusal names a thing: a sample, a version, a scale. */
  subject?: string;
};

/* -------------------------------------------------------------------------
 * Shared shapes
 * ---------------------------------------------------------------------- */

/** What the workspace may do here, decided by policy rather than by a prop. */
export type VoicePermissionsV1 = {
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Set when the organisation switched the reference path off. */
  referencePathDisabled: boolean;
};

/** How far the corpus is from the floor, in the two units that gate it. */
/**
 * The corpus floor, defined where both sides read it.
 *
 * It lived in three places: `analyzer.ts` for the server, `voice-copy.ts` for
 * the screens, and the screen itself recomputing readiness from them. Three
 * copies of one rule is how the button and the sentence beside it come to
 * disagree, and the rule is no longer a constant — it depends on how long this
 * corpus's texts are — so a retyped `8` is now wrong rather than merely
 * duplicated.
 */
export const MIN_CORPUS_CHARS = 15_000;
export const MIN_CORPUS_SAMPLES = 8;
export const MAX_REQUIRED_SAMPLES = 20;

/**
 * How many texts this corpus needs, given how long its texts are.
 *
 * Fifteen thousand characters is the volume floor; this asks the corpus to
 * reach it in items of its own size. A channel of eight-hundred-character
 * posts needs nineteen of them, which is inside the 15–25 the research names
 * for short form; a corpus of long articles bottoms out at eight.
 */
export function requiredSamples(
  charCount: number,
  sampleCount: number
): number {
  if (sampleCount <= 0 || charCount <= 0) return MIN_CORPUS_SAMPLES;
  const average = charCount / sampleCount;
  const needed = Math.ceil(MIN_CORPUS_CHARS / average);
  return Math.min(MAX_REQUIRED_SAMPLES, Math.max(MIN_CORPUS_SAMPLES, needed));
}

/**
 * Below either of these the profile is marked low-confidence — a label, never
 * a refusal.
 *
 * The volume figure is the research's five-thousand-word mark. The count is
 * measured: rebuilding the print from subsamples of the owner's corpus on
 * 2026-08-24, five draws each, a corpus under twenty-five posts separated his
 * writing from a stranger's in 83–84% of pairs against 89% above it, and the
 * line drawn on his own spread never fired at all — nought false alarms where
 * the calibration promises five per cent, because a print built on a dozen
 * texts sits too close to each of them.
 */
export const LOW_CONFIDENCE_CHARS = 35_000;
export const LOW_CONFIDENCE_SAMPLES = 25;

/**
 * Which half of the corpus is thin.
 *
 * "Низкая уверенность" on its own does not say whether to write more posts or
 * longer ones, and those are different pieces of advice.
 */
export function confidenceReasonsFor(
  charCount: number,
  sampleCount: number
): Array<'FEW_CHARS' | 'FEW_SAMPLES'> {
  const reasons: Array<'FEW_CHARS' | 'FEW_SAMPLES'> = [];
  if (charCount < LOW_CONFIDENCE_CHARS) reasons.push('FEW_CHARS');
  if (sampleCount < LOW_CONFIDENCE_SAMPLES) reasons.push('FEW_SAMPLES');
  return reasons;
}

export type CorpusReadinessV1 = {
  ready: boolean;
  charCount: number;
  sampleCount: number;
  missingChars: number;
  missingSamples: number;
  /**
   * How many texts this corpus needs, given how long its texts are.
   *
   * Not a constant: eight articles of two thousand characters and eight posts
   * of eight hundred are not the same corpus, and the screen has to say the
   * number that applies to the person looking at it.
   */
  requiredSamples: number;
  confidence: 'LOW' | 'NORMAL';
  /** Which half is short. "Низкая уверенность" alone says nothing to act on. */
  confidenceReasons: Array<'FEW_CHARS' | 'FEW_SAMPLES'>;
};

export type VoiceInsufficientV1 = {
  outcome: 'insufficient';
  readiness: CorpusReadinessV1;
};

/* -------------------------------------------------------------------------
 * Screen 01 — the section before a voice exists
 * ---------------------------------------------------------------------- */

/**
 * Whether there is a voice, whether this person may make one, and why not.
 *
 * One request answers screens 01 and 02, because they are one decision seen
 * twice: what is here, and which doors are open.
 */
export type VoiceOverviewResponseV1 = {
  contractVersion: typeof VOICE_CONTRACT_VERSION;
  hasVoice: boolean;
  /** `default` when a voice exists, `empty` when none does. */
  state: VoiceScreenStateV1;
  permissions: VoicePermissionsV1;
  /** The one line beside the button explaining a closed door. */
  note?: string;
  activeVersion?: VoiceVersionSummaryV1;
  readiness: CorpusReadinessV1;
  paths: VoicePathAvailabilityV1;
};

/**
 * The nine states every screen of `36r` reports, in the words it reports them.
 *
 * A screen that quietly falls back to `default` turns a review of nine states
 * into a review of one, and the same is true of a route.
 */
export type VoiceScreenStateV1 =
  | 'default'
  | 'loading'
  | 'empty'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

/* -------------------------------------------------------------------------
 * Screen 02 — three ways in
 * ---------------------------------------------------------------------- */

export type VoicePathKeyV1 = 'manual' | 'own' | 'reference';

/**
 * Which of the three doors are open, and the sentence for each that is shut.
 *
 * A closed path is shown closed with its reason rather than removed: an
 * organisation seeing two cards where the design has three cannot tell whether
 * it lost a feature or never had it.
 */
export type VoicePathAvailabilityV1 = {
  available: Readonly<Record<VoicePathKeyV1, boolean>>;
  disabledReasons: Partial<Record<VoicePathKeyV1, string>>;
};

export type VoicePathsResponseV1 = {
  state: VoiceScreenStateV1;
} & VoicePathAvailabilityV1;

/* -------------------------------------------------------------------------
 * Screen 03 — the corpus
 * ---------------------------------------------------------------------- */

/** One row of the corpus table. The text itself never travels to the list. */
export type VoiceSampleRowV1 = {
  id: string;
  /** `smp-02`, the short code the screen prints beside an example. */
  code: string;
  title: string;
  origin: SampleOrigin;
  usagePurpose: SampleUsagePurpose;
  charCount: number;
  /** Already formatted for the reader's locale by the server. */
  date: string;
  /** Something was taken out on the way in. Never the value itself. */
  redacted?: boolean;
};

/** Which intake paths are open, and why one is not. */
export type VoiceSampleSourceV1 = {
  key: SampleOrigin;
  available: boolean;
  unavailableReason?: string;
};

export type VoiceSamplesResponseV1 = {
  state: VoiceScreenStateV1;
  samples: VoiceSampleRowV1[];
  sources: VoiceSampleSourceV1[];
  readiness: CorpusReadinessV1;
  /** The line above the table after an intake: what arrived, what did not. */
  notice?: string;
};

/**
 * Adding texts, by any of the five paths.
 *
 * One request shape for all five: the difference between pasting and importing
 * a Telegram export is where the text came from, not what happens to it.
 */
export type VoiceSampleIntakeRequestV1 = {
  origin: SampleOrigin;
  usagePurpose: SampleUsagePurpose;
  language?: BrandVoiceLocale;
  items: Array<{
    title: string;
    text: string;
    externalRef?: string;
    sourceId?: string;
    postId?: string;
  }>;
  /** Required for `STYLE_REFERENCE`: the raw text is erased on this date. */
  retentionUntil?: string;
  /** Confirmed for anything the workspace did not write itself. */
  rightsConfirmed?: boolean;
};

export type VoiceSampleIntakeResponseV1 = {
  accepted: VoiceSampleRowV1[];
  /**
   * Nothing vanishes silently: a refused text says which of it and why.
   *
   * The first five reasons are `sample-intake.ts`'s own, decided after a
   * file has already become text. The eight after `UNREADABLE` are
   * `content-factory-next-uoy`'s: `file-intake.ts` routes origin `FILE` by
   * extension (`EXTENSION`, `TOO_LARGE`, `BINARY` shared with `.txt`/`.md`
   * via `text-file.ts`), and `docx-file.ts`/`pdf-file.ts` name everything
   * that can go wrong turning a `.docx`/`.pdf` into text in the first place
   * — before `sample-intake.ts` ever sees it: a password, a corrupted
   * archive or object graph, a zip-bomb entry caught by its declared
   * compression ratio, a scanned page with no text layer, and the isolated
   * parse process itself timing out or crashing.
   */
  rejected: Array<{
    title: string;
    reason:
      | 'EMPTY'
      | 'TOO_SHORT'
      | 'AI_ARTEFACT'
      | 'DUPLICATE'
      | 'UNREADABLE'
      | 'EXTENSION'
      | 'TOO_LARGE'
      | 'BINARY'
      | 'PASSWORD_PROTECTED'
      | 'CORRUPTED'
      | 'NO_TEXT_LAYER'
      | 'DECOMPRESSION_LIMIT'
      | 'PARSE_TIMEOUT'
      | 'PARSE_CRASHED';
    detail?: string;
  }>;
  readiness: CorpusReadinessV1;
};

export type VoiceSampleDeleteRequestV1 = {
  /** Codes rather than ids, because that is what the table selects with. */
  codes: string[];
};

/**
 * The multipart field the files arrive in.
 *
 * Named here rather than typed as a string in two places: the browser writes
 * it into a `FormData` and `FilesInterceptor` reads it back, and a typo in
 * either is an upload that silently arrives with no files at all.
 */
export const VOICE_SAMPLE_FILES_FIELD = 'files' as const;

/**
 * The three ceilings a batch of files is held to, in one place.
 *
 * `maxFileBytes` is the number the browser refuses by before sending — naming
 * the file it refused — and the number `multer`'s `limits.fileSize` is set to.
 * Because the browser refuses first, `text-file.ts`'s and the binary parsers'
 * own `TOO_LARGE` becomes unreachable over HTTP and stays what it always was:
 * the library's guarantee about its own input, checked by their tests rather
 * than by a person. `tests/brand-voice.file-intake.test.cjs` ties all three
 * declarations of it together, so they cannot drift apart quietly.
 *
 * The batch ceilings are a different rule with a different reason. One request
 * carries the whole selection because the workspace-wide limiter counts
 * requests — ninety an hour, shared with every read the wizard makes — and a
 * file per request would spend that on a single afternoon's corpus. What one
 * request may therefore contain has to be bounded on its own: ten files, forty
 * megabytes together.
 */
export const VOICE_SAMPLE_FILE_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxFilesPerBatch: 10,
  maxBatchBytes: 40 * 1024 * 1024,
} as const;

/**
 * The same batch, arriving as pasted JSON instead of files, held to a ceiling
 * of its own rather than to express's undeclared default.
 *
 * `content-factory-next-vme.10` found the gap: every JSON route but two gets
 * express's own 100 KB body limit, `main.ts` raised it for `/copilot` and
 * `/posts` and forgot the route this contract's own `items[].text` promises
 * two hundred thousand characters on. Cyrillic past roughly forty-five
 * thousand characters already crossed 100 KB in UTF-8, so the wizard's own
 * paste field failed on an ordinary-length post — as a bare 413 with no body,
 * shown to a person as «неизвестная ошибка» on an action the product told
 * them was allowed.
 *
 * `maxCharsPerSample` is not a new number: it is `sample-intake.ts`'s
 * `MAX_SAMPLE_CHARS`, restated here rather than imported, the same way
 * `maxFileBytes` above is restated rather than imported from the parsers —
 * `tests/brand-voice.paste-ceiling.test.cjs` ties the two together the same
 * way `tests/brand-voice.sample-files.test.cjs` ties the file ceilings.
 *
 * `maxCharsPerRequest` is the new rule: five hundred items at two hundred
 * thousand characters each is a hundred million characters, and nothing
 * bounds their sum until this does. A million characters is comfortably more
 * than any paste a person makes in one sitting and far short of the ceiling
 * five hundred items could otherwise carry.
 *
 * `maxBodyBytes` is what that million characters costs on the wire, with
 * room kept rather than spent. Cyrillic is two bytes per character in UTF-8,
 * so the text alone is two megabytes in the worst case. The other four
 * fields an item carries — `title` (200 chars), `externalRef` (512),
 * `sourceId` and `postId` (64 each) — add at most 840 KB more across five
 * hundred items if every one of them is filled to its own ceiling, and
 * JSON's own punctuation (quotes, commas, key names) adds tens of kilobytes
 * on top of that. The worst case lands under 2.9 MB; four megabytes clears
 * it with headroom instead of sitting against it.
 */
export const VOICE_SAMPLE_PASTE_LIMITS = {
  maxCharsPerSample: 200_000,
  maxSamplesPerRequest: 500,
  maxCharsPerRequest: 1_000_000,
  maxBodyBytes: 4 * 1024 * 1024,
} as const;

/**
 * Files, with what the texts inside them are for.
 *
 * Multipart rather than the JSON route beside it: the body limit on every
 * route but two is express's own 100 KB, base64 would inflate twenty megabytes
 * to twenty-seven, and all of it would pass through the global
 * `ValidationPipe` as one string. Everything except the bytes is the same as
 * `VoiceSampleIntakeRequestV1` — the origin is not, because a file's origin is
 * `FILE` and nothing else, and it is the server that knows that.
 *
 * The fields arrive as multipart text, so every one of them is a string on the
 * wire; the DTO converts them, and the day it stops, `rightsConfirmed: 'true'`
 * is refused as "not a boolean" and a person reads «неизвестная ошибка».
 */
export type VoiceSampleFileIntakeRequestV1 = {
  usagePurpose: SampleUsagePurpose;
  language?: BrandVoiceLocale;
  /** Required for `STYLE_REFERENCE`: the raw text is erased on this date. */
  retentionUntil?: string;
  /** Confirmed for anything the workspace did not write itself. */
  rightsConfirmed?: boolean;
};

/** Additive multipart contract; the parser still defaults to 300 for V1. */
export type VoiceSampleFileIntakeRequestV2 = VoiceSampleFileIntakeRequestV1 & {
  maxMessages?: number;
};

/* -------------------------------------------------------------------------
 * Screen 04 — the analysis step
 * ---------------------------------------------------------------------- */

/**
 * The analysis runs on TypeScript and does not go to the network, so it
 * finishes in one request for any corpus a person can paste. `pending` exists
 * for the agent pass that follows it, which does make a paid call.
 */
export type VoiceAnalysisRequestV1 = {
  language?: BrandVoiceLocale;
  /** The agent pass is optional: the deterministic numbers stand alone. */
  withAssist?: boolean;
};

export type VoiceAnalysisResponseV1 =
  | VoiceInsufficientV1
  | {
      outcome: 'pending';
      /** 0–100, so the step can show progress rather than a spinner. */
      progress: number;
      stage: 'MEASURING' | 'ASSISTING';
    }
  | {
      outcome: 'ready';
      measurementId: string;
      analyzerVersion: string;
      localePackVersion: string;
      language: BrandVoiceLocale;
      sampleCount: number;
      charCount: number;
      wordCount: number;
      sentenceCount: number;
      lexicon: LexiconEntry[];
      punctuation: PunctuationHabits;
      /** Dropped before counting, with the reason. */
      rejected: Array<{
        code: string;
        reason: 'AI_ARTEFACT' | 'TOO_SHORT' | 'LANGUAGE';
      }>;
      /**
       * Samples held back from the measurement on purpose.
       *
       * `splitCorpus` keeps 30% of an accepted corpus aside so a later
       * generation can be checked against writing the profile never read.
       * Without this number the step counts eight texts and then reports six,
       * with nothing dropped and nothing said — the two missing ones read as
       * loss. Optional because a measurement stored before this field existed
       * has no split to count.
       */
      holdoutCount?: number;
    };

/**
 * Тот же конверт NDJSON, что у входа: строка — событие, последняя — `done`
 * или `error`.
 *
 * Зачем стрим, когда рядом есть `POST /analysis`. Разбор корпуса — это один
 * вызов модели на образец, до 28 подряд, и целиком он не укладывается в
 * шестьдесят секунд, после которых ingress обрывает запрос: владелец получил
 * 504 на 88 образцах 07.09.2026. Ответ, который начинается сразу и идёт
 * строками, не упирается ни в один такой предел — и заодно показывает, что
 * происходит, вместо полосы, нарисованной наугад.
 *
 * `progress`/`stage` старого ответа здесь не повторяются: доля считается из
 * `index`/`total` события `call`, а стадию называет само имя события. Число,
 * посчитанное на сервере, было бы вторым источником правды о той же полосе.
 */
export type VoiceAnalysisEventV1 =
  /** Корпус прочитан: сколько текстов в нём и сколько из них увидит модель. */
  | { name: 'started'; samples: number; planned: number }
  /**
   * Арифметика сохранена. Она принадлежит человеку и переживает модель, а
   * потому называется отдельным событием: дальше может не ответить никто, и
   * сказанное здесь всё равно останется правдой.
   */
  | {
      name: 'measured';
      measurementId: string;
      sampleCount: number;
      charCount: number;
      wordCount: number;
      sentenceCount: number;
    }
  /** Один вызов модели. `ok: false` — попытка, которую пришлось повторить. */
  | {
      name: 'call';
      stage: 'map' | 'reduce';
      /** 1..`total` — какой это образец, а не какая это по счёту попытка. */
      index: number;
      total: number;
      ok: boolean;
    }
  | { name: 'done'; analysis: VoiceAnalysisResponseV1 }
  | { name: 'error'; error: true; code: string; message: string };

export type VoiceAnalysisEventNameV1 = VoiceAnalysisEventV1['name'];

/* -------------------------------------------------------------------------
 * Screen 05 — the proposal
 * ---------------------------------------------------------------------- */

export type VoiceProposalFieldV1 = {
  key: ProfileField;
  text: string;
  status: 'ACCEPTED' | 'EDITING' | 'UNDECIDED';
  /** `smp-02#1`. Empty means the corpus gave no grounds for this field. */
  observationRefs: string[];
};

export type VoiceObservationV1 = {
  ref: string;
  index: number;
  field: ProfileField;
  claim: string;
  /** Verbatim from the sample. An observation without one is refused. */
  quote: string;
  sampleCode: string;
  metric?: StyleScaleKey | PostHabitMetricKey | PostLayoutMetricKey;
};

/**
 * Where the five lines came from, and therefore whether they can be typed.
 *
 * `assist` is the model's proposal: the text is read, and editing it opens the
 * field the model wrote. `manual` is the path a person chose to fill in
 * themselves: the same five lines, all of them empty and all of them writable.
 *
 * It travels in the response rather than being decided by the interface,
 * because "these lines are typeable" is a fact about what the server is holding
 * — a hand-filled draft or a measured proposal — and a screen that decided it
 * from the path a person clicked would show writable fields over a proposal the
 * model wrote the moment those two disagreed.
 */
export type VoiceProposalModeV1 = 'assist' | 'manual';

/**
 * The portrait as the screen sees it: one long text, decided like a field.
 *
 * It is not one of the five `PROFILE_FIELDS` and does not travel in `fields`.
 * Those are one line each and are read back by code that branches on them;
 * this is up to 1200 characters of prose that only the prompt ever reads, and
 * widening every field's bounds to fit it would have made the five lines a
 * place where an essay can be typed.
 *
 * Absent where the analysis predates portraits, or where the model could not
 * ground one. The screen says so rather than showing an empty box that looks
 * like a portrait waiting to be written.
 */
export type VoiceProposalPortraitV1 = {
  text: string;
  status: 'ACCEPTED' | 'EDITING' | 'UNDECIDED';
  observationRefs: string[];
};

export type VoiceProposalResponseV1 =
  | VoiceInsufficientV1
  | {
      outcome: 'ready';
      state: VoiceScreenStateV1;
      mode: VoiceProposalModeV1;
      portrait?: VoiceProposalPortraitV1;
      fields: VoiceProposalFieldV1[];
      observations: VoiceObservationV1[];
      profileLabel?: string;
      /** Set once the proposal became an active version. */
      activatedAt?: string;
      notice?: string;
    };

export type VoiceProposalFieldV2 = Omit<VoiceProposalFieldV1, 'key'> & {
  key: ProfileFieldV2;
};

export type VoiceObservationV2 = Omit<VoiceObservationV1, 'field'> & {
  field: ProfileFieldV2;
};

/** Additive proposal wire contract; V1 remains available to older readers. */
export type VoiceProposalResponseV2 =
  | VoiceInsufficientV1
  | {
      outcome: 'ready';
      state: VoiceScreenStateV1;
      mode: VoiceProposalModeV1;
      portrait?: VoiceProposalPortraitV1;
      fields: VoiceProposalFieldV2[];
      observations: VoiceObservationV2[];
      profileLabel?: string;
      activatedAt?: string;
      notice?: string;
    };

/** Fields are accepted one at a time, and editing one restarts nothing. */
export type VoiceProposalFieldRequestV1 = {
  key: ProfileField;
  text?: string;
  action: 'ACCEPT' | 'EDIT' | 'SAVE';
};

export type VoiceProposalFieldRequestV2 = Omit<
  VoiceProposalFieldRequestV1,
  'key'
> & { key: ProfileFieldV2 };

/**
 * The portrait, decided on its own — same three actions, no `key`.
 *
 * There is exactly one portrait, so naming it would be a field that can only
 * hold one value and a route that has to validate it holds that value.
 */
export type VoiceProposalPortraitRequestV1 = {
  text?: string;
  action: 'ACCEPT' | 'EDIT' | 'SAVE';
};

/**
 * One hand-written line, saved on its own.
 *
 * No `action`: on this path there is nothing to accept or reject, only text
 * that is there or is not. The text is required for the same reason — an empty
 * save on the manual path is a field that was never filled, and it is reported
 * as still missing rather than stored as an empty decision.
 */
export type VoiceProposalManualFieldRequestV1 = {
  key: ProfileField;
  text: string;
};

export type VoiceProposalManualFieldRequestV2 = Omit<
  VoiceProposalManualFieldRequestV1,
  'key'
> & { key: ProfileFieldV2 };

export type VoiceProposalActivateRequestV1 = {
  /** The stated consent beside the checkbox, not implied by the last save. */
  consentGiven: boolean;
  label?: string;
  /**
   * What this avatar is called.
   *
   * Asked where the avatar is switched on, because that is the moment it
   * becomes something a person refers to. Every path used to activate without
   * asking, so a hand-filled avatar arrived in the list as «Без имени» and the
   * strip told its owner «тексты пишет Без имени»
   * (`content-factory-next-fn33.46`). Optional on the wire: an activation from
   * an older client is still an activation, and a nameless avatar is a smaller
   * loss than a refused one.
   */
  avatarName?: string;
  /**
   * Which of the two drafts is being activated. Absent means `assist`, which
   * is what every caller before the manual path meant.
   */
  mode?: VoiceProposalModeV1;
};

/** The six-field client opts into the portrait and name activation gates. */
export type VoiceProposalActivateRequestV2 = VoiceProposalActivateRequestV1 & {
  version: 2;
};

/* -------------------------------------------------------------------------
 * Screen 06 — the passport
 * ---------------------------------------------------------------------- */

export type VoicePassportV1 = {
  whoSpeaks: string;
  tone: string;
  audience: string;
  neverSay: string[];
  /**
   * The fifth line, in the person's own words.
   *
   * The wizard asks for five and says «Пять строк — это весь голос», and this
   * card described four of them: phrase length existed here only as a number
   * from the analysis, so a hand-written voice — which has no analysis — lost
   * the line entirely. It still steered generation from
   * `content.voice.sentenceStyle`; it was simply invisible to its author.
   */
  sentenceStyle?: string;
  versionLabel: string;
  activeSince: string;
  /**
   * Absent and zero say different things, and the screen must not collapse
   * them into one. Present with `0` would mean "a measurement ran and found
   * nothing" — a claim about an empty corpus. Absent means no measurement
   * explains this version at all, which is the honest state for a
   * hand-written voice or one activated without its own analysis: the
   * organisation's corpus can hold thirty samples and this field still be
   * missing, because none of them were counted for THIS version.
   */
  sampleCount?: number;
  charCount?: number;
  confidence?: 'LOW' | 'NORMAL';
  /** Two numbers from the analysis, so the words rest on something counted. */
  sentenceLength?: { value: string; low: number; high: number };
  dashShare?: string;
  /**
   * The author's own posts, shown because the model is being given them.
   *
   * Four to six, filled from the training half of the analysis. They are the
   * strongest lever the research found — demonstrations beat descriptions,
   * descriptions beat numbers — and they are also the part of a voice a person
   * has the clearest opinion about, because it is their own writing. Shown
   * here so that opinion has somewhere to go: each one can be removed, and the
   * set can be picked again from the corpus.
   */
  examples?: Array<{ text: string }>;
};

/**
 * The author's own posts: kept, removed, or picked again from the corpus.
 *
 * An empty list and `refresh` are different requests. Emptying the list says
 * "not these"; `refresh` says "choose again". Collapsing them would take away a
 * person's ability to end up with no examples at all, which is a decision they
 * are allowed to make about their own writing.
 */
export type VoiceExamplesRequestV1 = {
  texts?: string[];
  refresh?: boolean;
};

/**
 * One line of the passport, rewritten where it is read.
 *
 * The five voice fields were editable in exactly one place — a separate form
 * under a separate heading, filling a draft that had to be completed and
 * activated in full. Somebody who wanted to fix two words of «Каким тоном» had
 * to find that form, understand that it was the same voice, and re-agree to
 * the whole thing. This request is the other half of the passport's own read:
 * one field, laid over the version in force, activated as the next version.
 *
 * It is not the manual path and does not replace it. That one builds a voice
 * from nothing and demands all five lines plus consent before it counts; this
 * one edits a voice that already exists and is already consented to.
 */
export type VoicePassportFieldRequestV1 = {
  key: ProfileField;
  text: string;
};

/**
 * `voice: null` is the "no voice" variant and a working state.
 *
 * A workspace generating in an explicit neutral style is not broken, and the
 * card says so rather than leaving a hole where a voice should be.
 */
export type VoicePassportResponseV1 = {
  state: VoiceScreenStateV1;
  voice: VoicePassportV1 | null;
};

/* -------------------------------------------------------------------------
 * Screen 07 — the eight scales
 * ---------------------------------------------------------------------- */

/** A measured scale, with the author's own corridor around it. */
export type VoiceScaleValueV1 = {
  kind: 'value';
  raw: number;
  display: number;
  low: number;
  high: number;
  observations: number;
  sampleCount: number;
  exampleText: string | null;
  exampleSampleCode: string | null;
  manualCorridor?: boolean;
  excluded?: boolean;
};

/**
 * A scale that could not be computed is a gap, never a zero.
 *
 * Zero would read as "this writer never asks questions", which is a different
 * claim and a false one.
 */
export type VoiceScaleGapV1 = {
  kind: 'gap';
  reason:
    | 'TOO_FEW_OBSERVATIONS'
    | 'TOO_FEW_POSITIVE'
    | 'TOO_FEW_SAMPLES'
    /** This language has no word list for this scale. Not about this corpus. */
    | 'NO_DICTIONARY'
    | 'FAILED';
  positives: number;
};

export type VoiceScaleEntryV1 = VoiceScaleValueV1 | VoiceScaleGapV1;

export type VoiceScalesResponseV1 = {
  state: VoiceScreenStateV1;
  scales: Partial<Record<StyleScaleKey, VoiceScaleEntryV1>>;
  profileLabel?: string;
  versionLabel?: string;
  sampleCount?: number;
  /** The last generated text measured against these same corridors. */
  lastCheck?: {
    inCorridor: number;
    outside?: { key: StyleScaleKey; value: string };
  };
  /** Policy, not a prop: a member sees the corridors and cannot move them. */
  canEditCorridors: boolean;
  /**
   * Whether measuring the same texts again would change these numbers.
   *
   * The product's way of measuring likeness has moved twice already, and a
   * voice keeps whatever ruler was current the day it was analysed. Nothing is
   * broken about that — the numbers are honest for the ruler that took them —
   * but the workspace cannot tell, and nothing on any screen said so.
   *
   * The fact is the server's because only the server knows which ruler shipped
   * today. A client holding its own copy of that answer starts lying the
   * morning a new one ships, and lies until somebody reloads it.
   *
   * Absent when there is nothing to offer: no measurement, or one already
   * taken with the current ruler.
   */
  recalibration?: {
    /** How many of the eight bars a person dragged themselves. */
    movedByHand: number;
  };
};

export type VoiceScaleCorridorRequestV1 = {
  key: StyleScaleKey;
  low?: number;
  high?: number;
  /** A hand-set corridor survives recomputation; that is what marks it. */
  manual?: boolean;
  excluded?: boolean;
};

/* -------------------------------------------------------------------------
 * Screen 08 — what stayed out of a reference
 * ---------------------------------------------------------------------- */

export type VoiceRedactionRowV1 = {
  category: RedactionCategory;
  occurrences: number;
  /** Short, for the screen. Never written into a profile. */
  examples: string[];
};

export type VoiceRedactionsResponseV1 = {
  state: VoiceScreenStateV1;
  redactions: VoiceRedactionRowV1[];
  /** What the analysis did keep, so the trade is visible both ways. */
  kept: Array<{ label: string; value: string }>;
  referenceCount: number;
  finishedAt: string;
  /** Longest run of words shared with the source. The threshold is contract. */
  longestMatch: number;
  notice?: string;
};

/* -------------------------------------------------------------------------
 * Screen 09 — versions
 * ---------------------------------------------------------------------- */

export type VoiceVersionSummaryV1 = {
  id: string;
  label: string;
  lifecycle: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  active?: boolean;
  changedAt: string;
  actor: string;
};

/**
 * Which two versions the answer compared.
 *
 * `GET /versions` used to compare the two newest and take no arguments, while
 * the screen above it invited a person to tick any two rows. Ticking the third
 * silently dropped one of the first two, and ticking a pair the server had not
 * compared showed nothing at all with no reason given. The pair is now a
 * request, so what is ticked and what is compared are the same fact.
 *
 * Both ends are optional and both are version ids. Missing means "the two
 * newest that were in force", which is what every caller got before and what a
 * screen with nothing ticked still wants.
 */
export type VoiceVersionsQueryV1 = {
  from?: string;
  to?: string;
};

export type VoiceVersionComparisonV1 = {
  from: string;
  to: string;
  fields: Array<{
    /**
     * Which of the five lines this row is, by key rather than by name.
     *
     * It used to be the Russian label, built on the server — so the table read
     * «Тон» and «Длина предложения» in an English session, and called the same
     * five fields by different names than the card above it does («Тон» here,
     * «Каким тоном» there). A key travels; a name belongs to the screen that
     * shows it, and there is exactly one place that holds those names.
     */
    field: ProfileField;
    was: string;
    became: string;
    changed: boolean;
  }>;
};

export type VoiceVersionsResponseV1 = {
  state: VoiceScreenStateV1;
  versions: VoiceVersionSummaryV1[];
  comparison?: VoiceVersionComparisonV1;
  /**
   * Why the pair that was asked for has no table under it.
   *
   * A comparison that simply fails to appear teaches nothing; the screen used
   * to print «Выберите две версии» while two were already ticked. Set only
   * when a pair was named and refused — a draft, or an id this profile does
   * not hold.
   */
  comparisonNotice?: string;
  profileLabel?: string;
  canRestore: boolean;
};

/**
 * Restoring is a new version, not a rewrite of the history.
 *
 * The response says so by returning both: the version restored from and the
 * one just written.
 */
export type VoiceVersionRestoreRequestV1 = {
  versionId: string;
};

/* -------------------------------------------------------------------------
 * Screen 10 — the applied-voice strip
 * ---------------------------------------------------------------------- */

export type VoiceRibbonStateV1 =
  | 'fresh'
  | 'stale-context'
  | 'voice-moved'
  | 'no-profile';

export type VoiceRibbonDetailsV1 = {
  versionLabel?: string;
  /** The version in force now, when it differs from the one that wrote it. */
  currentVersionLabel?: string;
  contextLabel?: string;
  contextAgeDays?: number;
  factCount?: number;
  evidenceCount?: number;
  profileLabel?: string;
  /**
   * Who is writing this text, once a space can hold more than one of them.
   *
   * The strip named a version and never a person, which was correct while
   * `organizationId` was unique on the profile. With four avatars, «v3» does
   * not answer "who wrote this" — two of them are on v3 — so the name and the
   * kind travel beside the number rather than one expand away.
   */
  avatarId?: string;
  avatarName?: string;
  avatarKind?: VoiceAvatarKindV1;
};

export type VoiceRibbonResponseV1 = {
  state: VoiceRibbonStateV1;
  details: VoiceRibbonDetailsV1;
  /**
   * The choice behind «Сменить аватар», sent with the strip rather than
   * fetched when the menu opens.
   *
   * Two reasons it is not a second request. The list is four rows on the
   * screen this strip sits above, so the request would cost more than the
   * payload; and a menu that has to load is a menu a person opens twice before
   * it answers. `defaultAvatarId` is the same field screen 12 sends, so both
   * surfaces agree about who writes when nobody is picked.
   */
  avatars: readonly VoiceAvatarRowV1[];
  defaultAvatarId: string | null;
};

/**
 * Long generations get the voice named again at each boundary.
 *
 * A thread item is a boundary; one post is not, and repeating the voice inside
 * a single short post is noise rather than reinforcement.
 */
export type VoiceInjectionPlanRequestV1 = {
  boundaries: Array<'thread-item' | 'section' | 'continuation'>;
  versionId?: string;
};

export type VoiceInjectionPlanResponseV1 = {
  injections: Array<{
    boundary: 'start' | 'thread-item' | 'section' | 'continuation';
    index: number;
    text: string;
  }>;
};

/**
 * Generated text measured against this author's own corridors.
 *
 * The remark fires outside the writer's corridor and never for departing from
 * a general norm — otherwise the check becomes a style guide nobody asked for.
 */
export type VoiceTextCheckRequestV1 = {
  text: string;
  versionId?: string;
};

export type VoiceTextCheckResponseV1 = {
  inCorridor: number;
  total: number;
  outside: Array<{
    key: StyleScaleKey;
    value: number;
    low: number;
    high: number;
    placement: 'above' | 'below';
  }>;
  /** The line the screen prints. Words, not a colour. */
  summary: string;
  /**
   * Whether it reads like this author — the one answer above the eight scales.
   *
   * A warning. The client may colour it and must not gate on it: no screen
   * refuses a save, an activation or a publication because this says `FAR`.
   */
  similarity: VoiceSimilarityV1;
  /**
   * The sentences the divergence is in, with offsets into `plainText`.
   *
   * A scale outside the corridor is a fact about the whole text and a person
   * can do nothing with it. These are the places the divergence is in.
   *
   * Правка предложения моделью убрана 07.09.2026
   * (`content-factory-next-k879.1`): в продукте её никто не звал, а платить за
   * ответ, которого никто не просит, не за что. Место названо — что с ним
   * делать, решает человек.
   */
  spots: VoiceTextSpotV1[];
  /** The text as measured: markup removed, so the offsets mean something. */
  plainText: string;
  /**
   * Чего стоит вердикт: две доли ошибок рабочей точки со знаменателями.
   *
   * Числа, а не проценты, и обе, а не одна: верхняя граница держит долю чужих
   * текстов, названных авторскими, нижняя — долю настоящих постов автора,
   * названных чужими, и подвинуть одну нельзя, не подвинув другую. `null`,
   * когда границ для этого голоса нет — тогда и вердикта нет.
   *
   * Через границу арендатора едут только эти счётчики. Чужие тексты читает
   * серверная задача калибровки, наружу уходит «из 30 приняли 1».
   */
  calibrationErrors: VoiceCalibrationErrorsV1 | null;
  /**
   * Что делать, когда мерка промолчала: своя строка на каждое молчание.
   *
   * `null`, когда вердикт есть. Четыре причины молчать требуют от человека
   * разного — дописать, попробовать другой текст, подождать, пересобрать
   * голос, — и одна общая фраза на все четыре заставляет его гадать.
   */
  silenceHint: string | null;
};

/** Одна доля ошибок: сколько проверено и на скольких ответ был неверен. */
export type VoiceCalibrationErrorLineV1 = {
  of: number;
  wrong: number;
  /** Та же пара чисел словами. Экран печатает её, а не считает свою. */
  text: string;
};

export type VoiceCalibrationErrorsV1 = {
  falseAccept: VoiceCalibrationErrorLineV1 | null;
  falseReject: VoiceCalibrationErrorLineV1 | null;
};

export type VoiceTextSpotV1 = {
  scale: StyleScaleKey;
  sentence: string;
  start: number;
  end: number;
  /** One phrase saying what is wrong with this sentence. */
  note: string;
  /** The concrete words the note is about, where there are any. */
  terms: string[];
};

/**
 * `UNKNOWN` is not a quiet `CLOSE`. A text too short to measure, or a voice
 * whose analysis predates the print, both answer "cannot tell", and a screen
 * that draws that as approval is telling the person something nobody checked.
 */
export type VoiceSimilarityV1 = {
  verdict: 'CLOSE' | 'FAR' | 'UNKNOWN';
  /**
   * Почему ответа нет.
   *
   * `CANNOT_TELL` и `UNCALIBRATED` добавлены 27.08.2026 вместе с рабочей
   * точкой, снятой на самом авторе. Разница между ними — то, чего человеку не
   * хватает, и предлагать надо разное: в первом случае мерка есть и текст лёг
   * в её слепую полосу, во втором мерки для этого голоса ещё нет.
   */
  reason?: 'TOO_SHORT' | 'NO_PROFILE' | 'CANNOT_TELL' | 'UNCALIBRATED';
  distance: number | null;
  threshold: number | null;
  selfMedian: number | null;
  divergingTerms: Array<{
    term: string;
    rate: number;
    expected: number;
    z: number;
  }>;
  functionWordDistance: number | null;
  functionWordThreshold: number | null;
  /** Доля сравнений, в которых отпечаток автора выиграл у подставных. */
  votes?: number | null;
  /**
   * Какое правило вынесло вердикт.
   *
   * `RELATIVE` — голосование против константы `2/3`, снято 27.08.2026;
   * значение остаётся в перечислении, потому что его несут сохранённые
   * показания, и экран, читающий старую строку, не должен провалиться в
   * случай, которого нет.
   */
  decidedBy?: 'CALIBRATED' | 'RELATIVE' | 'THRESHOLD' | 'NONE';
};

/* -------------------------------------------------------------------------
 * Screen 12 — the avatars of a space
 * ---------------------------------------------------------------------- */

/**
 * How many avatars one space may hold.
 *
 * A ceiling rather than none, and named here so the screen's «восемь из
 * восьми» and the repository's refusal are one number. Eight is what the
 * design draws and what a two-column grid stays readable at; the cost of a
 * ninth is not storage but a list nobody scans.
 */
export const MAX_AVATARS_PER_SPACE = 8;

/**
 * A person or a brand — the whole difference between two avatars.
 *
 * Repeated from `BrandPersonaV1` rather than imported: this contract is read
 * by the frontend, and one `import type` from the brand-profile package is how
 * a screen ends up pulling Nest into its bundle graph. The two are checked
 * against each other by `tests/brand-voice.avatars.test.cjs`.
 */
export type VoiceAvatarKindV1 = 'PERSON' | 'BRAND';

export type VoiceAvatarRowV1 = {
  id: string;
  /**
   * `null` when nobody has named it yet — «Без имени» on the screen.
   *
   * Not defaulted to the version label here: an avatar created a minute ago
   * has no version to borrow a name from, and a name invented by the server is
   * a name the person cannot tell from one they chose.
   */
  name: string | null;
  kind: VoiceAvatarKindV1;
  isDefault: boolean;
  /**
   * Whether this avatar can write at all.
   *
   * `false` is a working state, not an error: an avatar exists from the moment
   * it is created and starts writing only once a corpus has been analysed and
   * a version activated. The screen says so in those words, and the two rules
   * that hang off it — cannot become the default, cannot inherit the default
   * from a deleted avatar — are refused by the repository rather than only
   * hidden by the interface.
   */
  analysed: boolean;
  /** `v3`, from the version in force for this avatar. */
  versionLabel?: string;
  /** How many texts its own analysis read. Absent until there is one. */
  sampleCount?: number;
  /** The date it was created, formatted for the reader. */
  createdAt: string;
  /** When its current version was activated. */
  activeSince?: string;
  /** Whether the version in force carries a portrait — see `BrandPersonaV1`. */
  hasPortrait?: boolean;
};

export type VoiceAvatarsResponseV1 = {
  state: VoiceScreenStateV1;
  avatars: readonly VoiceAvatarRowV1[];
  /**
   * Who writes when a draft names nobody.
   *
   * `null` where the space has no avatar that can write — either it has none
   * at all, or every one of them is still unanalysed. Both mean the same thing
   * for generation, and the strip says it in one sentence.
   */
  defaultAvatarId: string | null;
  /** `MAX_AVATARS_PER_SPACE`, sent rather than retyped by the screen. */
  limit: number;
  /** Managing avatars is an administrator's right; reading them is not. */
  canManage: boolean;
  notice?: string;
};

export type VoiceAvatarCreateRequestV1 = {
  name?: string;
  kind?: VoiceAvatarKindV1;
};

/** Renaming and changing the kind are one edit: both live in the «Ещё» menu. */
export type VoiceAvatarUpdateRequestV1 = {
  avatarId: string;
  name?: string;
  kind?: VoiceAvatarKindV1;
};

export type VoiceAvatarDefaultRequestV1 = {
  avatarId: string;
};

/**
 * Deleting an avatar, and naming who takes over from it.
 *
 * `successorId` is required exactly when the avatar being deleted is the
 * default and the space holds another avatar that can write. Deleting the last
 * one is allowed and leaves the space writing in a neutral style — the screen
 * says that consequence in the confirmation rather than refusing.
 */
export type VoiceAvatarDeleteRequestV1 = {
  avatarId: string;
  successorId?: string;
};

/* -------------------------------------------------------------------------
 * Screen 11 — material and its recut
 * ---------------------------------------------------------------------- */

export type MaterialRowV1 = {
  id: string;
  code: string;
  title: string;
  format: string;
  postCount: number;
  queuedCount?: number;
  /**
   * Versions of this piece that exist as drafts and have not been sent
   * anywhere yet — what a recut makes (`content-factory-next-fn33.84`).
   *
   * Its own number rather than a share of `postCount`: a text that went out
   * and a text still sitting in the editor are different facts about a piece,
   * and folding them together is how «постов: 0» ended up printed over a
   * material that had just produced five drafts.
   */
  draftCount?: number;
  date: string;
  voiceVersion?: string;
};

export type MaterialDerivedPostV1 = {
  platform: RecutPlatform;
  state: 'DRAFT' | 'QUEUED' | 'PUBLISHED';
  date: string;
};

/** The arithmetic of "what will be different", with losses named as losses. */
export type MaterialRecutChangeV1 = {
  aspect: 'length' | 'lists' | 'images' | 'links';
  from: string;
  to: string;
  lossy: boolean;
};

export type MaterialRecutPreviewV1 = {
  code: string;
  platform: RecutPlatform;
  voiceVersion?: string;
  changes: MaterialRecutChangeV1[];
  /** True when the piece already fits: inventing a difference would be worse. */
  unchanged: boolean;
};

export type MaterialsResponseV1 = {
  state: VoiceScreenStateV1;
  materials: MaterialRowV1[];
  /** Filled when a row is open: which posts came out of that piece. */
  derived: MaterialDerivedPostV1[];
  recut?: MaterialRecutPreviewV1;
  notice?: string;
};

export type MaterialRecutRequestV1 = {
  platform: RecutPlatform;
};

/**
 * Turning a piece into a draft.
 *
 * The response hands back a post id and nothing else about delivery: this
 * route prepares text, and the draft it made is published by the same path as
 * any other post.
 */
export type MaterialDraftRequestV1 = {
  platform: RecutPlatform;
  integrationId?: string;
};

export type MaterialDraftResponseV1 = {
  postId: string;
  derivationId: string;
  contentPieceId: string;
  platform: RecutPlatform;
};

/* -------------------------------------------------------------------------
 * The brief gate and the topic radar
 * ---------------------------------------------------------------------- */

export type BriefFactV1 = {
  statement: string;
  /** A source a reader could check. */
  sourceUrl?: string | null;
  /** Or an id from the workspace's own memory, checked when it entered. */
  factId?: string | null;
};

export type BriefRequestV1 = {
  goal?: string;
  thesis?: string;
  channel?: string;
  format?: string;
  facts?: BriefFactV1[];
  position?: string;
  disagreement?: string;
  audience?: string;
};

export type RadarTopicV1 = {
  id: string;
  title: string;
  score: number;
  evidenceCount: number;
  /** Why it ranks where it does, in the reader's language. A rank is not one number. */
  reasons: string[];
};

/**
 * An incomplete brief returns questions rather than a draft.
 *
 * "Нечего написать" arrives as words too: an empty topic list with no
 * explanation reads as a broken radar.
 */
export type BriefResponseV1 = {
  state: VoiceScreenStateV1;
  ready: boolean;
  missing: BriefField[];
  questions: Array<{ field: BriefField; question: string }>;
  /** Offered facts carrying nothing a reader could check. */
  ungroundedFacts: string[];
  brief?: Record<string, string>;
  topics: RadarTopicV1[];
  notice?: string;
};

export type BriefDraftResponseV1 =
  | { outcome: 'insufficient'; questions: BriefResponseV1['questions'] }
  | {
      outcome: 'ready';
      postId: string;
      /**
       * The piece the draft was cut from, when one was written.
       *
       * Absent when the caller is anonymous to this path — `ContentPiece`
       * needs an author — so a client reads it as "no library row", not as an
       * error.
       */
      pieceId?: string;
    };

/* -------------------------------------------------------------------------
 * The registry
 * ---------------------------------------------------------------------- */

/**
 * Which route fills which prop of which screen.
 *
 * Written down because the two sides of this epic are built in parallel and by
 * different hands. `dataFields` are the props a route fills; `clientOnlyProps`
 * are the ones the interface owns — a selection, an expanded row, a checkbox
 * that has not been submitted yet. Every prop a component declares is one or
 * the other, and the test proves it in both directions.
 */
/* -------------------------------------------------------------------------
 * Чему аватар научился на правках
 * ---------------------------------------------------------------------- */

/** Одно выученное правило, как его читает человек. */
export type VoiceLearnedRuleV1 = {
  id: string;
  text: string;
  /** ISO. Экран показывает дату, а не «недавно». */
  learnedAt: string;
  /** На скольких парах выведено. Число рядом с утверждением. */
  pairs: number;
};

/**
 * Сколько накоплено, чему научились и можно ли учиться сейчас.
 *
 * `pending` — существенные пары, накопившиеся ПОСЛЕ последнего прогона:
 * косметическая правка сюда не попадает, и уже оплаченная пара — тоже.
 * `canLearn` — право этого человека, а не готовность материала: экран рисует
 * выключенную кнопку по `pending < minPairs`, а отказ по праву выглядит
 * иначе.
 */
export type VoiceLearningResponseV1 = {
  pending: number;
  rules: readonly VoiceLearnedRuleV1[];
  /** Порог пачки и потолок набора — с сервера, чтобы экран их не перепечатывал. */
  minPairs: number;
  maxRules: number;
  canLearn: boolean;
  lastRunAt: string | null;
};

/** Какое правило отменяют. */
export type VoiceLearnForgetRequestV1 = {
  ruleId: string;
};

/** One screen, the routes that feed it, and the props each side owns. */
export type VoiceSurfaceDefinitionV1 = {
  /** The design's number, or `null` for a surface the design never numbered. */
  screen: string | null;
  source: string | null;
  component: string | null;
  pendingReason?: string;
  dataFields: readonly string[];
  clientOnlyProps: readonly string[];
  routes: ReadonlyArray<{
    method: 'GET' | 'POST' | 'DELETE';
    path: string;
    request?: string;
    response: string;
  }>;
};

export const VOICE_SURFACES = {
  empty: {
    screen: '01',
    source: 'voice-empty.screen.tsx',
    component: 'VoiceEmptyScreen',
    // `collected` is what `VoiceOverviewResponseV1.readiness` already carries:
    // the corpus a person left behind, said out loud instead of read as an
    // empty workspace (`content-factory-next-fn33.45`).
    dataFields: ['state', 'note', 'collected'],
    clientOnlyProps: [] as string[],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/overview`,
        response: 'VoiceOverviewResponseV1',
      },
    ],
  },
  paths: {
    screen: '02',
    source: 'voice-paths.screen.tsx',
    component: 'VoicePathsScreen',
    dataFields: ['state', 'available', 'disabledReasons'],
    clientOnlyProps: ['selected'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/paths`,
        response: 'VoicePathsResponseV1',
      },
    ],
  },
  samples: {
    screen: '03',
    source: 'voice-samples.screen.tsx',
    component: 'VoiceSamplesScreen',
    dataFields: ['state', 'samples', 'sources', 'notice'],
    // What the browser is holding before it sends: the files that were picked,
    // and whether the request is out. The server knows neither.
    clientOnlyProps: ['selectedCodes', 'upload', 'allowanceHint', 'maxMessages'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/samples`,
        response: 'VoiceSamplesResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/samples`,
        request: 'VoiceSampleIntakeRequestV1',
        response: 'VoiceSampleIntakeResponseV1',
      },
      // Files go to a route of their own rather than through the JSON one:
      // a body limit of 100 KB, base64's inflation and the global validation
      // pipe are three reasons the same path could not carry both, and a
      // second method on one path would collide in this registry anyway.
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/samples/files`,
        request: 'VoiceSampleFileIntakeRequestV2',
        response: 'VoiceSampleFileIntakeResponseV2',
      },
      {
        method: 'DELETE',
        path: `${VOICE_API_BASE}/samples`,
        request: 'VoiceSampleDeleteRequestV1',
        response: 'VoiceSamplesResponseV1',
      },
    ],
  },
  analysis: {
    screen: '04',
    source: 'voice-analysis.screen.tsx',
    component: 'VoiceAnalysisScreen',
    /**
     * `VoiceAnalysisResponseV1` is a union of three outcomes, and the screen's
     * props are the flattened reading of all three rather than the union
     * itself: the rest come from `ready`, and `insufficient` never reaches
     * this screen — the wizard routes a shortfall back to the corpus step
     * instead, the same way `36r` already treats "not enough yet" as a result
     * rather than a failure state here.
     *
     * `progress`, `stage` and `assisted` are read from the stream below rather
     * than from a response body: the run is `VoiceAnalysisEventV1` lines now,
     * and the three of them are what those lines say about what is happening.
     */
    dataFields: [
      'state',
      'progress',
      'stage',
      'assisted',
      'sampleCount',
      'charCount',
      'holdoutCount',
      'wordCount',
      'sentenceCount',
      'lexicon',
      'punctuation',
      'rejected',
      'notice',
    ],
    clientOnlyProps: ['selectionSummary'],
    routes: [
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/analysis`,
        request: 'VoiceAnalysisRequestV1',
        response: 'VoiceAnalysisResponseV1',
      },
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/analysis`,
        response: 'VoiceAnalysisResponseV1',
      },
      /**
       * Тот же разбор строками NDJSON — дверь, на которую ходит мастер.
       *
       * Соседняя `POST /analysis` осталась: она отвечает одним объектом, и её
       * читает всё, что не показывает ход.
       */
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/analysis/stream`,
        request: 'VoiceAnalysisRequestV1',
        response: 'VoiceAnalysisEventV1',
      },
      /**
       * The same texts, measured again with the ruler this build ships.
       *
       * The route existed and the registry did not name it, so the one place
       * that is supposed to hold every path did not hold this one. It answers
       * with the analysis because that is what it produced; the screen that
       * offers it is the scales, which is where the numbers move.
       */
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/analysis/refresh`,
        response: 'VoiceAnalysisResponseV1',
      },
    ],
  },
  proposal: {
    screen: '05',
    source: 'voice-proposal.screen.tsx',
    component: 'VoiceProposalScreen',
    dataFields: [
      'state',
      // Whose five lines these are, and therefore whether they are writable.
      // A server fact, not a client one — see `VoiceProposalModeV1`.
      'mode',
      'portrait',
      'fields',
      'observations',
      'profileLabel',
      'activatedAt',
      'notice',
    ],
    // `avatarName` is typed here and travels with the activation. It is not a
    // field any read route answers with (`content-factory-next-fn33.46`).
    clientOnlyProps: ['consentGiven', 'avatarName'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/proposal`,
        response: 'VoiceProposalResponseV2',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/proposal/portrait`,
        request: 'VoiceProposalPortraitRequestV1',
        response: 'VoiceProposalResponseV2',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/proposal/field`,
        request: 'VoiceProposalFieldRequestV2',
        response: 'VoiceProposalResponseV2',
      },
      // The hand-filled path reads and writes its own draft, and activates
      // through the same route as the model's proposal: consent is checked in
      // one place, so the two paths cannot come to disagree about it.
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/proposal/manual`,
        response: 'VoiceProposalResponseV2',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/proposal/manual/field`,
        request: 'VoiceProposalManualFieldRequestV2',
        response: 'VoiceProposalResponseV2',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/proposal/activate`,
        request: 'VoiceProposalActivateRequestV2',
        response: 'VoicePassportResponseV1',
      },
    ],
  },
  passport: {
    screen: '06',
    source: 'voice-passport.screen.tsx',
    component: 'VoicePassportScreen',
    dataFields: ['state', 'voice'],
    // `saved` — «правка легла», а не факт о голосе: она гаснет сама и её
    // некому хранить между двумя чтениями карточки.
    clientOnlyProps: ['density', 'saved'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/passport`,
        response: 'VoicePassportResponseV1',
      },
      // The author's own posts: removed one at a time, or picked again from
      // the corpus. Answers with the passport, because the card is what
      // changed.
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/passport/examples`,
        request: 'VoiceExamplesRequestV1',
        response: 'VoicePassportResponseV1',
      },
      // One of the five lines, edited where it is read. Answers with the
      // passport for the same reason the examples route does: the card is what
      // changed, and a screen that has to refetch to see its own edit will
      // show the old sentence for a beat.
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/passport/field`,
        request: 'VoicePassportFieldRequestV1',
        response: 'VoicePassportResponseV1',
      },
      // Taking the voice out of use answers with the "no voice" passport,
      // because that is exactly the state the workspace lands in.
      {
        method: 'DELETE',
        path: `${VOICE_API_BASE}/profile`,
        response: 'VoicePassportResponseV1',
      },
    ],
  },
  scales: {
    screen: '07',
    source: 'voice-scales.screen.tsx',
    component: 'VoiceScalesScreen',
    dataFields: [
      'state',
      'scales',
      'profileLabel',
      'versionLabel',
      'sampleCount',
      'lastCheck',
      'canEditCorridors',
      // Стоит ли предлагать пересчёт и сколько полос человек подвинул сам.
      // Факт сервера: только он знает, какая мерка отгружена сегодня.
      'recalibration',
    ],
    // Три клиентских: раскрытая шкала и две — про сообщение, которое гаснет
    // само. Ни одно из них не факт о шкале, который кто-то должен помнить
    // между двумя чтениями.
    clientOnlyProps: [
      'expandedScale',
      'saved',
      'recalibrating',
      'recalibrated',
    ],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/scales`,
        response: 'VoiceScalesResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/scales/corridor`,
        request: 'VoiceScaleCorridorRequestV1',
        response: 'VoiceScalesResponseV1',
      },
    ],
  },
  redactions: {
    screen: '08',
    source: 'voice-redactions.screen.tsx',
    component: 'VoiceRedactionsScreen',
    dataFields: [
      'state',
      'redactions',
      'kept',
      'referenceCount',
      'finishedAt',
      'longestMatch',
      'notice',
    ],
    clientOnlyProps: ['expandedCategory', 'consentGiven'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/redactions`,
        response: 'VoiceRedactionsResponseV1',
      },
    ],
  },
  versions: {
    screen: '09',
    source: 'voice-versions.screen.tsx',
    component: 'VoiceVersionsScreen',
    dataFields: [
      'state',
      'versions',
      'comparison',
      // Почему у названной пары нет таблицы. Ответ сервера, а не догадка
      // экрана: только он знает, черновик это или неизвестный идентификатор.
      'comparisonNotice',
      'profileLabel',
      'canRestore',
    ],
    clientOnlyProps: ['selected'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/versions`,
        response: 'VoiceVersionsResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/versions/restore`,
        request: 'VoiceVersionRestoreRequestV1',
        response: 'VoiceVersionsResponseV1',
      },
    ],
  },
  ribbon: {
    screen: '10',
    source: 'voice-ribbon.tsx',
    component: 'VoiceRibbon',
    dataFields: ['state', 'details', 'avatars', 'defaultAvatarId'],
    // Which avatar the person has picked for *this* draft, and whether the
    // menu behind «Сменить аватар» is open. Neither is a server fact: the
    // choice is not saved until the draft is, and the default keeps standing
    // until then.
    clientOnlyProps: ['expanded', 'pickerOpen', 'pickedAvatarId'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/ribbon`,
        response: 'VoiceRibbonResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/injection-plan`,
        request: 'VoiceInjectionPlanRequestV1',
        response: 'VoiceInjectionPlanResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/text-check`,
        request: 'VoiceTextCheckRequestV1',
        response: 'VoiceTextCheckResponseV1',
      },
    ],
  },
  materials: {
    screen: '11',
    source: 'voice-materials.screen.tsx',
    component: 'VoiceMaterialsScreen',
    dataFields: ['state', 'materials', 'derived', 'recut', 'notice'],
    // `availablePlatforms` is the client's own: it comes from the channel
    // list this workspace already loads for the editor, not from a materials
    // route (`content-factory-next-fn33.86`).
    clientOnlyProps: ['expandedCode', 'availablePlatforms'],
    routes: [
      {
        method: 'GET',
        path: MATERIALS_API_BASE,
        response: 'MaterialsResponseV1',
      },
      /**
       * «Свои тексты по теме» (`content-factory-next-m2eg.19`).
       *
       * Отвечает не `MaterialsResponseV1`, а тем же списком, который при
       * адаптации получает модель: это другой вопрос — «что у меня уже вышло
       * об этом». Один список для экрана и для модели, иначе ссылка в готовом
       * тексте перестала бы быть проверяемой глазами.
       */
      {
        method: 'GET',
        path: `${MATERIALS_API_BASE}/related`,
        response: 'RelatedTextsResponseV1',
      },
      {
        method: 'GET',
        path: `${MATERIALS_API_BASE}/:id/derivations`,
        response: 'MaterialsResponseV1',
      },
      {
        method: 'POST',
        path: `${MATERIALS_API_BASE}/:id/recut-preview`,
        request: 'MaterialRecutRequestV1',
        response: 'MaterialsResponseV1',
      },
      {
        method: 'POST',
        path: `${MATERIALS_API_BASE}/:id/draft`,
        request: 'MaterialDraftRequestV1',
        response: 'MaterialDraftResponseV1',
      },
    ],
  },
  /**
   * Screen 12 — every avatar of the space, and which one writes.
   *
   * One card shape for a person and for a brand, because they are one
   * mechanism with two values of `kind`: two card designs would need the same
   * defect fixed twice, and the reader would have to learn which column a
   * brand lives in before finding the name they came for.
   *
   * Four routes and no `:id` in any of them. The subject travels in the body,
   * so the registry stays flat — one method and one path per entry, which is
   * what `tests/brand-voice.wiring-contract.test.cjs` checks for collisions —
   * and so that «удалить» carries its successor in the same request that
   * removes the avatar, rather than in a second one that can fail on its own.
   */
  avatars: {
    screen: '12',
    source: 'voice-avatars.screen.tsx',
    component: 'VoiceAvatarsScreen',
    dataFields: [
      'state',
      'avatars',
      'defaultAvatarId',
      'limit',
      'canManage',
      'notice',
    ],
    // What the browser is holding before it sends: which card's «Ещё» menu is
    // open, which name is being typed, and which confirmation is on screen.
    clientOnlyProps: ['openMenuId', 'renamingId', 'draftName', 'confirmDelete'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/avatars`,
        response: 'VoiceAvatarsResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/avatars`,
        request: 'VoiceAvatarCreateRequestV1',
        response: 'VoiceAvatarsResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/avatars/update`,
        request: 'VoiceAvatarUpdateRequestV1',
        response: 'VoiceAvatarsResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/avatars/default`,
        request: 'VoiceAvatarDefaultRequestV1',
        response: 'VoiceAvatarsResponseV1',
      },
      {
        method: 'DELETE',
        path: `${VOICE_API_BASE}/avatars`,
        request: 'VoiceAvatarDeleteRequestV1',
        response: 'VoiceAvatarsResponseV1',
      },
    ],
  },
  /**
   * Чему аватар научился на правках человека.
   *
   * Без номера: дизайн этот блок не рисовал — он появился из решения владельца
   * 05.09.2026 и живёт на странице аватара, между паспортом и историей версий,
   * а не отдельным экраном. Отдельный экран настроек здесь был бы третьей
   * дверью к одному объекту.
   *
   * Читает всякий, кто видит аватара; учат и отменяют — администратор, теми же
   * правами, что правят голос.
   */
  learning: {
    screen: null as string | null,
    source: 'voice-learning.screen.tsx',
    component: 'VoiceLearningScreen',
    dataFields: [
      'state',
      'pending',
      'rules',
      'minPairs',
      'maxRules',
      'canLearn',
      'lastRunAt',
    ],
    // Что держит браузер: идёт ли прогон прямо сейчас, подсказка про остаток
    // допуска и отказ последнего нажатия. Ни одного из трёх сервер не знает.
    clientOnlyProps: ['learning', 'allowanceHint', 'failure'],
    routes: [
      {
        method: 'GET',
        path: `${VOICE_API_BASE}/learning`,
        response: 'VoiceLearningResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/learning/run`,
        response: 'VoiceLearningResponseV1',
      },
      {
        method: 'POST',
        path: `${VOICE_API_BASE}/learning/forget`,
        request: 'VoiceLearnForgetRequestV1',
        response: 'VoiceLearningResponseV1',
      },
    ],
  },
  brief: {
    screen: null as string | null,
    source: 'voice-brief.screen.tsx',
    component: 'VoiceBriefScreen',
    dataFields: [
      'state',
      'topics',
      'brief',
      'questions',
      'ungroundedFacts',
      'notice',
    ],
    /*
      `draftNotice` is the answer to a press, not a field of any response:
      `content-factory-next-fn33.69` prints the refusal that came back from
      «Сделать черновик» — including the one that says the workspace has no
      channel yet — next to the button that caused it.
    */
    clientOnlyProps: ['selectedTopicId', 'draftNotice'],
    routes: [
      {
        method: 'GET',
        path: `${BRIEF_API_BASE}/radar`,
        response: 'BriefResponseV1',
      },
      {
        method: 'POST',
        path: `${BRIEF_API_BASE}/evaluate`,
        request: 'BriefRequestV1',
        response: 'BriefResponseV1',
      },
      {
        method: 'POST',
        path: `${BRIEF_API_BASE}/draft`,
        request: 'BriefRequestV1',
        response: 'BriefDraftResponseV1',
      },
    ],
  },
} satisfies Record<string, VoiceSurfaceDefinitionV1>;

export type VoiceSurfaceKey = keyof typeof VOICE_SURFACES;

/* -------------------------------------------------------------------------
 * Вход одной мыслью (intake)
 *
 * `content-factory-next-tu3k`, решение владельца 06.09.2026: человек даёт
 * мысль, ссылку или чужой пост и выбирает каналы; модель заполняет бриф сама,
 * спрашивает не больше двух вещей и только когда неясен тезис или нет ни
 * одного факта, а черновик появляется сразу и сохраняется как DRAFT в каждом
 * выбранном канале. Это не чат: ход ограничен, бриф типизирован, происхождение
 * каждого поля видно.
 *
 * Типы здесь — общая правда четырёх потоков волны (сервер входа, канал и граф,
 * качество текста, экраны). Меняются только аддитивно; экран не регистрируется
 * в `VOICE_SURFACES`, потому что живёт не в `brand-voice`, а в
 * `content-intelligence/intake` (страж реестра проверяет папку экрана).
 * ---------------------------------------------------------------------- */

export const INTAKE_API_BASE = '/content-intelligence/intake' as const;
export const TEXT_QUALITY_API_BASE = '/content-intelligence/text-quality' as const;
export const INTAKE_MAX_CHANNELS = 3 as const;
export const INTAKE_MAX_VERIFIED_CLAIMS = 3 as const;
/**
 * Сколько вопросов задавал вход, пока вопрос был терминальным.
 *
 * С волны `content-factory-next-m2eg` счёт ведёт `PIECE_MAX_QUESTIONS`: вопросы
 * ворот и вопросы интервью сведены в один список по полям брифа, и предел у
 * него один. Константа оставлена ради читателей старого контракта и новым
 * кодом не читается.
 */
export const INTAKE_MAX_QUESTIONS = 2 as const;
/** Сколько кругов уточнений допускает экран, прежде чем предложить ручной бриф. */
export const INTAKE_MAX_ROUNDS = 2 as const;
export const INTAKE_INPUT_MAX_CHARS = 20_000 as const;
export const INTAKE_INPUT_MIN_CHARS = 10 as const;

export type IntakeInputKindV1 = 'thought' | 'link' | 'foreign_post';

/**
 * Откуда взялось значение поля брифа. `person` — из ответа или правки
 * человека, оно неприкосновенно; `model` — предположение модели, которое
 * квитанция помечает словом «предположение».
 */
export type BriefFieldOriginV1 =
  | 'input'
  | 'person'
  | 'avatar'
  | 'memory'
  | 'search'
  | 'model';

export type BriefFilledFactV1 = {
  statement: string;
  sourceUrl?: string | null;
  factId?: string | null;
  evidenceId?: string | null;
  origin: BriefFieldOriginV1;
  /** `true`, когда число или утверждение сверено поиском или взято из памяти. */
  verified: boolean;
  /** Research presentation metadata; absent on pre-research records. */
  kind?: 'own' | 'external' | 'found';
  status?: 'confirmed' | 'conflicting' | 'not_found' | 'unverified';
  selected?: boolean;
};

export type BriefFilledV1 = {
  inputKind: IntakeInputKindV1;
  goal?: string | null;
  thesis?: string | null;
  position?: string | null;
  disagreement?: string | null;
  audience?: string | null;
  format?: IntakeFormatV1 | null;
  facts: BriefFilledFactV1[];
  origins: Partial<
    Record<
      'goal' | 'thesis' | 'position' | 'disagreement' | 'audience' | 'format',
      BriefFieldOriginV1
    >
  >;
  /** Утверждения из чужого текста, которые нечем подтвердить: в материал не идут. */
  ungrounded: string[];
};

export type IntakeFormatV1 =
  | 'auto'
  | 'opinion'
  | 'announcement'
  | 'list'
  | 'expert'
  | 'case'
  | 'story';

export type IntakeClaimStatusV1 = 'verified' | 'unverified' | 'skipped';

export type IntakeClaimV1 = {
  text: string;
  hasNumber: boolean;
  status: IntakeClaimStatusV1;
  evidenceId?: string | null;
  sourceUrl?: string | null;
};

export type IntakeQuestionV1 = {
  field: BriefField;
  question: string;
  /** Готовые варианты ответа; человек может выбрать свой или отдать решение модели. */
  options?: string[];
  /**
   * Вариант модели, словами «я думаю, вот так». `null` — она честно не нашла
   * ответа и просит слова человека; поля нет вовсе у вопроса, заданного до
   * волны `m2eg`, когда предлагать было нечего.
   */
  suggested?: string | null;
  /** Подсказка, почему это спрашивается. */
  why?: string;
};

/**
 * `slopCheck` здесь больше нет (`content-factory-next-k879.1`, 07.09.2026):
 * проверка на ИИ-штампы считается на каждом черновике и на каждой адаптации
 * сама. Флаг, о котором надо просить и о котором не просил ни один клиент, —
 * это проверка, которой нет. Клиент, всё ещё присылающий поле, отказа не
 * получает: проверяющий снимает незнакомое поле молча.
 */
export type IntakeOptionsV1 = {
  /** По умолчанию `true`: числа из чужого поста и мысль без фактов проверяются поиском. */
  searchEnrichment?: boolean;
  /** Paid research is an explicit, opt-in action. */
  researchEnabled?: boolean;
  researchLevel?: 'quick' | 'standard' | 'deep';
  isPicture?: boolean;
};

export type IntakeRequestV1 = {
  input: string;
  /** Клиент распознаёт только ссылку; остальное решает сервер. */
  inputKind?: IntakeInputKindV1;
  integrationIds: string[];
  language: 'ru' | 'en';
  /** Ответы на вопросы прошлого хода: поле становится `person` и больше не спрашивается. */
  answers?: Array<{ field: BriefField; text: string }>;
  /** Поля, которые человек отдал модели («Реши сама»): заполняются с origin `model`, вопрос не повторяется. */
  decide?: BriefField[];
  /** Правки квитанции перед пересборкой: тоже `person`. */
  briefOverrides?: Partial<
    Pick<BriefFilledV1, 'goal' | 'thesis' | 'position' | 'disagreement' | 'audience' | 'format'>
  >;
  options?: IntakeOptionsV1;
  /** Exact statements the author chose from a pending paid research run. */
  researchSelections?: string[];
  brandProfileSelection?: BrandProfileSelectionV1;
  /** Повод из «Откуда идеи», из которого пришёл текст; сервер вправе не знать его. */
  sourceLeadId?: string;
};

/* ---- Карточка канала «Как пишем сюда» ------------------------------------ */

export const CHANNEL_WRITING_PROFILE_VERSION = 'channel-writing-profile/v1' as const;

export type ChannelLengthPolicyV1 =
  | 'provider_max'
  | { idealMin: number; idealMax: number; hardMax?: number | null };

export type ChannelWritingProfileV1 = {
  version: typeof CHANNEL_WRITING_PROFILE_VERSION;
  lengthPolicy: ChannelLengthPolicyV1;
  /** `few` — 1–3 эмодзи не больше двух видов, никогда как маркеры списка. */
  emojiLevel: 'none' | 'few' | 'free';
  linkPolicy: 'none' | 'end' | 'inline';
  hashtagPolicy: 'none' | 'end_1_3' | 'free';
  ctaKind: 'none' | 'question' | 'comment' | 'link' | 'subscribe' | 'reply';
  formatPreference: IntakeFormatV1;
  /** Слова человека, ≤500 знаков; в промпт идут очищенными, как выученные правила аватара. */
  notes?: string | null;
  /** Зарезервировано под нетекстовые выходы (видео-промпт); сейчас всегда `text`. */
  output?: 'text';
};

export type ChannelWritingProfileResponseV1 = {
  integrationId: string;
  providerIdentifier: string;
  provider: {
    name: string;
    maxLength: number;
    maxCaptionLength?: number | null;
    editor: 'none' | 'normal' | 'markdown' | 'html';
  };
  profile: ChannelWritingProfileV1;
  /** `false` — карточка не сохранялась, действуют умолчания провайдера. */
  stored: boolean;
};

/* ---- Качество текста: штампы и антикопия ---------------------------------- */

export type SlopSeverityV1 = 'error' | 'warn';

export type SlopFindingV1 = {
  ruleId: string;
  severity: SlopSeverityV1;
  start: number;
  end: number;
  excerpt: string;
  hint: { ru: string; en: string };
  /** Для правил-счётчиков (например, «честно» больше одного раза). */
  count?: number;
};

export type SlopVerdictV1 = 'clean' | 'review' | 'rewrite';

export type SlopReportV1 = {
  version: 'slop-check/1.0.0';
  platform: string;
  locale: 'ru' | 'en';
  /** Не больше пятнадцати: сначала `error`, затем по позиции. */
  findings: SlopFindingV1[];
  truncated: boolean;
  metrics: {
    sentences: number;
    words: number;
    meanNeighbourDiff: number | null;
    shortSentences: number;
    questions: number;
    boldSpans: number;
    emojiKinds: number;
    dashPer1k: number;
    lists: number;
    listItemsMax: number;
  };
  /** errors × 3 + warnings. */
  score: number;
  /** ≤3 clean, ≤10 review, 11+ rewrite. */
  verdict: SlopVerdictV1;
};

export type SlopCheckRequestV1 = {
  text: string;
  platform?: string;
  locale?: 'ru' | 'en';
  /** `true`, когда текст пришёл из редактора как HTML. */
  html?: boolean;
};

export type AntiCopyRunV1 = { text: string; start: number; end: number };

export type AntiCopyReportV1 = {
  minWords: number;
  runs: AntiCopyRunV1[];
  retried: boolean;
  clean: boolean;
};

/**
 * Похоже ли на этого автора — одна строка вердикта рядом со штампами.
 *
 * `content-factory-next-k879.1`, решение владельца 07.09.2026: проверки живут
 * там, где текст окончателен, то есть на адаптации. Считается той же
 * бесплатной меркой, что и кнопка проверки в ленте голоса
 * (`VoiceService.textCheck`), и ни одного платного вызова на этом пути нет.
 *
 * `UNKNOWN` — это не тихое `CLOSE`. Голоса нет, разбор собран вручную,
 * границы не сняты или текст слишком короток, чтобы мерить: во всех четырёх
 * случаях ответа нет, и экран, рисующий это одобрением, сообщает человеку то,
 * чего никто не проверял.
 */
export type VoiceCheckReportV1 = {
  verdict: VoiceSimilarityV1['verdict'];
  /** Почему ответа нет. Есть только у `UNKNOWN`. */
  reason?: VoiceSimilarityV1['reason'];
};

/**
 * Квитанция проверок одной адаптации: то, что посчитано без единого вызова
 * модели.
 *
 * Все три поля присутствуют всегда, и все три считаются сами
 * (`content-factory-next-k879.1`). До 07.09.2026 штампы считались только при
 * `options.slopCheck === true`, которого не присылал ни один клиент, — то есть
 * не считались никогда. Проверка, которую надо попросить, — это проверка,
 * которой нет.
 *
 * `null` у штампов и антикопии значит «посчитать было нечем»: у голоса на это
 * есть свой честный `UNKNOWN` с причиной.
 *
 * Находки совещательны. Ни одна из трёх не запрещает сохранить, отправить или
 * опубликовать текст.
 */
export type AdaptationChecksV1 = {
  antiCopy: AntiCopyReportV1 | null;
  slop: SlopReportV1 | null;
  voice: VoiceCheckReportV1;
};

/* ---- События стрима ------------------------------------------------------- */

export type IntakeDraftContentV1 = {
  content: string;
  usedCitationIds: string[];
};

export type IntakeEventV1 =
  | {
      name: 'intake-started';
      inputKind: IntakeInputKindV1;
      channels: Array<{ id: string; name: string; providerIdentifier: string }>;
    }
  | { name: 'link-fetched'; url: string; title: string | null; evidenceId: string }
  | { name: 'claims'; claims: IntakeClaimV1[] }
  | { name: 'brief-filled'; brief: BriefFilledV1 }
  | {
      name: 'research-started';
      level: 'quick' | 'standard' | 'deep';
      count: number;
    }
  | {
      name: 'research-ready';
      level: 'quick' | 'standard' | 'deep';
      facts: BriefFilledFactV1[];
      sources: Array<{ url: string; title: string; status: 'confirmed' | 'conflicting' | 'not_found' }>;
    }
  | {
      name: 'research-selection-required';
      level: 'quick' | 'standard' | 'deep';
      facts: BriefFilledFactV1[];
    }
  /**
   * Что осталось спросить — и **не терминальное** с волны
   * `content-factory-next-m2eg`: заготовка уже записана событием `piece`, а
   * вопросы живут на её странице и отвечаются дверью `answer`. `round` —
   * который это круг; клиент вправе его не читать.
   */
  | { name: 'questions'; questions: IntakeQuestionV1[]; round?: number }
  | { name: 'channel-started'; integrationId: string }
  | { name: 'content-context'; integrationId: string; data: { output: unknown } }
  /** Проброс события графа генератора как есть. */
  | { name: 'generator'; integrationId: string; event: unknown }
  | {
      name: 'draft';
      integrationId: string;
      postId: string;
      pieceId?: string | null;
      content: IntakeDraftContentV1[];
      provenance: unknown;
      draftGaps: unknown[];
      checks: AdaptationChecksV1;
    }
  | { name: 'done'; postIds: string[] }
  | {
      name: 'error';
      error: true;
      code: string;
      message: string;
      integrationId?: string;
    };

export type IntakeEventNameV1 = IntakeEventV1['name'];

/** Отказы до первого байта стрима — обычные HTTP 422 с этим кодом. */
export type IntakePreflightErrorCodeV1 =
  | 'INTAKE_INPUT_TOO_SHORT'
  | 'INTAKE_CHANNEL_REQUIRED'
  | 'INTAKE_CHANNEL_UNKNOWN'
  | 'INTAKE_TOO_MANY_CHANNELS'
  | 'INTAKE_CHANNEL_UNSUPPORTED';

export const INTAKE_ROUTES = {
  intake: { method: 'POST', path: INTAKE_API_BASE },
  slopCheck: { method: 'POST', path: `${TEXT_QUALITY_API_BASE}/slop-check` },
  writingProfile: (integrationId: string) =>
    `/integrations/${integrationId}/writing-profile`,
} as const;

/* -------------------------------------------------------------------------
 * Заготовка и адаптации (pieces)
 *
 * `content-factory-next-tu3k.9`, решения владельца 06.09.2026: человек сначала
 * делает нейтральную **заготовку** — суть одним текстом плюс бриф, без
 * площадки, — а потом сам решает, во что её превратить: пост в Telegram,
 * подпись в Instagram, позже видео и аудио. Каждая такая версия —
 * **адаптация**. Список заготовок — первая вкладка «Контента», таблицей: по
 * колонке на площадку, в клетке состояние, и оно читается из поста, а не
 * хранится (`ContentDerivation.state` три месяца лгала).
 *
 * Таблицы те же: заготовка — `ContentPiece` (`kind = 'CORE'`, `body` — суть,
 * `brief` — что поняла модель), адаптация — `ContentDerivation` (`kind`,
 * `title`, `body`, `mediaId`, связь с постом). Старые строки читаются без
 * переноса: материал без `kind` — заготовка, у которой суть не выделена;
 * производная без `body` берёт текст из поста.
 *
 * Типы — общая правда шести потоков волны. Меняются только аддитивно. Экран
 * в `VOICE_SURFACES` не регистрируется: страж реестра требует экран в папке
 * `brand-voice`, а он живёт в `content-intelligence/pieces`.
 * ---------------------------------------------------------------------- */

export const PIECES_API_BASE = '/content-intelligence/pieces' as const;
export const PIECE_CORE_VERSION = 'piece-core/v1' as const;
/** Вопросов за один шаг интервью: при создании и под канал при адаптации. */
export const PIECE_MAX_QUESTIONS = 3 as const;
/** Кругов уточнений на шаг; граница из `pl1.10`: продукт предлагает, а не спрашивает вместо текста. */
export const PIECE_MAX_INTERVIEW_ROUNDS = 2 as const;
/** Столько колонок площадок показывается без выбора человека; дальше — «Площадки ▾». */
export const PIECE_DEFAULT_COLUMNS = 6 as const;
/** Сколько первых строк сути несёт строка списка. */
export const PIECE_EXCERPT_LINES = 3 as const;
/** Ниже этой ширины таблица становится карточками. */
export const PIECE_TABLE_MIN_WIDTH = 720 as const;

/** `ContentPiece.kind`. Строка без `kind` — материал до этой волны. */
export type PieceKindV1 = 'CORE';

/**
 * Вид адаптации (`ContentDerivation.kind`). Площадка — отдельное поле, та же
 * строка, что и `providerIdentifier` канала (`telegram`, `instagram`,
 * `wordpress`): видео это не площадка, а вид, и Instagram появляется сам, без
 * таблицы перевода. Строка без `kind` — производная до этой волны, читается как
 * `post`.
 */
export type AdaptationKindV1 =
  | 'post'
  | 'caption'
  | 'article'
  | 'newsletter'
  | 'video'
  | 'audio';

/** Виды, которых в этой волне нет: страница заготовки показывает их строкой «позже». */
export const ADAPTATION_KINDS_LATER: readonly AdaptationKindV1[] = [
  'video',
  'audio',
];

/**
 * Состояние адаптации — из поста, по старшинству
 * `published > queued > error > draft`. Пост с `deletedAt` состояния не даёт.
 */
export type AdaptationStateV1 = 'published' | 'queued' | 'error' | 'draft';

/**
 * Состояние клетки матрицы «площадка × заготовка».
 *
 * - `none` — адаптации нет; нажатие начинает её. Рисуется спокойно: пустая
 *   клетка — возможность, а не долг;
 * - `no_channel` — площадка не подключена; клетка выключена и объясняет себя
 *   до нажатия, а не ошибкой после;
 * - `unknown` — сервер не прочитал публикацию (ответ без клеток): экран пишет
 *   «пока не знаем», а не «ещё нет» поверх существующих постов.
 */
export type PieceCellStateV1 =
  | AdaptationStateV1
  | 'none'
  | 'no_channel'
  | 'unknown';

export type PieceCellV1 = {
  /** `providerIdentifier` площадки. */
  platform: string;
  state: PieceCellStateV1;
  /** ISO. Для `published` и `queued` — `publishDate` поста; иначе `null`. */
  date?: string | null;
  /** `releaseURL` опубликованного поста. */
  url?: string | null;
  postId?: string | null;
  adaptationId?: string | null;
  integrationId?: string | null;
  /**
   * Колонка — площадка, а не канал: три Telegram-канала дают одну клетку с
   * лучшим состоянием и счётом «ещё N». Поимённо — в раскрытой строке.
   */
  more?: number;
};

export type PieceColumnV1 = {
  platform: string;
  /** Имя площадки для шапки таблицы, как его знает провайдер. */
  name: string;
  /** Подключённых каналов площадки. `0` — колонка есть лишь потому, что адаптация уже была. */
  channels: number;
  /** Адаптаций по площадке во всей области: порядок колонок по умолчанию. */
  adaptations: number;
};

/** Откуда взялась заготовка. `legacy` — материал до этой волны. */
export type PieceOriginV1 =
  | IntakeInputKindV1
  | 'lead'
  | 'manual'
  | 'legacy';

export type PieceRowV1 = {
  id: string;
  /** `cnt-12` — код библиотеки, тот же `materialCode`. */
  code: string;
  title: string;
  format: string;
  /** Как печатает библиотека: `06.09.26`. */
  date: string;
  /** ISO — для сортировки и фильтра. */
  createdAt: string;
  /** Первые `PIECE_EXCERPT_LINES` строк сути; пусто, когда суть не выделена. */
  excerpt: string[];
  /** `false` — старый материал: тело — HTML одного канала, суть не выделена. */
  coreExtracted: boolean;
  origin: PieceOriginV1;
  voiceVersion?: string;
  /** Вердикт проверки на штампы по сути; `null` — не считался. */
  slopVerdict?: SlopVerdictV1 | null;
  /**
   * По одной клетке на колонку ответа, в том же порядке. Отсутствует, пока
   * чтение публикации не выпущено: экран рисует `unknown`, не `none`.
   */
  cells?: PieceCellV1[];
  archivedAt?: string | null;
};

export type PiecesQueryV1 = {
  /** Поиск по словам в заголовке, сути и брифе. */
  q?: string;
  /** Фильтр «Ещё нет в…»: площадка без адаптации. */
  missingOn?: string;
  /** Фильтр по состоянию: хотя бы одна адаптация в этом состоянии. */
  state?: AdaptationStateV1;
  includeArchived?: boolean;
};

export type PiecesResponseV1 = {
  state: VoiceScreenStateV1;
  /**
   * Колонки таблицы: подключённые площадки плюс те, где адаптация уже была,
   * отсортированные по числу адаптаций. Неподключённые площадки колонками не
   * становятся. Видео и аудио — не колонки.
   */
  columns: PieceColumnV1[];
  pieces: PieceRowV1[];
  notice?: string;
};

/* ---- Интервью --------------------------------------------------------- */

/**
 * О чём модель спрашивает. Первые три — при создании заготовки (список
 * владельца для короткого текста), остальные — под канал при адаптации, из
 * исследования конкретной площадки. Спрашивается только то, чего нет ни в
 * заготовке, ни в аватаре, ни в фактах, ни в карточке канала.
 */
export type PieceQuestionKeyV1 =
  | 'key_idea'
  | 'personal_detail'
  | 'position'
  | 'hook'
  | 'cta'
  | 'format'
  | 'own_number'
  | 'screenshot'
  | 'log';

export type PieceQuestionV1 = {
  key: PieceQuestionKeyV1;
  question: string;
  /**
   * Вариант модели, словами «я думаю, вот так». Пустого поля не бывает;
   * `null` — модель честно не нашла ответа в тексте и просит слова человека.
   */
  suggested: string | null;
  /** Поле брифа, куда ляжет ответ, если вопрос — про поле брифа. */
  field?: BriefField;
  /** Готовые варианты, когда их конечное число (например, вид призыва). */
  options?: string[];
  /** Подсказка, почему это спрашивается именно здесь: «пуш видит 80–180 знаков». */
  why?: string;
};

export type PieceAnswerOriginV1 = 'person' | 'confirmed' | 'model';

/**
 * Ответ, как его дал человек, — дословно, без приглаживания опечаток:
 * шероховатости и есть материал. `confirmed` — нажал «Так и есть», текст равен
 * `suggested`; `model` — «Реши сама». Ответ ложится в бриф с происхождением
 * «ваш ответ» и цитируется в сути и адаптациях как слова человека.
 */
export type PieceAnswerV1 = {
  key: PieceQuestionKeyV1;
  text: string;
  origin: PieceAnswerOriginV1;
  step: 'core' | 'adaptation';
  /** Для шага `adaptation` — площадка, под которую спрашивали. */
  platform?: string;
  /** ISO. */
  answeredAt: string;
};

/** Ответ человека в запросе; `answeredAt` и `step` ставит сервер. */
export type PieceAnswerInputV1 = {
  key: PieceQuestionKeyV1;
  text: string;
  origin: Exclude<PieceAnswerOriginV1, 'model'>;
};

/* ---- Открытые вопросы заготовки --------------------------------------- */

/**
 * Вопрос, на который заготовка ещё ждёт ответа.
 *
 * `content-factory-next-m2eg`, живой прогон 07.09.2026. До этой волны вопрос
 * был терминальным: пока человек не ответил, заготовки не существовало, и на
 * втором круге экран упирался в тупик «больше спрашивать не будем» — а
 * записать было нечего. Теперь порядок обратный: заготовка пишется сразу,
 * вопросы едут вместе с ней и живут на её странице.
 *
 * Опознаётся **полем брифа**, а не ключом вопроса, и это устраняет повтор,
 * который владелец увидел на прогоне: ворота брифа спрашивали «на чём это
 * стоит», интервью следом спрашивало «есть личная история или факт», и это был
 * один и тот же вопрос про `facts`, заданный дважды подряд.
 */
export type PieceOpenQuestionV1 = IntakeQuestionV1 & {
  /** Вариант модели или честный `null` — «прошу ваши слова». */
  suggested: string | null;
};

/** Ответ человека на открытый вопрос; `answeredAt` ставит сервер. */
export type PieceFieldAnswerV1 = {
  field: BriefField;
  /** Дословно, как написал человек. Пусто у `origin: 'model'`. */
  text: string;
  /** `person` — свои слова или «Так и есть»; `model` — «Реши сама». */
  origin: 'person' | 'model';
  /** ISO. */
  answeredAt: string;
};

/**
 * Что у заготовки осталось спросить и что уже спрошено.
 *
 * Живёт в существующей колонке `ContentPiece.brief` рядом с брифом и ответами
 * интервью — своей таблицы у вопроса нет и не заводится. `round` считает круги
 * ответов: их не больше `PIECE_MAX_INTERVIEW_ROUNDS`, и после последнего
 * `items` остаётся пустым навсегда.
 */
export type PieceQuestionsV1 = {
  round: number;
  items: PieceOpenQuestionV1[];
  /** Уже отвеченное и отданное модели: об этом не спрашивают второй раз. */
  answered: PieceFieldAnswerV1[];
};

/* ---- Суть и адаптация ------------------------------------------------- */

/**
 * Суть заготовки: `text` лежит в `ContentPiece.body` простым текстом, всё
 * остальное — в `ContentPiece.brief`. Суть пишет один вызов роли `draft`
 * (операция `intake`); аватар в неё не идёт — суть нейтральна и по площадке, и
 * по манере. Слова, числа и примеры автора переносятся дословно.
 */
export type ZagotovkaCoreV1 = {
  version: typeof PIECE_CORE_VERSION;
  text: string;
  brief: BriefFilledV1;
  /** Ответы интервью при создании, дословно. */
  answers: PieceAnswerV1[];
  /** Проверка на штампы, снятая сразу после записи сути. */
  slop: SlopReportV1 | null;
  /** `fallback` — модель отказала, суть собрана из брифа детерминированно. */
  writtenBy: 'model' | 'fallback';
  /** Автор принёс хотя бы одно своё число; иначе страница показывает то же предложение, что окно поста. */
  authorNumbers: boolean;
  /**
   * Что осталось спросить. `null` или отсутствие — спрашивать нечего, и это
   * обычное состояние готовой заготовки, а не пробел (`m2eg`).
   */
  questions?: PieceQuestionsV1 | null;
  /**
   * Слова человека, с которых началась заготовка, дословно. Нужны переписи
   * сути после ответа: без них второй вызов модели писал бы по одному брифу,
   * потеряв ровно то, ради чего продукт хранит формулировки автора. У
   * вставленного чужого поста своих слов нет, и здесь пусто.
   */
  personText?: string;
};

export type AdaptationV1 = {
  id: string;
  pieceId: string;
  kind: AdaptationKindV1;
  platform: string;
  integrationId?: string | null;
  integrationName?: string | null;
  title?: string | null;
  /** Текст адаптации простым текстом; у строк до этой волны — из поста. */
  body?: string | null;
  postId?: string | null;
  mediaId?: string | null;
  state: AdaptationStateV1;
  /** ISO — `publishDate` поста. */
  date?: string | null;
  url?: string | null;
  /** ISO. */
  createdAt: string;
  voiceVersion?: string;
  /** Ответы на вопросы под канал, дословно. */
  answers?: PieceAnswerV1[];
  /** Есть у свежей адаптации; у строки списка проверок нет — их не хранят. */
  checks?: AdaptationChecksV1;
};

/**
 * Куда можно адаптировать. Площадка без канала приходит с `available: false`
 * — так страница показывает её выключенной с причиной, а отказ не случается
 * после нажатия.
 */
export type PieceTargetV1 = {
  platform: string;
  name: string;
  kinds: AdaptationKindV1[];
  channels: Array<{ id: string; name: string; providerIdentifier: string }>;
  available: boolean;
};

export type PieceDetailV1 = {
  state: VoiceScreenStateV1;
  piece: PieceRowV1;
  /** `null` — суть не выделена (материал до волны); тогда тело — в `legacyBody`. */
  core: ZagotovkaCoreV1 | null;
  /** HTML одного канала у старых материалов. Старая кнопка «Черновик» вставит его как есть — экран предупреждает. */
  legacyBody?: string | null;
  adaptations: AdaptationV1[];
  targets: PieceTargetV1[];
  /** Виды адаптаций, которые появятся позже. */
  later: readonly AdaptationKindV1[];
  notice?: string;
};

/* ---- Запросы ------------------------------------------------------------ */

/**
 * Создание заготовки — та же дверь, что и вход одной мыслью: каналы
 * необязательны. Без каналов — только заготовка; с каналами — заготовка
 * один раз до цикла и адаптация в каждом (короткий путь «сразу для
 * Telegram» создаёт её незаметно).
 */
export type PieceCreateRequestV1 = Omit<IntakeRequestV1, 'integrationIds'> & {
  integrationIds?: string[];
  /** Ответы интервью при создании. */
  interview?: PieceAnswerInputV1[];
  /** «Реши сама» по ключам вопросов. */
  decideKeys?: PieceQuestionKeyV1[];
  /** Пропустить интервью целиком одной кнопкой: модель решает всё сама. */
  skipInterview?: boolean;
};

export type PieceAdaptRequestV1 = {
  integrationId: string;
  /** По умолчанию — первый из `KINDS_BY_PROVIDER` площадки. */
  kind?: AdaptationKindV1;
  answers?: PieceAnswerInputV1[];
  decideKeys?: PieceQuestionKeyV1[];
  skipInterview?: boolean;
  options?: Pick<IntakeOptionsV1, 'isPicture'>;
  brandProfileSelection?: BrandProfileSelectionV1;
};

/**
 * Ответы на открытые вопросы заготовки.
 *
 * Опознаются полем брифа: `answers` — слова человека дословно, `decide` —
 * поля, отданные модели («Реши сама»). Отданное поле — это решение, а не
 * пустой ответ: о нём больше не спрашивают ни разу, и для `facts` оно значит
 * «суть стоит на словах человека», а не «опоры нет».
 */
export type PieceAnswerRequestV1 = {
  answers?: Array<{ field: BriefField; text: string }>;
  decide?: BriefField[];
};

export type PieceArchiveRequestV1 = {
  archived: boolean;
};

/* ---- События стрима ----------------------------------------------------- */

/**
 * Что вход добавляет к `IntakeEventV1` в этой волне: заготовка записана до
 * цикла по каналам, и черновик знает свою адаптацию. Объявлено отдельным
 * союзом, чтобы старые читатели `IntakeEventV1` не ломались.
 */
export type IntakePieceEventV1 =
  | {
      name: 'piece';
      pieceId: string;
      code: string;
      core: ZagotovkaCoreV1;
    }
  | {
      name: 'piece-questions';
      questions: PieceQuestionV1[];
      round: number;
    };

/**
 * Вход говорит вслух, что сейчас идёт поиск (`content-factory-next-tu3k.7`):
 * те несколько секунд, пока числа чужого поста сверяются, экран иначе читает
 * как зависание. Объявлено в контракте с волны `tu3k.11`; до неё жило рядом с
 * сервисом в `pieces/intake-events.ts`.
 */
export type IntakeSearchStartedEventV1 = {
  name: 'search-started';
  /**
   * Зачем ищем: `claims` — сверка чисел чужого поста, `facts` — опора для
   * мысли, у которой не нашлось ни одного факта.
   */
  reason: 'claims' | 'facts';
  /** Сколько запросов уйдёт. Экран показывает число, а не крутилку без конца. */
  count: number;
};

export type IntakeEventWithPieceV1 =
  | IntakeEventV1
  | IntakePieceEventV1
  | IntakeSearchStartedEventV1
  | (Extract<IntakeEventV1, { name: 'draft' }> & {
      adaptationId?: string | null;
    });

/** Тот же конверт NDJSON, что у входа: строка — событие, последняя — `done` или `error`. */
/**
 * Свой прежний текст, на который новый может сослаться.
 *
 * Решение владельца 07.09.2026 (`content-factory-next-m2eg.19`): «нам это
 * нужно сразу сделать, чтобы модель научилась на них ссылаться». Строка —
 * это ВЫШЕДШИЙ пост со своим адресом: сослаться можно только на то, что
 * читатель откроет, поэтому у черновика адреса нет и в этот список он не
 * попадает.
 *
 * `score` — вес находки внутреннего поиска, а не оценка качества текста.
 * Он есть в ответе двери потому, что порядок строк на экране обязан
 * совпадать с порядком, в котором их увидела модель.
 */
export type RelatedOwnPostV1 = {
  /** `ContentPiece.id`, `ContentDerivation.id` или `Post.id` — что нашлось. */
  id: string;
  kind: 'PIECE' | 'ADAPTATION' | 'POST';
  title: string;
  /** Первые строки текста: столько, сколько нужно, чтобы узнать пост. */
  excerpt: string;
  /** Адрес вышедшего поста. Без него ссылаться не на что. */
  url: string;
  /** `providerIdentifier` канала, где текст вышел. */
  platform: string | null;
  /** ISO — когда вышел. */
  publishedAt: string | null;
  score: number;
};

/** Ответ двери «свои тексты по теме». */
export type RelatedTextsResponseV1 = {
  related: RelatedOwnPostV1[];
};

export type PieceAdaptEventV1 =
  | {
      name: 'adapt-started';
      pieceId: string;
      kind: AdaptationKindV1;
      channel: { id: string; name: string; providerIdentifier: string };
    }
  /** Терминальное: адаптации нет, клиент повторяет запрос с `answers`/`decideKeys`/`skipInterview`. */
  | { name: 'questions'; questions: PieceQuestionV1[]; round: number }
  | { name: 'content-context'; data: { output: unknown } }
  /**
   * Свои прежние тексты по теме — то же, что увидела модель.
   *
   * Идёт до генерации и информационно: экран показывает список, отмечать в
   * нём нечего. Пустой список не отправляется вовсе — «ничего не нашлось» это
   * не новость для человека, который просил написать пост.
   */
  | { name: 'related'; related: RelatedOwnPostV1[] }
  /** Проброс события графа генератора как есть. */
  | { name: 'generator'; event: unknown }
  | {
      name: 'adaptation';
      adaptation: AdaptationV1;
      content: IntakeDraftContentV1[];
      provenance: unknown;
      draftGaps: unknown[];
      checks: AdaptationChecksV1;
    }
  | { name: 'done'; adaptationId: string; postId: string | null }
  | { name: 'error'; error: true; code: string; message: string };

export type PieceAdaptEventNameV1 = PieceAdaptEventV1['name'];

/**
 * Тот же конверт NDJSON у двери ответов: строка — событие, последняя — `done`
 * или `error`.
 *
 * Тупика здесь нет ни на каком круге. Ответ либо переписывает суть, либо
 * ничего не меняет, но заготовка остаётся на месте, и `piece` приходит всегда.
 * `questions` появляется, только если спросить ещё есть о чём и круги не
 * исчерпаны; его отсутствие — это «больше не спросим», сказанное молчанием, а
 * не отказом.
 */
export type PieceAnswerEventV1 =
  | { name: 'answer-started'; pieceId: string; round: number }
  | { name: 'piece'; pieceId: string; code: string; core: ZagotovkaCoreV1 }
  | { name: 'questions'; questions: PieceOpenQuestionV1[]; round: number }
  | { name: 'done'; pieceId: string }
  | { name: 'error'; error: true; code: string; message: string };

export type PieceAnswerEventNameV1 = PieceAnswerEventV1['name'];

/* ---- Отказы --------------------------------------------------------------- */

/**
 * Отказы дверей заготовок. До первого байта стрима — обычный HTTP с этим
 * кодом; после — последней строкой `{name:'error'}`.
 */
export const PIECE_ERROR_CODES = {
  PIECE_NOT_FOUND: { status: 404, screenState: 'error' },
  PIECE_ARCHIVED: { status: 409, screenState: 'error' },
  PIECE_CHANNEL_REQUIRED: { status: 422, screenState: 'error' },
  PIECE_CHANNEL_UNKNOWN: { status: 422, screenState: 'error' },
  /** Площадка канала не умеет ни одного вида адаптации из `KINDS_BY_PROVIDER`. */
  PIECE_CHANNEL_UNSUPPORTED: { status: 422, screenState: 'error' },
  /** Видео и аудио — «позже». */
  ADAPTATION_KIND_UNSUPPORTED: { status: 422, screenState: 'error' },
  ADAPTATION_NOT_FOUND: { status: 404, screenState: 'error' },
  /** Происхождение опубликованного текста не стирается. */
  ADAPTATION_PUBLISHED: { status: 409, screenState: 'error' },
  /** Интервью исчерпало `PIECE_MAX_INTERVIEW_ROUNDS`: дальше — «Реши сама» или ручной бриф. */
  PIECE_INTERVIEW_EXHAUSTED: { status: 422, screenState: 'error' },
  /**
   * Отвечать нечему: у материала до волны заготовок сути нет, а есть тело
   * одного канала. Вопросы к нему бессмысленны, и молчание в ответ было бы
   * хуже названного отказа.
   */
  PIECE_CORE_MISSING: { status: 422, screenState: 'error' },
  /**
   * Заготовка не записалась. С волны `m2eg` это отказ, а не тишина: до неё
   * `recordCore` возвращал `null`, стрим шёл дальше, и человек получал
   * черновики без заготовки, о чём никто ему не говорил.
   */
  PIECE_NOT_SAVED: { status: 500, screenState: 'error' },
} as const satisfies Record<
  string,
  { status: number; screenState: VoiceScreenStateV1 }
>;

export type PieceErrorCodeV1 = keyof typeof PIECE_ERROR_CODES;

export type PieceErrorBodyV1 = {
  code: PieceErrorCodeV1;
  message: string;
  subject?: string;
};

/* ---- Маршруты ------------------------------------------------------------- */

export const PIECE_ROUTES = {
  list: { method: 'GET', path: PIECES_API_BASE },
  detail: {
    method: 'GET',
    path: (pieceId: string) => `${PIECES_API_BASE}/${pieceId}`,
  },
  /** Проверка самой заготовки возвращает тот же подписанный V2-снимок, что и адаптация. */
  review: {
    method: 'POST',
    path: (pieceId: string) => `${PIECES_API_BASE}/${pieceId}/review`,
  },
  /** Создание — дверь входа; каналы необязательны с этой волны. */
  create: { method: 'POST', path: INTAKE_API_BASE },
  /** NDJSON по `PieceAdaptEventV1`. Повторный вызов создаёт новую адаптацию, старую не трогает. */
  adapt: {
    method: 'POST',
    path: (pieceId: string) => `${PIECES_API_BASE}/${pieceId}/adapt`,
  },
  /** NDJSON по `PieceAnswerEventV1`: ответы на открытые вопросы заготовки. */
  answer: {
    method: 'POST',
    path: (pieceId: string) => `${PIECES_API_BASE}/${pieceId}/answer`,
  },
  archive: {
    method: 'POST',
    path: (pieceId: string) => `${PIECES_API_BASE}/${pieceId}/archive`,
  },
  /** Отказ `ADAPTATION_PUBLISHED`, когда пост опубликован. */
  deleteAdaptation: {
    method: 'DELETE',
    path: (pieceId: string, adaptationId: string) =>
      `${PIECES_API_BASE}/${pieceId}/adaptations/${adaptationId}`,
  },
} as const;
