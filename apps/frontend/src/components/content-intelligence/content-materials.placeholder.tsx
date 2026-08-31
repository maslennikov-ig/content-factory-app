'use client';

import { contentSectionCopy, type ContentSectionLocale } from './content-section.copy';

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

  return (
    <section
      data-content-materials="empty"
      className="rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
    >
      <p className="cf-label-sm uppercase text-cf-ink-muted">
        {t.materialsPending}
      </p>
      <h2 className="mt-[8px] cf-heading-md text-cf-ink [text-wrap:balance]">
        {t.materialsTitle}
      </h2>
      <p className="mt-[8px] max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
        {t.materialsBody}
      </p>
    </section>
  );
}
