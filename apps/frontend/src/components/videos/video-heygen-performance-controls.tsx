'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Button } from '@contentfactory/react/form/button';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import type { HeygenPerformanceKeyV1, HeygenPerformanceValuesV1, HeygenPerformanceLimitationV1 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-performance.v1';
import { LabelledField } from '../ui/field-label';
import { SectionLabel } from '../ui/section-label';
import { SkeletonRows } from '../ui/surface';
import type { VideoDraftUiV1 } from './video-ui.v1';
import { heygenPerformanceCopy } from './video-heygen-performance.copy';

type PerformanceValues = HeygenPerformanceValuesV1;
type Field = HeygenPerformanceKeyV1;
type PerformanceView = {
  draftId: string; draftVersion: number; revision: number; values: PerformanceValues;
  lockedFields: string[]; origins: Record<string,'assistant'|'manual'|'default'>;
  limitations: HeygenPerformanceLimitationV1[]; applied: boolean;
  rationale?: string;
  effectiveSettings?: {expressiveness: 'low'|'medium'|'high'|null; motionPrompt: string|null}|null;
};
type SavedPerformance = PerformanceView & {draft: VideoDraftUiV1};
type SceneReview = {draftId:string; draftVersion:number; revision:number; status:'limited'|'single_clip_available';
  limitations:{code:string}[]; operationCount:number|null};
const fields: readonly Field[] = ['context','delivery','gaze','facialIntensity','gestures','wish'];

