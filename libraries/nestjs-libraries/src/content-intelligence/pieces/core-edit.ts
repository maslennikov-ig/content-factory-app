/**
 * The piece's core after it was written: edited by hand, fed more material,
 * rebuilt on request (`content-factory-next-97dq.75`, thirteenth walk,
 * «overall»).
 *
 * Owner: «возможность редактировать заготовку, чтобы туда можно было что-то
 * добавить, дописать». Three moves, and none of them regenerates anything by
 * itself:
 *
 *  - **edit** — the author's text replaces the core; the replaced text goes
 *    into `revisions`, so the history of the core is kept, not overwritten;
 *  - **add material** — the author's words are appended to `personText`
 *    (every core-write path reads it) and recorded in `addedMaterial`; the
 *    piece is marked `materialPending` until the author asks for a rebuild;
 *  - **rebuild** — «Пересобрать суть» runs the existing core-write path over
 *    the enlarged material. Only that button spends a model call.
 *
 * Storage without a schema change: all of it lives in `ContentPiece.brief`
 * next to the core, like the answers and the questions.
 */

import type {
  PieceAddedMaterialV1,
  PieceCoreRevisionV1,
  ZagotovkaCoreV1,
} from '../brand-voice/voice-wiring.contract';

/** The longest core the author may save by hand. */
export const PIECE_CORE_EDIT_MAX = 20_000;

/** The longest piece of material one «Дописать материал» adds. */
export const PIECE_MATERIAL_APPEND_MAX = 10_000;

/** How many replaced core texts the piece keeps. */
export const PIECE_CORE_REVISIONS_MAX = 20;

/**
 * Autosaves of one editing session are one revision (`97dq.75` review P2-4):
 * a hand-edited core saved again within this window replaces the author's
 * own draft without recording it, so typing never pushes the original out.
 */
export const PIECE_CORE_EDIT_SESSION_MS = 10 * 60 * 1000;

/** How many times material may be added, and how long the author's words may grow (P3-16). */
export const PIECE_ADDED_MATERIAL_MAX = 50;
export const PIECE_PERSON_TEXT_MAX = 60_000;

const isoOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && Number.isFinite(new Date(value).getTime())
    ? value
    : fallback;

/** Added material, read defensively. */
export function readAddedMaterial(value: unknown): PieceAddedMaterialV1[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record =
      entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
    if (!record || typeof record.text !== 'string' || !record.text.trim()) return [];
    return [
      {
        text: record.text,
        addedAt: isoOr(record.addedAt, new Date(0).toISOString()),
      },
    ];
  });
}

/** Replaced core texts, read defensively. */
export function readCoreRevisions(value: unknown): PieceCoreRevisionV1[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record =
      entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
    if (!record || typeof record.text !== 'string') return [];
    const writtenBy =
      record.writtenBy === 'person' || record.writtenBy === 'fallback'
        ? record.writtenBy
        : 'model';
    return [
      {
        text: record.text,
        writtenBy,
        replacedAt: isoOr(record.replacedAt, new Date(0).toISOString()),
        ...(typeof record.materialPending === 'boolean'
          ? { materialPending: record.materialPending }
          : {}),
      },
    ];
  });
}

/** Who wrote the core that is about to be replaced. */
export const coreAuthorOf = (
  core: Pick<ZagotovkaCoreV1, 'writtenBy' | 'editedBy'>
): PieceCoreRevisionV1['writtenBy'] =>
  core.editedBy === 'person' ? 'person' : core.writtenBy;

