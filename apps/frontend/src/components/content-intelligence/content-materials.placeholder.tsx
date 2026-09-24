'use client';

import { contentSectionCopy, type ContentSectionLocale } from './content-section.copy';
import { EmptyState } from '../ui/surface';

/**
 * The Material tab.
 *
 * It was an honest empty state until `content-factory-next-36r.8` filled it,
 * and the empty state stays — it is what a workspace with no pieces still
 * sees, and it says what a piece is rather than leaving a blank where one
 * would be. Not a failure, and it does not read as one.
 */
export function ContentMaterialsPlaceholder({
  locale,
}: {
  locale: ContentSectionLocale;
}) {
  const t = contentSectionCopy[locale];

  // The shared empty state (`97dq.76`, audit §7.6): a title and what a piece
  // is, without a caption over it.
  return (
    <section
      data-content-materials="empty"
      className="rounded-[8px] border border-cf-border bg-cf-surface"
    >
      <EmptyState title={t.materialsTitle} description={t.materialsBody} />
    </section>
  );
}
