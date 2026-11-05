'use client';

import { useState } from 'react';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { SectionLabel } from '../ui/section-label';
import { Status, type StatusTone } from '../ui/surface';
import { clipStages, type AgentClipProduction, type AgentClipProductionStage } from './agent.clip-production.contract';
import { clipProductionWordsFor } from './agent.clip-production.copy';

const stageTone = (state: AgentClipProductionStage['state']): StatusTone => state === 'saved' ? 'accent' :
  ['failed', 'quote_failed', 'save_failed', 'access_unavailable'].includes(state) ? 'danger' :
    ['submission_unknown', 'input_changed', 'status_delayed', 'reauth_required', 'awaiting_budget', 'awaiting_approval'].includes(state) ? 'warning' : 'neutral';

export const clipFramePreviewKey = (stage: AgentClipProductionStage) => stage.result ? JSON.stringify([stage.stage, stage.result.ownedMediaId, stage.result.byteSha256, stage.result.path]) : null;
function OwnedClipPreview({stage, label, words, onFramePreview}: {stage: AgentClipProductionStage; label: string; words: ReturnType<typeof clipProductionWordsFor>; onFramePreview?: (key: string, ready: boolean) => void}) {
  const [failed, setFailed] = useState(false);
  const media = stage.result;
  if (stage.state !== 'saved' || !media) return stage.state === 'saved' ? <p role="status" className="cf-body-sm text-cf-warning">{words.noMedia}</p> : null;
  if (failed) return <p role="alert" className="cf-body-sm text-cf-warning">{words.mediaFailed}</p>;
  return stage.stage === 'clip' ?
    <video src={media.path} controls playsInline preload="metadata" width={media.width} height={media.height} aria-label={label} onError={() => setFailed(true)} className="max-h-[480px] w-full rounded-[8px] bg-cf-surface-subtle object-contain" /> :
    <img src={media.path} alt={label} width={media.width} height={media.height} loading={onFramePreview ? 'eager' : 'lazy'}
      onLoad={() => onFramePreview?.(clipFramePreviewKey(stage)!, true)} onError={() => {setFailed(true); onFramePreview?.(clipFramePreviewKey(stage)!, false);}}
      className="max-h-[480px] w-full rounded-[8px] bg-cf-surface-subtle object-contain" />;
}

