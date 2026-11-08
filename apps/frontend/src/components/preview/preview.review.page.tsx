'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { EmptyState, ErrorState, SkeletonRows } from '@contentfactory/frontend/components/ui/surface';
import { PostPreview, type PublicPreviewPost } from './post.preview';
import { ReviewRequestErrorV1, useReviewFetchV1 } from './preview.review.context';
import { useReviewCopyV1 } from './review.copy';

/** The bearer stays in the URL fragment and request headers, never in a server URL. */
export function PreviewReviewPageV1({ postId, publicationDateLabel }: { postId: string; publicationDateLabel: string }) {
  const [ready, setReady] = useState(false);
  const [grantToken, setGrantToken] = useState<string>();
  const [grantGeneration, setGrantGeneration] = useState(0);
  const copy = useReviewCopyV1();
  useEffect(() => {
    const read = () => { setGrantToken(new URLSearchParams(window.location.hash.slice(1)).get('review') || undefined); setGrantGeneration(generation => generation + 1); setReady(true); };
    read(); window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const request = useReviewFetchV1(grantToken);
  const path = `/preview-review/v1/posts/${encodeURIComponent(postId)}`;
  const { data, error, isLoading, mutate } = useSWR<{ posts: PublicPreviewPost[]; canManage: boolean }>(ready ? [path, grantGeneration] : null, async () => {
    const response = await request(path);
    if (grantToken) await request(`${path}/session`, { method: 'POST', body: '{}' });
    return response.json();
  }, { shouldRetryOnError: false, refreshInterval: 15 * 60_000, revalidateOnFocus: true });
  const denied = error instanceof ReviewRequestErrorV1 && [403, 404].includes(error.status);
  if (!ready || isLoading) return <SkeletonRows rows={4} label={copy.loadingPreview} />;
  if (error) return <ErrorState title={copy.previewFailed} description={denied ? copy.restricted : copy.error} action={<div className="flex flex-wrap gap-[8px]"><Button variant="secondary" onClick={() => mutate()}>{copy.retry}</Button>{denied && <ButtonLink href={`/auth?returnUrl=${encodeURIComponent(`/p/${postId}`)}`}>{copy.signIn}</ButtonLink>}</div>} />;
  if (!data?.posts.length) return <EmptyState title={copy.previewEmpty} />;
  return <PostPreview key={`${postId}-${grantGeneration}`} postId={postId} posts={data.posts} publicationDateLabel={publicationDateLabel} showCopy={data.canManage} reviewToken={grantToken} />;
}
