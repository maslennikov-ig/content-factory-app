/**
 * «Спросить агента» from the post window (`content-factory-next-kcxz.28`).
 *
 * The post editor's CopilotKit helper went with W6; what it did for a person
 * — rewrite the text of the post being written — the agent chat does on the
 * piece and its adaptation, which is where the text lives. The window hands
 * over what the post is, the agent screen writes it into the composer, and the
 * person sends it. Nothing is sent by the hand-over itself: a link is weaker
 * intent than a press (the «Сделать в чате» rule, review W3-21 P2-2).
 *
 * The description travels through `sessionStorage`, not through the address:
 * a crafted `/agents/new?from=editor&text=…` link could otherwise put any
 * words into a person's composer, and the post text would sit in the history
 * and the frontend's access log. Only a page of this origin writes the
 * storage, the screen takes it once and removes it, and an address without the
 * mark never reads it.
 */
export const AGENT_FROM_PARAM = 'from';
export const AGENT_FROM_EDITOR = 'editor';
export const AGENT_FROM_EDITOR_HREF = `/agents/new?${AGENT_FROM_PARAM}=${AGENT_FROM_EDITOR}`;
export const EDITOR_HANDOFF_KEY = 'cf.agent.editor-handoff';

/** The composer takes a message, not a book: the rest stays in the post. */
export const EDITOR_TEXT_IN_DRAFT = 4000;
const NAME_IN_DRAFT = 200;

export type EditorHandoff = {
  /** The piece the post was made from; `null` for a post written by hand. */
  piece: string | null;
  /**
   * The piece's code (`cnt-07`), the name the agent resolves unambiguously
   * where two pieces share a title (review W6-28 F3); `null` when unknown.
   */
  code: string | null;
  /** The one channel the post goes to; `null` for none or several. */
  channel: string | null;
  /** The post's words as plain text, for a post without a piece. */
  text: string;
};

export type EditorDraftWords = {
  piece: (piece: string, code: string | null, channel: string | null) => string;
  text: (text: string, channel: string | null) => string;
  empty: (channel: string | null) => string;
};

const clean = (value: unknown, limit: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
};

const PIECE_CODE = /^cnt-\d{1,6}$/;

const normalize = (value: unknown): EditorHandoff | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const code = clean(raw.code, 16);
  return {
    piece: clean(raw.piece, NAME_IN_DRAFT),
    code: code && PIECE_CODE.test(code) ? code : null,
    channel: clean(raw.channel, NAME_IN_DRAFT),
    text: clean(raw.text, EDITOR_TEXT_IN_DRAFT) ?? '',
  };
};

type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * What the post window knows, as the hand-over: the piece's title and code,
 * the channel when there is exactly one, and the post's parts as plain text.
 */
export const editorHandoffFrom = ({
  piece,
  code,
  channels,
  texts,
}: {
  piece: string | null | undefined;
  code?: string | null;
  channels: string[];
  texts: string[];
}): EditorHandoff =>
  normalize({
    piece: piece ?? null,
    code: code ?? null,
    channel: channels.length === 1 ? channels[0] : null,
    text: texts.map((part) => part.trim()).filter(Boolean).join('\n\n'),
  }) as EditorHandoff;

/** Written by the post window right before it leaves for the agent screen. */
export const writeEditorHandoff = (
  storage: HandoffStorage,
  handoff: EditorHandoff
): boolean => {
  const value = normalize(handoff);
  if (!value) return false;
  try {
    storage.setItem(EDITOR_HANDOFF_KEY, JSON.stringify(value));
    return true;
  } catch {
    // A storage that refuses (a private window over its quota): the agent
    // screen opens with an empty composer, which is still the agent.
    return false;
  }
};

/** Read once and removed, whatever it held. */
export const takeEditorHandoff = (
  storage: HandoffStorage
): EditorHandoff | null => {
  try {
    const stored = storage.getItem(EDITOR_HANDOFF_KEY);
    storage.removeItem(EDITOR_HANDOFF_KEY);
    return stored ? normalize(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
};

/**
 * The words for the composer. A post made from a piece is named by the piece
 * and the channel: the agent finds the adaptation and edits, reviews or
 * illustrates it there — and the post with it (`adaptation.edit` writes the
 * post's text). A post written by hand has no piece to work on, so the honest
 * offer is to make one from its text; an empty window is the «one thought»
 * starter.
 */
export const editorDraft = (
  words: EditorDraftWords,
  handoff: EditorHandoff
): string => {
  if (handoff.piece) return words.piece(handoff.piece, handoff.code, handoff.channel);
  if (handoff.text) return words.text(handoff.text, handoff.channel);
  return words.empty(handoff.channel);
};
