/**
 * The picture on an adaptation's post, as the screens draw it (W4 live walk
 * 29.09.2026, P3-F).
 *
 * The adaptation row names its picture by id (`mediaId`); the address the
 * thumbnail needs lives in the post's `image` JSON, which
 * `PieceService.updateAdaptation` writes from the media row whoever sets the
 * picture — the screen's picker or the chat's `adaptation.image`. The piece
 * door returned the id only, so a picture the chat put on a post showed no
 * thumbnail anywhere, even after a reload: only the page that had picked it
 * knew its path. The door now reads the path back from the post.
 */
export type AdaptationPictureV1 = { id: string; path: string };

export const adaptationPictureOf = (
  postImage: string | null | undefined,
  mediaId: string | null | undefined
): AdaptationPictureV1 | null => {
  if (!mediaId) return null;
  let items: unknown;
  try {
    items = JSON.parse(postImage || '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(items)) return null;
  const item = items.find(
    (one) => one && typeof one === 'object' && (one as { id?: unknown }).id === mediaId
  ) as { id: string; path?: unknown } | undefined;
  return item && typeof item.path === 'string' && item.path ? { id: item.id, path: item.path } : null;
};