/** Read-only native stages. A refresh/recovery never implies permission to submit. */
export function ClipProductionStages({stages, current, limitSource, onFramePreview}: {stages: AgentClipProductionStage[]; current: boolean; limitSource?: AgentClipProduction['authorization']['limitSource']; onFramePreview?: (key: string, ready: boolean) => void}) {
  const language = useInterfaceLanguage(), w = clipProductionWordsFor(language);
  const delegated = limitSource === 'owner_delegated_necessary_one_pilot';
  return <section aria-label={w.title} className="flex min-w-0 flex-col gap-[16px]" data-clip-production="stages">
    <SectionLabel as="h3">{w.title}</SectionLabel>
    {!current ? <p role="status" className="cf-body-sm text-cf-warning">{w.stale}</p> :
      <ol className="flex min-w-0 flex-col gap-[16px]">{clipStages.map(name => {
        const stage = stages.find(item => item.stage === name);
        const errors = stage ? [...new Set([...stage.blockers, ...(stage.errorCode ? [stage.errorCode] : [])].map(code => code === 'VIDEO_PILOT_BUDGET_REQUIRED' && delegated ? w.calculatingCap : w.errors[code as keyof typeof w.errors] ?? w.blocker))] : [];
        return <li key={name} className="flex min-w-0 flex-col gap-[8px] border-t border-cf-border pt-[12px]" data-clip-stage={name}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-[8px]"><h4 className="cf-label-md text-cf-ink">{w.stages[name]}</h4>{stage ? <Status tone={stage.state === 'saved' && !stage.result ? 'warning' : stageTone(stage.state)}>{stage.state === 'saved' && !stage.result ? w.noMedia : stage.state === 'awaiting_budget' && delegated ? w.calculatingCapStatus : w.states[stage.state]}</Status> : null}</div>
          {!stage ? <p className="cf-body-sm text-cf-ink-muted">{w.empty}</p> : <>
            {stage.quote ? <><dl className="flex min-w-0 flex-col gap-[4px]">
              <div><dt className="cf-body-sm text-cf-ink-muted">{w.quote}</dt><dd className="cf-body-sm text-cf-ink">{stage.quote.amount} {w.unit}</dd></div>
              <div><dt className="cf-body-sm text-cf-ink-muted">{w.quoteTime}</dt><dd className="cf-body-sm text-cf-ink"><time dateTime={stage.quote.capturedAt}>{new Date(stage.quote.capturedAt).toLocaleString(language.replace(/_/g, '-'))}</time></dd></div>
              <div><dt className="cf-body-sm text-cf-ink-muted">{w.admissionUntil}</dt><dd className="cf-body-sm text-cf-ink"><time dateTime={stage.quote.localAdmissionExpiresAt}>{new Date(stage.quote.localAdmissionExpiresAt).toLocaleString(language.replace(/_/g, '-'))}</time></dd></div>
            </dl><p className="cf-body-sm text-cf-ink-muted">{w.quoteNote}</p></> : <p className="cf-body-sm text-cf-ink-muted">{w.quoteMissing}</p>}
            {stage.ownerLimit ? <><dl className="flex min-w-0 flex-col gap-[4px]">{[[w.pilotLimit, stage.ownerLimit.pilotLimit], [w.stageLimit, stage.ownerLimit.stageLimit], [w.reserved, stage.ownerLimit.reserved], [w.remaining, stage.ownerLimit.remaining]].map(([label, value]) =>
              <div key={label}><dt className="cf-body-sm text-cf-ink-muted">{label}</dt><dd className="cf-body-sm text-cf-ink">{value} {w.unit}</dd></div>)}</dl><p className="cf-body-sm text-cf-ink-muted">{w.localNote}</p></> : null}
            <p className="cf-body-sm text-cf-ink-muted">{stage.cost.certainty === 'unknown' || stage.cost.amount === null ? w.costUnknown : `${stage.cost.certainty === 'owner_reconciled' ? w.reconciledCost : w.cost}: ${stage.cost.amount} ${w.unit}`}</p>
            {stage.ownerLimit?.actualChargeUnknown && stage.cost.certainty !== 'unknown' ? <p className="cf-body-sm text-cf-warning">{w.unreconciledCharges}</p> : null}
            {stage.state === 'submission_unknown' ? <p role="status" className="cf-body-sm text-cf-warning">{w.uncertain}</p> : null}
            {errors.map(text => <p key={text} role="status" className="cf-body-sm text-cf-warning">{text}</p>)}
            {stage.recoveryActions.length ? <div className="flex flex-col gap-[4px]"><p className="cf-label-md text-cf-ink">{w.recovery}</p><ul>{stage.recoveryActions.map(action => <li key={action} className="cf-body-sm text-cf-ink">{action === 'status_read' ? w.statusRead : w.retrySave}</li>)}</ul><p className="cf-body-sm text-cf-ink-muted">{w.recoveryNote}</p></div> : null}
            <OwnedClipPreview key={clipFramePreviewKey(stage) ?? stage.preflightId} stage={stage} label={w.stages[name]} words={w} onFramePreview={onFramePreview} />
          </>}
        </li>;
      })}</ol>}
  </section>;
}