/** Private draft planning only. Every mutation requires a separate explicit button. */
export function VideoHeygenPerformanceControls({actorKey, connectionId, connectionGeneration, draft, disabled, draftDirty,
  onDirtyChange, onBusyChange, onSaved}: {
  actorKey: string; connectionId: string; connectionGeneration: number; draft: VideoDraftUiV1;
  disabled: boolean; draftDirty: boolean; onDirtyChange: (dirty:boolean)=>void; onBusyChange: (busy:boolean)=>void;
  onSaved: (next:VideoDraftUiV1, expected:{id:string;version:number})=>Promise<void>;
}) {
  const request=useFetch(),language=useInterfaceLanguage(),w=heygenPerformanceCopy[language.startsWith('ru')?'ru':'en'];
  const scope=JSON.stringify([actorKey,connectionId,connectionGeneration,draft.id]);
  const current=useRef({scope,version:draft.version});current.current={scope,version:draft.version};
  const [snapshot,setSnapshot]=useState<PerformanceView|null>(null),[changes,setChanges]=useState<Partial<PerformanceValues>>({});
  const [releaseFields,setReleaseFields]=useState<Field[]>([]),[busy,setBusy]=useState<'apply'|'preference'|null>(null);
  const [error,setError]=useState<'failed'|'stale'|''>(''),[notice,setNotice]=useState(false),lock=useRef<symbol|null>(null);
  const mounted=useRef(true);
  const [saveLimitations,setSaveLimitations]=useState<HeygenPerformanceLimitationV1[]>([]);
  const [sceneRequest,setSceneRequest]=useState('');
  const dirty=Object.keys(changes).length>0||releaseFields.length>0;
  const read=useSWR<PerformanceView>(['heygen-performance-v1',actorKey,connectionId,connectionGeneration,draft.id,draft.version],async()=>{
    const response=await request(`/media/video-v2/drafts/${encodeURIComponent(draft.id)}/performance`);
    if(!response.ok)throw Error('read');const value:PerformanceView=await response.json();
    if(value.draftId!==draft.id||!Number.isInteger(value.revision)||!value.values||!Array.isArray(value.lockedFields))throw Error('read');
    return value;
  },{revalidateOnFocus:true,shouldRetryOnError:false});
  useEffect(()=>{setSnapshot(null);setChanges({});setReleaseFields([]);setError('');setNotice(false);setSaveLimitations([]);lock.current=null;setBusy(null);onDirtyChange(false);onBusyChange(false);},[scope,onDirtyChange,onBusyChange]);
  useEffect(()=>{if(read.data&&!dirty)setSnapshot(read.data);},[read.data,dirty]);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;lock.current=null;onDirtyChange(false);onBusyChange(false);};},[onDirtyChange,onBusyChange]);
  const stale=error==='stale'||!!snapshot&&(snapshot.draftVersion!==draft.version||!!read.data&&(read.data.revision!==snapshot.revision||read.data.draftVersion!==snapshot.draftVersion));
  const frozen=disabled||draftDirty||busy!==null,values=snapshot?{...snapshot.values,...changes}:null;
  const sceneKey = snapshot && `${scope}:${draft.version}:${snapshot.revision}`;
  const scene = useSWR<SceneReview>(sceneKey && sceneRequest === sceneKey && !stale && !dirty && !draftDirty
    ? ['heygen-scene-review-v1', sceneKey] : null, async () => {
    const response = await request('/media/video-v2/performance-scenes', {method:'POST',
      body: JSON.stringify({draftId:draft.id, version:draft.version, expectedRevision:snapshot!.revision})});
    if (!response.ok) throw new Error('read');
    const result: SceneReview = await response.json();
    if (result.draftId !== draft.id || result.draftVersion !== draft.version || result.revision !== snapshot!.revision)
      throw new Error('stale');
    return result;
  }, {revalidateOnFocus:false,shouldRetryOnError:false});
  const checkScene = () => {
    if (!sceneKey) return;
    if (sceneRequest === sceneKey) void scene.mutate();
    else setSceneRequest(sceneKey);
  };
  const edit=<K extends Field>(field:K,value:PerformanceValues[K])=>{
    setChanges(previous=>({...previous,[field]:value}));setReleaseFields(previous=>previous.filter(item=>item!==field));
    onDirtyChange(true);setNotice(false);setSaveLimitations([]);if(error!=='stale')setError('');
  };
  const release=(field:Field)=>{
    setChanges(previous=>{const next={...previous};delete next[field];return next;});
    setReleaseFields(previous=>previous.includes(field)?previous:[...previous,field]);onDirtyChange(true);setNotice(false);setSaveLimitations([]);
  };
  const reset=()=>{setChanges({});setReleaseFields([]);setNotice(false);setError('');setSaveLimitations([]);onDirtyChange(false);if(read.data)setSnapshot(read.data);};
  const reload=async()=>{reset();await read.mutate().catch(()=>undefined);};
  const mutate=async(kind:'apply'|'preference')=>{
    if(lock.current||frozen||stale||!snapshot||kind==='preference'&&(dirty||!snapshot.revision))return;
    const token=Symbol('performance-save'),started={...current.current},expected={id:draft.id,version:draft.version};
    const stillCurrent=()=>mounted.current&&lock.current===token&&current.current.scope===started.scope&&current.current.version===started.version;
    lock.current=token;setBusy(kind);onBusyChange(true);setError('');setNotice(false);setSaveLimitations([]);
    try {
      const response=await request(kind==='apply'?'/media/video-v2/performance':'/media/video-v2/performance-preference',{
        method:'POST',body:JSON.stringify({draftId:draft.id,version:draft.version,expectedRevision:snapshot.revision,
          ...(kind==='apply'?{...(Object.keys(changes).length?{changes}:{}),...(releaseFields.length?{releaseFields}:{})}:{})}),
      });
      if(!response.ok){const body=await response.json().catch(()=>null);
        if(stillCurrent()&&Array.isArray(body?.limitations))setSaveLimitations(body.limitations.filter((item:HeygenPerformanceLimitationV1)=>typeof item.field==='string'&&typeof item.code==='string'));
        throw Error(response.status===409||/CHANGED|STALE|CONFLICT|VERSION|REVISION/.test(body?.code??'')?'stale':'failed');}
      const result:SavedPerformance&{preferenceSaved?:boolean}=await response.json();
      if(!stillCurrent())return;
      if(result.draftId!==draft.id||!Number.isInteger(result.revision)||result.revision<snapshot.revision||!result.values)throw Error('stale');
      if(kind==='apply'){
        const next=result.draft;
        if(!next||next.id!==draft.id||next.pieceId!==draft.pieceId||!Number.isInteger(next.version)||next.version<=draft.version||result.draftVersion!==next.version||!next.settings?.heygenV2||!next.brief)throw Error('stale');
        const previous=draft.settings.heygenV2!,saved=next.settings.heygenV2;
        if(saved.binding.connectionId!==previous.binding.connectionId||saved.binding.profileId!==previous.binding.profileId||saved.binding.profileDigest!==previous.binding.profileDigest||
          saved.settings.sourceLookId!==previous.settings.sourceLookId||saved.settings.appearanceLookId!==previous.settings.appearanceLookId||saved.settings.voiceId!==previous.settings.voiceId||next.brief.script!==draft.brief.script)throw Error('stale');
        await onSaved({...draft,...next,pieceRevision:next.pieceRevision??draft.pieceRevision},expected);
        // onSaved adopts the new version; scope ownership still guards late completions.
        if(current.current.scope!==started.scope||lock.current!==token)return;
        setChanges({});setReleaseFields([]);setSnapshot(result);onDirtyChange(false);
      } else {
        if(result.preferenceSaved!==true||result.draftVersion!==draft.version)throw Error('stale');
        setNotice(true);setSnapshot(result);
      }
      await read.mutate(result,false);
    } catch(cause) {
      if(stillCurrent())setError(cause instanceof Error&&/stale|DRAFT_CHANGED|CONFLICT/.test(cause.message)?'stale':'failed');
    } finally {
      if(lock.current===token){lock.current=null;setBusy(null);onBusyChange(false);}
    }
  };
  const origin=(field:Field)=>{
    const automatic=releaseFields.includes(field),manual=!automatic&&(Object.prototype.hasOwnProperty.call(changes,field)||snapshot?.lockedFields.includes(field)||snapshot?.origins[field]==='manual');
    return <div className="flex flex-wrap items-center gap-[8px]">
      <span className="cf-caption text-cf-ink-muted">{manual?w.manual:snapshot?.origins[field]==='default'?w.defaultSource:w.auto}</span>
      {manual&&<Button type="button" variant="quiet" density="dense" disabled={frozen} aria-label={`${w.release}: ${w[field]}`} onClick={()=>release(field)}>{w.release}</Button>}
      {automatic&&<span className="cf-body-sm text-cf-ink-muted">{w.releasePending}</span>}
    </div>;
  };
  const selects=values?[
    {field:'context' as const,options:w.contexts}, {field:'delivery' as const,options:w.deliveries},
    {field:'gaze' as const,options:w.gazes}, {field:'facialIntensity' as const,options:w.faces}, {field:'gestures' as const,options:w.gesturesOptions},
  ]:[];
  const limitations=saveLimitations.length?saveLimitations:snapshot?.limitations??[];
  const needsApply=!!snapshot&&(snapshot.revision===0||snapshot.limitations.some(item=>item.code==='draft_changed'));
  const limitationText=(item:HeygenPerformanceLimitationV1)=>Object.prototype.hasOwnProperty.call(w.limitationCodes,item.code)
    ?w.limitationCodes[item.code as keyof typeof w.limitationCodes]:w.limitations[fields.includes(item.field as Field)?item.field as Field:'unknown'];
  const visibleLimitations=[...new Map(limitations.map(item=>[limitationText(item),item])).values()];
  return <section aria-label={w.title} className="flex min-w-0 flex-col gap-[12px] border-t border-cf-border pt-[16px]" aria-busy={busy!==null}>
    <SectionLabel as="h4">{w.title}</SectionLabel>
    <p className="cf-body-sm text-cf-ink-muted">{w.planNote}</p>
    {!snapshot||!values?read.error?<p role="alert" className="cf-body-sm text-cf-danger">{w.readFailed} <Button type="button" variant="quiet" onClick={()=>read.mutate()}>{w.refresh}</Button></p>:<SkeletonRows rows={3} label={w.loading}/>:<>
      <p role="status" className="cf-body-sm text-cf-ink-muted">{snapshot.applied?w.applied:snapshot.revision>0&&snapshot.limitations.length?w.partiallyApplied:w.notApplied}</p>
      {snapshot.rationale&&<p className="cf-body-sm text-cf-ink-muted">{snapshot.rationale}</p>}
      {snapshot.effectiveSettings&&<div className="flex min-w-0 flex-col gap-[8px] cf-body-sm text-cf-ink-muted">
        <p>{w.actualSettings}</p><dl className="flex min-w-0 flex-col gap-[8px]">
          <div><dt>{w.actualFace}</dt><dd>{snapshot.effectiveSettings.expressiveness?w.faces[snapshot.effectiveSettings.expressiveness]:w.noFace}</dd></div>
          <div><dt>{w.actualMotion}</dt><dd className="break-words">{snapshot.effectiveSettings.motionPrompt||w.noMotion}</dd></div>
        </dl>
      </div>}
      <div className="grid min-w-0 gap-[16px] split:grid-cols-2">
        {selects.map(({field,options})=><LabelledField key={field} id={`heygen-performance-${field}`} label={w[field]}>
          <Select standalone id={`heygen-performance-${field}`} value={values[field]} disabled={frozen} aria-describedby={field==='delivery'?'heygen-performance-delivery-hint':field==='gestures'?'heygen-performance-gestures-hint':undefined} onChange={event=>edit(field,event.target.value as PerformanceValues[typeof field])}>
            {Object.entries(options).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </Select>
          {field==='delivery'&&<p id="heygen-performance-delivery-hint" className="cf-body-sm text-cf-ink-muted">{w.deliveryHints[values.delivery]}</p>}
          {field==='gestures'&&<p id="heygen-performance-gestures-hint" className="cf-body-sm text-cf-ink-muted">{w.gesturesHint}</p>}
          {origin(field)}
        </LabelledField>)}
      </div>
      <LabelledField id="heygen-performance-wish" label={w.wish}>
        <Textarea standalone id="heygen-performance-wish" layout="content" maxLength={500} value={values.wish} disabled={frozen} aria-describedby="heygen-performance-wish-hint" onChange={event=>edit('wish',event.target.value)}/>
        <p id="heygen-performance-wish-hint" className="cf-body-sm text-cf-ink-muted">{w.wishHint}</p>{origin('wish')}
      </LabelledField>
      {visibleLimitations.length>0&&<div role="status" className="cf-body-sm text-cf-warning"><p>{w.limited}</p><ul className="list-disc space-y-[8px] pl-[24px]">{visibleLimitations.map((item,index)=><li key={`${item.field}:${item.code}:${index}`}>{limitationText(item)}</li>)}</ul></div>}
      {draftDirty&&<p role="status" className="cf-body-sm">{w.saveFirst}</p>}
      {dirty&&<p role="status" className="cf-body-sm">{w.dirty}</p>}
      {stale&&<p role="alert" className="cf-body-sm text-cf-danger">{w.stale} <Button type="button" variant="quiet" disabled={frozen} onClick={reload}>{w.reload}</Button></p>}
      {error==='failed'&&<p role="alert" className="cf-body-sm text-cf-danger">{w.failed}</p>}
      {read.error&&<p role="alert" className="cf-body-sm text-cf-danger">{w.readFailed} <Button type="button" variant="quiet" disabled={frozen} onClick={()=>read.mutate()}>{w.refresh}</Button></p>}
      {notice&&<p role="status" className="cf-body-sm">{w.preferenceSaved}</p>}
      <div className="flex flex-wrap gap-[8px]">
        <Button type="button" variant="secondary" disabled={frozen||stale||!dirty&&!needsApply} loading={busy==='apply'} loadingLabel={w.applying} onClick={()=>mutate('apply')}>{w.apply}</Button>
        {dirty&&<Button type="button" variant="quiet" disabled={busy!==null||disabled} onClick={reset}>{w.discard}</Button>}
        <Button type="button" variant="quiet" disabled={frozen||dirty||stale||!snapshot.revision} loading={busy==='preference'} loadingLabel={w.savingPreference} onClick={()=>mutate('preference')}>{w.preference}</Button>
        <Button type="button" variant="quiet" disabled={frozen||dirty||stale||scene.isLoading} loading={scene.isLoading}
          loadingLabel={w.sceneChecking} onClick={checkScene}>{w.sceneCheck}</Button>
      </div>
      {scene.error&&<p role="alert" className="cf-body-sm text-cf-danger">{w.sceneFailed}</p>}
      {scene.data&&<div role="status" className="flex flex-col gap-[8px] cf-body-sm">
        <p>{scene.data.status==='single_clip_available'?w.sceneReady:w.sceneLimited}</p>
        {scene.data.status==='limited'&&<ul className="list-disc space-y-[8px] pl-[24px]">{[...new Set(scene.data.limitations.map(item=>
          Object.prototype.hasOwnProperty.call(w.sceneReasons,item.code)?w.sceneReasons[item.code as keyof typeof w.sceneReasons]:w.sceneReasons.other
        ))].map(reason=><li key={reason}>{reason}</li>)}</ul>}
      </div>}
    </>}
  </section>;
}