/** `revisions` with the replaced text added, the oldest dropped past the bound. */
export function withRevision(
  revisions: readonly PieceCoreRevisionV1[] | undefined,
  replaced: {
    text: string;
    writtenBy: PieceCoreRevisionV1['writtenBy'];
    materialPending?: boolean;
  },
  at: string
): PieceCoreRevisionV1[] {
  const list = [...(revisions ?? [])];
  if (replaced.text.trim())
    list.push({
      text: replaced.text,
      writtenBy: replaced.writtenBy,
      replacedAt: at,
      ...(typeof replaced.materialPending === 'boolean'
        ? { materialPending: replaced.materialPending }
        : {}),
    });
  if (list.length <= PIECE_CORE_REVISIONS_MAX) return list;
  // The first text is the one the piece was born with: it is never evicted.
  return [list[0], ...list.slice(-(PIECE_CORE_REVISIONS_MAX - 1))];
}

/**
 * Whether the added material is still waiting once a stored text is the core
 * again (review of 97dq.81-85, P2-2).
 *
 * The cnt-35 flow: material added, the core rebuilt, the author disliked the
 * result and restored the text from before. That text never read the added
 * words, so «суть ещё не учитывает дописанное» must come back.
 *
 * - The wait the text had when it was replaced comes back with it.
 * - Material added after it was replaced is not in it either.
 * - A revision stored before `materialPending` was recorded is judged by
 *   when it became the core: the `replacedAt` of the revision before it (the
 *   first text is older than any material). With a gap in the history (older
 *   revisions evicted, one editing session saved as one revision) that
 *   moment reads earlier than it was, so the answer errs towards «still
 *   waiting» — it only invites a rebuild the author may skip.
 */
export function restoredMaterialPending(
  revisions: readonly PieceCoreRevisionV1[],
  index: number,
  added: readonly PieceAddedMaterialV1[]
): boolean {
  const chosen = revisions[index];
  if (!chosen || !added.length) return false;
  const time = (iso: string): number => {
    const at = new Date(iso).getTime();
    return Number.isFinite(at) ? at : 0;
  };
  const addedAfter = (moment: number) =>
    added.some((entry) => time(entry.addedAt) > moment);
  if (typeof chosen.materialPending === 'boolean')
    return chosen.materialPending || addedAfter(time(chosen.replacedAt));
  const became = index > 0 ? time(revisions[index - 1].replacedAt) : 0;
  return addedAfter(became);
}

/**
 * Whether a hand edit starts a new revision: not when it continues the
 * author's own editing session (P2-4).
 */
export function editStartsRevision(
  core: Pick<ZagotovkaCoreV1, 'editedBy' | 'editedAt'>,
  now: Date
): boolean {
  if (core.editedBy !== 'person' || !core.editedAt) return true;
  const at = new Date(core.editedAt).getTime();
  return !Number.isFinite(at) || now.getTime() - at >= PIECE_CORE_EDIT_SESSION_MS;
}

/** The author's words with the new material after a blank line. */
export function appendedPersonText(
  personText: string | undefined,
  added: string
): string {
  const before = (personText ?? '').trimEnd();
  const text = added.trim();
  return before ? `${before}\n\n${text}` : text;
}

/**
 * The author's words as they were before any «Дописать материал»
 * (`97dq.85`): `appendedPersonText` put each added piece after a blank line,
 * so the tail is peeled off newest first. A tail that does not match (the
 * words were stored before the record) is left in place.
 */
export function personTextWithoutAdded(
  personText: string | undefined,
  added: readonly string[]
): string {
  let rest = (personText ?? '').trimEnd();
  for (const piece of [...added].reverse()) {
    const text = piece.trim();
    if (!text) break;
    /*
      Review of 97dq.81-85, P3-5: `appendedPersonText` always puts a blank
      line before the added words, so a tail is peeled only on that
      boundary (or when it is all there is). A tail that merely ends the same
      way — «…да» with an added «да» — is the author's own text and stays.
    */
    if (rest === text) {
      rest = '';
      continue;
    }
    if (!rest.endsWith(`\n\n${text}`)) break;
    rest = rest.slice(0, rest.length - text.length).trimEnd();
  }
  return rest;
}

/** The edited core as the author typed it: line ends normalised, outer blanks dropped. */
export const editedCoreText = (text: string): string =>
  (text || '').replace(/\r\n?/gu, '\n').trim();
