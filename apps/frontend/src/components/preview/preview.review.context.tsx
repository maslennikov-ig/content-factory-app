'use client';

import { createContext, useCallback, useContext, useId, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';

export type ReviewAnchorV1 = { postId: string; quote: string; start: number; end: number; revision: string; stale?: boolean };
export type ReviewCommentV1 = { id: string; content: string; authorName: string; unverified?: boolean; createdAt: string };
export type ReviewThreadV1 = { id: string; anchor: ReviewAnchorV1 | null; resolvedAt: string | null; comments: ReviewCommentV1[] };
export type ReviewDataV1 = { canManage: boolean; threads: ReviewThreadV1[]; legacyComments: ReviewCommentV1[] };

export class ReviewRequestErrorV1 extends Error {
  constructor(public status: number, public code?: string) { super('Preview review request failed'); }
}

export function useReviewFetchV1(grantToken?: string) {
  const fetch = useFetch();
  return useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (grantToken) headers.set('X-Preview-Grant', grantToken);
    if (options.method && options.method !== 'GET') headers.set('X-Preview-Review', '1');
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    if (!response.ok) {
      let code: string | undefined;
      try { code = (await response.json()).code; } catch { /* The status still describes this refusal. */ }
      throw new ReviewRequestErrorV1(response.status, code);
    }
    return response;
  }, [fetch, grantToken]);
}

function useReviewStateV1(postId: string, grantToken?: string) {
  const request = useReviewFetchV1(grantToken);
  const instance = useId();
  const [selected, setSelected] = useState<ReviewAnchorV1 | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<ReviewAnchorV1 | null>(null);
  const path = `/preview-review/v1/posts/${encodeURIComponent(postId)}`;
  const { data, error, isLoading, mutate } = useSWR<ReviewDataV1>([`${path}/discussions`, instance, !!grantToken], () => request(`${path}/discussions`).then(response => response.json()), { shouldRetryOnError: false, revalidateOnFocus: true });
  return { postId, path, request, data, error, isLoading, mutate, selected, setSelected, activeAnchor, setActiveAnchor, guest: !!grantToken };
}

const ReviewContextV1 = createContext<ReturnType<typeof useReviewStateV1> | null>(null);
export function PreviewReviewProviderV1({ postId, grantToken, children }: { postId: string; grantToken?: string; children: ReactNode }) {
  const value = useReviewStateV1(postId, grantToken);
  return <ReviewContextV1.Provider value={value}>{children}</ReviewContextV1.Provider>;
}
export function usePreviewReviewV1() {
  const context = useContext(ReviewContextV1);
  if (!context) throw new Error('Preview review provider is required');
  return context;
}

export const reviewComposerIdV1 = (postId: string) => `preview-review-composer-${postId}`;
