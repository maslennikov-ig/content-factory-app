/**
 * The wire between the voice routes and the screens `36r` accepted.
 *
 * Kept apart from the container for the same reason
 * `content-intelligence.adapter.ts` is: the mapping is a pure function of the
 * response and can be argued about — and tested — without a render, a fetch or
 * a hook.
 *
 * Two habits are load-bearing here. The routes are read out of
 * `VOICE_SURFACES` rather than retyped, so a path cannot drift away from the
 * screen the contract gave it. And every field arrives as `unknown` and is
 * narrowed on the way in: a screen that trusts the shape of a response is a
 * screen that renders `undefined` the first time a route is versioned.
 */

import {
  PROFILE_FIELDS,
  type ProfileField,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/assist.contract';
import {
  VOICE_ERROR_CODES,
  VOICE_SURFACES,
  type VoiceErrorCode,
  type VoiceScreenStateV1,
  type VoiceSurfaceKey,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type {
  PassportVoice,
  VoicePassportState,
} from './voice-passport.screen';
import type { ScaleEntry } from './voice-scales.screen';
import type {
  KeptMetric,
  RedactionCategory,
  RedactionRow,
} from './voice-redactions.screen';
import type {
  FieldComparison,
  VersionLifecycle,
  VoiceVersion,
} from './voice-versions.screen';
import type { LearnedRule } from './voice-learning.screen';
import { SCALE_ORDER, type StyleScaleKey, type VoiceLocale } from './voice-copy';

/**
 * @param endsWith хвост пути, когда у поверхности несколько маршрутов одного
 *   метода. Без него берётся первый подходящий, а порядок в реестре решать
 *   такое не должен: у паспорта на одном `POST` это верно сегодня и молча
 *   перестанет быть верным в день, когда рядом встанет второй.
 */
const routeOf = (
  surface: VoiceSurfaceKey,
  method: 'GET' | 'POST',
  endsWith?: string
): string => {
  const route = VOICE_SURFACES[surface].routes.find(
    (one) =>
      one.method === method && (!endsWith || one.path.endsWith(endsWith))
  );
  if (!route) throw new Error(`no ${method} route for ${surface}`);
  return route.path;
};

/** The paths this tab uses, named by the surface each one feeds. */
export const VOICE_ROUTES = Object.freeze({
  passport: routeOf('passport', 'GET'),
  examples: routeOf('passport', 'POST', '/passport/examples'),
  // One of the five lines, rewritten on the card that shows it. The passport
  // now has two writes, which is why both are named by their tail.
  passportField: routeOf('passport', 'POST', '/passport/field'),
  scales: routeOf('scales', 'GET'),
  /** Измерить те же тексты заново нынешней меркой. Модель не вызывается. */
  recalibrate: routeOf('analysis', 'POST', '/analysis/refresh'),
  corridor: routeOf('scales', 'POST'),
  redactions: routeOf('redactions', 'GET'),
  versions: routeOf('versions', 'GET'),
  restore: routeOf('versions', 'POST'),
  /** Чему аватар научился на правках: читать, учить, отменить правило. */
  learning: routeOf('learning', 'GET'),
  learningRun: routeOf('learning', 'POST', '/learning/run'),
  learningForget: routeOf('learning', 'POST', '/learning/forget'),
});

/* -------------------------------------------------------------------------
 * Narrowing
 * ---------------------------------------------------------------------- */

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => {
  const candidate = asString(value) as T;
  return allowed.includes(candidate) ? candidate : fallback;
};

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

/** The state a response asked for, or `default` when it named none. */
export const screenStateOf = (
  response: unknown,
  fallback: VoiceScreenStateV1 = 'default'
): VoiceScreenStateV1 =>
  oneOf(asRecord(response).state, SCREEN_STATES, fallback);

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

export type VoiceFailure = {
  /** `null` when the failure never reached a route that names its reasons. */
  code: VoiceErrorCode | null;
  message: string;
  /** `restricted` is a state a person stays in, not a message they dismiss. */
  screenState: 'error' | 'restricted';
  subject?: string;
};

/**
 * What a screen is told when a route refused.
 *
 * The code is what the interface branches on and the message is what a person
 * reads, and both travel: a screen printing "что-то пошло не так" over a server
 * that named the reason has thrown the reason away between two processes. The
 * state each code puts a screen into is the contract's table, read rather than
 * retyped.
 */
export function readVoiceFailure(error: unknown): VoiceFailure | null {
  if (!error) return null;
  const record = asRecord(error);
  const code = asString(record.code) as VoiceErrorCode;
  const known = Object.prototype.hasOwnProperty.call(VOICE_ERROR_CODES, code);
  const message =
    asString(record.message) ||
    (error instanceof Error ? error.message : '') ||
    'Запрос к голосу бренда не удался.';
  return {
    code: known ? code : null,
    message,
    screenState: known ? VOICE_ERROR_CODES[code].screenState : 'error',
    ...(asString(record.subject) ? { subject: asString(record.subject) } : {}),
  };
}

/**
 * The state a surface is in, given what the request did and what it answered.
 *
 * Loading first, then the refusal's own state, then whatever the server asked
 * for. A screen quietly falling back to `default` turns nine reviewed states
 * into one.
 */
export function surfaceState(input: {
  loading: boolean;
  failure: VoiceFailure | null;
  response: unknown;
  fallback?: VoiceScreenStateV1;
}): VoiceScreenStateV1 {
  if (input.loading) return 'loading';
  if (input.failure) return input.failure.screenState;
  return screenStateOf(input.response, input.fallback);
}

/* -------------------------------------------------------------------------
 * Requests
 * ---------------------------------------------------------------------- */

type Request = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * One read, with the refusal kept intact.
 *
 * The body carries `code`, `message` and sometimes `subject`; throwing a bare
 * status would discard all three, and the screens are built to say them.
 */
export async function readVoice(
  request: Request,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await request(path, init);
  if (!response.ok) {
    const body = asRecord(await response.json().catch(() => null));
    throw Object.assign(
      new Error(
        asString(body.message) || `Voice request failed: ${response.status}`
      ),
      {
        status: response.status,
        ...(asString(body.code) ? { code: asString(body.code) } : {}),
        ...(asString(body.subject) ? { subject: asString(body.subject) } : {}),
      }
    );
  }
  return response.status === 204 ? null : response.json();
}

/* -------------------------------------------------------------------------
 * Dates
 * ---------------------------------------------------------------------- */

/**
 * A date a person reads.
 *
 * The passport arrives formatted by the server and the version history arrives
 * as ISO instants, because they are written by two different code paths. A
 * screen printing `2026-08-22T10:00:00.000Z` beside a name is a screen showing
 * machine time to a reader, so anything that parses is formatted and anything
 * else is passed through untouched.
 */
export function formatVoiceDate(value: string, locale: VoiceLocale): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

/* -------------------------------------------------------------------------
 * Screen 06 — the passport
 * ---------------------------------------------------------------------- */

/**
 * `null` is the voice's absence and a working state, so it is preserved
 * exactly: an empty card built out of empty strings would claim a voice exists
 * and say nothing about it.
 */
export function mapPassport(response: unknown): {
  state: VoicePassportState;
  voice: PassportVoice | null;
} {
  const envelope = asRecord(response);
  const state = screenStateOf(envelope, 'empty') as VoicePassportState;
  if (!envelope.voice) return { state, voice: null };

  const voice = asRecord(envelope.voice);
  const sentence = asRecord(voice.sentenceLength);
  return {
    state,
    voice: {
      whoSpeaks: asString(voice.whoSpeaks),
      tone: asString(voice.tone),
      audience: asString(voice.audience),
      neverSay: asArray(voice.neverSay).map((one) => asString(one)).filter(Boolean),
      ...(typeof voice.sentenceStyle === 'string' && voice.sentenceStyle
        ? { sentenceStyle: voice.sentenceStyle }
        : {}),
      versionLabel: asString(voice.versionLabel),
      activeSince: asString(voice.activeSince),
      // Carried through only when the route actually sent a number: defaulting
      // a missing field to `0` here would recreate the exact lie vme.11 fixed
      // on the server, one hop later.
      ...(typeof voice.sampleCount === 'number'
        ? { sampleCount: voice.sampleCount }
        : {}),
      ...(typeof voice.charCount === 'number'
        ? { charCount: voice.charCount }
        : {}),
      ...(voice.confidence === 'LOW' || voice.confidence === 'NORMAL'
        ? { confidence: voice.confidence }
        : {}),
      ...(typeof sentence.value === 'string'
        ? {
            sentenceLength: {
              value: sentence.value,
              low: asNumber(sentence.low),
              high: asNumber(sentence.high),
            },
          }
        : {}),
      ...(typeof voice.dashShare === 'string'
        ? { dashShare: voice.dashShare }
        : {}),
      ...(asArray(voice.examples).length
        ? {
            examples: asArray(voice.examples)
              .map((one) => ({ text: asString(asRecord(one).text) }))
              .filter((one) => one.text),
          }
        : {}),
    },
  };
}

/* -------------------------------------------------------------------------
 * Screen 07 — the eight scales
 * ---------------------------------------------------------------------- */

const GAP_REASONS = [
  'TOO_FEW_OBSERVATIONS',
  'TOO_FEW_POSITIVE',
  'TOO_FEW_SAMPLES',
  'NO_DICTIONARY',
  'FAILED',
] as const;

const mapScaleEntry = (value: unknown): ScaleEntry | null => {
  const entry = asRecord(value);
  if (entry.kind === 'gap') {
    return {
      kind: 'gap',
      reason: oneOf(entry.reason, GAP_REASONS, 'FAILED'),
      positives: asNumber(entry.positives),
    };
  }
  if (entry.kind !== 'value') return null;
  return {
    kind: 'value',
    raw: asNumber(entry.raw),
    display: asNumber(entry.display),
    low: asNumber(entry.low),
    high: asNumber(entry.high),
    observations: asNumber(entry.observations),
    sampleCount: asNumber(entry.sampleCount),
    exampleText:
      typeof entry.exampleText === 'string' ? entry.exampleText : null,
    exampleSampleCode:
      typeof entry.exampleSampleCode === 'string'
        ? entry.exampleSampleCode
        : null,
    ...(entry.manualCorridor === true ? { manualCorridor: true } : {}),
    // Что намерил разбор под перенесённой границей — только когда оно есть.
    ...(typeof entry.measuredLow === 'number'
      ? { measuredLow: entry.measuredLow }
      : {}),
    ...(typeof entry.measuredHigh === 'number'
      ? { measuredHigh: entry.measuredHigh }
      : {}),
    ...(entry.excluded === true ? { excluded: true } : {}),
  };
};

export function mapScales(response: unknown): {
  scales: Partial<Record<StyleScaleKey, ScaleEntry>>;
  profileLabel?: string;
  versionLabel?: string;
  sampleCount?: number;
  lastCheck?: { inCorridor: number; outside?: { key: StyleScaleKey; value: string } };
  canEditCorridors: boolean;
  recalibration?: { movedByHand: number };
} {
  const envelope = asRecord(response);
  const raw = asRecord(envelope.scales);
  const scales: Partial<Record<StyleScaleKey, ScaleEntry>> = {};
  for (const key of SCALE_ORDER) {
    const entry = mapScaleEntry(raw[key]);
    if (entry) scales[key] = entry;
  }

  const check = asRecord(envelope.lastCheck);
  const outside = asRecord(check.outside);
  return {
    scales,
    ...(asString(envelope.profileLabel)
      ? { profileLabel: asString(envelope.profileLabel) }
      : {}),
    ...(asString(envelope.versionLabel)
      ? { versionLabel: asString(envelope.versionLabel) }
      : {}),
    ...(typeof envelope.sampleCount === 'number'
      ? { sampleCount: envelope.sampleCount }
      : {}),
    ...(typeof check.inCorridor === 'number'
      ? {
          lastCheck: {
            inCorridor: check.inCorridor,
            ...(SCALE_ORDER.includes(outside.key as StyleScaleKey)
              ? {
                  outside: {
                    key: outside.key as StyleScaleKey,
                    value: asString(outside.value),
                  },
                }
              : {}),
          },
        }
      : {}),
    // Policy, read from the answer. A permission the interface decides for
    // itself is a permission the server never granted. The same goes for the
    // offer below: whether measuring again would change anything is a fact
    // only the server holds, because only it knows which ruler shipped today.
    canEditCorridors: envelope.canEditCorridors === true,
    ...(asRecord(envelope.recalibration).movedByHand !== undefined
      ? {
          recalibration: {
            movedByHand: asNumber(asRecord(envelope.recalibration).movedByHand),
          },
        }
      : {}),
  };
}

/** The measured scales, in the design's order — what a corridor can be set on. */
export const editableScales = (
  scales: Partial<Record<StyleScaleKey, ScaleEntry>>
): readonly StyleScaleKey[] =>
  SCALE_ORDER.filter((key) => scales[key]?.kind === 'value');

/* -------------------------------------------------------------------------
 * Screen 08 — what stayed out of a reference
 * ---------------------------------------------------------------------- */

const CATEGORIES: readonly RedactionCategory[] = [
  'PERSON',
  'FACT_NUMBER',
  'LINK',
  'MENTION',
  'VERBATIM',
];

export function mapRedactions(response: unknown): {
  redactions: readonly RedactionRow[];
  kept: readonly KeptMetric[];
  referenceCount: number;
  finishedAt: string;
  longestMatch: number;
  notice?: string;
} {
  const envelope = asRecord(response);
  return {
    redactions: asArray(envelope.redactions)
      .map((value) => {
        const row = asRecord(value);
        return {
          category: oneOf(row.category, CATEGORIES, 'PERSON'),
          occurrences: asNumber(row.occurrences),
          examples: asArray(row.examples)
            .map((one) => asString(one))
            .filter(Boolean),
        };
      })
      .filter((row) => CATEGORIES.includes(row.category)),
    kept: asArray(envelope.kept).map((value) => {
      const metric = asRecord(value);
      return { label: asString(metric.label), value: asString(metric.value) };
    }),
    referenceCount: asNumber(envelope.referenceCount),
    finishedAt: asString(envelope.finishedAt),
    longestMatch: asNumber(envelope.longestMatch),
    ...(asString(envelope.notice) ? { notice: asString(envelope.notice) } : {}),
  };
}

/* -------------------------------------------------------------------------
 * Screen 09 — versions
 * ---------------------------------------------------------------------- */

const LIFECYCLES: readonly VersionLifecycle[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export function mapVersions(
  response: unknown,
  locale: VoiceLocale
): {
  versions: readonly VoiceVersion[];
  comparison?: { from: string; to: string; fields: readonly FieldComparison[] };
  comparisonNotice?: string;
  profileLabel?: string;
  canRestore: boolean;
} {
  const envelope = asRecord(response);
  const comparison = asRecord(envelope.comparison);
  /**
   * Строки, чей ключ продукт не знает, отбрасываются, а не рисуются.
   *
   * Сравнение приходит с ключом поля, а не с его названием, и название
   * подставляет экран. Неизвестный ключ подставить нечем: строка получилась бы
   * с пустым названием и двумя значениями, о которых непонятно, что это.
   */
  const fields = asArray(comparison.fields)
    .map((value) => {
      const field = asRecord(value);
      return {
        field: asString(field.field) as ProfileField,
        was: asString(field.was),
        became: asString(field.became),
        changed: field.changed === true,
      } satisfies FieldComparison;
    })
    .filter((field) => PROFILE_FIELDS.includes(field.field));

  return {
    versions: asArray(envelope.versions).map((value) => {
      const version = asRecord(value);
      return {
        id: asString(version.id),
        label: asString(version.label),
        lifecycle: oneOf(version.lifecycle, LIFECYCLES, 'ARCHIVED'),
        ...(version.active === true ? { active: true } : {}),
        changedAt: formatVoiceDate(asString(version.changedAt), locale),
        actor: asString(version.actor),
      } satisfies VoiceVersion;
    }),
    ...(asString(comparison.from) && asString(comparison.to) && fields.length
      ? {
          comparison: {
            from: asString(comparison.from),
            to: asString(comparison.to),
            fields,
          },
        }
      : {}),
    // Why a pair that was asked for has no table under it. The screen prints
    // this instead of «выберите две версии», which it used to say over two
    // versions that were already ticked.
    ...(asString(envelope.comparisonNotice)
      ? { comparisonNotice: asString(envelope.comparisonNotice) }
      : {}),
    ...(asString(envelope.profileLabel)
      ? { profileLabel: asString(envelope.profileLabel) }
      : {}),
    canRestore: envelope.canRestore === true,
  };
}

/**
 * The two the server compares when nobody has picked a pair.
 *
 * `/versions` answers with a comparison of the two newest that were in force,
 * and the list has to show those two ticked — otherwise the table underneath
 * describes a pair the reader cannot see. This used to be worked out by
 * matching labels, which picked three rows whenever two versions shared one;
 * ids are unique and the versions arrive newest first, so the answer is the
 * first two that are not drafts.
 */
export function defaultComparedIds(
  versions: readonly VoiceVersion[]
): readonly string[] {
  return versions
    .filter((version) => version.lifecycle !== 'DRAFT')
    .slice(0, 2)
    .map((version) => version.id);
}

/**
 * `/versions` with the pair to compare, or without it.
 *
 * Two ids or none: one tick is not a comparison, and sending half a pair would
 * make the route answer about something else while the screen shows one box
 * ticked.
 */
export function versionsPath(
  base: string,
  picked: readonly string[]
): string {
  if (picked.length !== 2) return base;
  const separator = base.includes('?') ? '&' : '?';
  return (
    `${base}${separator}from=${encodeURIComponent(picked[0]!)}` +
    `&to=${encodeURIComponent(picked[1]!)}`
  );
}

/* -------------------------------------------------------------------------
 * Чему аватар научился на правках
 * ---------------------------------------------------------------------- */

/**
 * Ответ двери обучения, приведённый к тому, что рисует блок.
 *
 * Даты форматируются здесь, той же функцией, что и в истории версий: экран,
 * печатающий `2026-09-05T10:00:00.000Z` рядом с правилом, показывает читателю
 * машинное время.
 *
 * Пороги приходят с сервера и здесь не подставляются числами: пять и десять
 * решены в `voice-learning.ts`, и вторая копия этих чисел на экране разошлась
 * бы с первой молча.
 */
export function mapLearning(
  response: unknown,
  locale: VoiceLocale
): {
  pending: number;
  rules: readonly LearnedRule[];
  minPairs: number;
  maxRules: number;
  canLearn: boolean;
  lastRunAt: string;
} {
  const envelope = asRecord(response);
  return {
    pending: asNumber(envelope.pending),
    rules: asArray(envelope.rules)
      .map((value) => {
        const rule = asRecord(value);
        return {
          id: asString(rule.id),
          text: asString(rule.text),
          learnedAt: formatVoiceDate(asString(rule.learnedAt), locale),
          pairs: asNumber(rule.pairs),
        };
      })
      .filter((rule) => rule.id && rule.text),
    minPairs: asNumber(envelope.minPairs),
    maxRules: asNumber(envelope.maxRules),
    canLearn: envelope.canLearn === true,
    lastRunAt: formatVoiceDate(asString(envelope.lastRunAt), locale),
  };
}
