'use client';

import { useState } from 'react';
import useSWR from 'swr';
import copyToClipboard from 'copy-to-clipboard';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Dialog } from '@contentfactory/frontend/components/ui/layers';
import { ConfirmButton } from '@contentfactory/frontend/components/ui/confirm-button';
import { SkeletonRows, Status as StatusBadge } from '@contentfactory/frontend/components/ui/surface';
import { usePreviewReviewV1 } from './preview.review.context';
import { useReviewCopyV1 } from './review.copy';

type GrantV1 = { id: string; expiresAt: string; revokedAt: string | null };
export function CopyClient({ postId }: { postId?: string }) {
  const review = usePreviewReviewV1();
  const copy = useReviewCopyV1();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const { data, isLoading, error: loadError, mutate } = useSWR<{ grants: GrantV1[] }>(open && review.data?.canManage ? `${review.path}/grants` : null, path => review.request(path).then(response => response.json()), { shouldRetryOnError: false });
  const close = () => { setOpen(false); setLink(''); setCopied(false); setError(false); };
  const create = async (grantId?: string) => {
    if (busy) return;
    setBusy(true); setError(false); setCopied(false); setLink('');
    try {
      const result = await (await review.request(`${review.path}/grants${grantId ? `/${encodeURIComponent(grantId)}/reissue` : ''}`, { method: 'POST', body: '{}' })).json();
      const url = new URL(`/p/${encodeURIComponent(postId || review.postId)}`, window.location.origin);
      url.hash = new URLSearchParams({ review: result.token }).toString();
      setLink(url.toString());
      await mutate();
    } catch { setError(true); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(true); setError(false);
    try { await review.request(`${review.path}/grants/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' }); await mutate(); }
    catch { setError(true); } finally { setBusy(false); }
  };
  if (!review.data?.canManage) return null;
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}>{copy.share}</Button>
    <Dialog open={open} onClose={close} title={copy.links} footer={<Button variant="secondary" onClick={close}>{copy.close}</Button>}>
      <div className="space-y-[16px]">
        <p className="cf-body-md text-cf-ink-muted">{copy.linkHelp}</p>
        <p className="cf-body-sm text-cf-ink-muted">{copy.noApproval}</p>
        <Button onClick={() => create()} loading={busy} loadingLabel={copy.creatingLink}>{copy.createLink}</Button>
        {link && <div className="space-y-[8px]">
          <Input standalone label={copy.links} value={link} readOnly onFocus={event => event.target.select()} />
          <p className="cf-body-sm text-cf-ink-muted">{copy.linkOnce}</p>
          <Button variant="secondary" onClick={() => setCopied(copyToClipboard(link))}>{copy.copy}</Button>
          {copied && <p role="status" className="cf-body-sm text-cf-accent">{copy.copied}</p>}
        </div>}
        {(error || loadError) && <p role="alert" className="cf-body-sm text-cf-danger">{copy.error}</p>}
        {isLoading ? <SkeletonRows rows={2} label={copy.loading} /> : !data?.grants.length ? <p className="cf-body-sm text-cf-ink-muted">{copy.noLinks}</p> : <ul className="divide-y divide-cf-border">
          {data.grants.map(grant => {
            const active = !grant.revokedAt && new Date(grant.expiresAt).getTime() > Date.now();
            return <li key={grant.id} className="space-y-[8px] py-[12px]">
              <StatusBadge tone="neutral">{grant.revokedAt ? copy.revoked : active ? copy.active : copy.expired}</StatusBadge>
              <p className="cf-caption text-cf-ink-muted">{copy.expires} <time dateTime={grant.expiresAt}>{new Date(grant.expiresAt).toLocaleString()}</time></p>
              <div className="flex flex-wrap gap-[8px]">
                <Button variant="quiet" disabled={busy} onClick={() => create(grant.id)}>{copy.reissue}</Button>
                {active && <ConfirmButton label={copy.revoke} armedLabel={`${copy.revoke}?`} disabled={busy} onConfirm={() => revoke(grant.id)} />}
              </div>
            </li>;
          })}
        </ul>}
      </div>
    </Dialog>
  </>;
}
