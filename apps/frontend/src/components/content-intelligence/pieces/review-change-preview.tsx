import type { ReactNode } from 'react';

/** The same complete, read-only change in manual review and the assistant. */
export function ReviewChangePreview({
  before,
  after,
  reason,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  reason?: ReactNode;
  beforeLabel: string;
  afterLabel: string;
}) {
  return (
    <span data-review-change-preview className="flex min-w-0 max-w-[72ch] flex-col gap-[8px] cf-body-sm text-cf-ink">
      <span className="flex min-w-0 flex-col gap-[4px]">
        <span className="cf-caption text-cf-ink-muted">{beforeLabel}</span>
        <del data-review-before dir="auto" className="whitespace-pre-wrap bg-cf-danger-soft [overflow-wrap:anywhere]">{before}</del>
      </span>
      <span className="flex min-w-0 flex-col gap-[4px]">
        <span className="cf-caption text-cf-ink-muted">{afterLabel}</span>
        <ins data-review-after dir="auto" className="whitespace-pre-wrap bg-cf-accent-soft no-underline [overflow-wrap:anywhere]">{after}</ins>
      </span>
      {reason ? <span dir="auto" className="whitespace-pre-wrap text-cf-ink-muted [overflow-wrap:anywhere]">{reason}</span> : null}
    </span>
  );
}
