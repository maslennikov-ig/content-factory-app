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
  const statement = draft.statement.trim();
  return {
    // content-factory-next-fn33.57. Two fields the server insists on and a
    // person writing down what they know has no opinion about. The key is
    // filed from the statement when nobody typed one, and the value falls
    // back to the statement itself — the whole claim is the value when the
    // person did not split a number out of it. Both stay editable under
    // «Подробнее»; neither is a question the form asks first.
    claimKey: draft.claimKey.trim() || claimKeyFromStatement(statement),
    statement,
    language: draft.language,
    valueText: draft.valueText.trim() || statement,
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

/**
 * The words a sentence is built with rather than about
 * (content-factory-next-fn33.112).
 *
 * Short and deliberately dull: prepositions, conjunctions, particles,
 * pronouns and the auxiliary verbs of two languages. It is not morphology and
 * does not pretend to be — it only keeps the key from being filed under the
 * word a sentence happens to start with. Anything not on the list counts as
 * meaning something, which is the safe way round: a word wrongly kept makes a
 * clumsy topic, a word wrongly dropped loses the topic altogether.
 */
const FUNCTION_WORDS = new Set([
  // Russian: prepositions and conjunctions
  'в', 'во', 'на', 'над', 'под', 'перед', 'при', 'про', 'за', 'из', 'изо', 'к',
  'ко', 'о', 'об', 'обо', 'от', 'ото', 'по', 'до', 'для', 'без', 'с', 'со',
  'у', 'через', 'между', 'после', 'вместе', 'и', 'а', 'но', 'или', 'либо',
  'что', 'чтобы', 'как', 'если', 'когда', 'чем', 'то', 'также', 'тоже',
  // Russian: particles, pronouns, quantifiers
  'же', 'ли', 'бы', 'не', 'ни', 'вот', 'уже', 'ещё', 'еще', 'только', 'очень',
  'более', 'менее', 'этот', 'эта', 'это', 'эти', 'этом', 'этой', 'этого',
  'тот', 'та', 'те', 'том', 'той', 'того', 'весь', 'вся', 'всё', 'все', 'всех',
  'каждый', 'каждое', 'каждая', 'каждые', 'любой', 'наш', 'наша', 'наше',
  'наши', 'нашей', 'нашего', 'наших', 'нашим', 'свой', 'своя', 'своё', 'свои',
  'своей', 'своего', 'своих', 'мы', 'нас', 'нам', 'нами', 'я', 'меня', 'мне',
  'он', 'она', 'оно', 'они', 'его', 'её', 'ее', 'их', 'им', 'ему', 'ей',
  'вы', 'вас', 'вам', 'ваш', 'ваша', 'ваши', 'там', 'тут', 'здесь', 'где',
  // Russian: the verb of being and its neighbours
  'быть', 'был', 'была', 'было', 'были', 'есть', 'будет', 'будут',
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'from', 'by', 'with', 'without', 'into', 'over', 'under', 'after', 'before',
  'during', 'per', 'via', 'about', 'as', 'if', 'than', 'then', 'so', 'not',
  'no', 'all', 'every', 'each', 'any', 'some', 'this', 'that', 'these',
  'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have',
  'had', 'do', 'does', 'did', 'we', 'our', 'ours', 'you', 'your', 'they',
  'their', 'it', 'its', 'his', 'her', 'my', 'i',
]);

/**
 * A short, stable stamp of the claim itself.
 *
 * FNV-1a, six hex characters. Not a security thing and not a checksum: it is
 * there so a claim written entirely in function words still gets a key of its
 * own instead of colliding with every other such claim, and so the preview
 * under the field and the key that is saved agree on what it is.
 */
function shortStamp(text: string): string {
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

/** What a claim of nothing but function words is filed under. */
const UNNAMED_TOPIC = 'утверждение';

/**
 * The key nobody should have to invent (content-factory-next-fn33.57).
 *
 * `claimKey` is filing, not writing: `ContentFact` groups by it and the radar
 * turns its «тема» half into a topic name. The owner's decision of 01.09.2026
 * (`docs/product/content-section-map.md` §3, §4) takes the engineering
 * apparatus out of the interface, and an internal key with a shape rule is
 * exactly that. So it is filed from the words of the claim itself, and the
 * person stays free to type their own under «Подробнее».
 *
 * Which words: the first two or three that mean something. Taking them in the
 * order they were written — the first word as the topic — produced topics
 * called «В», «Наши» and «Редакция», and the radar offered them as three
 * subjects to write about (`content-factory-next-fn33.112`). Function words
 * and one-character words are skipped for that reason and no other: this is
 * not stemming, nothing here is language-aware beyond a list, and the same
 * sentence always files the same key.
 *
 * A claim made only of function words is filed under «утверждение» with a
 * stamp of its own text, so such claims sit together rather than each
 * inventing a topic. An empty string comes back when the statement carries no
 * letters or numbers at all — the caller then has nothing to save either,
 * because the statement is required.
 */
export function claimKeyFromStatement(statement: string): string {
  const words = statement
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  const meaningful = words.filter(
    (word) =>
      word.length > 1 &&
      !FUNCTION_WORDS.has(word) &&
      // A bare number is the value, not what the claim is about: «период_14»
      // and «период_30» are one attribute filed twice.
      !/^\p{N}+$/u.test(word)
  );
  if (!meaningful.length) return `${UNNAMED_TOPIC}|${shortStamp(statement)}`;
  const topic = meaningful[0].slice(0, 40);
  const attribute = (meaningful.slice(1, 3).join('_') || topic).slice(0, 60);
  return `${topic}|${attribute}`;
}

/**
 * What is wrong with a key somebody typed, not that something is
 * (content-factory-next-fn33.62).
 *
 * The field used to answer a rejected key by repeating, in red, the same
 * grey hint that was already under it — «Формат «тема|атрибут»» — which
 * names the target and never the obstacle. The one thing that actually
 * bites is a space, because words are how a person writes a topic; the
 * other is a missing `|`. Both are named separately so the sentence says
 * what to change.
 */
/**
 * A `yyyy-mm-dd` value read back in the order the person writes dates in
 * (content-factory-next-fn33.58).
 *
 * Formatted by hand rather than through `Intl`: the value is three numbers
 * with no time and no zone, and `new Date('2026-12-31')` is midnight UTC —
 * one `toLocaleDateString` west of Greenwich and the person is told the day
 * before the one they picked. A value that is not a plain date is handed
 * back untouched; inventing a reading of it would be worse than showing it.
 */
export function readableDate(value: string, locale: FactLanguage): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) return value;
  const [, year, month, day] = match;
  return locale === 'ru'
    ? `${day}.${month}.${year}`
    : `${month}/${day}/${year}`;
}

export type ClaimKeyIssue = 'spaces' | 'shape' | null;

export function claimKeyIssue(claimKey: string): ClaimKeyIssue {
  const value = claimKey.trim();
  if (!value) return null;
  if (CLAIM_KEY_PATTERN.test(value)) return null;
  if (/\s/u.test(value)) return 'spaces';
  return 'shape';
}

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
