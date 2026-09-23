/**
 * Which buttons the adaptation editor's toolbar carries, per channel format
 * (`content-factory-next-97dq.61`, variant A).
 *
 * The owner's note on the canvas: Telegram gets bold, link and emoji; the
 * thirteenth walk added italic and underline (`97dq.52`), which Telegram shows
 * as `<i>` and `<u>`. A format
 * with a title gains a heading; a video has no text editor at all. The set is
 * a table rather than branches in the component, so a new format is one entry
 * here and nothing else. The key is the channel's provider identifier; a
 * format with no entry of its own gets `default`.
 *
 * The order in a list is the order on the toolbar. The image button is not in
 * the table: it belongs to whoever can attach a picture (`onPickImage`), not
 * to the text format.
 */
export const EDITOR_TOOLS = [
  'bold',
  'italic',
  'underline',
  'link',
  'emoji',
] as const;

export type EditorTool = (typeof EDITOR_TOOLS)[number];

export const EDITOR_TOOLS_BY_FORMAT: Readonly<
  Record<string, readonly EditorTool[]>
> = {
  default: ['bold', 'italic', 'underline', 'link', 'emoji'],
  telegram: ['bold', 'italic', 'underline', 'link', 'emoji'],
};

export function editorToolsFor(format?: string | null): readonly EditorTool[] {
  const key = (format ?? '').trim().toLowerCase();
  return EDITOR_TOOLS_BY_FORMAT[key] ?? EDITOR_TOOLS_BY_FORMAT.default;
}
