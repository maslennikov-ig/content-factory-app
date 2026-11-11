'use client';

import useSWR from 'swr';
import { useState, useEffect, useRef } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Button } from '@contentfactory/react/form/button';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useUser } from '../layout/user.context';
import { SkeletonRows, Status } from '../ui/surface';
import { SectionLabel } from '../ui/section-label';
import { AgentCard } from './agent.cards';
import { AgentMarkdown } from './agent.markdown';
import { type AgentClipPreproductionRef, type AgentWorkContextV1 } from './agent.contract';
import { clipPreproductionKey, readOwnedClipPreproduction } from './agent.preproduction-read';
import { clipPreproductionWordsFor } from './agent.preproduction.copy';
import { ClipProductionDetails } from './agent.clip-production';
import { clipProductionWordsFor } from './agent.clip-production.copy';

export function ClipPreproductionCard({ preproduction, threadId, onOpenSource, busy = false, onRequest, readOnly = false }: {
  preproduction: AgentClipPreproductionRef;
  threadId: string | null;
  onOpenSource: () => void;
  busy?: boolean;
  onRequest?: (text: string, context: AgentWorkContextV1) => void;
  readOnly?: boolean;
}) {
  const user = useUser(), request = useFetch();
  const language = useInterfaceLanguage(), w = clipPreproductionWordsFor(language), modeWords = clipProductionWordsFor(language);
  const [savingMode, setSavingMode] = useState(false), [modeFailure, setModeFailure] = useState<'save' | 'read' | null>(null);
  const [revisionScope, setRevisionScope] = useState<'scenario' | 'references' | null>(null), [revisionText, setRevisionText] = useState('');
  const [requested, setRequested] = useState(false), requestLatch = useRef(false);
  useEffect(() => {if (!busy) {requestLatch.current = false; setRequested(false);}}, [busy]);
  const readable = !!user?.orgId && !!user?.id && !!threadId && threadId === preproduction.threadId;
  const result = useSWR(readable ? clipPreproductionKey(user.orgId, user.id, preproduction) : null,
    () => readOwnedClipPreproduction(clipPreproductionKey(user.orgId, user.id, preproduction), preproduction, request),
    { revalidateOnMount: true, revalidateOnFocus: !revisionScope, revalidateIfStale: true, dedupingInterval: 0, errorRetryCount: 0,
    refreshInterval: value => !revisionScope && value?.sourceCurrent && value.production &&
      !value.production.stages.some(stage => ['submission_unknown', 'input_changed', 'quote_failed', 'save_failed', 'status_delayed', 'reauth_required', 'access_unavailable', 'canceled', 'failed'].includes(stage.state) || stage.stage === 'clip' && stage.state === 'saved') &&
      !['needs_input', 'uncertain', 'stale'].includes(value.production.visionReview?.state ?? '') ? 10000 : 0 });
  const data = result.data;
  const canRequest = !readOnly && !!onRequest && isOrganizationEditor(user?.role) && data?.sourceCurrent === true && !busy && !requested && !savingMode;
  const requestTurn = (text: string) => {
    if (!canRequest || requestLatch.current || !text.trim()) return;
    requestLatch.current = true; setRequested(true);
    onRequest!(text, {version: 'assistant-work-context/v1', kind: 'piece', id: preproduction.pieceId, clipPilotId: preproduction.id});
  };
  const oldWorkActive = data?.models.some(model => model.state !== 'captured') || data?.production?.stages.some(stage => stage.jobId && !['saved', 'failed', 'canceled'].includes(stage.state)) ||
    ['running', 'captured', 'uncertain'].includes(data?.production?.visionReview?.state ?? '');
  const setMode = async (mode: string) => {
    if (readOnly || !data?.executionModeV2?.canChange || savingMode) return;
    setSavingMode(true); setModeFailure(null);
    let accepted = false;
    try {
      const response = await request('/social-factory/clip-preproduction/production/mode-v2', {method: 'PATCH', body: JSON.stringify({pilotId: preproduction.id, threadId, mode})});
      if (!response.ok) throw new Error('CLIP_MODE_SAVE_FAILED');
      accepted = true;
      // Never repeat the accepted write if its readback fails.
      if (!await result.mutate()) throw new Error('CLIP_MODE_READ_FAILED');
    } catch {setModeFailure(accepted ? 'read' : 'save');} finally {setSavingMode(false);}
  };
  // Recheck the source before displaying a cached acceptance, including after remount/focus.
  const checking = readable && !result.error && (result.isLoading || result.isValidating || !data);
  const author = data?.models.filter(model => model.role === 'author').at(-1);
  const critic = data?.models.filter(model => model.role === 'critic').at(-1);
  const accepted = !!data?.scenario && data.sourceCurrent === true && data.state === 'reviewed' && data.independentReviewAccepted &&
    !data.scenario.unknownFacts.length && !data.scenario.rightsConflicts.length &&
    data.review?.verdict === 'accept' && !data.review.findings.length && author?.state === 'captured' && critic?.state === 'captured' &&
    !!author.actual && !!critic.actual && author.actual !== critic.actual;
  const status = data?.sourceCurrent === false ? w.changed : accepted ? w.reviewed : data?.state === 'preparing' ? w.preparing :
    data?.state === 'uncertain' ? w.uncertain : data?.state === 'needs_input' ? w.needsInput : w.unconfirmed;
  return <AgentCard cardKind="clip-preproduction" glyph="doc" kind={w.title} label={w.title}
    tone={!checking && data && (!data.sourceCurrent || !accepted) ? 'warning' : 'neutral'}
    aside={!checking && !result.error && readable && data ? <Status tone={accepted ? 'accent' : 'warning'}>{status}</Status> : undefined}
    footer={readable ? <><Button type="button" variant="secondary" loading={result.isValidating} loadingLabel={w.loading} onClick={() => void result.mutate()}>{w.refresh}</Button>{!result.error && data ? <Button type="button" variant="quiet" onClick={onOpenSource}>{w.source}</Button> : null}</> : undefined}>
    <div className="flex min-w-0 flex-col gap-[16px] p-[16px] [overflow-wrap:anywhere]">
      {!readable ? <p role="alert" className="cf-body-sm text-cf-ink-muted">{w.unavailable}</p> : result.error ?
        <p role="alert" className="cf-body-sm text-cf-danger">{w.readFailed}</p> : checking ?
          <div aria-label={w.loading}><SkeletonRows rows={4} /></div> : data ? <>
            {data.revisionV2 ? <p role="status" className="cf-body-sm text-cf-ink">{modeWords.linkedRevision}</p> : null}
            {data.executionModeV2 ? <section className="flex min-w-0 flex-col gap-[8px]" aria-label={modeWords.mode}>
              <Select disableForm name={`clip-mode-${preproduction.id}`} label={modeWords.mode} value={data.executionModeV2.mode}
                disabled={readOnly || !data.executionModeV2.canChange || savingMode || !data.sourceCurrent} onChange={event => void setMode(event.target.value)}>
                <option value="review">{modeWords.reviewMode}</option><option value="autopilot">{modeWords.autopilotMode}</option>
              </Select>
              {savingMode ? <p role="status" className="cf-body-sm text-cf-ink-muted">{modeWords.modeSaving}</p> : null}
              {!data.executionModeV2.canChange ? <p className="cf-body-sm text-cf-ink-muted">{modeWords.modeLocked}</p> : null}
              {modeFailure ? <p role="alert" className="cf-body-sm text-cf-danger">{modeFailure === 'read' ? modeWords.modeReadFailed : modeWords.modeFailed}</p> : null}
              <p className="cf-body-sm text-cf-ink-muted">{data.executionModeV2.mode === 'review' ? modeWords.reviewScope : modeWords.wholePilot}</p>
            </section> : null}
            <p role="status" className="cf-body-sm text-cf-ink-muted">{data.sourceCurrent ? w.current : w.changed}</p>
            {data.blocker ? <p role="status" className="cf-body-sm text-cf-warning">{w.blockers[data.blocker as keyof typeof w.blockers] ?? w.genericBlocker}</p> : null}
            {data.scenario ? <>
              <section className="flex min-w-0 flex-col gap-[12px]" aria-label={w.directions}>
                <SectionLabel as="h3">{w.directions}</SectionLabel>
                {[[w.first, data.scenario.firstFrameDirections], [w.last, data.scenario.lastFrameDirections], [w.motion, data.scenario.motionDirections]].map(([label, text]) =>
                  <div key={label} className="min-w-0"><h4 className="cf-label-md text-cf-ink">{label}</h4><div lang="en"><AgentMarkdown text={text} /></div></div>)}
              </section>
              <section className="flex min-w-0 flex-col gap-[12px]" aria-label={w.output}>
                <SectionLabel as="h3">{w.output} · {data.outputLocale}</SectionLabel>
                {[[w.screen, data.scenario.screenText], [w.spoken, data.scenario.spokenText]].map(([label, text]) =>
                  <div key={label}><h4 className="cf-label-md text-cf-ink">{label}</h4><p lang={text ? data.outputLocale : undefined} className="cf-body-sm whitespace-pre-wrap text-cf-ink">{text || w.empty}</p></div>)}
                <div><h4 className="cf-label-md text-cf-ink">{w.captions}</h4>{data.scenario.captions.length ? <ul className="flex flex-col gap-[4px]">{data.scenario.captions.map((text, index) => <li key={index} lang={data.outputLocale} className="cf-body-sm whitespace-pre-wrap text-cf-ink">{text}</li>)}</ul> : <p className="cf-body-sm text-cf-ink-muted">{w.empty}</p>}</div>
              </section>
              {[[w.missingFacts, data.scenario.unknownFacts], [w.rights, data.scenario.rightsConflicts]].map(([label, values]) =>
                Array.isArray(values) && values.length ? <section key={String(label)} className="flex flex-col gap-[8px]" aria-label={String(label)}><SectionLabel as="h3">{String(label)}</SectionLabel><ul>{values.map((text, index) => <li key={index} className="cf-body-sm whitespace-pre-wrap text-cf-ink">{text}</li>)}</ul></section> : null)}
            </> : <p className="cf-body-sm text-cf-ink-muted">{w.noScenario}</p>}
            <section className="flex min-w-0 flex-col gap-[8px]" aria-label={w.review}>
              <SectionLabel as="h3">{w.review}</SectionLabel>
              <p className="cf-body-sm text-cf-ink">{!data.sourceCurrent ? w.changed : data.review ? data.review.verdict === 'accept' && !accepted ? w.unconfirmed : w.verdicts[data.review.verdict] : w.notReviewed}</p>
              {data.review?.findings.length ? <ul className="flex flex-col gap-[8px]">{data.review.findings.map((finding, index) => <li key={index} className="cf-body-sm whitespace-pre-wrap text-cf-ink">{w.categories[finding.category]}: {finding.detail}</li>)}</ul> : data.review ? <p className="cf-body-sm text-cf-ink-muted">{w.noFindings}</p> : null}
            </section>
            <section className="flex min-w-0 flex-col gap-[8px]" aria-label={w.models}>
              <SectionLabel as="h3">{w.models}</SectionLabel>
              {data.models.map((model, index) => <p key={index} className="cf-body-sm text-cf-ink">{model.role === 'author' ? w.author : w.critic}: {model.actual ? `${w.actual}: ${model.actual}` : w.unknown}{model.selected ? ` · ${w.selected}: ${model.selected}` : ''}</p>)}
            </section>
            {data.production ? <ClipProductionDetails production={data.production} current={data.sourceCurrent} /> : <>
              <p role="status" className="cf-body-sm text-cf-ink-muted">{w.pending}</p>
              <p className="cf-body-sm text-cf-ink-muted">{w.planOnly}</p>
            </>}
            {!readOnly && onRequest && isOrganizationEditor(user?.role) ? <section className="flex min-w-0 flex-col gap-[12px]" aria-label={modeWords.nextAction}>
              <SectionLabel as="h3">{modeWords.nextAction}</SectionLabel>
              {!data.production && accepted ? <Button type="button" disabled={!canRequest || !!oldWorkActive} onClick={() => requestTurn(modeWords.requestImagePreparation)}>{modeWords.prepareImageLaunch}</Button> : null}
              {accepted && data.production?.executionApproval.canApprove ? <>
                <p className="cf-body-sm text-cf-ink-muted">{modeWords.realApprovalNotice}</p>
                <Button type="button" disabled={!canRequest || !!oldWorkActive} onClick={() => requestTurn(data.production?.executionV2?.mode === 'review' ? modeWords.requestScriptApproval : modeWords.requestAutopilotApproval)}>{modeWords.openScriptApproval}</Button>
              </> : null}
              {data.production?.executionV2?.referenceApproval.canApprove ? <>
                <p className="cf-body-sm text-cf-ink-muted">{modeWords.realApprovalNotice}</p>
                <Button type="button" disabled={!canRequest} onClick={() => requestTurn(modeWords.requestPairApproval)}>{modeWords.openPairApproval}</Button>
              </> : null}
              {data.production?.lastFrameRepair?.canApprove ? <>
                <p className="cf-body-sm text-cf-ink-muted">{modeWords.realApprovalNotice}</p>
                <Button type="button" disabled={!canRequest} onClick={() => requestTurn(modeWords.requestRepairApproval)}>{modeWords.openRepairApproval}</Button>
              </> : null}
              {data.scenario ? <>
                <div className="flex flex-wrap gap-[8px]">
                  <Button type="button" variant="secondary" disabled={!canRequest || !!oldWorkActive} onClick={() => setRevisionScope('scenario')}>{modeWords.reviseScenario}</Button>
                  <Button type="button" variant="secondary" disabled={!canRequest || !!oldWorkActive || !accepted} onClick={() => setRevisionScope('references')}>{modeWords.reviseReferences}</Button>
                </div>
                {oldWorkActive ? <p role="status" className="cf-body-sm text-cf-warning">{modeWords.activeRevisionBlocked}</p> : null}
              </> : null}
              {revisionScope ? <form className="flex min-w-0 flex-col gap-[8px]" onSubmit={event => {event.preventDefault(); if (revisionText.trim() && !oldWorkActive) requestTurn(`${revisionScope === 'references' ? modeWords.referenceCorrectionRequest : modeWords.scenarioCorrectionRequest}\n\n${revisionText}`);}}>
                <p className="cf-body-sm text-cf-ink-muted">{revisionScope === 'references' ? modeWords.newPairWarning : modeWords.revisionWarning}</p>
                <Textarea disableForm name={`clip-revision-${preproduction.id}`} label={modeWords.correction} value={revisionText} onChange={event => setRevisionText(event.target.value)} rows={4} disabled={!canRequest} maxLength={5000} />
                <div className="flex flex-wrap gap-[8px]"><Button type="submit" disabled={!canRequest || !revisionText.trim() || !!oldWorkActive}>{modeWords.sendCorrection}</Button><Button type="button" variant="quiet" disabled={requested} onClick={() => setRevisionScope(null)}>{modeWords.cancelCorrection}</Button></div>
              </form> : null}
              {requested ? <p role="status" className="cf-body-sm text-cf-ink-muted">{modeWords.requestSent}</p> : null}
            </section> : null}
          </> : null}
    </div>
  </AgentCard>;
}
