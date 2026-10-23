'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { isOrganizationAdmin, isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useUser } from '../layout/user.context';
import { ConfirmButton } from '../ui/confirm-button';
import { ErrorState, SkeletonRows, Status } from '../ui/surface';
import { useVideoWords } from './video.copy';
import { useVideoAccessWords } from './video-access.copy';
import { videoErrorCode } from './video-ui.v1';
import { videoDecimalValidV2, type VideoAccessChoicesUiV2, type VideoConnectionUiV2 } from './video-ui.v2';

export function useVideoAccessChoicesV2() {
  const user = useUser(); const request = useFetch();
  return useSWR<VideoAccessChoicesUiV2>(user ? ['video-access-v2', user.orgId, user.id] : null, async () => {
    const response = await request('/media/video-access');
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(videoErrorCode(value));
    return value;
  }, {revalidateOnFocus: true});
}

/** Personal credentials stay behind this person-driven connection action. */
export function VideoSubscriptions({returnPath = '/media?video=1', onChanged, canConnect = true}: {returnPath?: string; onChanged?: () => void; canConnect?: boolean}) {
  const words = useVideoWords(); const accessWords = useVideoAccessWords(); const request = useFetch(); const user = useUser();
  const choices = useVideoAccessChoicesV2(); const canWrite = isOrganizationEditor(user?.role); const canAdmin = isOrganizationAdmin(user?.role);
  const [pending, setPending] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const lock = useRef(false);
  useEffect(() => { const code = new URLSearchParams(window.location.search).get('connectionError'); if (code) setError('VIDEO_OAUTH_REFUSED'); }, []);
  const mutate = async (path: string, body: unknown = {}, method = 'POST') => {
    const response = await request(path, {method, body: JSON.stringify(body)}); const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(videoErrorCode(value));
    return value;
  };
  const action = async (key: string, callback: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setPending(key); setError(''); setNotice('');
    try { await callback(); onChanged?.(); await choices.mutate(); }
    catch (err) { setError(err instanceof Error ? err.message : 'VIDEO_REQUEST_FAILED'); }
    finally { lock.current = false; setPending(''); }
  };
  const connect = (provider: string) => action(`connect-${provider}`, async () => {
    const value = await mutate(`/media/video-connections/${provider}/start`, {returnPath});
    const url = new URL(value.authorizationUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('VIDEO_CONNECTION_UNAVAILABLE');
    window.location.assign(url.href);
  });
  return <section className="flex min-w-0 flex-col gap-[16px]" data-video-subscriptions="v2" aria-busy={!!pending}>
    <h2 className="cf-heading-md">{accessWords.subscriptions}</h2>
    {choices.error ? <ErrorState title={words.failed} action={<Button variant="secondary" onClick={() => choices.mutate()}>{words.refresh}</Button>} /> : !choices.data ? <SkeletonRows rows={2} label={words.loading} /> : <>
      {canAdmin && <CheckboxField label={accessWords.workspaceEnabled} checked={choices.data.workspaceEnabled} disabled={!!pending} onChange={event => { const enabled = event.target.checked; void action('workspace', async () => { await mutate('/media/video-connections/workspace/policy', {enabled}, 'PUT'); }); }} />}
      {!choices.data.workspaceEnabled && <p role="status" className="cf-body-sm text-cf-ink-muted">{accessWords.unavailable}</p>}
      {choices.data.providers.map(provider => <section key={provider.provider} className="flex min-w-0 flex-col gap-[12px] border-t border-cf-border pt-[16px]" data-video-subscription-provider={provider.provider}>
        <div className="flex flex-wrap items-center justify-between gap-[8px]"><h3 className="cf-label-md">{provider.provider === 'higgsfield' ? 'Higgsfield' : 'HeyGen'}</h3><Button variant="secondary" disabled={!canWrite || !!pending || !provider.enabled || !canConnect} loading={pending === `connect-${provider.provider}`} loadingLabel={accessWords.connecting} onClick={() => connect(provider.provider)}>{choices.data!.connections.some(connection => connection.provider === provider.provider) ? accessWords.reconnect : accessWords.connect}</Button></div>
        {provider.trial && <p className="cf-body-sm text-cf-ink-muted">{accessWords.trial}</p>}
        {!provider.enabled && choices.data!.workspaceEnabled && <p className="cf-body-sm text-cf-ink-muted">{accessWords.unavailable}</p>}
        {!canConnect && <p className="cf-body-sm text-cf-ink-muted">{words.dirty} · {words.save}</p>}
        {!choices.data!.connections.some(connection => connection.provider === provider.provider) && <p className="cf-body-sm text-cf-ink-muted">{accessWords.disconnected}</p>}
        {choices.data!.connections.filter(connection => connection.provider === provider.provider).map(connection => <VideoConnectionRow key={`${connection.id}:${connection.generation}:${connection.perJob}:${connection.perMonth}`} connection={connection} canWrite={canWrite} pending={pending} onLimits={(perJob, perMonth) => action(`limits-${connection.id}`, async () => { await mutate(`/media/video-connections/${encodeURIComponent(connection.id)}/limits`, {perJob, perMonth}, 'PUT'); setNotice(words.settingsSaved); })} onGrant={() => action(`grant-${connection.id}`, async () => { await mutate(`/media/video-connections/${encodeURIComponent(connection.id)}/grant`); })} onDisconnect={() => action(`disconnect-${connection.id}`, async () => { await mutate(`/media/video-connections/${encodeURIComponent(connection.id)}`, {}, 'DELETE'); })} />)}
      </section>)}
      <p className="cf-body-sm text-cf-ink-muted">{accessWords.disconnectNote}</p>
      {notice && <p role="status" className="cf-body-sm text-cf-accent">{notice}</p>}
    </>}
    {error && <p role="alert" className="cf-body-sm text-cf-danger">{/OAUTH|CONNECTION|WALLET/.test(error) ? accessWords.loginFailed : error === 'VIDEO_ACCESS_DENIED' ? words.restricted : error === 'VIDEO_CREDIT_LIMIT_INVALID' ? accessWords.limitsNote : words.failed}</p>}
  </section>;
}

function VideoConnectionRow({connection, canWrite, pending, onLimits, onGrant, onDisconnect}: {connection: VideoConnectionUiV2; canWrite: boolean; pending: string; onLimits: (perJob: string, perMonth: string) => void; onGrant: () => void; onDisconnect: () => void}) {
  const words = useVideoWords(); const accessWords = useVideoAccessWords();
  const [perJob, setPerJob] = useState(connection.perJob ?? ''); const [perMonth, setPerMonth] = useState(connection.perMonth ?? '');
  const valid = videoDecimalValidV2(perJob, true) && videoDecimalValidV2(perMonth, true);
  const connected = connection.state === 'connected';
  return <div className="flex min-w-0 flex-col gap-[12px]" data-video-connection-id={connection.id}>
    <div className="flex min-w-0 flex-wrap items-center gap-[8px]"><Status tone={connected ? 'accent' : 'warning'}>{connected ? accessWords.connected : connection.state === 'reauth_required' ? accessWords.reconnect : accessWords.disconnected}</Status><span className="break-all cf-caption text-cf-ink-muted">{connection.id}</span></div>
    <p className="cf-body-sm text-cf-ink-muted">{accessWords.balanceUnknown}</p>
    <div className="grid gap-[12px] sm:grid-cols-2"><Input standalone name={`video-credit-job-${connection.id}`} label={accessWords.jobLimit} inputMode="decimal" value={perJob} disabled={!canWrite || !!pending || !connected || !connection.workspaceGranted} onChange={event => setPerJob(event.target.value)} /><Input standalone name={`video-credit-month-${connection.id}`} label={accessWords.monthLimit} inputMode="decimal" value={perMonth} disabled={!canWrite || !!pending || !connected || !connection.workspaceGranted} onChange={event => setPerMonth(event.target.value)} /></div>
    <p className="cf-body-sm text-cf-ink-muted">{accessWords.limitsNote}</p>
    <div className="flex flex-wrap gap-[8px]">
      <Button variant="secondary" disabled={!canWrite || !!pending || !valid || !connected || !connection.workspaceGranted} loading={pending === `limits-${connection.id}`} loadingLabel={words.saving} onClick={() => onLimits(perJob, perMonth)}>{accessWords.saveLimits}</Button>
      {!connection.workspaceGranted && connected && <Button variant="secondary" disabled={!canWrite || !!pending} loading={pending === `grant-${connection.id}`} loadingLabel={words.saving} onClick={onGrant}>{accessWords.grant}</Button>}
      {connection.state !== 'disconnected' && <ConfirmButton label={accessWords.disconnect} armedLabel={accessWords.confirmDisconnect} disabled={!canWrite || !!pending} loading={pending === `disconnect-${connection.id}`} loadingLabel={words.loading} onConfirm={onDisconnect} />}
    </div>
  </div>;
}
