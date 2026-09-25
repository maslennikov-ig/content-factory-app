/**
 * «Материала мало» (`content-factory-next-97dq.98`): when a written post is
 * clearly shorter than its channel expects, the page offers optional
 * questions under it. This file holds the rule and its storage; the prompt
 * lives in `channels/material-questions.v1.ts`.
 *
 * The rule runs on the server, right after an adaptation is written
 * (`PieceService.adapt`): the length the post was written to comes from
 * `channelLengthTarget` — the same reader the prompt uses for the post's own
 * length, «Короче / Длиннее» and the channel card — and the post is measured
 * by its visible characters, the same count as the editor's «N из M знаков»
 * (`stripInlineMarks`). `auto` length has no target and never triggers.
 *
 * Storage without a schema change, beside `postSettings`: one record per
 * channel under `ContentPiece.tags.materialAsks[integrationId]`, written under
 * the piece row lock like the post settings. `open` shows on the page while
 * the post it was asked for is the one shown; `dismissed` («Не нужно») and
 * `answered` never show again.
 */

import { createHash } from 'node:crypto';
import { stripInlineMarks } from '@contentfactory/helpers/utils/inline-marks';
import type {
  PieceMaterialAskV1,
  PieceQuestionV1,
} from '../brand-voice/voice-wiring.contract';
import { isInterviewAskKey } from '../brand-voice/voice-wiring.contract';

export const MATERIAL_ASKS_TAG = 'materialAsks';

/**
 * A post under this share of its minimum is short enough to ask. The owner's
 * case was 367 of 500 (73%); a post at 460 of 500 is a normal spread of the
 * writer, and asking there would be the nagging the owner ruled out.
 */
export const MATERIAL_SHORTFALL_RATIO = 0.9;

/** What a reader sees, in characters: bold marks and link addresses do not count. */
export const visiblePostLength = (text: string): number =>
  Array.from(stripInlineMarks(text || '').trim()).length;

/**
 * The shortfall of a post against the length it was written to, or `null`
 * when there is none worth a word: no target (`auto`, «длину держит
 * площадка»), an empty post, or a length at or above 90% of the minimum.
 */
export const materialShortfall = (
  text: string,
  target: { min: number } | null | undefined
): { length: number; min: number } | null => {
  const min = target?.min ?? 0;
  if (!Number.isFinite(min) || min <= 0) return null;
  const length = visiblePostLength(text);
  if (length === 0) return null;
  return length < min * MATERIAL_SHORTFALL_RATIO ? { length, min } : null;
};

export type MaterialAskStateV1 = 'open' | 'dismissed' | 'answered';

/** One channel's record in `tags.materialAsks`. */
export type MaterialAskRecordV1 = PieceMaterialAskV1 & {
  state: MaterialAskStateV1;
  /** The core the questions were asked about (`coreDigest`). */
  core: string;
  askedAt: string;
  closedAt: string | null;
};

/** A short fingerprint of the core: the questions are about this material. */
export const coreDigest = (text: string): string =>
  createHash('sha256').update((text || '').trim()).digest('hex').slice(0, 16);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readQuestion = (value: unknown): PieceQuestionV1 | null => {
  const record = asRecord(value);
  const question = typeof record.question === 'string' ? record.question.trim() : '';
  const why = typeof record.why === 'string' ? record.why.trim() : '';
  if (!isInterviewAskKey(record.key) || !question) return null;
  return { key: record.key, question, suggested: null, ...(why ? { why } : {}) };
};

/** This channel's record, read defensively; junk reads as none. */
export function materialAskRecordOf(
  tags: unknown,
  integrationId: string
): MaterialAskRecordV1 | null {
  const all = asRecord(asRecord(tags)[MATERIAL_ASKS_TAG]);
  if (!Object.prototype.hasOwnProperty.call(all, integrationId)) return null;
  const entry = asRecord(all[integrationId]);
  const state = entry.state;
  if (state !== 'open' && state !== 'dismissed' && state !== 'answered') return null;
  if (typeof entry.adaptationId !== 'string' || !entry.adaptationId) return null;
  const questions = (Array.isArray(entry.questions) ? entry.questions : [])
    .map(readQuestion)
    .filter((one): one is PieceQuestionV1 => one !== null);
  const length = Number(entry.length);
  const min = Number(entry.min);
  return {
    adaptationId: entry.adaptationId,
    length: Number.isFinite(length) ? length : 0,
    min: Number.isFinite(min) ? min : 0,
    questions,
    state,
    core: typeof entry.core === 'string' ? entry.core : '',
    askedAt: typeof entry.askedAt === 'string' ? entry.askedAt : '',
    closedAt: typeof entry.closedAt === 'string' ? entry.closedAt : null,
  };
}

/** What the page shows: an open record with questions, and nothing else. */
export function openMaterialAskOf(
  tags: unknown,
  integrationId: string
): PieceMaterialAskV1 | null {
  const record = materialAskRecordOf(tags, integrationId);
  if (!record || record.state !== 'open' || !record.questions.length) return null;
  return {
    adaptationId: record.adaptationId,
    length: record.length,
    min: record.min,
    questions: record.questions,
  };
}

/**
 * Whether a new post on this channel may be asked about. Once answered, the
 * channel is not asked again on this piece: the person gave what they had,
 * and asking again after the rewrite is the nagging the owner ruled out.
 * «Не нужно» holds while the core is the same; new material may be asked
 * about again.
 */
export function mayAskMaterial(
  record: MaterialAskRecordV1 | null,
  coreText: string
): boolean {
  if (!record) return true;
  if (record.state === 'answered') return false;
  if (record.state === 'dismissed') return record.core !== coreDigest(coreText);
  return true;
}

/** `tags` with this channel's record written in (or removed), every other key kept. */
export function withMaterialAsk(
  tags: unknown,
  integrationId: string,
  record: MaterialAskRecordV1 | null
): Record<string, unknown> {
  const bag = { ...asRecord(tags) };
  const all = { ...asRecord(bag[MATERIAL_ASKS_TAG]) };
  if (record) all[integrationId] = { ...record };
  else delete all[integrationId];
  if (Object.keys(all).length) bag[MATERIAL_ASKS_TAG] = all;
  else delete bag[MATERIAL_ASKS_TAG];
  return bag;
}
