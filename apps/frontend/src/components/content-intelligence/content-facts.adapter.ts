import {
  failureNotice,
  jsonReader,
  readFailure,
  screenState,
  type MaterialFailure,
} from '../brand-voice/voice-materials.adapter';

/**
 * The door `CreateContentFactDto` never had on this side of the wire.
 *
 * `POST /content-intelligence/facts` and `GET /content-intelligence/facts`
 * existed before this file did — the fact catalogue, its service and its
 * repository were built for `BriefFactV1.factId` to point at, and nothing in
 * the interface ever wrote to it. A brief could cite a fact only by pasting a
 * URL; the half of working memory that is "this was checked and entered
 * deliberately" had no door.
 *
 * The refusal reading is not reinvented here. `voice-materials.adapter.ts`
 * already turns a `{ code, message }` body into a sentence and a screen state,
 * and the fact catalogue answers on the same controller, guarded by the same
 * `aiCreate` policy as everything else under `/content-intelligence`. A second
 * table of what a 403 or a 422 means is how two surfaces of one section start
 * disagreeing about it.
 *
 * Linking evidence to a fact (`POST /facts/:factId/evidence`) is deliberately
 * left for its own door. A fact is a claim; evidence is what checks it, and the
 * two have different owners in the data model — `LinkContentFactEvidenceDto`
 * takes an existing `evidenceId` from the source pipeline, which nothing on
 * this screen produces yet. Creating a fact and grounding a brief in it does
 * not need evidence at all: `groundedBrief` only asks whether the id exists in
 * this workspace and is not `TOMBSTONED`, `RETRACTED` or `SUPERSEDED` — a freshly
 * created fact, `UNVERIFIED`, already clears that bar.
 */

export { failureNotice, jsonReader, readFailure, screenState };
export type FactFailure = MaterialFailure;

export const FACTS_API = '/content-intelligence/facts';

export type FactLanguage = 'ru' | 'en';
export type FactTemporalKind = 'CURRENT' | 'DATED' | 'TIMELESS';

/**
 * `ContentFact.status` is a plain `String` column, not an enum, so this list
 * is what the product happens to write today rather than what the database
 * permits. A status this list does not know is therefore a real possibility,
 * and it is shown as it arrived — relabelling it to the nearest known value
 * would put a reassuring word on a row nobody here can vouch for.
 */
export const KNOWN_FACT_STATUSES = [
  'UNVERIFIED',
  'VERIFIED',
  'CONFLICTED',
  'STALE',
  'TOMBSTONED',
  'RETRACTED',
  'SUPERSEDED',
] as const;

export type KnownFactStatus = (typeof KNOWN_FACT_STATUSES)[number];
export type FactStatus = KnownFactStatus | (string & {});

/**
 * The three the brief refuses, mirrored from `UNUSABLE_FACT_STATUSES` in
 * `content-brief.service.ts` and tied to it by test.
 *
 * `listFacts` filters only `TOMBSTONED`, so the other two reach this list.
 * A row carrying one of them holds an id `groundedBrief` will answer
 * `BRIEF_FACT_UNGROUNDED` for, and offering it beside the usable ones with
 * nothing said is how a person ends up pasting an id that cannot work and
 * reading a refusal that names no reason they can see.
 */
export const UNUSABLE_FACT_STATUSES = [
  'TOMBSTONED',
  'RETRACTED',
  'SUPERSEDED',
] as const;

export const isUsableFact = (status: FactStatus): boolean =>
  !(UNUSABLE_FACT_STATUSES as readonly string[]).includes(status);

export type FactEvidenceRow = Readonly<{
  evidenceId: string;
  stance: 'SUPPORTS' | 'CONTRADICTS';
  reviewStatus: 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
  title: string;
  sourceState: 'AVAILABLE' | 'SOURCE_REMOVED';
  freshUntil: string | null;
}>;

/**
 * The three ways of standing behind a claim, in the words the witness screen
 * (`content-factory-next-odb8.1`) uses for them rather than the database's:
 * «ваше слово», «ваш материал», «найдено поиском». `SEARCH_RESULT` is real —
 * `ContentFactService` already computes it — even though nothing produces a
 * `SEARCH_PROVIDER_RESULT` snapshot yet (`content-factory-next-lh5s`), so a
 * workspace sees only the first two today. That gap is not hidden here: a
 * row this reader does not recognise still carries a method, never a blank.
 */
