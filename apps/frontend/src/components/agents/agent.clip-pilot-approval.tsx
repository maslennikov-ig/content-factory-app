'use client';

import { useEffect, useState, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Button } from '@contentfactory/react/form/button';
import { useUser } from '../layout/user.context';
import { SkeletonRows } from '../ui/surface';
import { readClipPreproduction, readClipPreproductionRef } from './agent.contract';
import { clipPilotApprovalCurrent, clipPilotApprovalReadKey, type AgentClipPilotApprovalScope } from './agent.clip-production.contract';
import { clipProductionWordsFor } from './agent.clip-production.copy';
import { ClipProductionDetails, clipFramePreviewKey } from './agent.clip-production';
import { AgentMarkdown } from './agent.markdown';
import { clipPreproductionWordsFor } from './agent.preproduction.copy';

/** Reads the existing owned parent; never refreshes a quote or starts a job. */
export function SavedClipPilotApproval({scope, threadId, onReady}: {
  scope?: AgentClipPilotApprovalScope; threadId: string | null | undefined; onReady: (scope: string | null) => void;
}) {
  const user = useUser(), request = useFetch(), language = useInterfaceLanguage(), w = clipProductionWordsFor(language), textWords = clipPreproductionWordsFor(language);
  const key = clipPilotApprovalReadKey(scope, threadId, user?.orgId, user?.id);
  const [loadedFrames, setLoadedFrames] = useState<Record<string, boolean>>({});
  const onFramePreview = useCallback((frameKey: string, ready: boolean) => setLoadedFrames(current => current[frameKey] === ready ? current : {...current, [frameKey]: ready}), []);
  const snapshot = useSWR(key ? ['clip-pilot-approval', key] : null, async () => {
    const response = await request('/social-factory/clip-preproduction/open', {method: 'POST', body: JSON.stringify({pilotId: scope!.pilotId, threadId})});
    if (!response.ok) throw new Error('CLIP_READ_UNAVAILABLE');
    const raw = await response.json();
    const ref = readClipPreproductionRef({id: scope!.pilotId, pieceId: raw?.pieceId, threadId});
    const view = ref && readClipPreproduction(raw, ref);
    if (!view) throw new Error('CLIP_READ_UNAVAILABLE');
    return view;
  }, {revalidateOnMount: true, revalidateOnFocus: true, revalidateIfStale: true, dedupingInterval: 0, errorRetryCount: 0, refreshInterval: 15000});
  const view = snapshot.data;
  const matches = !!key && !!scope && !snapshot.error && !snapshot.isLoading && !snapshot.isValidating && view?.sourceCurrent === true && !!view.production &&
    (view.production.executionV2?.mode !== 'review' || !!view.scenario) && clipPilotApprovalCurrent(view.production, scope);
  const referencePhase = !!scope && 'referenceDigest' in scope;
  const imagesReady = !referencePhase || ['first_frame', 'last_frame'].every(name => {
    const stage = view?.production?.stages.find(stage => stage.stage === name), frameKey = stage && clipFramePreviewKey(stage);
    return !!frameKey && loadedFrames[frameKey] === true;
  });
  useEffect(() => { onReady(matches && imagesReady ? key : null); return () => onReady(null); }, [matches, imagesReady, key, onReady]);
  if (!key || snapshot.error || view && !matches && !snapshot.isValidating) return <div className="flex flex-col gap-[8px]"><p role="status" className="cf-body-sm text-cf-warning">{w.unavailable}</p>{key ? <Button variant="secondary" onClick={() => void snapshot.mutate()}>{w.refresh}</Button> : null}</div>;
  if (!view || snapshot.isLoading || snapshot.isValidating) return <SkeletonRows rows={3} label={w.loading} />;
  return <section className="flex min-w-0 flex-col gap-[12px]" aria-label={w.approval}>
    <p className="cf-label-md text-cf-ink">{w.approval}</p>
    {view.production?.executionV2?.mode === 'review' && view.scenario ? <section className="flex min-w-0 flex-col gap-[12px]" aria-label={textWords.title}>
      {[[textWords.first, view.scenario.firstFrameDirections], [textWords.last, view.scenario.lastFrameDirections], [textWords.motion, view.scenario.motionDirections],
        [textWords.screen, view.scenario.screenText], [textWords.spoken, view.scenario.spokenText], [textWords.captions, view.scenario.captions.join('\n')]].map(([label, text]) =>
        <div key={label}><h4 className="cf-label-md text-cf-ink">{label}</h4><AgentMarkdown text={text || textWords.empty} /></div>)}
    </section> : null}
    {referencePhase && !imagesReady ? <p role="status" className="cf-body-sm text-cf-ink-muted">{w.previewRequired}</p> : null}
    <ClipProductionDetails production={view.production!} current={matches} onFramePreview={referencePhase ? onFramePreview : undefined} />
  </section>;
}
