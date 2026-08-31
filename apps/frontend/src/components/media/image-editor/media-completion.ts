import type { UploadedMedia } from './types';

export function completeEditedMedia<
  T extends Pick<UploadedMedia, 'id' | 'path'>
>({
  standalone,
  selected,
  uploaded,
}: {
  standalone: boolean;
  selected: T[];
  uploaded: T;
}) {
  if (standalone) return { selected, shouldSelect: false };
  const next = selected.some((item) => item.id === uploaded.id)
    ? selected
    : [...selected, uploaded];
  return { selected: next, shouldSelect: true };
}

/**
 * What a post's attachment list looks like after one of its pictures is edited.
 *
 * Replace, never append: the person edited the picture this post already
 * carries, so the post should show the result where the original was and keep
 * the order the platforms will publish in. Appending would leave the pre-edit
 * picture in the post — the one visible mistake this feature exists to fix.
 *
 * Only `id` and `path` move. Anything the draft attached to that slot — alt
 * text most of all — describes the picture's content, which editing does not
 * change, and retyping it would be the cost of every crop.
 */
export function replaceEditedAttachment<
  T extends Pick<UploadedMedia, 'id' | 'path'>
>({
  attachments,
  index,
  uploaded,
}: {
  attachments: readonly T[];
  index: number;
  uploaded: Pick<UploadedMedia, 'id' | 'path'>;
}): T[] {
  if (!Number.isInteger(index) || index < 0 || index >= attachments.length) {
    throw new Error('The edited attachment is no longer in the draft.');
  }
  return attachments.map((item, position) =>
    position === index
      ? { ...item, id: uploaded.id, path: uploaded.path }
      : item
  );
}

export async function completeMediaBoxEditorSave<
  T extends Pick<UploadedMedia, 'id' | 'path'>
>({
  standalone,
  uploaded,
  mutate,
  select,
  close,
  onRefreshError,
}: {
  standalone: boolean;
  uploaded: T;
  mutate: () => Promise<unknown>;
  select: (uploaded: T) => void;
  close: () => void;
  onRefreshError: (error: unknown) => void;
}) {
  if (!standalone) select(uploaded);
  close();
  try {
    await mutate();
    return { refreshed: true };
  } catch (error) {
    onRefreshError(error);
    return { refreshed: false };
  }
}
