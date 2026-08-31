import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  MATERIALS_API_BASE,
  VOICE_ERROR_CODES,
  type MaterialDraftResponseV1,
  type MaterialRecutPreviewV1,
  type MaterialsResponseV1,
  type VoiceErrorCode,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { RecutPlatform } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut';
// A type, and only a type: the editor's own channel shape, so this file hands
// it exactly what it already expects instead of a lookalike.
import type { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';

/**
 * Everything the Material tab decides, kept out of the component that renders it.
 *
 * The screen was accepted in `36r` and is not redrawn here. What was missing
 * was the wire, and a wire has decisions in it: which identifier travels, what
 * a refusal reads like, what "already fits this platform" is allowed to claim,
 * and what the editor is handed. Each of those is a function here, so it can be
 * checked as arithmetic rather than inferred from a rendering.
 *
 * The one rule the whole file exists to keep: nothing on this surface reaches a
 * platform. The recut prepares text, the draft is a post in `DRAFT`, and it is
 * published by the ordinary path — `docs/product/migration-map.md` says so, and
 * `voice-wiring.contract.ts` repeats it.
 */

dayjs.extend(utc);

export const MATERIALS_API = MATERIALS_API_BASE;

export type MaterialAction = 'derivations' | 'recut-preview' | 'draft';

export const materialEndpoint = (id: string, action?: MaterialAction) =>
  `${MATERIALS_API}/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;

/**
 * The post the draft became, read back through the product's own route.
 *
 * `GET /posts/:id` answers in the same envelope as `GET /posts/group/:group`,
 * which is what the calendar hands its editor. One request instead of two, and
 * the same shape at the end of it.
 */
export const postEndpoint = (postId: string) =>
  `/posts/${encodeURIComponent(postId)}`;

/**
 * The platform the panel opens on.
 *
 * The first of the four the screen offers, and the person changes it in one
 * click. Guessing from the workspace's channels would be a better guess and a
 * worse explanation: the panel would open on something nobody chose.
 */
export const DEFAULT_RECUT_PLATFORM: RecutPlatform = 'site';

/* -------------------------------------------------------------------------
 * Requests
 * ---------------------------------------------------------------------- */

type Request = (path: string, init?: RequestInit) => Promise<Response>;

export type JsonReader = (path: string, init?: RequestInit) => Promise<any>;

/**
 * A reader that keeps the server's own words.
 *
 * `safeHttpError` on the controller puts `{ code, message }` on the wire
 * exactly so the screen can print them. Throwing a bare status here would
 * discard the only part of a refusal a person can act on.
 */
export const jsonReader =
  (request: Request): JsonReader =>
  async (path, init) => {
    const response = await request(path, init);
    if (response.ok) {
      return response.status === 204 ? null : response.json();
    }
    const body = await response.json().catch(() => null);
    const error = new Error(
      (body && typeof body.message === 'string' && body.message) ||
        `Material request failed: ${response.status}`
    );
    return Promise.reject(
      Object.assign(error, {
        status: response.status,
        code: body && typeof body.code === 'string' ? body.code : undefined,
        subject:
          body && typeof body.subject === 'string' ? body.subject : undefined,
      })
    );
  };

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

export type MaterialFailure = {
  code: VoiceErrorCode | null;
  message: string;
  /** `restricted` is a state a member stays in, not a thing that went wrong. */
  screenState: 'error' | 'restricted';
  /**
   * The thing the refusal names, when it names one — a sample, a version, a
   * scale, or (`BRIEF_FACT_UNGROUNDED`) the statement of the fact that did not
   * check out. Carried through rather than dropped: a brief holding several
   * facts at once needs to say which one failed, not just that one did.
   */
  subject?: string;
};

const isKnownCode = (value: unknown): value is VoiceErrorCode =>
  typeof value === 'string' && value in VOICE_ERROR_CODES;

export const readFailure = (
  error: unknown,
  fallback: string
): MaterialFailure => {
  const carried = (error || {}) as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    subject?: unknown;
  };
  const code = isKnownCode(carried.code) ? carried.code : null;
  // Only the server's own sentence is printed. "socket hang up" is a fact
  // about a socket, and putting it where an explanation goes tells a person
  // nothing they can do anything with.
  const message =
    typeof carried.status === 'number' &&
    typeof carried.message === 'string' &&
    carried.message.trim()
      ? carried.message
      : fallback;
  const subject =
    typeof carried.status === 'number' &&
    typeof carried.subject === 'string' &&
    carried.subject.trim()
      ? carried.subject
      : undefined;
  return {
    code,
    message,
    screenState: code ? VOICE_ERROR_CODES[code].screenState : 'error',
    ...(subject ? { subject } : {}),
  };
};

/** The line the screen prints: the code to act on, the sentence to read. */
export const failureNotice = (failure: MaterialFailure) => {
  const base = failure.code
    ? `${failure.code} · ${failure.message}`
    : failure.message;
  return failure.subject ? `${base} · ${failure.subject}` : base;
};

/* -------------------------------------------------------------------------
 * What the screen is handed
 * ---------------------------------------------------------------------- */

/**
 * The table prints codes; the routes answer to identifiers.
 *
 * Keeping both means a click on `cnt-02` asks about the piece the person is
 * looking at, rather than about the second row of whatever the list is now.
 */
export const idByCode = (
  response: MaterialsResponseV1 | null | undefined,
  code: string
) => (response?.materials ?? []).find((material) => material.code === code)?.id;

/** The row the screen declares: the identifier is the container's business. */
export const screenMaterials = (response?: MaterialsResponseV1 | null) =>
  (response?.materials ?? []).map(({ id, ...row }) => row);

/**
 * The recut panel, with `unchanged` honoured rather than decorated.
 *
 * A piece already in a platform's shape has no differences to list, and the
 * screen has a sentence for exactly that. Passing changes alongside
 * `unchanged: true` would print an invented difference over the top of it.
 */
export const screenRecut = (recut?: MaterialRecutPreviewV1 | null) =>
  recut
    ? {
        code: recut.code,
        platform: recut.platform,
        voiceVersion: recut.voiceVersion,
        changes: recut.unchanged ? [] : recut.changes,
      }
    : undefined;

/* -------------------------------------------------------------------------
 * The handoff into the editor
 * ---------------------------------------------------------------------- */

export type EditorExistingData = {
  group?: string;
  integration?: string;
  integrationPicture?: string;
  settings?: unknown;
  posts: Array<{ id?: string; publishDate?: string }>;
};

export type EditorHandoff = {
  postId: string;
  derivationId: string;
  platform: RecutPlatform;
  existing: EditorExistingData;
};

/**
 * Turn a piece into a draft, then read the draft back as a post.
 *
 * Two requests and neither of them delivers anything: the first writes a post
 * in `DRAFT`, the second reads it in the envelope the editor already knows how
 * to open. Sending it is publishing's job.
 */
export async function draftHandoff(
  read: JsonReader,
  id: string,
  platform: RecutPlatform
): Promise<EditorHandoff> {
  const draft: MaterialDraftResponseV1 = await read(
    materialEndpoint(id, 'draft'),
    { method: 'POST', body: JSON.stringify({ platform }) }
  );
  const existing: EditorExistingData = await read(postEndpoint(draft.postId));
  return {
    postId: draft.postId,
    derivationId: draft.derivationId,
    platform: draft.platform,
    existing,
  };
}

/**
 * The channels the editor opens with.
 *
 * The same split the calendar makes: every channel behind it, so a person can
 * add one, and the draft's own channel in front, because that is the post they
 * asked to open.
 */
export const editorChannels = (
  existing: EditorExistingData | null | undefined,
  channels: readonly Integrations[] | null | undefined
) => ({
  allIntegrations: (channels ?? []).map((channel) => ({ ...channel })),
  integrations: (channels ?? [])
    .filter((channel) => channel.id === existing?.integration)
    .map((channel) => ({
      ...channel,
      picture: existing?.integrationPicture ?? channel.picture,
    })),
});

/** The draft's own date, in the reader's zone, the way the calendar reads it. */
export const editorDate = (existing: EditorExistingData | null | undefined) =>
  dayjs.utc(existing?.posts?.[0]?.publishDate).local();

/**
 * The dialog the product already has for a post.
 *
 * Copied from the calendar rather than restated in the container, because a
 * second set of flags for the same dialog is how the two drift apart. It lives
 * in this file so the interface component stays free of the legacy class the
 * modal shell still needs.
 */
export const EDITOR_MODAL = Object.freeze({
  id: 'add-edit-modal',
  closeOnClickOutside: false,
  removeLayout: true,
  closeOnEscape: false,
  withCloseButton: false,
  askClose: true,
  fullScreen: true,
  classNames: Object.freeze({
    modal: 'w-[100%] max-w-[1400px] text-textColor',
  }),
  size: '80%',
  title: '',
});

/* -------------------------------------------------------------------------
 * The one state the screen is in
 * ---------------------------------------------------------------------- */

export type MaterialsScreenState =
  | 'default'
  | 'loading'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted';

/**
 * Nine states exist and the screen reports whichever it is in.
 *
 * A surface that quietly falls back to `default` turns a review of nine states
 * into a review of one. `empty` is missing on purpose: a workspace with no
 * material is answered by the section's own explanation, not by an empty table.
 */
export const screenState = (input: {
  failure?: MaterialFailure | null;
  busy?: boolean;
  loaded?: boolean;
  opened?: boolean;
  selected?: boolean;
}): MaterialsScreenState => {
  if (input.failure) return input.failure.screenState;
  if (input.busy || !input.loaded) return 'loading';
  if (input.opened) return 'success';
  if (input.selected) return 'selected';
  return 'default';
};
