/**
 * Who the post is for, as the workspace avatar knows it
 * (`content-factory-next-97dq.54`).
 *
 * When the brief model leaves `audience` open, the service fills it from the
 * avatar's first `project.audiences` item (`origin: 'avatar'`). The live stand
 * of 23.09.2026 showed what that item can hold: the voice calibration's
 * AUDIENCE line, which describes how the author speaks to readers — «Автор
 * обращается к подписчикам напрямую, преимущественно на «вы»: «Друзья,
 * привет!»…» — split into a 120-character `name` and the full `need`, and
 * joined back as «name — need», the same sentence twice. The brief's
 * audience read as junk until the person answered.
 *
 * So the brief takes only a reader: a short label of who reads. The one line
 * split into `name` and `need` is read once; the placeholder a first voice
 * activation writes is no audience; a description of how the author
 * addresses people (quotes, «обращается», «на „вы“», «addresses») or a long
 * several-sentence text is no audience either. Anything else is left open,
 * and the interview asks the person — which is what an open field is for.
 */

/** What an empty voice profile writes so its form validates; not a reader. */
const PLACEHOLDERS = new Set(['аудитория организации', 'organization audience']);

/** The longest label that still reads as «who reads», not a description. */
export const AVATAR_AUDIENCE_MAX_CHARS = 160;

const ADDRESS_DESCRIPTION =
  /обращ|на\s*[«"„]?\s*(?:вы|ты)\b|[«»„“”"]|\baddress(?:es|ing)?\b|\bspeaks?\s+to\b|\bon\s+first-name\b/iu;

const clean = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';

/** The one line the avatar keeps for an audience item, read once. */
export function avatarAudienceLine(item: unknown): string {
  const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
  const name = clean(record.name);
  const need = clean(record.need);
  // One written line split into a label and its sentence (`voice.service`).
  if (name && need && need.startsWith(name.replace(/…$/u, ''))) return need;
  return [name, need].filter(Boolean).join(' — ');
}

/** A reader the brief may take, or `null` — leave the field open. */
export function avatarReader(item: unknown): string | null {
  const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
  const name = clean(record.name);
  if (PLACEHOLDERS.has(name.toLowerCase())) return null;
  const line = avatarAudienceLine(item);
  if (!line) return null;
  if (line.length > AVATAR_AUDIENCE_MAX_CHARS) return null;
  if (ADDRESS_DESCRIPTION.test(line)) return null;
  // More than one sentence is a description, not a label.
  if (/[.!?…]\s+\p{Lu}/u.test(line)) return null;
  return line;
}
