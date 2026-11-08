'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Textarea } from '@contentfactory/react/form/textarea';
import { ErrorState, SkeletonRows, Status as StatusBadge } from '@contentfactory/frontend/components/ui/surface';
import { SectionLabel } from '@contentfactory/frontend/components/ui/section-label';
import { ReviewRequestErrorV1, reviewComposerIdV1, usePreviewReviewV1, type ReviewThreadV1 } from './preview.review.context';
import { useReviewCopyV1 } from './review.copy';

export function ReviewComposerV1({ threadId }: { threadId?: string }) {
  const review = usePreviewReviewV1();
  const copy = useReviewCopyV1();
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const selected = threadId ? null : review.selected;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      await review.request(`${review.path}/discussions${threadId ? `/${encodeURIComponent(threadId)}/replies` : ''}`, {
        method: 'POST', body: JSON.stringify({ content, ...(review.guest ? { guestName: name } : {}), ...(selected ? { anchor: selected } : {}) }),
      });
      setContent('');
      if (!threadId) review.setSelected(null);
      await review.mutate();
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  };
  const failure = error instanceof ReviewRequestErrorV1 && error.status === 429 ? copy.rate : error instanceof ReviewRequestErrorV1 && error.code === 'review_anchor_changed' ? copy.changed : copy.error;
  return <form onSubmit={submit} className="space-y-[12px]">
    {selected && <div className="border-s-2 border-cf-border-strong ps-[12px]">
      <p className="cf-caption text-cf-ink-muted">{copy.selected}</p>
      <blockquote className="cf-body-sm whitespace-pre-wrap break-words">{selected.quote}</blockquote>
      <Button variant="quiet" onClick={() => review.setSelected(null)}>{copy.clear}</Button>
    </div>}
    {review.guest && <Input standalone label={copy.name} name={`guest-name-${threadId || 'new'}`} value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoComplete="nickname" />}
    <Textarea standalone layout="content" id={threadId ? `reply-${threadId}` : reviewComposerIdV1(review.postId)} aria-label={threadId ? copy.reply : copy.add} value={content} onChange={event => setContent(event.target.value)} maxLength={4000} required disabled={busy} className="w-full cf-body-md" placeholder={threadId ? copy.reply : copy.add} />
    {error && <p role="alert" className="cf-body-sm text-cf-danger">{failure}</p>}
    <Button type="submit" loading={busy} loadingLabel={copy.sending} disabled={!content.trim() || (review.guest && !name.trim()) || !!selected && selected.quote.length > 2000}>{copy.send}</Button>
  </form>;
}

function ReviewThreadV1View({ thread }: { thread: ReviewThreadV1 }) {
  const review = usePreviewReviewV1();
  const copy = useReviewCopyV1();
  const [replying, setReplying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const resolve = async () => {
    if (busy) return;
    setBusy(true); setError(false);
    try { await review.request(`${review.path}/discussions/${encodeURIComponent(thread.id)}/resolution`, { method: 'PUT', body: JSON.stringify({ resolved: !thread.resolvedAt }) }); await review.mutate(); }
    catch { setError(true); } finally { setBusy(false); }
  };
  return <article className="space-y-[12px] border-t border-cf-border py-[16px]">
    <StatusBadge tone={thread.resolvedAt ? 'neutral' : 'info'}>{thread.resolvedAt ? copy.resolved : copy.open}</StatusBadge>
    {thread.anchor ? <div className="border-s-2 border-cf-border-strong ps-[12px]">
      <blockquote className="cf-body-sm whitespace-pre-wrap break-words">{thread.anchor.quote}</blockquote>
      {thread.anchor.stale ? <p className="cf-body-sm text-cf-warning">{copy.stale}</p> : <Button variant="quiet" onClick={() => review.setActiveAnchor(thread.anchor)}>{copy.selected}</Button>}
    </div> : <p className="cf-caption text-cf-ink-muted">{copy.unanchored}</p>}
    {thread.comments.map(comment => <div key={comment.id} className="space-y-[4px]">
      <p className="cf-label-md break-words">{comment.authorName}</p>
      {comment.unverified && <p className="cf-caption text-cf-ink-muted">{copy.unverified}</p>}
      <p className="cf-body-md whitespace-pre-wrap break-words">{comment.content}</p>
      <time dateTime={comment.createdAt} className="cf-caption text-cf-ink-muted">{new Date(comment.createdAt).toLocaleString()}</time>
    </div>)}
    <div className="flex flex-wrap gap-[8px]">
      <Button variant="quiet" onClick={() => setReplying(!replying)} aria-expanded={replying}>{copy.reply}</Button>
      {review.data?.canManage && <Button variant="quiet" onClick={resolve} loading={busy} loadingLabel={copy.loading}>{thread.resolvedAt ? copy.reopen : copy.resolve}</Button>}
    </div>
    {error && <p role="alert" className="cf-body-sm text-cf-danger">{copy.error}</p>}
    {replying && <ReviewComposerV1 threadId={thread.id} />}
  </article>;
}

export function CommentsComponents({ postId }: { postId: string }) {
  const review = usePreviewReviewV1();
  const copy = useReviewCopyV1();
  if (review.isLoading) return <SkeletonRows rows={3} label={copy.loading} />;
  if (review.error) return <ErrorState title={copy.discussions} description={review.error instanceof ReviewRequestErrorV1 && [403, 404].includes(review.error.status) ? copy.restricted : copy.error} action={<Button variant="secondary" onClick={() => review.mutate()}>{copy.retry}</Button>} />;
  return <section aria-label={copy.discussions} data-preview-review-post={postId} className="space-y-[16px]">
    <SectionLabel>{copy.discussions}</SectionLabel>
    {review.guest && <p className="cf-body-sm text-cf-ink-muted">{copy.guestNotice}</p>}
    <p className="cf-body-sm text-cf-ink-muted">{copy.noApproval}</p>
    <ReviewComposerV1 />
    {!review.data?.threads.length && !review.data?.legacyComments.length && <p className="cf-body-sm text-cf-ink-muted">{copy.empty}</p>}
    {review.data?.threads.map(thread => <ReviewThreadV1View key={thread.id} thread={thread} />)}
    {review.data?.legacyComments.map(comment => <article key={comment.id} className="space-y-[8px] border-t border-cf-border py-[16px]">
      <p className="cf-caption text-cf-ink-muted">{copy.legacy}</p>
      <p className="cf-label-md break-words">{comment.authorName}</p>
      <p className="cf-body-md whitespace-pre-wrap break-words">{comment.content}</p>
    </article>)}
  </section>;
}

export const RenderComponents = CommentsComponents;
