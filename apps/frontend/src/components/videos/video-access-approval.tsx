'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { useUser } from '../layout/user.context';
import { ErrorState, SkeletonRows } from '../ui/surface';
import { useVideoWords } from './video.copy';
import { useVideoAccessWords } from './video-access.copy';
import { videoApprovalCurrentV2, type VideoApprovalUiV2, type VideoChargeUnitV2 } from './video-ui.v2';
import type { VideoApprovalScopeV1 } from './video-ui.v1';

export function useVideoUnitV2() {
  const accessWords = useVideoAccessWords();
  return (unit: VideoChargeUnitV2 | null | undefined) => unit === 'USD' ? 'USD' : unit === 'higgsfield_credit' ? `Higgsfield ${accessWords.credits}` : unit === 'heygen_credit' ? `HeyGen ${accessWords.credits}` : accessWords.externalCost;
}

/** Exact saved text and options, never live editable fields or remote tool arguments. */
export function VideoApprovalDetailsV2({ approval }: { approval: VideoApprovalUiV2 }) {
  const words = useVideoWords(); const accessWords = useVideoAccessWords(); const unit = useVideoUnitV2();
  const { settings, brief, quote, access } = approval;
  const facts: Array<[string, string]> = [
    [accessWords.access, access.kind === 'subscription' ? accessWords.subscription : words.payer + ': ' + (access.kind === 'api' && access.payer === 'included' ? words.included : words.workspaceKey)],
    [words.route, `${settings.provider} / ${settings.model}`], [words.locale, settings.locale], [words.ratio, settings.aspectRatio], [words.duration, String(settings.duration)],
    ...(settings.resolution ? [[words.resolution, settings.resolution] as [string, string]] : []),
    ...(settings.avatarId ? [[words.avatar, settings.avatarId] as [string, string]] : []), ...(settings.voiceId ? [[words.voice, settings.voiceId] as [string, string]] : []),
    ...(settings.engine ? [[words.engine, settings.engine] as [string, string]] : []),
    [words.scriptPolicy, brief.scriptPolicy === 'exact' ? words.exact : words.adaptable],
    [words.estimate, `${quote.amount} ${unit(quote.unit)}`], [accessWords.quoteSource, quote.source], [accessWords.quoteAsOf, quote.asOf], [accessWords.quoteExpires, approval.expiresAt],
    ...(quote.upperBound != null ? [[accessWords.upperBound, `${quote.upperBound} ${unit(quote.unit)}`] as [string, string]] : []),
    ...(approval.perJob !== null ? [[access.kind === 'subscription' ? accessWords.jobLimit : words.maxCost, `${approval.perJob} ${unit(quote.unit)}`] as [string, string]] : []),
    ...(approval.perMonth !== null ? [[accessWords.monthLimit, `${approval.perMonth} ${unit(quote.unit)}`] as [string, string]] : []),
    ...(approval.remaining !== null ? [[accessWords.remaining, `${approval.remaining} ${unit(quote.unit)}`] as [string, string]] : []),
    ...(access.kind === 'subscription' ? [[accessWords.account, `${access.connectionId} · v${approval.accountGeneration}`] as [string, string]] : []),
  ];
  return <section className="flex min-w-0 flex-col gap-[12px]" aria-label={words.reviewSnapshot} data-video-approval-v2={approval.id}>
    <p className="cf-label-md">{words.reviewSnapshot}</p>
    <dl className="flex min-w-0 flex-col gap-[8px]">{facts.map(([label, value], index) => <div key={`${label}-${index}`} className="flex min-w-0 flex-wrap justify-between gap-x-[16px] gap-y-[4px]"><dt className="cf-body-sm text-cf-ink-muted">{label}</dt><dd className="min-w-0 break-all cf-body-sm">{value}</dd></div>)}</dl>
    <div className="flex flex-wrap gap-[16px]"><CheckboxField disabled label={words.audio} checked={settings.audio} /><CheckboxField disabled label={words.captions} checked={settings.captions} /></div>
    <div className="flex min-w-0 flex-col gap-[8px] border-t border-cf-border pt-[12px]">
      <p className="cf-label-md">{words.prompt}</p><p className="whitespace-pre-wrap break-words cf-body-sm">{brief.prompt}</p>
      {settings.mode === 'presenter' && <><p className="cf-label-md">{words.script}</p><p className="whitespace-pre-wrap break-words cf-body-sm">{brief.script}</p></>}
      {!!brief.facts.length && <><p className="cf-label-md">{words.facts}</p><ul className="flex flex-col gap-[4px]">{brief.facts.map((fact, i) => <li key={i} className="break-words cf-body-sm">{fact.text} · {fact.policy === 'must_include' ? words.mustInclude : words.contextOnly}<span className="block break-all cf-caption text-cf-ink-muted">{fact.sourceId}</span></li>)}</ul></>}
      {!!brief.avoidImplications.length && <p className="whitespace-pre-wrap break-words cf-body-sm">{words.avoid}: {brief.avoidImplications.join('\n')}</p>}
      {!!brief.referenceMediaIds.length && <p className="break-all cf-caption">{words.references}: {brief.referenceMediaIds.join(', ')}</p>}
    </div>
    <p className="cf-body-sm text-cf-ink-muted">{words.quoteNote}</p><p className="cf-body-sm text-cf-ink-muted">{words.paymentNote}</p>
  </section>;
}

export function SavedVideoApprovalV2({scope, onReady}: {scope: VideoApprovalScopeV1; onReady: (scope: string | null) => void}) {
  const words = useVideoWords(); const accessWords = useVideoAccessWords(); const user = useUser(); const request = useFetch();
  const [, setClock] = useState(0);
  const snapshot = useSWR<VideoApprovalUiV2>(['video-approval-v2', user?.orgId, user?.id, scope.preflightId], async () => {
    const response = await request(`/media/video-v2/preflights/${encodeURIComponent(scope.preflightId)}`);
    if (!response.ok) throw new Error('VIDEO_APPROVAL_UNAVAILABLE');
    return response.json();
  }, {refreshInterval: 15000, revalidateOnFocus: true});
  useEffect(() => { const timer = setInterval(() => setClock(value => value + 1), 1000); return () => clearInterval(timer); }, []);
  const approval = snapshot.data;
  const matches = !snapshot.error && !snapshot.isValidating && approval?.draftId === scope.draftId && approval?.version === scope.version && approval?.preflightId === scope.preflightId && videoApprovalCurrentV2(approval);
  const scopeKey = JSON.stringify(scope);
  useEffect(() => { onReady(matches ? scopeKey : null); return () => onReady(null); }, [matches, onReady, scopeKey]);
  if (snapshot.error || approval && !matches && !snapshot.isValidating) return <ErrorState title={accessWords.approvalStale} action={<Button variant="secondary" onClick={() => snapshot.mutate()}>{words.refresh}</Button>} />;
  if (!approval || snapshot.isValidating) return <SkeletonRows rows={3} label={words.loading} />;
  return <VideoApprovalDetailsV2 approval={approval} />;
}
