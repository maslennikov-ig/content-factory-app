'use client';

import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { ErrorState, SkeletonRows } from '../ui/surface';
import { SectionLabel } from '../ui/section-label';
import { useUser } from '../layout/user.context';
import { useVideoWords } from './video.copy';
import { videoWorkspacePath, type VideoDraftMetadataUiV1 } from './video-ui.v1';

/** Existing saved scripts/prompts in the media library; these rows are not rendered files. */
export function SavedVideoDrafts() {
  const request = useFetch();
  const user = useUser();
  const words = useVideoWords();
  const drafts = useSWR<VideoDraftMetadataUiV1[]>(['saved-video-drafts', user?.orgId, user?.id], async () => {
    const response = await request('/media/video-prompts?metadata=1');
    if (!response.ok) throw new Error('Video drafts unavailable');
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error('Video drafts unavailable');
    return body;
  }, {revalidateOnFocus: true});
  if (drafts.data?.length === 0 && !drafts.error) return null;
  return <section className="flex min-w-0 flex-col gap-[12px]" aria-label={`${words.script} / ${words.prompt}`}>
    <SectionLabel>{words.script} / {words.prompt}</SectionLabel>
    {drafts.error ? <ErrorState title={words.failed} action={<Button variant="quiet" onClick={() => void drafts.mutate()}>{words.refresh}</Button>} />
      : !drafts.data ? <SkeletonRows rows={2} label={words.loading} /> : <ul className="flex max-h-[44dvh] min-w-0 flex-col divide-y divide-cf-border overflow-y-auto">
        {drafts.data.map(draft => <li key={draft.id} className="flex min-w-0 flex-wrap items-center justify-between gap-[8px] py-[12px]">
          <div className="min-w-0 flex-1"><p className="break-words cf-body-sm">{draft.title}</p><p className="cf-caption text-cf-ink-muted">{draft.settings.mode === 'presenter' ? words.script : words.prompt}</p></div>
          <ButtonLink variant="quiet" density="dense" href={videoWorkspacePath({draftId: draft.id, pieceId: draft.pieceId})}>{words.reopen}</ButtonLink>
        </li>)}
      </ul>}
  </section>;
}
