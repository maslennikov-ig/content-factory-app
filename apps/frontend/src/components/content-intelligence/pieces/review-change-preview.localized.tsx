'use client';

import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { ReviewChangePreview } from './review-change-preview';

/** Native interface translations shared by manual review and the assistant. */
export function LocalizedReviewChangePreview({
  before,
  after,
  reason,
  fallbackWords,
}: {
  before: string;
  after: string;
  reason?: string;
  fallbackWords: { before: string; after: string };
}) {
  const t = useT();
  return (
    <ReviewChangePreview
      before={before}
      after={after}
      reason={reason}
      beforeLabel={t('review_preview_before', fallbackWords.before)}
      afterLabel={t('review_preview_after', fallbackWords.after)}
    />
  );
}
