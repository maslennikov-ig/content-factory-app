'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { reviewComposerIdV1, usePreviewReviewV1 } from './preview.review.context';
import { useReviewCopyV1 } from './review.copy';

/** Offsets refer to exactly the server's plain text and immutable text revision. */
export function PostReviewContentV1({ postId, text, revision }: { postId: string; text: string; revision: string }) {
  const element = useRef<HTMLDivElement>(null);
  const review = usePreviewReviewV1();
  const { selected, setSelected, activeAnchor } = review;
  const copy = useReviewCopyV1();
  const capture = () => {
    const selection = window.getSelection();
    const container = element.current;
    if (!selection?.rangeCount || selection.isCollapsed || !container) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return;
    const before = range.cloneRange();
    before.selectNodeContents(container);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const quote = range.toString();
    setSelected({ postId, quote, start, end: start + quote.length, revision });
  };
  const active = activeAnchor?.postId === postId && !activeAnchor.stale && activeAnchor.revision === revision ? activeAnchor : null;
  const ranges = (review.data?.threads || []).flatMap(thread => !thread.resolvedAt && thread.anchor?.postId === postId && !thread.anchor.stale && thread.anchor.revision === revision ? [thread.anchor] : []);
  if (active) ranges.push(active);
  if (selected?.postId === postId && selected.revision === revision && selected.quote.length <= 2000) ranges.push(selected);
  const boundaries = [...new Set([0, text.length, ...ranges.flatMap(anchor => [anchor.start, anchor.end])])].sort((a, b) => a - b);
  useEffect(() => {
    if (active) element.current?.querySelector('[data-preview-active="true"]')?.scrollIntoView({ block: 'center' });
  }, [activeAnchor, postId, revision]);
  return <div className="min-w-0 space-y-[12px]">
    <div ref={element} tabIndex={0} aria-label={copy.select} onMouseUp={capture} onKeyUp={capture} onTouchEnd={capture} className="cf-body-md whitespace-pre-wrap break-words rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus">
      {boundaries.slice(0, -1).map((start, index) => {
        const end = boundaries[index + 1];
        const anchored = ranges.some(anchor => anchor.start < end && anchor.end > start);
        const focused = !!active && active.start < end && active.end > start;
        return anchored ? <mark key={start} data-preview-active={focused ? 'true' : undefined} className="bg-cf-accent-soft text-cf-ink">{text.slice(start, end)}</mark> : text.slice(start, end);
      })}
    </div>
    <p className="cf-caption text-cf-ink-muted">{copy.select}</p>
    {selected?.postId === postId && <div className="flex flex-wrap gap-[8px]">
      {selected.quote.length > 2000 ? <p role="status" className="cf-body-sm text-cf-warning">{copy.selectedTooLong}</p> : <Button variant="secondary" onClick={() => document.getElementById(reviewComposerIdV1(review.postId))?.focus()}>{copy.discussSelection}</Button>}
      <Button variant="quiet" onClick={() => setSelected(null)}>{copy.clear}</Button>
    </div>}
  </div>;
}
