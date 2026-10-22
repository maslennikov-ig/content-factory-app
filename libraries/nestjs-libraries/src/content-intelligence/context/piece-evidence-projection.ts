import { createHash } from 'node:crypto';
import { ContentContextError } from './content-context.errors';
import type { EvidenceCandidateV1, EvidenceProjectionV1, PieceEvidenceInputV1 } from './content-context.types';

/** Internal piece-adaptation policy. Other context consumers retain v1/v2 limits. */
export const PIECE_EVIDENCE_MAX_ITEMS = 16;
export const PIECE_EVIDENCE_MAX_CHARACTERS = 64_000;
const MAX_SPANS = 64;
const MAX_SOURCE_CHARACTERS = 8_000;
const MAX_BACKGROUND_CHARACTERS = 2_400;
const OMITTED = '\n[... source text omitted ...]\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const proofPreflightFailure = (reason: string): never => {
  const error = new ContentContextError('CONTENT_EVIDENCE_REQUIRED', 409, reason);
  Object.assign(error, { missingRequirements: [reason], unsupportedClaims: [] });
  throw error;
};

function invalidProjection(): never {
  throw new ContentContextError('CONTENT_CONTEXT_INVALIDATED', 409, 'The stored evidence projection no longer matches its source.');
}

/** Whitespace normalization retains a map back to literal UTF-16 source offsets. */
function normalizedWithOffsets(raw: string) {
  let text = '', pending = -1;
  const starts: number[] = [], ends: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(char)) continue;
    if (/\s/.test(char)) {
      if (text && pending < 0) pending = index;
      continue;
    }
    if (pending >= 0) {
      text += ' '; starts.push(pending); ends.push(index); pending = -1;
    }
    text += char; starts.push(index); ends.push(index + 1);
  }
  return { text, starts, ends };
}

function canonical(value: string | null | undefined) {
  try {
    const url = new URL(value || '');
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.search = ''; url.hash = ''; url.username = ''; url.password = '';
    return url.toString();
  } catch { return null; }
}

function merge(spans: EvidenceProjectionV1['spans']) {
  const result: EvidenceProjectionV1['spans'] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result[result.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else result.push({ ...span });
  }
  return result;
}

export function renderEvidenceProjection(raw: string, value: EvidenceProjectionV1) {
  if (!value || value.version !== 'evidence-projection/v1' || value.sourceHash !== hash(raw) ||
    !Array.isArray(value.spans) || !value.spans.length || value.spans.length > MAX_SPANS) return invalidProjection();
  let previousEnd = -1, characters = 0;
  for (const span of value.spans) {
    if (!span || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) ||
      span.start < 0 || span.start < previousEnd || span.end <= span.start || span.end > raw.length) return invalidProjection();
    previousEnd = span.end;
    characters += span.end - span.start;
  }
  if (characters > MAX_SOURCE_CHARACTERS) return invalidProjection();
  const literalSpans = value.spans.map(span => raw.slice(span.start, span.end).replace(controls, ''));
  return { excerpt: literalSpans.join(OMITTED), literalSpans };
}

/** Literal background windows are ranked against the whole core, including late topics. */
function backgroundWindow(raw: string, size: number, terms: Set<string>) {
  if (raw.length <= size) return { start: 0, end: raw.length };
  const tokens = (text: string) => text.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [];
  let best = { start: 0, end: Math.min(raw.length, size) }, score = -1;
  const stride = Math.max(1, Math.floor(size / 2));
  for (let start = 0; start < raw.length; start += stride) {
    const end = Math.min(raw.length, start + size);
    const matches = new Set(tokens(raw.slice(start, end)).filter(term => terms.has(term))).size;
    if (matches > score) { score = matches; best = { start, end }; }
  }
  return best;
}

