'use client';

import { useState } from 'react';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { useOpenMediaBox } from '../media/media.component';
import { useVideoWords } from './video.copy';
import { useVideoAccessWords } from './video-access.copy';
import type { VideoDraftUiV1 } from './video-ui.v1';
import { videoManualTextV2, VIDEO_PROVIDER_SITES_V2 } from './video-ui.v2';

/** Copy/open never submits. The existing media picker owns uploading/storage. */
export function VideoManualV2({draft, provider, dirty, busy, canWrite, onAttach}: {draft: VideoDraftUiV1 | null; provider: 'higgsfield' | 'heygen'; dirty: boolean; busy: boolean; canWrite: boolean; onAttach: (mediaId: string) => void}) {
  const words = useVideoWords(); const accessWords = useVideoAccessWords(); const openMedia = useOpenMediaBox();
  const [notice, setNotice] = useState(''); const [failed, setFailed] = useState(false);
  const ready = !!draft && !dirty && !busy;
  const copy = async () => { if (!draft) return; setFailed(false); try { await navigator.clipboard.writeText(videoManualTextV2(draft.brief, draft.settings)); setNotice(accessWords.copied); } catch { setFailed(true); } };
  const download = () => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([videoManualTextV2(draft.brief, draft.settings)], {type: 'text/plain;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `video-${draft.id}-v${draft.version}.txt`; anchor.hidden = true; document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  };
  return <section className="flex min-w-0 flex-col gap-[12px]" data-video-manual="awaiting-upload">
    <h2 className="cf-heading-md">{accessWords.manualAwaiting}</h2>
    <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{accessWords.manualNote}</p>
    {(!draft || dirty) && <p role="status" className="cf-body-sm">{words.save}{dirty ? ` · ${words.dirty}` : ''}</p>}
    <div className="flex flex-wrap gap-[8px]"><Button variant="secondary" disabled={!ready} onClick={copy}>{accessWords.copy}</Button><Button variant="quiet" disabled={!ready} onClick={download}>{accessWords.export}</Button><a className={buttonClassName({variant: 'quiet'})} href={VIDEO_PROVIDER_SITES_V2[provider]} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{accessWords.open}</a></div>
    <Button variant="secondary" disabled={!ready || !canWrite} loading={busy} loadingLabel={words.saving} onClick={() => { setFailed(false); openMedia(items => { if (items.length !== 1) { setFailed(true); return; } onAttach(items[0].id); }, {type: 'video'}); }}>{accessWords.upload}</Button>
    <p className="cf-body-sm text-cf-ink-muted">{accessWords.externalCost}</p>
    {notice && <p role="status" className="cf-body-sm text-cf-accent">{notice}</p>}
    {failed && <p role="alert" className="cf-body-sm text-cf-danger">{words.failed} {accessWords.upload}</p>}
  </section>;
}