export const GROUNDING_METHODS = [
  'OWN_WORD',
  'OWN_MATERIAL',
  'SEARCH_RESULT',
] as const;
export type GroundingMethod = (typeof GROUNDING_METHODS)[number];

export type FactGrounding = Readonly<{
  method: GroundingMethod;
  evidenceId: string | null;
  excerpt: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
}>;

/** One row of the catalogue, read back the shape `ContentFactService.listFacts` answers in. */
export type FactRow = Readonly<{
  id: string;
  claimKey: string;
  topic: string;
  topicLabel: string;
  statement: string;
  language: FactLanguage;
  temporalKind: FactTemporalKind;
  freshUntil: string | null;
  status: FactStatus;
  supersedesFactId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdByName: string | null;
  grounding: FactGrounding;
  /**
   * True only for a still-pending «найдено поиском» row (`content-factory-
   * next-tyrk`): grounded in a search result whose link or assessment is not
   * yet accepted. The witness screen offers «Подтвердить» only here — every
   * other row keeps the two actions the map document settled on (§8.2).
   */
  needsLook: boolean;
  evidence: readonly FactEvidenceRow[];
}>;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const asText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const asNullableText = (value: unknown) =>
  typeof value === 'string' ? value : null;

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => {
  const candidate = asText(value) as T;
  return allowed.includes(candidate) ? candidate : fallback;
};

const asNullableNumberText = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null;

const asBoolean = (value: unknown) => value === true;

const readGrounding = (value: unknown): FactGrounding => {
  const grounding = asRecord(value);
  return {
    method: oneOf(grounding.method, GROUNDING_METHODS, 'OWN_WORD'),
    evidenceId: asNullableText(grounding.evidenceId),
    excerpt: asNullableText(grounding.excerpt),
    sourceLabel: asNullableText(grounding.sourceLabel),
    sourceUrl: asNullableText(grounding.sourceUrl),
    observedAt: asNullableNumberText(grounding.observedAt),
  };
};

/** `GET /content-intelligence/facts`, read defensively. */
export function readFactsEnvelope(value: unknown): readonly FactRow[] {
  const body = asRecord(value);
  return asArray(body.facts).map((entry) => {
    const fact = asRecord(entry);
    return {
      id: asText(fact.id),
      claimKey: asText(fact.claimKey),
      topic: asText(fact.topic),
      topicLabel: asText(fact.topicLabel),
      statement: asText(fact.statement),
      language: oneOf(fact.language, ['ru', 'en'], 'en'),
      temporalKind: oneOf(
        fact.temporalKind,
        ['CURRENT', 'DATED', 'TIMELESS'],
        'TIMELESS'
      ),
      freshUntil: asNullableText(fact.freshUntil),
      // Carried through verbatim rather than narrowed to a known value: see
      // `KNOWN_FACT_STATUSES`. The screen labels what it recognises and
      // prints the rest as it came.
      status: asText(fact.status, 'UNVERIFIED'),
      supersedesFactId: asNullableText(fact.supersedesFactId),
      createdAt: asNullableNumberText(fact.createdAt),
      updatedAt: asNullableNumberText(fact.updatedAt),
      createdByName: asNullableText(fact.createdByName),
      grounding: readGrounding(fact.grounding),
      needsLook: asBoolean(fact.needsLook),
      evidence: asArray(fact.evidence).map((row) => {
        const evidence = asRecord(row);
        return {
          evidenceId: asText(evidence.evidenceId),
          stance: oneOf(evidence.stance, ['SUPPORTS', 'CONTRADICTS'], 'SUPPORTS'),
          reviewStatus: oneOf(
            evidence.reviewStatus,
            ['PROPOSED', 'ACCEPTED', 'REJECTED'],
            'PROPOSED'
          ),
          title: asText(evidence.title, 'Untitled source'),
          sourceState: oneOf(
            evidence.sourceState,
            ['AVAILABLE', 'SOURCE_REMOVED'],
            'AVAILABLE'
          ),
          freshUntil: asNullableText(evidence.freshUntil),
        } satisfies FactEvidenceRow;
      }),
    } satisfies FactRow;
  });
}

/**
 * What the form is holding, as typed.
 *
 * `claimKey` stays one field rather than two ("topic" and "attribute") joined
 * behind the scenes: `CreateContentFactDto` validates it as one string against
 * `^[\p{L}\p{N}_.:-]+\|[\p{L}\p{N}_.:-]+$`, and a client-side join would have to
 * guess at exactly that pattern a second time. The helper text under the field
 * states the shape once; the server is still where it is checked.
 */
