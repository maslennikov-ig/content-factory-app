import type { IntakeCandidate } from './sample-intake';
import { truncateChars } from './text-truncate';

/**
 * Text out of a Telegram Desktop `result.json`.
 *
 * This path exists for the common case the other four miss: the channel is
 * theirs, but nothing was ever published through this product, so there are no
 * `Post` rows to read. The export is the only copy of how that person writes.
 *
 * Written here rather than carried over from the donor, whose right to
 * distribute is not established (`docs/research/content-intelligence-donor-audit.md`).
 *
 * Three things about the format decide the shape of this code.
 *
 * A channel export runs to hundreds of megabytes, so callers hand over a
 * parsed object or a string. All eligible messages are dated before selecting
 * the latest bounded set, regardless of the order in the export.
 *
 * `text` is either a string or an array mixing strings and `{type, text}`
 * entities. A reader that expects one shape drops every message containing a
 * link or a bold word — which is most of them.
 *
 * Everything that is not the author writing is discarded at the door:
 * forwards are someone else's words, service events are the client talking,
 * and a caption under a photo is usually a caption, not prose.
 */

export type TelegramMessage = {
  id?: number | string;
  type?: string;
  date?: string;
  from?: string;
  text?: unknown;
  forwarded_from?: string;
  photo?: unknown;
  file?: unknown;
  action?: string;
};

export type TelegramExport = {
  name?: string;
  type?: string;
  id?: number;
  messages?: TelegramMessage[];
};

/** A cap, not a guess: beyond this the person is importing an archive. */
export const MAX_MESSAGES = 300;

/** Shorter than this a message is a reaction, not writing. */
export const MIN_MESSAGE_CHARS = 120;

/**
 * Flattens Telegram's `text` field.
 *
 * Entities keep their visible text and lose their markup: a bold word is still
 * a word. A `link` entity keeps the text but not the href — the address is not
 * how someone writes, and it is exactly what the identity barrier strips later
 * anyway.
 */
export function flattenText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') {
        const entity = part as { type?: string; text?: unknown };
        if (entity.type === 'link' || entity.type === 'mention_name') {
          return typeof entity.text === 'string' ? entity.text : '';
        }
        return typeof entity.text === 'string' ? entity.text : '';
      }
      return '';
    })
    .join('');
}

const isAuthored = (message: TelegramMessage): boolean => {
  if (message.type && message.type !== 'message') return false;
  if (message.action) return false;
  // A forward is someone else's manner. Counting it teaches the profile a
  // voice the person never had.
  if (message.forwarded_from) return false;
  return true;
};

export type TelegramParseResult = {
  candidates: IntakeCandidate[];
  /** More eligible messages existed than the bounded selection can keep. */
  truncated: boolean;
  seen: number;
  eligible: number;
};

export function parseTelegramExport(
  input: TelegramExport | string,
  options: { maxMessages?: number; channel?: string } = {}
): TelegramParseResult {
  let parsed: TelegramExport;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as TelegramExport;
    } catch {
      // A truncated or hand-edited export is common. It is not a crash.
      return { candidates: [], truncated: false, seen: 0, eligible: 0 };
    }
  } else {
    parsed = input;
  }

  const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
  const limit = options.maxMessages ?? MAX_MESSAGES;
  const channel = options.channel ?? parsed?.name ?? 'telegram';
  const eligible = messages.flatMap((message, index) => {
    if (!message || typeof message !== 'object' || !isAuthored(message)) return [];
    const text = flattenText(message.text).trim();
    if (text.length < MIN_MESSAGE_CHARS) return [];
    const timestamp = Date.parse(message.date ?? '');
    return [{ message, text, index, timestamp: Number.isFinite(timestamp) ? timestamp : -Infinity }];
  });
  // A date wins over file order. Undated entries come last; ties keep later file entries first.
  eligible.sort((a, b) => (b.timestamp - a.timestamp) || b.index - a.index);
  const selected = eligible.slice(0, Math.max(0, Math.min(MAX_MESSAGES, Math.floor(limit) || 0)));
  const candidates: IntakeCandidate[] = selected.map(({ message, text, index }) => ({
    origin: 'TELEGRAM_EXPORT',
    title: truncateChars(text.split('\n')[0], 80) || `${channel} · ${message.id ?? index + 1}`,
    text,
    externalRef: message.id === undefined ? undefined : String(message.id),
  }));
  return { candidates, truncated: selected.length < eligible.length, seen: messages.length, eligible: eligible.length };
}
