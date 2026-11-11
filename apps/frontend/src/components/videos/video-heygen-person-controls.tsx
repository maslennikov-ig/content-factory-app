'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import type { HeygenPersonProfileInputV1, HeygenPersonProfileViewV1 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-person-profile.v1';
import type { HeygenVoiceBaselineV2 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-settings.v2';
import { Disclosure } from '../ui/disclosure';
import { LabelledField } from '../ui/field-label';
import { SkeletonRows } from '../ui/surface';
import type { VideoDraftUiV1, VideoSettingsV1 } from './video-ui.v1';
import { heygenControlsCopy } from './video-heygen-controls.copy';
import { VideoHeygenPerformanceControls } from './video-heygen-performance-controls';
import { VideoHeygenAdvancedOptions } from './video-heygen-advanced-options';

type OwnedLook = {id: string; name: string; groupId?: string; engines?: string[]; avatarType?: string; selectableForDraft?: boolean; ownership?: string; state?: string};
type OwnedVoice = {id: string; name: string; selectableForDraft?: boolean; ownership?: string; state?: string};
type Proposal = {profile: HeygenPersonProfileInputV1; selectionDigest: string; name: string; looks: {id: string; name: string; groupId: string}[]; voice: {id: string; name: string}};
type ProfilePage = {items: HeygenPersonProfileViewV1[]; nextCursor: string|null};
type Form = {profileId: string; sourceLookId: string; appearanceLookId: string; name: string; engine: string; speed: string; pitch: string; volume: string; expression: string; motion: string; background: string; fit: string;
  animationReferenceLookId: string; moreBlinking: boolean; resolution: string; aspectRatio: string; duration: string; captions: string; glossaryId: string; backgroundAssetId: string};
const formFromDraft = (draft: VideoDraftUiV1 | null): Form => {
  const value = draft?.settings.heygenV2;
  return {profileId: value?.binding.profileId ?? '', sourceLookId:value?.settings.sourceLookId ?? '', appearanceLookId:value?.settings.appearanceLookId ?? '',
    name:value?.settings.title ?? '',engine:value?.settings.engine.type ?? '',speed:value?.settings.voiceSettings?.speed?.toString() ?? '',pitch:value?.settings.voiceSettings?.pitch?.toString() ?? '',
    volume:value?.settings.voiceSettings?.volume?.toString() ?? '',expression:value?.settings.expressiveness ?? '',motion:value?.settings.motionPrompt ?? '',
    background:value?.settings.background?.type==='color'?value.settings.background.value:'',fit:value?.settings.fit ?? '',
    animationReferenceLookId:value?.settings.animationReferenceLookId??'',moreBlinking:value?.settings.engine.type==='avatar_v'&&value.settings.engine.moreBlinking===true,
    resolution:value?.settings.resolution??draft?.settings.resolution??'720p',aspectRatio:value?.settings.aspectRatio??draft?.settings.aspectRatio??'9:16',
    duration:String(value?.settings.durationSeconds??draft?.settings.duration??30),captions:value?.settings.captions??(draft?.settings.captions?'burned':'none'),
    glossaryId:value?.settings.brandGlossaryId??'',backgroundAssetId:value?.settings.background?.type==='image'?value.settings.background.assetId:''};
};
const readyLook = (look: OwnedLook) => !!look.groupId && look.ownership === 'owned' && look.selectableForDraft === true;
const readyVoice = (voice: OwnedVoice) => voice.ownership === 'owned' && voice.selectableForDraft === true && !['failed','training'].includes(voice.state ?? '');
/** Existing common controls keep the versioned recipe consistent without changing identity/binding. */
export function patchHeygenVideoSettings(current: VideoSettingsV1, patch: Partial<VideoSettingsV1>): VideoSettingsV1 {
  const next={...current,...patch},v=current.heygenV2;
  if(!v)return next;
  return {...next,heygenV2:{binding:v.binding,settings:{...v.settings,
    ...(patch.duration!==undefined?{durationSeconds:patch.duration}:{}),
    ...(patch.locale!==undefined&&v.settings.voiceSettings?{voiceSettings:{...v.settings.voiceSettings,locale:patch.locale}}:{}),
    ...(patch.aspectRatio!==undefined?{aspectRatio:patch.aspectRatio}:{}),
    ...(patch.resolution!==undefined?{resolution:patch.resolution as '720p'|'1080p'|'4k'}:{}),
    ...(patch.captions!==undefined?{captions:patch.captions?'burned' as const:'none' as const}:{}),
  }}};
}

/** Reuses the saved private profile. Only explicit buttons save human setup or per-video settings. */
export function VideoHeygenPersonControls({actorKey, connectionId, connectionGeneration, draft, avatars, voices, disabled, draftDirty,
  onDirtyChange: notifyDirtyChange, onBusyChange: notifyBusyChange, onSaved}: {actorKey: string; connectionId: string; connectionGeneration: number; draft: VideoDraftUiV1 | null;
  avatars: readonly OwnedLook[]; voices: readonly OwnedVoice[]; disabled: boolean; draftDirty: boolean;
  onDirtyChange: (dirty: boolean)=>void; onBusyChange: (busy: boolean)=>void;
  onSaved: (next: VideoDraftUiV1, expected: {id:string;version:number})=>Promise<void>}) {
  const request=useFetch(), language=useInterfaceLanguage();
  const w=heygenControlsCopy[language.startsWith('ru')?'ru':'en'];
  const [form,setForm]=useState(()=>formFromDraft(draft)),[changed,setChanged]=useState(false),[busy,setBusy]=useState<'review'|'profile'|'settings'|null>(null);
  const [performanceDirty,setPerformanceDirty]=useState(false),[performanceBusy,setPerformanceBusy]=useState(false);
  const dirtyParts=useRef({person:false,performance:false}),busyParts=useRef({person:false,performance:false});
  const onDirtyChange=useCallback((value:boolean)=>{dirtyParts.current.person=value;notifyDirtyChange(value||dirtyParts.current.performance);},[notifyDirtyChange]);
  const onBusyChange=useCallback((value:boolean)=>{busyParts.current.person=value;notifyBusyChange(value||busyParts.current.performance);},[notifyBusyChange]);
  const performanceEditing=useCallback((value:boolean)=>{dirtyParts.current.performance=value;setPerformanceDirty(value);notifyDirtyChange(value||dirtyParts.current.person);},[notifyDirtyChange]);
  const performanceSaving=useCallback((value:boolean)=>{busyParts.current.performance=value;setPerformanceBusy(value);notifyBusyChange(value||busyParts.current.person);},[notifyBusyChange]);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [profileName,setProfileName]=useState(''),[newLookId,setNewLookId]=useState(''),[newVoiceId,setNewVoiceId]=useState(''),[extraLooks,setExtraLooks]=useState<string[]>([]);
  const [proposal,setProposal]=useState<Proposal|null>(null),lock=useRef(false);
  const [additionalLookId,setAdditionalLookId]=useState('');
  const [loadingMore,setLoadingMore]=useState(false),[pageError,setPageError]=useState(false);
  const pageLoad=useRef<symbol|null>(null),scopeRef=useRef('');
  const profileScope=JSON.stringify([actorKey,connectionId,connectionGeneration]);scopeRef.current=profileScope;
  const profilePath=`/media/video-v2/connections/${encodeURIComponent(connectionId)}/person-profiles`;
  const pages=useSWRInfinite<ProfilePage>((index:number,previous:ProfilePage|null)=>previous&&!previous.nextCursor?null:
    ['heygen-person-profiles-v1',actorKey,connectionId,connectionGeneration,index===0?'':previous!.nextCursor],async(key:readonly unknown[])=>{
    const cursor=key[4] as string;const response=await request(`${profilePath}${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);
    if(!response.ok)throw Error('read');return response.json();
  },{revalidateOnFocus:true,persistSize:false,revalidateFirstPage:false});
  const profiles={data:pages.data?{items:[...new Map(pages.data.flatMap(page=>page.items).map(item=>[item.profileId,item])).values()],nextCursor:pages.data.at(-1)?.nextCursor??null}:undefined,
    error:pages.error,mutate:pages.mutate};
  const loadMore=async()=>{
    if(pageLoad.current||disabled||!profiles.data?.nextCursor)return;
    const token=Symbol('profile-page'),scope=profileScope;pageLoad.current=token;setLoadingMore(true);setPageError(false);
    try{await pages.setSize(Math.max(pages.size,(pages.data?.length??0)+1));}
    catch{if(pageLoad.current===token&&scopeRef.current===scope)setPageError(true);}
    finally{if(pageLoad.current===token&&scopeRef.current===scope){pageLoad.current=null;setLoadingMore(false);}}
  };
  useEffect(()=>{pageLoad.current=null;setLoadingMore(false);setPageError(false);setProposal(null);setAdditionalLookId('');},[profileScope]);
  useEffect(()=>{setForm(formFromDraft(draft?.settings.heygenV2?.binding.connectionId===connectionId?draft:null));setChanged(false);onDirtyChange(false);},[draft?.id,draft?.version,profileScope]);
  useEffect(()=>()=>{onDirtyChange(false);onBusyChange(false);},[onDirtyChange,onBusyChange]);
  const profile=profiles.data?.items.find(item=>item.profileId===form.profileId);
  const selectedSource=profile?.sourceLooks.find(look=>look.lookId===form.sourceLookId);
  const appearance=avatars.find(look=>look.id===(form.appearanceLookId||profile?.defaultAppearanceLookId||form.sourceLookId));
  const engine=form.engine || (draft?.settings.heygenV2?.binding.profileId===form.profileId?draft.settings.heygenV2.settings.engine.type:undefined) || 'avatar_iv';
  const supportsExpression=engine==='avatar_iv'&&appearance?.avatarType==='photo_avatar'&&appearance.engines?.includes('avatar_iv');
  const supportsMotion=engine==='avatar_v'&&!!appearance?.engines?.includes(engine)&&(appearance.avatarType!=='photo_avatar'||!!form.animationReferenceLookId);
  const sourceOptions=profile?.sourceLooks.filter(look=>look.roles.includes('style_base'))??[];
  const appearanceOptions=profile?.sourceLooks.filter(look=>look.roles.includes('appearance')&&look.groupId===selectedSource?.groupId)??[];
  const animationOptions=profile?.sourceLooks.filter(look=>look.roles.includes('animation_reference')&&look.groupId===selectedSource?.groupId&&
    avatars.some(candidate=>candidate.id===look.lookId&&candidate.avatarType==='digital_twin'&&readyLook(candidate)))??[];
  const lookName=(id:string)=>avatars.find(look=>look.id===id)?.name??profile?.observations.looks.find(look=>look.lookId===id)?.name??w.chooseLook;
  const patch=(value:Partial<Form>)=>{setForm(current=>({...current,...value}));setChanged(true);onDirtyChange(true);setError('');setNotice('');};
  const changeProfile=(id:string)=>{
    setProposal(null);setAdditionalLookId('');
    const next=profiles.data?.items.find(item=>item.profileId===id);
    const base=next?.sourceLooks.find(look=>look.lookId===next.preferredSourceLookId);
    const savedAppearance=next?.sourceLooks.find(look=>look.lookId===next.defaultAppearanceLookId&&look.groupId===base?.groupId&&look.roles.includes('appearance'));
    // Saved deliberate defaults may be reused; first-row provider order never selects identity.
    patch({profileId:id,sourceLookId:next?.preferredSourceLookId??'',appearanceLookId:savedAppearance?.lookId??(base?.roles.includes('appearance')?base.lookId:''),
      engine:'',speed:'',pitch:'',volume:'',expression:'',motion:'',background:'',backgroundAssetId:'',fit:'',animationReferenceLookId:'',moreBlinking:false});
  };
  const run=async(kind:NonNullable<typeof busy>,callback:()=>Promise<void>)=>{
    if(lock.current||disabled||busyParts.current.performance||dirtyParts.current.performance)return;lock.current=true;setBusy(kind);onBusyChange(true);setError('');setNotice('');
    try{await callback();}catch(error){const setting=error instanceof Error?error.message:'';
      setError(Object.prototype.hasOwnProperty.call(w.settingErrors,setting)?w.settingErrors[setting as keyof typeof w.settingErrors]:w.failed);
    }finally{lock.current=false;setBusy(null);onBusyChange(false);}
  };
  const post=async<T,>(path:string,body:unknown):Promise<T>=>{
    const response=await request(path,{method:'POST',body:JSON.stringify(body)});
    if(!response.ok){const result=await response.json().catch(()=>null);
      throw Error(result?.code==='VIDEO_HEYGEN_BACKGROUND_DOWNLOAD_UNAVAILABLE'?'background_asset':
        result?.code==='VIDEO_HEYGEN_SETTING_UNAVAILABLE'&&typeof result.setting==='string'?result.setting:'save');}
    return response.json();
  };
  const apply=()=>run('settings',async()=>{
    if(!draft||draftDirty||!profile?.setupReusable||!selectedSource||!appearanceOptions.some(look=>look.lookId===form.appearanceLookId))return;
    const current=draft.settings.heygenV2?.binding.profileId===profile.profileId&&draft.settings.heygenV2.binding.profileDigest===profile.digest?draft.settings.heygenV2.settings:undefined;
    // Retain qualified controls this compact panel does not edit. It submits a new recipe, never mutates an old one.
    const overrides:Record<string,unknown>={...(current?{engine:current.engine,resolution:current.resolution,aspectRatio:current.aspectRatio,
      durationSeconds:current.durationSeconds,captions:current.captions,outputFormat:current.outputFormat,
      ...(current.removeBackground!==undefined?{removeBackground:current.removeBackground}:{})}: {})};
    const savedBackground = current?.background?.type==='image' && current.background.assetId===form.backgroundAssetId ? current.background : undefined;
    if (savedBackground) overrides.background = savedBackground;
    if (!form.backgroundAssetId && !form.background.trim() && draft.settings.heygenV2?.settings.background) overrides.background = null;
    if (form.glossaryId || draft.settings.heygenV2?.settings.brandGlossaryId)
      overrides.brandGlossaryId = form.glossaryId || null;
    const voiceSettings:HeygenVoiceBaselineV2=current?.voiceSettings?.engineSettings?{engineSettings:current.voiceSettings.engineSettings}:{};
    for(const key of ['speed','pitch','volume'] as const)if(form[key].trim())voiceSettings[key]=Number(form[key]);
    if(Object.keys(voiceSettings).length)overrides.voiceSettings=voiceSettings;
    if(form.name.trim())overrides.title=form.name.trim();
    if(form.engine)overrides.engine={type:form.engine,...(form.engine==='avatar_v'?{moreBlinking:form.moreBlinking}:{})};
    overrides.resolution=form.resolution;overrides.aspectRatio=form.aspectRatio;overrides.durationSeconds=Number(form.duration);overrides.captions=form.captions;
    if(form.expression)overrides.expressiveness=form.expression;
    if(form.motion.trim())overrides.motionPrompt=form.motion.trim();
    if(form.background.trim())overrides.background={type:'color',value:form.background.trim()};
    if(form.fit)overrides.fit=form.fit;
    const result=await post<VideoDraftUiV1>('/media/video-v2/heygen-settings',{draftId:draft.id,version:draft.version,connectionId,profileId:profile.profileId,
      groupId:selectedSource.groupId,sourceLookId:form.sourceLookId,appearanceLookId:form.appearanceLookId,
      ...(form.backgroundAssetId&&!savedBackground?{backgroundAssetId:form.backgroundAssetId}:{}),
      ...(engine==='avatar_v'&&form.animationReferenceLookId?{animationReferenceLookId:form.animationReferenceLookId}:{}),overrides});
    if(result.id!==draft.id||result.pieceId!==draft.pieceId||!Number.isInteger(result.version)||result.version<draft.version||!result.settings?.heygenV2||!result.brief)throw Error('stale');
    await onSaved({...draft,...result,pieceRevision:result.pieceRevision??draft.pieceRevision},{id:draft.id,version:draft.version});
    setChanged(false);onDirtyChange(false);
  });
  const reviewProfile=()=>run('review',async()=>{
    const base=avatars.find(item=>item.id===newLookId);if(!base||!readyLook(base)||!voices.some(voice=>voice.id===newVoiceId&&readyVoice(voice)))return;
    const selected=[base,...avatars.filter(look=>extraLooks.includes(look.id)&&look.id!==base.id&&look.groupId===base.groupId&&readyLook(look))];
    const input:HeygenPersonProfileInputV1={profileId:crypto.randomUUID(),expectedRevision:0,connectionId,displayName:profileName.trim(),aliases:[],preferredForName:false,
      groupIds:[base.groupId!],preferredGroupId:base.groupId!,sourceLooks:selected.map(look=>({groupId:look.groupId!,lookId:look.id,roles:lookRoles(look)})),
      preferredSourceLookId:base.id,defaultAppearanceLookId:base.id,defaultVoice:{voiceId:newVoiceId}};
    setProposal(await post<Proposal>('/media/video-v2/person-profile-proposals',input));
  });
  const saveProfile=()=>run('profile',async()=>{
    if(!proposal)return;
    await post<HeygenPersonProfileViewV1>('/media/video-v2/person-profiles',{profile:proposal.profile,selectionDigest:proposal.selectionDigest});
    await profiles.mutate();
    if (proposal.profile.expectedRevision > 0) {
      patch({appearanceLookId:additionalLookId,expression:'',motion:''});
      setAdditionalLookId('');
    }
    setProposal(null);setNotice(w.saved);
  });
  const changeSetup=(callback:()=>void)=>{callback();setProposal(null);setNotice('');};
  const selectableLooks=avatars.filter(readyLook),baseForSetup=selectableLooks.find(look=>look.id===newLookId);
  const additionalLooks=selectableLooks.filter(look=>profile&&look.groupId===selectedSource?.groupId&&
    !profile.sourceLooks.some(saved=>saved.lookId===look.id));
  const selectedAdditionalLook=additionalLooks.find(look=>look.id===additionalLookId);
  const reviewAdditionalLook=()=>run('review',async()=>{
    if (!profile || !selectedAdditionalLook?.groupId) return;
    const {profileId, revision, connectionId, displayName, aliases, preferredForName, editorialPersonaId, groupIds,
      preferredGroupId, sourceLooks, preferredSourceLookId, defaultAppearanceLookId, defaultAnimationReferenceLookId, defaultVoice} = profile;
    setProposal(await post<Proposal>('/media/video-v2/person-profile-proposals', {
      profileId, expectedRevision:revision, connectionId, displayName, aliases, preferredForName, editorialPersonaId, groupIds, preferredGroupId,
      sourceLooks:[...sourceLooks,{lookId:selectedAdditionalLook.id,groupId:selectedAdditionalLook.groupId,roles:lookRoles(selectedAdditionalLook)}],
      preferredSourceLookId, defaultAppearanceLookId, defaultAnimationReferenceLookId, defaultVoice,
    } satisfies HeygenPersonProfileInputV1));
  });
  const frozen=disabled||busy!==null||performanceBusy||performanceDirty,videoFrozen=frozen||draftDirty||!draft;
  return <section className="flex min-w-0 flex-col gap-[12px] border-t border-cf-border pt-[16px]" aria-label={w.title}>
    <h3 className="cf-label-md">{w.title}</h3>
    {profiles.error&&!profiles.data?<p role="alert" className="cf-body-sm text-cf-danger">{w.failed} <Button variant="quiet" onClick={()=>profiles.mutate()}>{w.refresh}</Button></p>:!profiles.data?<SkeletonRows rows={2} label={w.loading}/>:<>
      {!profiles.data.items.length&&<p className="cf-body-sm text-cf-ink-muted">{w.empty}</p>}
      <LabelledField id="heygen-person-profile" label={w.profile}><Select standalone id="heygen-person-profile" value={form.profileId} disabled={videoFrozen} onChange={event=>changeProfile(event.target.value)}><option value="">{w.choose}</option>{profiles.data.items.map(item=><option key={item.profileId} value={item.profileId}>{item.displayName}{profiles.data!.items.filter(other=>other.displayName===item.displayName).length>1?` · ${item.observations.looks.find(look=>look.lookId===item.preferredSourceLookId)?.name??w.base} · ${item.observations.voice.name}`:''}</option>)}</Select></LabelledField>
      {profiles.data.nextCursor&&<div><Button variant="quiet" density="dense" disabled={frozen||loadingMore} loading={loadingMore} loadingLabel={w.loadingMore} onClick={loadMore}>{w.loadMore}</Button></div>}
      {(pageError||profiles.error)&&<p role="alert" className="cf-body-sm text-cf-danger">{w.loadMoreFailed}</p>}
      {profile&&<>
        <p className="cf-body-sm text-cf-ink-muted">{w.voice}: {profile.observations.voice.name}. {w.reusable}</p>
        {!profile.setupReusable&&<p role="status" className="cf-body-sm text-cf-warning">{w.blocked}</p>}
        <div className="grid gap-[16px] split:grid-cols-2">
          <LabelledField id="heygen-source-look" label={w.base}><Select standalone id="heygen-source-look" value={form.sourceLookId} disabled={videoFrozen} onChange={event=>{const id=event.target.value,source=sourceOptions.find(look=>look.lookId===id);patch({sourceLookId:id,appearanceLookId:source?.roles.includes('appearance')?id:'',animationReferenceLookId:'',motion:''});}}>{sourceOptions.map(look=><option key={look.lookId} value={look.lookId}>{lookName(look.lookId)}</option>)}</Select></LabelledField>
          <LabelledField id="heygen-appearance-look" label={w.appearance}><Select standalone id="heygen-appearance-look" value={form.appearanceLookId} disabled={videoFrozen} onChange={event=>patch({appearanceLookId:event.target.value})}><option value="">{w.chooseLook}</option>{appearanceOptions.map(look=><option key={look.lookId} value={look.lookId}>{lookName(look.lookId)}</option>)}</Select></LabelledField>
        </div>
        <OwnedLookPreview actorKey={actorKey} profileId={profile.profileId} lookId={form.appearanceLookId} profileRevision={profile.revision}
          previewMediaId={appearanceOptions.find(look=>look.lookId===form.appearanceLookId)?.previewMediaId} name={lookName(form.appearanceLookId)} unavailable={w.previewUnavailable}
          draft={draft} viewLabel={w.viewLook} disabled={frozen}/>
        <p className="cf-body-sm text-cf-ink-muted">{w.cameraLookHint}</p>
        {!!additionalLooks.length&&<Disclosure summary={w.addLook} contentClassName="flex flex-col gap-[8px] pt-[8px]">
          <LabelledField id="heygen-add-look" label={w.chooseLook}>
            <Select standalone id="heygen-add-look" value={additionalLookId} disabled={frozen} onChange={event=>changeSetup(()=>setAdditionalLookId(event.target.value))}>
              <option value="">{w.chooseLook}</option>
              {additionalLooks.map(look=><option key={look.id} value={look.id}>{look.name}</option>)}
            </Select>
          </LabelledField>
          {selectedAdditionalLook&&<OwnedLookPreview actorKey={actorKey} profileId={profile.profileId} lookId={selectedAdditionalLook.id}
            profileRevision={profile.revision} name={selectedAdditionalLook.name} unavailable={w.previewUnavailable}
            draft={draft} viewLabel={w.viewLook} disabled={frozen}/>}
          <div><Button variant="secondary" disabled={frozen||!selectedAdditionalLook} loading={busy==='review'} loadingLabel={w.loading} onClick={reviewAdditionalLook}>{w.review}</Button></div>
          {!!proposal?.profile.expectedRevision&&<div role="region" aria-label={w.reviewTitle} className="flex flex-col items-start gap-[8px]">
            <p className="cf-body-sm">{proposal.name} · {selectedAdditionalLook?.name} · {proposal.voice.name}</p>
            <Button disabled={frozen} loading={busy==='profile'} loadingLabel={w.saving} onClick={saveProfile}>{w.confirmLook}</Button>
          </div>}
        </Disclosure>}
        <Disclosure summary={w.advanced} contentClassName="flex flex-col gap-[16px] pt-[12px]">
          <Input standalone name="heygen-settings-name" label={w.titleField} value={form.name} maxLength={120} disabled={videoFrozen} onChange={event=>patch({name:event.target.value})}/>
          <div className="grid gap-[16px] split:grid-cols-2">
            <LabelledField id="heygen-avatar-model" label={w.engine}><Select standalone id="heygen-avatar-model" value={form.engine} disabled={videoFrozen} onChange={event=>patch({engine:event.target.value,expression:'',motion:'',animationReferenceLookId:''})}><option value="">{w.inherited}</option>{form.engine&&!appearance?.engines?.includes(form.engine)&&<option disabled value={form.engine}>{form.engine}</option>}{appearance?.engines?.filter(value=>['avatar_iii','avatar_iv','avatar_v'].includes(value)).map(value=><option key={value} value={value}>{value==='avatar_iii'?'Avatar III':value==='avatar_iv'?'Avatar IV':'Avatar V'}</option>)}</Select></LabelledField>
            <LabelledField id="heygen-output-resolution" label={w.resolution}><Select standalone id="heygen-output-resolution" value={form.resolution} disabled={videoFrozen} onChange={event=>patch({resolution:event.target.value})}>{!['720p','1080p'].includes(form.resolution)&&<option disabled value={form.resolution}>{form.resolution}</option>}{['720p','1080p'].map(value=><option key={value} value={value}>{value}</option>)}</Select></LabelledField>
            <LabelledField id="heygen-output-ratio" label={w.aspectRatio}><Select standalone id="heygen-output-ratio" value={form.aspectRatio} disabled={videoFrozen} onChange={event=>patch({aspectRatio:event.target.value})}>{['9:16','16:9','1:1','4:5','5:4','auto'].map(value=><option key={value} value={value}>{value==='auto'?w.autoRatio:value}</option>)}</Select></LabelledField>
            <Input standalone name="heygen-duration" type="number" label={w.duration} value={form.duration} min={2} max={300} step={1} disabled={videoFrozen} onChange={event=>patch({duration:event.target.value})}/>
            <LabelledField id="heygen-caption-mode" label={w.captions}><Select standalone id="heygen-caption-mode" value={form.captions} disabled={videoFrozen} onChange={event=>patch({captions:event.target.value})}><option value="none">{w.captionsNone}</option><option value="sidecar">{w.captionsSidecar}</option><option value="burned">{w.captionsBurned}</option></Select></LabelledField>
            {(['speed','pitch','volume'] as const).map(key=><Input key={key} standalone name={`heygen-${key}`} type="number" label={w[key]} value={form[key]} min={key==='speed'?0.5:key==='pitch'?-50:0} max={key==='speed'?1.5:key==='pitch'?50:1} step={key==='pitch'?1:0.05} placeholder={profile.defaultVoice.baseline?.[key]?.toString()??w.inherited} disabled={videoFrozen} onChange={event=>patch({[key]:event.target.value})}/>)}
            {supportsExpression&&<LabelledField id="heygen-expressiveness" label={w.expression}><Select standalone id="heygen-expressiveness" value={form.expression} disabled={videoFrozen} onChange={event=>patch({expression:event.target.value})}><option value="">{w.inherited}</option>{(['low','medium','high'] as const).map(value=><option key={value} value={value}>{w[value]}</option>)}</Select></LabelledField>}
            <Input standalone name="heygen-background" label={w.background} value={form.background} disabled={videoFrozen} onChange={event=>patch({background:event.target.value,backgroundAssetId:''})} placeholder={w.inherited}/>
            <LabelledField id="heygen-fit" label={w.fit}><Select standalone id="heygen-fit" value={form.fit} disabled={videoFrozen} onChange={event=>patch({fit:event.target.value})}><option value="">{w.inherited}</option><option value="contain">{w.contain}</option><option value="cover">{w.cover}</option></Select></LabelledField>
          </div>
          <p className="cf-body-sm text-cf-ink-muted">{w.durationHint}</p>
          {engine==='avatar_v'&&<>
            <LabelledField id="heygen-animation-reference" label={w.animationReference}><Select standalone id="heygen-animation-reference" value={form.animationReferenceLookId} disabled={videoFrozen} onChange={event=>patch({animationReferenceLookId:event.target.value,motion:''})}><option value="">{w.noAnimationReference}</option>{form.animationReferenceLookId&&!animationOptions.some(look=>look.lookId===form.animationReferenceLookId)&&<option disabled value={form.animationReferenceLookId}>{lookName(form.animationReferenceLookId)}</option>}{animationOptions.map(look=><option key={look.lookId} value={look.lookId}>{lookName(look.lookId)}</option>)}</Select></LabelledField>
            <CheckboxField label={w.moreBlinking} checked={form.moreBlinking} disabled={videoFrozen} onChange={event=>patch({moreBlinking:event.target.checked})}/>
          </>}
          {supportsMotion?<LabelledField id="heygen-motion" label={w.motion}><Textarea standalone id="heygen-motion" layout="content" value={form.motion} maxLength={500} disabled={videoFrozen} onChange={event=>patch({motion:event.target.value})}/><p className="cf-body-sm text-cf-ink-muted">{w.motionHint}</p></LabelledField>:<p className="cf-body-sm text-cf-ink-muted">{w.motionUnavailable}</p>}
          {!supportsMotion&&form.motion&&<div><Button variant="quiet" disabled={videoFrozen} onClick={()=>patch({motion:''})}>{w.removeMotion}</Button></div>}
          {draft?.settings.heygenV2?.binding.connectionId===connectionId&&draft.settings.heygenV2.binding.profileId===profile.profileId&&
            <VideoHeygenAdvancedOptions key={profileScope+draft.id} actorKey={profileScope} draftId={draft.id} version={draft.version}
              disabled={videoFrozen} glossaryId={form.glossaryId} onGlossaryChange={glossaryId=>patch({glossaryId})}
              backgroundAssetId={form.backgroundAssetId} onBackgroundChange={backgroundAssetId=>patch({backgroundAssetId,background:''})}
              appearanceMatches={form.appearanceLookId===draft.settings.heygenV2.settings.appearanceLookId}/>}
          <p className="cf-body-sm text-cf-ink-muted">{w.controlsNote}</p>
        </Disclosure>
        {draftDirty||!draft?<p role="status" className="cf-body-sm">{w.saveFirst}</p>:null}
        <div className="flex flex-wrap gap-[8px]"><Button variant="secondary" disabled={frozen||!changed||draftDirty||!draft||!profile.setupReusable||!selectedSource||!appearanceOptions.some(look=>look.lookId===form.appearanceLookId)} loading={busy==='settings'} loadingLabel={w.applying} onClick={apply}>{w.apply}</Button>{changed&&<Button variant="quiet" disabled={frozen} onClick={()=>{setForm(formFromDraft(draft));setChanged(false);onDirtyChange(false);setError('');}}>{w.discard}</Button>}</div>
      </>}
      {changed&&!profile&&<Button variant="quiet" disabled={frozen} onClick={()=>{setForm(formFromDraft(draft));setChanged(false);onDirtyChange(false);}}>{w.discard}</Button>}
    </>}
    {draft?.settings.heygenV2?.binding.connectionId===connectionId&&<VideoHeygenPerformanceControls
      key={`${profileScope}:${draft.id}`} actorKey={actorKey} connectionId={connectionId} connectionGeneration={connectionGeneration}
      draft={draft} disabled={disabled||busy!==null} draftDirty={draftDirty||changed}
      onDirtyChange={performanceEditing} onBusyChange={performanceSaving} onSaved={onSaved}/>
    }
    <Disclosure summary={w.create} contentClassName="flex flex-col gap-[16px] pt-[12px]">
      <p className="cf-body-sm text-cf-ink-muted">{w.createNote}</p>
      {!selectableLooks.length&&<p role="status" className="cf-body-sm">{w.noGroup}</p>}
      <Input standalone name="heygen-person-name" label={w.name} value={profileName} maxLength={120} disabled={frozen} onChange={event=>changeSetup(()=>setProfileName(event.target.value))}/>
      <LabelledField id="heygen-new-person-look" label={w.createLook}><Select standalone id="heygen-new-person-look" value={newLookId} disabled={frozen} onChange={event=>changeSetup(()=>{setNewLookId(event.target.value);setExtraLooks([]);})}><option value="">{w.chooseLook}</option>{selectableLooks.map(look=><option key={look.id} value={look.id}>{look.name}</option>)}</Select></LabelledField>
      <LabelledField id="heygen-new-person-voice" label={w.createVoice}><Select standalone id="heygen-new-person-voice" value={newVoiceId} disabled={frozen} onChange={event=>changeSetup(()=>setNewVoiceId(event.target.value))}><option value="">{w.chooseVoice}</option>{voices.filter(readyVoice).map(voice=><option key={voice.id} value={voice.id}>{voice.name}</option>)}</Select></LabelledField>
      {baseForSetup&&selectableLooks.some(look=>look.groupId===baseForSetup.groupId&&look.id!==baseForSetup.id)&&<fieldset className="flex min-w-0 flex-col gap-[8px]"><legend className="cf-label-md">{w.additional}</legend>{selectableLooks.filter(look=>look.groupId===baseForSetup.groupId&&look.id!==baseForSetup.id).map(look=><CheckboxField key={look.id} label={look.name} checked={extraLooks.includes(look.id)} disabled={frozen} onChange={event=>changeSetup(()=>setExtraLooks(current=>event.target.checked?[...current,look.id]:current.filter(id=>id!==look.id)))}/>)}</fieldset>}
      <div><Button variant="secondary" disabled={frozen||!profileName.trim()||!baseForSetup||!newVoiceId} loading={busy==='review'} loadingLabel={w.loading} onClick={reviewProfile}>{w.review}</Button></div>
      {proposal&&proposal.profile.expectedRevision===0&&<div className="flex min-w-0 flex-col gap-[8px] border-t border-cf-border pt-[12px]" role="region" aria-label={w.reviewTitle}>
        <p className="break-words cf-label-md">{proposal.name}</p><ul className="cf-body-sm">{proposal.looks.map(look=><li key={look.id}>{look.name}</li>)}</ul><p className="cf-body-sm">{w.voice}: {proposal.voice.name}</p>
        <Button disabled={frozen} loading={busy==='profile'} loadingLabel={w.saving} onClick={saveProfile}>{w.confirm}</Button>
      </div>}
    </Disclosure>
    {notice&&<p role="status" className="cf-body-sm">{notice}</p>}{error&&<p role="alert" className="cf-body-sm text-cf-danger">{error}</p>}
  </section>;
}

function lookRoles(look: OwnedLook): HeygenPersonProfileInputV1['sourceLooks'][number]['roles'] {
  return look.avatarType==='digital_twin'&&look.state==='available'
    ? ['style_base','appearance','animation_reference'] : ['style_base','appearance'];
}

function OwnedLookPreview({actorKey,profileId,profileRevision,lookId,previewMediaId,name,unavailable,draft,viewLabel,disabled}:{
  actorKey:string;profileId:string;profileRevision:number;lookId:string;previewMediaId?:string;name:string;unavailable:string;
  draft:VideoDraftUiV1|null;viewLabel:string;disabled:boolean;
}) {
  const request=useFetch();
  const preview=useSWR<{id:string;path:string;name:string;type:string}>(previewMediaId?['heygen-owned-look-preview-v1',actorKey,profileId,profileRevision,lookId,previewMediaId]:null,async()=>{
    const response=await request(`/media/video-v2/person-profiles/${encodeURIComponent(profileId)}/looks/${encodeURIComponent(lookId)}/preview`);
    if(!response.ok)throw Error('preview');const value=await response.json();if(value.type!=='image'||!value.path)throw Error('preview');return value;
  },{revalidateOnFocus:false,shouldRetryOnError:false});
  if (preview.data) return <img src={preview.data.path} alt={name} className="h-[96px] w-[96px] rounded-[8px] object-cover"/>;
  if (draft?.settings.heygenV2?.binding.profileId===profileId&&lookId)
    return <RemoteLookPreview key={JSON.stringify([actorKey,draft.id,draft.version,lookId])} draft={draft} lookId={lookId}
      name={name} label={viewLabel} unavailable={unavailable} disabled={disabled}/>;
  return <p className="cf-caption text-cf-ink-muted">{unavailable}</p>;
}

function RemoteLookPreview({draft,lookId,name,label,unavailable,disabled}:{
  draft:VideoDraftUiV1;lookId:string;name:string;label:string;unavailable:string;disabled:boolean;
}) {
  const request = useFetch();
  const [url,setUrl] = useState('');
  const [pending,setPending] = useState(false);
  const [error,setError] = useState(false);
  const abort = useRef<AbortController|null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => {if (url) URL.revokeObjectURL(url);}, [url]);
  async function load() {
    if (disabled || abort.current || url) return;
    const control = new AbortController();
    abort.current = control;
    setPending(true);
    setError(false);
    try {
      const response = await request(`/media/video-v2/drafts/${encodeURIComponent(draft.id)}/looks/${encodeURIComponent(lookId)}/preview?version=${draft.version}`,
        {signal:control.signal});
      if (!response.ok || !['image/jpeg','image/png','image/webp'].includes(response.headers.get('Content-Type') ?? '')) throw new Error('preview');
      const image = await response.blob();
      if (!control.signal.aborted) setUrl(URL.createObjectURL(image));
    } catch {
      if (!control.signal.aborted) setError(true);
    } finally {
      if (!control.signal.aborted) {abort.current=null;setPending(false);}
    }
  }
  return url ? <img src={url} alt={name} className="max-h-[240px] w-fit max-w-full rounded-[8px] object-contain"/>
    : <div>
      <Button variant="quiet" disabled={disabled||pending} loading={pending} loadingLabel={label} onClick={load}>{label}</Button>
      {error&&<p role="status" className="cf-body-sm text-cf-ink-muted">{unavailable}</p>}
    </div>;
}