export type FactDraft = {
  claimKey: string;
  statement: string;
  language: FactLanguage;
  valueText: string;
  temporalKind: FactTemporalKind;
  effectiveFrom: string;
  effectiveTo: string;
  freshUntil: string;
};

export const emptyFactDraft = (language: FactLanguage): FactDraft => ({
  claimKey: '',
  statement: '',
  language,
  valueText: '',
  temporalKind: 'TIMELESS',
  effectiveFrom: '',
  effectiveTo: '',
  freshUntil: '',
});

/**
 * `CreateContentFactDto`, built from the form.
 *
 * Optional dates are dropped rather than sent as `''`: `@IsDateString()` on the
 * DTO rejects an empty string as an invalid date, turning a field nobody filled
 * in into a 400 the person typing has no way to connect to "dates" at all.
 */
export function buildFactCreatePayload(draft: FactDraft) {
  const dateOrUndefined = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    claimKey: draft.claimKey.trim(),
    statement: draft.statement.trim(),
    language: draft.language,
    valueText: draft.valueText.trim(),
    temporalKind: draft.temporalKind,
    ...(dateOrUndefined(draft.effectiveFrom)
      ? { effectiveFrom: dateOrUndefined(draft.effectiveFrom) }
      : {}),
    ...(dateOrUndefined(draft.effectiveTo)
      ? { effectiveTo: dateOrUndefined(draft.effectiveTo) }
      : {}),
    ...(dateOrUndefined(draft.freshUntil)
      ? { freshUntil: dateOrUndefined(draft.freshUntil) }
      : {}),
  };
}

/** The one thing a claim key must look like, mirrored from the DTO for the hint under the field. */
export const CLAIM_KEY_PATTERN = /^[\p{L}\p{N}_.:-]+\|[\p{L}\p{N}_.:-]+$/u;

/* -------------------------------------------------------------------------
 * The witness screen's actions (`content-factory-next-odb8.1`, `content-
 * factory-next-tyrk`): СНЯТЬ, КОПИРОВАТЬ И ПОПРАВИТЬ, and «Подтвердить» for a
 * still-pending «найдено поиском» row. Routes only — the reader and the
 * create payload builder above are reused as-is; nothing about a fact's
 * shape changes because the screen showing it is new.
 * ---------------------------------------------------------------------- */

const factAction = (factId: string, action: 'retract' | 'restore' | 'copy') =>
  `${FACTS_API}/${encodeURIComponent(factId)}/${action}`;

export const retractFactUrl = (factId: string) => factAction(factId, 'retract');
export const restoreFactUrl = (factId: string) => factAction(factId, 'restore');
export const copyFactUrl = (factId: string) => factAction(factId, 'copy');

/** «Подтвердить»: `POST /content-intelligence/facts/:factId/evidence/:evidenceId/confirm`. */
export const confirmEvidenceUrl = (factId: string, evidenceId: string) =>
  `${FACTS_API}/${encodeURIComponent(factId)}/evidence/${encodeURIComponent(
    evidenceId
  )}/confirm`;

/**
 * What the copy dialog is holding, as typed.
 *
 * Only the statement is edited on screen (`Facts.dc.html`, screen 23); the
 * claim key, language, temporal kind and lifecycle dates travel with the
 * fact being copied and are decided server-side, in
 * `ContentFactService.copyFact` — not retyped here, so there is nowhere for
 * the interface to disagree with the server about which fields carry over.
 */
export type FactCopyDraft = {
  statement: string;
  groundedIn: 'OWN_WORD' | 'EVIDENCE';
  evidenceId: string;
};

export const emptyFactCopyDraft = (statement: string): FactCopyDraft => ({
  statement,
  groundedIn: 'OWN_WORD',
  evidenceId: '',
});

/**
 * `CopyContentFactDto`, built from the dialog.
 *
 * `evidenceId` is sent only for the "point at another confirmation" branch;
 * the "this is my word" branch sends none, which is exactly what leaves a
 * freshly copied fact ungrounded until somebody grounds it on purpose — the
 * one behaviour this whole screen exists to guarantee.
 */
export function buildFactCopyPayload(draft: FactCopyDraft) {
  const statement = draft.statement.trim();
  const evidenceId = draft.evidenceId.trim();
  return {
    statement,
    ...(draft.groundedIn === 'EVIDENCE' && evidenceId
      ? { evidenceId, stance: 'SUPPORTS' as const }
      : {}),
  };
}