/** Validate against the owned registry before any budget decision or snapshot write. */
export function packPieceEvidence(input: {
  organizationId: string;
  piece: PieceEvidenceInputV1;
  evidence: EvidenceCandidateV1[];
  requiredIds: string[];
  availableCharacters: number;
  admit: (item: EvidenceCandidateV1) => boolean;
}) {
  if (input.piece.version !== 'piece-evidence/v1' || typeof input.piece.core !== 'string' ||
    !Array.isArray(input.piece.quotes) || input.piece.quotes.length > 64 ||
    input.piece.quotes.some(item => !item || typeof item.evidenceId !== 'string' || !item.evidenceId ||
      typeof item.sourceUrl !== 'string' || typeof item.quote !== 'string')) {
    return proofPreflightFailure('The selected piece proof input exceeds its bounded contract.');
  }
  const ids = [...new Set([...input.requiredIds, ...input.piece.quotes.map(item => item.evidenceId)])].sort();
  if (ids.length > PIECE_EVIDENCE_MAX_ITEMS) return proofPreflightFailure(`The piece needs ${ids.length} sources; its proof limit is ${PIECE_EVIDENCE_MAX_ITEMS}.`);
  const selected: EvidenceCandidateV1[] = [];
  const projections = new Map<string, EvidenceProjectionV1>();
  const normalized = new Map<string, ReturnType<typeof normalizedWithOffsets>>();
  for (const id of ids) {
    const item = input.evidence.find(candidate => candidate.id === id);
    if (!item || item.organizationId !== input.organizationId || item.snapshot.organizationId !== input.organizationId || !input.admit(item)) {
      return proofPreflightFailure(`Selected source ${id} is unavailable or not admissible for this piece.`);
    }
    const raw = item.excerpt || '';
    if (!raw.trim() || raw.length > 256_000) return proofPreflightFailure(`Selected source ${id} has no bounded usable passage.`);
    selected.push(item);
    projections.set(id, { version: 'evidence-projection/v1', sourceHash: hash(raw), spans: [] });
    normalized.set(id, normalizedWithOffsets(raw));
  }
  for (const hint of input.piece.quotes) {
    const item = selected.find(candidate => candidate.id === hint.evidenceId);
    const source = normalized.get(hint.evidenceId);
    const quote = normalizedWithOffsets(typeof hint.quote === 'string' ? hint.quote : '').text;
    if (!item || !source || item.exposure === 'INTERNAL_ONLY' || !canonical(hint.sourceUrl) || canonical(hint.sourceUrl) !== canonical(item.snapshot.finalCanonicalUrl) || !quote) {
      return proofPreflightFailure(`The selected quote for ${hint.evidenceId} does not match its source identity.`);
    }
    const offset = source.text.indexOf(quote);
    if (offset < 0) return proofPreflightFailure(`The selected quote for ${hint.evidenceId} is absent from the actual source passage.`);
    // A page copied into both statement and quote is background material.
    // A semantic claim's literal quote remains mandatory at any supported length.
    if (quote === source.text && quote.length > 1_024 &&
      normalizedWithOffsets(typeof hint.statement === 'string' ? hint.statement : '').text === quote) continue;
    projections.get(hint.evidenceId)!.spans.push({ start: source.starts[offset], end: source.ends[offset + quote.length - 1] });
  }
  const terms = new Set(input.piece.core.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || []);
  const sizeOf = (item: EvidenceCandidateV1, spans: EvidenceProjectionV1['spans']) => {
    const merged = merge(spans);
    if (merged.length > MAX_SPANS || merged.reduce((n, span) => n + span.end - span.start, 0) > MAX_SOURCE_CHARACTERS) {
      return proofPreflightFailure(`The essential quotes for ${item.id} exceed the bounded source proof limit.`);
    }
    return { projection: { ...projections.get(item.id)!, spans: merged },
      size: merged.length ? merged.reduce((n, span) => n + (item.excerpt || '').slice(span.start, span.end).replace(controls, '').length, 0) + (merged.length - 1) * OMITTED.length : 0 };
  };
  // After validating every selected proof, keep its surrounding qualifications
  // whenever the complete corpus fits both the existing source cap and budget.
  const fullCharacters = selected.reduce((n, item) => n + item.excerpt!.replace(controls, '').length, 0);
  if (selected.every(item => item.excerpt!.length <= MAX_SOURCE_CHARACTERS) &&
    fullCharacters <= input.availableCharacters) {
    for (const item of selected) {
      projections.set(item.id, { ...projections.get(item.id)!, spans: [{ start: 0, end: item.excerpt!.length }] });
    }
    return { selected, projections };
  }
  let used = 0;
  for (const item of selected) {
    const projection = projections.get(item.id)!;
    if (!projection.spans.length) projection.spans.push(backgroundWindow(item.excerpt!, 160, terms));
    const packed = sizeOf(item, projection.spans);
    projections.set(item.id, packed.projection); used += packed.size;
  }
  if (used > input.availableCharacters) return proofPreflightFailure(`Essential source proof needs ${used} characters; only ${Math.max(0, input.availableCharacters)} remain after the voice and selected facts.`);
  // One fair, bounded expansion per source; full pages never monopolize the pack.
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index], current = sizeOf(item, projections.get(item.id)!.spans);
    const fairExtra = Math.floor((input.availableCharacters - used) / (selected.length - index));
    // Existing essential spans have already paid for part of a short page.
    // Keep the complete page when it fits this source's fair remaining share.
    const fullPageFits = item.excerpt!.length <= Math.min(MAX_BACKGROUND_CHARACTERS, current.size + fairExtra);
    const windowSize = fullPageFits ? item.excerpt!.length : Math.min(MAX_BACKGROUND_CHARACTERS, Math.max(160, fairExtra));
    const expandedSpans = merge([...current.projection.spans, backgroundWindow(item.excerpt!, windowSize, terms)]);
    if (expandedSpans.length > MAX_SPANS || expandedSpans.reduce((n, span) => n + span.end - span.start, 0) > MAX_SOURCE_CHARACTERS) continue;
    const expanded = sizeOf(item, expandedSpans);
    if (used - current.size + expanded.size <= input.availableCharacters) {
      projections.set(item.id, expanded.projection); used += expanded.size - current.size;
    }
  }
  return { selected, projections };
}
