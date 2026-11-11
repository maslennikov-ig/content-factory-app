'use client';

import { useEffect, useId, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { useUser } from '../layout/user.context';
import { AgentCard } from './agent.cards';
import type { AgentHeygenConsentRef } from './agent.contract';
import type { AgentWords } from './agent.copy';

/** Defense in depth for the private browser response; never pass this value to chat or storage. */
export function readHeygenConsentLink(value: unknown): {url: string; expiresAt: string} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.url !== 'string' || row.url.length > 2048 || typeof row.expiresAt !== 'string' || row.expiresAt.length > 40 ||
    !/^\d{4}-\d\d-\d\dT/.test(row.expiresAt) || !Number.isFinite(Date.parse(row.expiresAt))) return null;
  try {
    const url = new URL(row.url);
    const recording = url.hostname === 'app.heygen.com' && url.pathname === '/avatars/api-video/record' &&
      [...url.searchParams.keys()].length === 1 && url.searchParams.getAll('token').length === 1 &&
      /^[A-Za-z0-9._~-]{1,1000}$/.test(url.searchParams.get('token') ?? '');
    if (url.protocol !== 'https:' || !['heygen.com', 'www.heygen.com', 'app.heygen.com'].includes(url.hostname) ||
      url.port || url.username || url.password || url.hash || !(recording || /^\/consent\/[A-Za-z0-9._~-]{1,1000}\/?$/.test(url.pathname))) return null;
    return {url: url.href, expiresAt: row.expiresAt};
  } catch {return null;}
}

export function HeygenConsentCard({consent, words}: {
  consent: AgentHeygenConsentRef;
  words: AgentWords;
}) {
  const user = useUser(), request = useFetch(), w = words.heygenConsent;
  // A remounted card must authorize its read before showing any cached bearer URL.
  const readId = useId();
  const [now, setNow] = useState(() => Date.now());
  const readable = !!user?.id && !!user?.orgId;
  const originalExpiry = Date.parse(consent.expiresAt);
  const result = useSWR(readable && originalExpiry > now
    ? ['heygen-consent', user.orgId, user.id, consent.threadId, consent.id, readId] : null, async () => {
      try {
        const response = await request(`/agent/threads/${encodeURIComponent(consent.threadId)}/heygen-consent/${encodeURIComponent(consent.id)}`, {method: 'GET', cache: 'no-store'});
        if (!response.ok) throw new Error(response.status === 410 ? 'expired' : [401, 403, 404].includes(response.status) ? 'unavailable' : 'failed');
        const value = readHeygenConsentLink(await response.json());
        if (!value) throw new Error('unavailable');
        return value;
      } catch (error) {
        // No provider URL or response body is retained in a SWR error or browser log.
        throw new Error(error instanceof Error && ['expired', 'unavailable'].includes(error.message) ? error.message : 'failed');
      }
    }, {revalidateOnMount: true, revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false, keepPreviousData: false});
  const expiry = Math.min(originalExpiry, result.data ? Date.parse(result.data.expiresAt) : originalExpiry);
  useEffect(() => {
    const remaining = expiry - Date.now();
    if (remaining <= 0) {setNow(Date.now()); return;}
    const timer = setTimeout(() => setNow(Date.now()), Math.min(remaining, 2147483647));
    return () => clearTimeout(timer);
  }, [expiry]);
  const expired = expiry <= Math.max(now, Date.now()) || result.error?.message === 'expired';
  const unavailable = !readable || result.error?.message === 'unavailable';
  const checking = !expired && !unavailable && !result.error && (result.isLoading || result.isValidating || !result.data);
  const link = !expired && !unavailable && !result.error && !checking ? result.data : null;
  return <AgentCard cardKind="heygen-consent" glyph="user" kind={w.title} title={consent.name} label={w.title}
    footer={link ? <a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
      className={buttonClassName({variant: 'primary'})}>{w.open}</a> : !expired && !unavailable && result.error ?
      <Button type="button" variant="secondary" loading={result.isValidating} loadingLabel={w.loading} onClick={() => void result.mutate()}>{w.retry}</Button> : undefined}>
    <p role="status" className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{expired ? w.expired : unavailable ? w.unavailable : result.error ? w.failed : checking ? w.loading : w.notice}</p>
    {link ? <p className="cf-caption text-cf-ink-muted"><time dateTime={new Date(expiry).toISOString()}>{w.expires(new Intl.DateTimeFormat(words.locale, {dateStyle: 'medium', timeStyle: 'short'}).format(expiry))}</time></p> : null}
  </AgentCard>;
}