export function ClipProductionDetails({production, current, onFramePreview}: {production: AgentClipProduction; current: boolean; onFramePreview?: (key: string, ready: boolean) => void}) {
  const w = clipProductionWordsFor(useInterfaceLanguage()), vision = production.visionReview, repair = production.lastFrameRepair;
  const {authorization, settings} = production, delegated = authorization.limitSource === 'owner_delegated_necessary_one_pilot', basis = authorization.capBasis;
  const frames = vision?.frames;
  const matchingFrames = frames?.length === 2 && frames[0].slot === 'first' && frames[1].slot === 'last' && frames.every(frame => {
    const saved = production.stages.find(stage => stage.stage === (frame.slot === 'first' ? 'first_frame' : 'last_frame'));
    return saved?.state === 'saved' && saved.result?.ownedMediaId === frame.ownedMediaId && saved.result.byteSha256 === frame.byteSha256;
  });
  const accepted = current && vision?.current && vision.state === 'reviewed' && vision.verdict === 'accept' && !!vision.actualModel && !vision.findings.length && !vision.blocker && matchingFrames;
  return <div className="flex min-w-0 flex-col gap-[16px]" data-clip-production="details">
    {current && settings ? <section aria-label={w.settings} className="flex min-w-0 flex-col gap-[8px]">
      <SectionLabel as="h3">{w.settings}</SectionLabel>
      <dl className="flex min-w-0 flex-col gap-[4px]">{[
        [w.frameResolution, settings.image.resolution], [w.imageQuality, w.qualities[settings.image.quality]], [w.imageVariant, settings.image.variant],
        ...(settings.image.background ? [[w.imageBackground, w.backgrounds[settings.image.background]]] : []),
        [w.videoResolution, settings.video.resolution], [w.duration, `${settings.video.durationSeconds} ${w.seconds}`], [w.ratio, settings.video.aspectRatio],
      ].map(([label, value]) => <div key={label}><dt className="cf-body-sm text-cf-ink-muted">{label}</dt><dd className="cf-body-sm text-cf-ink">{value}</dd></div>)}</dl>
    </section> : null}
    <section aria-label={w.authorization} className="flex min-w-0 flex-col gap-[8px]">
      <SectionLabel as="h3">{w.authorization}</SectionLabel>
      <p className="cf-body-sm text-cf-ink">{!current ? w.stale : delegated && ['missing', 'awaiting_answer'].includes(authorization.state) ? w.calculatingCap : w.authorizationStates[authorization.state]}</p>
      {current && authorization.limitSource ? <p className="cf-body-sm text-cf-ink-muted">{w.limitSources[authorization.limitSource]}</p> : null}
      {current && authorization.pilotLimit !== null ? <p className="cf-body-sm text-cf-ink">{delegated ? w.operationalCap : w.pilotLimit}: {authorization.pilotLimit} {w.unit}</p> : null}
      {current && delegated ? basis ? <section aria-label={w.capBasis} className="flex min-w-0 flex-col gap-[8px]">
        <SectionLabel as="h4">{w.capBasis}</SectionLabel>
        <dl className="flex min-w-0 flex-col gap-[4px]">{[[w.firstQuote, basis.firstFrameQuotedCredits], [w.lastEstimate, basis.estimatedLastFrameCredits], [w.planningClipQuote, basis.clipPlanningQuotedCredits]].map(([label, value]) =>
          <div key={label}><dt className="cf-body-sm text-cf-ink-muted">{label}</dt><dd className="cf-body-sm text-cf-ink">{value} {w.unit}</dd></div>)}
          <div><dt className="cf-body-sm text-cf-ink-muted">{w.buffer}</dt><dd className="cf-body-sm text-cf-ink">{basis.bufferPercent}%</dd></div>
        </dl><p className="cf-body-sm text-cf-ink-muted">{w.capRule}</p><p className="cf-body-sm text-cf-ink-muted">{w.capEstimateNote}</p>
      </section> : <p role="status" className="cf-body-sm text-cf-warning">{w.capBasisMissing}</p> : null}
      <p className="cf-label-md text-cf-ink">{w.mode}: {production.executionV2?.mode === 'review' ? w.reviewMode : w.autopilotMode}</p>
      <p className="cf-body-sm text-cf-ink-muted">{production.executionV2?.mode === 'review' ? w.reviewScope : w.wholePilot}</p><p className="cf-body-sm text-cf-ink-muted">{w.laterPrices}</p>
      {production.executionV2?.mode === 'review' ? <><p role="status" className="cf-body-sm text-cf-ink">{w.referenceStates[production.executionV2.referenceApproval.state]}</p><p className="cf-body-sm text-cf-ink-muted">{w.declineScope}</p></> : null}
      {current && production.executionV2?.mode === 'review' && production.executionV2.referenceApproval.state === 'awaiting_approval' ? <p className="cf-body-sm text-cf-ink">{w.referenceNext}</p> : null}
      {current && production.blockers.length ? <p role="status" className="cf-body-sm text-cf-warning">{w.blocker}</p> : null}
    </section>
    {repair ? <section aria-label={w.repair} className="flex min-w-0 flex-col gap-[8px]" data-clip-repair={repair.state}>
      <SectionLabel as="h3">{w.repair}</SectionLabel>
      {!current || !repair.current ? <p role="status" className="cf-body-sm text-cf-warning">{w.stale}</p> : <>
        <Status tone={repair.state === 'blocked' ? 'danger' : accepted ? 'accent' : 'warning'}>{w.repairStates[repair.state]}</Status>
        <p className="cf-body-sm text-cf-ink">{w.repairScope}</p>
        <p className="cf-body-sm text-cf-ink">{repair.approved ? w.repairApproved : w.repairNotApproved}</p>
        {!repair.approved ? <p className="cf-body-sm text-cf-ink-muted">{w.repairConsent}</p> : null}
        <dl className="flex min-w-0 flex-col gap-[4px]">
          <div><dt className="cf-body-sm text-cf-ink-muted">{w.quote}</dt><dd className="cf-body-sm text-cf-ink">{repair.quote ? `${repair.quote.amount} ${w.unit}` : w.quoteMissing}</dd></div>
          {repair.remaining !== null ? <div><dt className="cf-body-sm text-cf-ink-muted">{w.remaining}</dt><dd className="cf-body-sm text-cf-ink">{repair.remaining} {w.unit}</dd></div> : null}
          <div><dt className="cf-body-sm text-cf-ink-muted">{w.repairReason}</dt><dd className="cf-body-sm whitespace-pre-wrap text-cf-ink">{repair.reason}</dd></div>
        </dl>
        <p className="cf-body-sm text-cf-ink-muted">{w.repairReview}</p>
      </>}
    </section> : null}
    <ClipProductionStages stages={production.stages} current={current} limitSource={authorization.limitSource} onFramePreview={onFramePreview} />
    <section aria-label={w.vision} className="flex min-w-0 flex-col gap-[8px]">
      <SectionLabel as="h3">{w.vision}</SectionLabel>
      {!current ? <p role="status" className="cf-body-sm text-cf-warning">{w.stale}</p> : !vision ? <p className="cf-body-sm text-cf-ink-muted">{w.visionNotStarted}</p> : <>
        <Status tone={accepted ? 'accent' : 'warning'}>{accepted ? w.visionAccepted : w.visionUnconfirmed}</Status>
        <p className="cf-body-sm text-cf-ink">{w.visionStates[vision.state]}</p>
        {!vision.current ? <p role="status" className="cf-body-sm text-cf-warning">{w.visionStale}</p> : null}
        <p className="cf-body-sm text-cf-ink-muted">{w.imageBytes}</p>
        <p className="cf-body-sm text-cf-ink">{vision.actualModel ? `${w.actual}: ${vision.actualModel}` : w.actualUnknown} · {w.selected}: {vision.selectedModel}</p>
        {vision.findings.length ? <ul className="flex flex-col gap-[4px]">{vision.findings.map((finding, index) => <li key={index} className="cf-body-sm whitespace-pre-wrap text-cf-ink">{w.categories[finding.category]}: {finding.detail}</li>)}</ul> : null}
        {vision.blocker ? <p role="status" className="cf-body-sm text-cf-warning">{w.blocker}</p> : null}
      </>}
    </section>
  </div>;
}
