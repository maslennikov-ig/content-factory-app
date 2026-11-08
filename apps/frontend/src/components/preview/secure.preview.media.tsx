'use client';

import { useState } from 'react';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { useReviewCopyV1 } from './review.copy';

export function SecurePreviewMediaV1({ media }: { media: { path: string; name: string; type?: string; alt?: string | null; thumbnail?: string; thumbnailTimestamp?: number | null } }) {
  const { backendUrl } = useVariables();
  const copy = useReviewCopyV1();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Only the scoped API door is rendered; a storage path is never a fallback.
  if (!media.path.startsWith('/preview-review/v1/posts/')) return null;
  const src = `${backendUrl}${media.path}`;
  const timestamp = media.thumbnailTimestamp;
  const videoSrc = !media.thumbnail && typeof timestamp === 'number' && Number.isSafeInteger(timestamp) && timestamp >= 0 ? `${src}#t=${timestamp / 1000}` : src;
  if (failed) return <div role="status" className="space-y-[8px] p-[12px]"><p className="cf-body-sm text-cf-ink-muted">{copy.mediaFailed}</p><Button variant="secondary" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}>{copy.retry}</Button></div>;
  return media.type === 'video' ? <video key={attempt} src={videoSrc} crossOrigin="use-credentials" controls preload="metadata" poster={media.thumbnail?.startsWith('/preview-review/v1/posts/') ? `${backendUrl}${media.thumbnail}` : undefined} className="w-full object-contain" aria-label={media.alt ?? media.name} onError={() => setFailed(true)} />
    : <img key={attempt} src={src} crossOrigin="use-credentials" referrerPolicy="no-referrer" alt={media.alt ?? media.name} className="w-full object-contain" onError={() => setFailed(true)} />;
}
