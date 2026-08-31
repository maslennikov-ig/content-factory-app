import { createHash } from 'node:crypto';
import { hasAiArtefacts } from './ai-artefacts';
import { countWords } from './segment';
import type { BrandVoiceLocale } from './brand-voice.types';
import { truncateChars } from './text-truncate';

/**
 * Turning something a person brought into a sample the analyser may count.
 *
 * Five ways in, one shape out. What matters is what happens between: the text
 * is scrubbed of secrets before it is stored rather than before it is read,
 * because a token that reaches the database has already leaked even if nothing
 * ever reads it back; and it is hashed after normalisation, because the same
 * post arriving twice — once from the workspace, once from a Telegram export —
 * must not count twice. A duplicate does not just inflate a total: it pulls
 * every corridor towards whatever happened to arrive twice.
 */

export type SampleOrigin =
  | 'OWN_POST'
  | 'TELEGRAM_EXPORT'
  | 'PASTE'
  | 'FILE'
  | 'SOURCE_SNAPSHOT';

export type SampleUsagePurpose = 'OWN_VOICE' | 'STYLE_REFERENCE';

export type SampleRightsState =
  | 'OWN_CONTENT'
  | 'RIGHTS_CONFIRMED'
  | 'RIGHTS_PENDING';

export type PreparedSample = {
  origin: SampleOrigin;
  usagePurpose: SampleUsagePurpose;
  title: string;
  text: string;
  contentHash: string;
  charCount: number;
  wordCount: number;
  language: BrandVoiceLocale;
  rightsState: SampleRightsState;
  sourceId?: string;
  postId?: string;
  externalRef?: string;
  /** What was removed on the way in, so nothing disappears unannounced. */
  redactions: { kind: 'SECRET'; count: number }[];
};

export type RejectedSample = {
  title: string;
  reason: 'EMPTY' | 'TOO_SHORT' | 'AI_ARTEFACT' | 'DUPLICATE' | 'UNREADABLE';
  detail?: string;
};

export type IntakeResult = {
  accepted: PreparedSample[];
  rejected: RejectedSample[];
};

/** Anything shorter is a fragment, not a sample of how someone writes. */
export const MIN_SAMPLE_CHARS = 200;

/** A single file or pasted block. Beyond this a person is importing a book. */
export const MAX_SAMPLE_CHARS = 200_000;

/**
 * Secrets, removed before storage.
 *
 * Drafts and private chats carry tokens constantly — a bot token pasted to a
 * colleague, an API key in a note to self. The corpus is a copy of somebody's
 * writing, and a copy that carries a live credential is a second place for it
 * to leak from. The value is replaced, never logged and never returned.
 */
const SECRET_PATTERNS: RegExp[] = [
  // Telegram bot token: digits, colon, 35 URL-safe characters.
  /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g,
  // Bearer and API-key style assignments.
  /\b(?:api[_-]?key|secret|token|password|passwd|pwd)\b\s*[:=]\s*\S{8,}/gi,
  // Common vendor prefixes.
  /\b(?:sk|pk|rk)-[A-Za-z0-9]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // Anything that looks like a private key block.
  /-----BEGIN[^-]{0,40}PRIVATE KEY-----[\s\S]*?-----END[^-]{0,40}PRIVATE KEY-----/g,
];

export const SECRET_PLACEHOLDER = '[секрет удалён]';

export function scrubSecrets(text: string): {
  text: string;
  removed: number;
} {
  let removed = 0;
  let output = text;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, () => {
      removed += 1;
      return SECRET_PLACEHOLDER;
    });
  }
  return { text: output, removed };
}

/**
 * Normalisation before hashing, and before counting.
 *
 * Quotation marks are deliberately left alone: `«»` against `""` is itself a
 * punctuation habit, and normalising it would erase part of what is being
 * measured.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[​﻿]/g, '')
    .replace(/(?<![-–—])--(?![-–—])/g, '—')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const hashText = (text: string): string =>
  createHash('sha256').update(normalizeText(text), 'utf8').digest('hex');

export type IntakeCandidate = {
  origin: SampleOrigin;
  title: string;
  text: string;
  language?: BrandVoiceLocale;
  sourceId?: string;
  postId?: string;
  externalRef?: string;
};

export type IntakeOptions = {
  usagePurpose: SampleUsagePurpose;
  rightsState: SampleRightsState;
  language?: BrandVoiceLocale;
  /** Hashes already in the corpus. The same text never joins it twice. */
  knownHashes?: Iterable<string>;
};

export function prepareSamples(
  candidates: readonly IntakeCandidate[],
  options: IntakeOptions
): IntakeResult {
  const seen = new Set(options.knownHashes ?? []);
  const accepted: PreparedSample[] = [];
  const rejected: RejectedSample[] = [];

  for (const candidate of candidates) {
    const trimmed = (candidate.text ?? '').trim();
    if (!trimmed) {
      rejected.push({ title: candidate.title, reason: 'EMPTY' });
      continue;
    }

    const { text: scrubbed, removed } = scrubSecrets(trimmed);
    const text = normalizeText(scrubbed).slice(0, MAX_SAMPLE_CHARS);

    if (text.length < MIN_SAMPLE_CHARS) {
      rejected.push({
        title: candidate.title,
        reason: 'TOO_SHORT',
        detail: `${text.length}/${MIN_SAMPLE_CHARS}`,
      });
      continue;
    }
    if (hasAiArtefacts(text)) {
      rejected.push({ title: candidate.title, reason: 'AI_ARTEFACT' });
      continue;
    }

    const contentHash = hashText(text);
    if (seen.has(contentHash)) {
      // Not an error and not silent: the same post can legitimately arrive by
      // two paths, and the person should see that it was already counted.
      rejected.push({ title: candidate.title, reason: 'DUPLICATE' });
      continue;
    }
    seen.add(contentHash);

    accepted.push({
      origin: candidate.origin,
      usagePurpose: options.usagePurpose,
      title: truncateChars(candidate.title, 200),
      text,
      contentHash,
      charCount: text.length,
      wordCount: countWords(text),
      language: candidate.language ?? options.language ?? 'ru',
      rightsState: options.rightsState,
      sourceId: candidate.sourceId,
      postId: candidate.postId,
      externalRef: candidate.externalRef,
      redactions: removed > 0 ? [{ kind: 'SECRET', count: removed }] : [],
    });
  }

  return { accepted, rejected };
}
