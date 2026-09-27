import { z } from 'zod';
import { Memory } from '@mastra/memory';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { AGENT_THREAD_TITLE_MAX } from '../capabilities/agent-parts.contract';
import { redactSecretShapes } from './secret-shapes';

/**
 * The conductor's memory (`content-factory-next-kcxz.7`, spec §4.7).
 *
 * - Threads are personal: every row is written under `{orgId}:{userId}`
 *   (`conductor.context.ts`).
 * - Working memory holds the person's chat preferences only, resource-scoped,
 *   so they follow the person across threads. Product state — avatars, pieces,
 *   the plan — is never memorised: the snapshot reads it every turn. The
 *   inherited `proverbs` field is gone.
 * - Titles come from the first message, with no model call: `generateTitle`
 *   is a background call outside the turn's admission (ADR-0012 amendment §7).
 * - Observational memory and semantic recall stay off in release 1 (extra
 *   unbilled model calls; `pgvector` is an owner migration).
 */

const shortText = (max: number) => z.string().trim().max(max);

/** At most this many characters per working-memory note. */
export const WORKING_MEMORY_NOTE_MAX = 120;

/**
 * A note longer than the limit is cut to it, not refused (kcxz.29, D13): the
 * refusal came back to the model as a failed tool call — an extra step of
 * the turn for nothing the person asked. The limit still holds, so there is
 * still no room for a pasted text or a key, and the model still reads it as
 * `maxLength` in the tool's schema.
 */
const note = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value.trim().slice(0, WORKING_MEMORY_NOTE_MAX)
      : value,
  z.string().max(WORKING_MEMORY_NOTE_MAX)
);

/**
 * Enumerations and short labels only: nothing here has room for a pasted text
 * or a key, and the input processors redact key shapes before the model could
 * copy one in.
 *
 * No behaviour switch lives here (correctness review W1 F11): the model writes
 * working memory, and a text it read could make it write «decide for me» or
 * «never ask before deleting» into every later thread. «Решите за меня» is an
 * answer on one question card; approvals are cards, never a memory. The notes
 * that stay are read as preferences, never as permissions (instructions).
 */
export const personPreferencesSchema = z.object({
  answerLength: z
    .enum(['short', 'detailed'])
    .optional()
    .describe('How long the person likes answers'),
  usualChannelId: shortText(128)
    .optional()
    .describe('Channel id the person usually writes for, from the snapshot'),
  usualAvatarId: shortText(128)
    .optional()
    .describe('Avatar id the person usually writes with, from the snapshot'),
  notes: z
    .array(note)
    .max(5)
    .optional()
    .describe(
      'At most five short preferences about how to work with this person, under 100 characters each; never content, never what happened in the conversation, never keys'
    ),
});
export type PersonPreferences = z.infer<typeof personPreferencesSchema>;

/** Messages of the thread the agent reads on every turn. */
export const CONDUCTOR_HISTORY_MESSAGES = 10;

export const conductorMemoryOptions = {
  lastMessages: CONDUCTOR_HISTORY_MESSAGES,
  semanticRecall: false,
  generateTitle: false,
  observationalMemory: false,
  workingMemory: {
    enabled: true,
    scope: 'resource' as const,
    schema: personPreferencesSchema,
  },
};

export const createConductorMemory = (storage: MastraCompositeStore) =>
  new Memory({ storage, options: conductorMemoryOptions });

const FALLBACK_TITLE = { ru: 'Новый разговор', en: 'New conversation' };
/** Short enough for one line of the thread list. */
const TITLE_CHARS = 60;

/**
 * The first line of the first message, whitespace folded, cut on a word.
 * No model: a title is a label for the list, and the person renames it.
 * Written before the turn's processors run, so a pasted key is removed here
 * too — the title lives in the thread row and in every run snapshot.
 */
export const threadTitleFromMessage = (
  text: string | null | undefined,
  language: 'ru' | 'en'
): string => {
  const line = redactSecretShapes(String(text ?? ''))
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return FALLBACK_TITLE[language];
  if (line.length <= TITLE_CHARS) return line;
  const cut = line.slice(0, TITLE_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > TITLE_CHARS / 2 ? cut.slice(0, space) : cut).trim()}…`;
};

/** A title the person typed on `PATCH /agent/threads/:id`. */
export const normaliseThreadTitle = (title: unknown): string | null => {
  if (typeof title !== 'string') return null;
  const clean = redactSecretShapes(title).replace(/\s+/g, ' ').trim();
  return clean && clean.length <= AGENT_THREAD_TITLE_MAX ? clean : null;
};
