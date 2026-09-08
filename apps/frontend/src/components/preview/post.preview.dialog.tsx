'use client';

import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { calendarPlanningCopy } from '../launches/calendar-planning.copy';
import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Button } from '@contentfactory/react/form/button';
import { CloseIconSmall } from '@contentfactory/frontend/components/ui/icons';
import { Dialog } from '@contentfactory/frontend/components/ui/layers';
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
} from '@contentfactory/frontend/components/ui/surface';
import {
  PostPreview,
  type PublicPreviewPost,
} from '@contentfactory/frontend/components/preview/post.preview';
import { PreviewSurface } from './preview.surface';

export const PostPreviewDialog = ({
  open,
  onClose,
  postId,
  piece,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  /** Provenance only from the authenticated calendar; never from public preview. */
  piece?: { id: string; code: string; title: string } | null;
}) => {
  const fetch = useFetch();
  const t = useT();
  const language = useInterfaceLanguage();
  const copy = calendarPlanningCopy[language.startsWith('ru') ? 'ru' : 'en'];
  const loadPost = useCallback(async () => {
    const response = await fetch(`/public/posts/${postId}`);
    if (!response.ok) {
      throw new Error(`Post preview request failed with ${response.status}`);
    }
    return (await response.json()) as PublicPreviewPost[];
  }, [fetch, postId]);
  const { data, error, isLoading } = useSWR(
    open ? `/public/posts/${postId}` : null,
    loadPost
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('post_preview', 'Post preview')}
      className="max-w-[1400px]"
      footer={
        <Button variant="secondary" onClick={onClose}>
          <CloseIconSmall aria-hidden />
          {t('close', 'Close')}
        </Button>
      }
    >
      {piece && <p className="cf-caption text-cf-ink-muted mb-[16px]">
        {copy.origin} {piece.code} · <ButtonLink href={`/content/pieces/${encodeURIComponent(piece.id)}`} variant="quiet" density="dense" onClick={onClose}>{copy.originOpen} →</ButtonLink>
      </p>}
      {isLoading ? (
        <PreviewSurface state="loading"><SkeletonRows
          rows={4}
          label={t('loading_post_preview', 'Loading post preview')}
        /></PreviewSurface>
      ) : error ? (
        <PreviewSurface state="error"><ErrorState
          title={t('post_preview_failed', 'Post preview could not be loaded')}
          description={t(
            'post_preview_failed_description',
            'Close the preview and try again.'
          )}
        /></PreviewSurface>
      ) : !data?.length ? (
        <PreviewSurface state="empty"><EmptyState title={t('post_not_found', 'Post not found')} /></PreviewSurface>
      ) : (
        <PostPreview
          postId={postId}
          posts={data}
          publicationDateLabel={t('publication_date', 'Publication Date:')}
          showCopy={true}
          wordmarkHref={null}
        />
      )}
    </Dialog>
  );
};
