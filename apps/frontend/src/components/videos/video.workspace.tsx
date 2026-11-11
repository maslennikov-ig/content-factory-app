'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { videoDraftTitle } from '@contentfactory/helpers/utils/video-draft-title';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useUser } from '../layout/user.context';
import { useOpenMediaBox } from '../media/media.component';
import { LabelledField } from '../ui/field-label';
import { ErrorState, SkeletonRows, Status } from '../ui/surface';
import { useVideoWords, type VideoWordsV1 } from './video.copy';
import type { VideoProviderSettingsUiV1 } from './video-provider-settings';
import {
  VIDEO_ACTIVE_STATES, videoErrorCode,
  videoPendingKey, videoSettingsForRoute, videoWorkspacePath, videoChatReturnPath,
  type VideoBriefUiV1, type VideoCatalogUiV1, type VideoDraftUiV1,
  type VideoSettingsV1,
} from './video-ui.v1';
import { useVideoAccessWords, type VideoAccessWordsV2 } from './video-access.copy';
import { useVideoPersonalWords, videoPersonalBlocker } from './video-personal.copy';
import { VideoSubscriptions, useVideoAccessChoicesV2 } from './video-subscriptions';
import { VideoApprovalDetailsV2, useVideoUnitV2 } from './video-access-approval';
import { VideoManualV2 } from './video-manual';
import { patchHeygenVideoSettings, VideoHeygenPersonControls } from './video-heygen-person-controls';
import { VideoHeygenPerformanceFeedback } from './video-heygen-performance-feedback';
import { heygenPerformanceCopy } from './video-heygen-performance.copy';
import { heygenControlsCopy } from './video-heygen-controls.copy';
import { downloadOwnedVideoSubtitleV2 } from './video-ui.v2';
import {
  VIDEO_UNRESOLVED_STATES_V2, downloadOwnedVideoV2, videoActorKeyV2,
  videoApprovalCurrentV2, videoCanLaunchV2, videoDecimalValidV2, videoPendingKeyV2, videoPresenterEngineOptionsV2,
  VIDEO_PROVIDER_SITES_V2, type VideoAccessV2, type VideoApprovalUiV2, type VideoJobUiV2, type VideoPendingIntentV2, type VideoPersonalReadinessUi, type VideoPersonalAssetsUi,
} from './video-ui.v2';

const blankBrief = (locale: string): VideoBriefUiV1 => ({ intent: '', audience: '', keyMessage: '', visualIntent: '', prompt: '', script: '', scriptPolicy: 'exact', outputLocale: locale, facts: [], avoidImplications: [], referenceMediaIds: [] });
const defaultSettings = (locale: string): VideoSettingsV1 => ({ provider: 'higgsfield', model: '', mode: 'clip', locale, duration: 5, aspectRatio: '9:16', audio: false, captions: false });
const pendingRead = (key: string, accessVersion: 1 | 2): VideoPendingIntentV2 | null => {
  try { const value = JSON.parse(sessionStorage.getItem(key) ?? 'null'); return value && typeof value.intentId === 'string' && typeof value.preflightId === 'string' && typeof value.draftId === 'string' && Number.isInteger(value.version) ? {...value, accessVersion} : null; } catch { return null; }
};
const accessRead = (key: string): VideoAccessV2 | null => {
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); return value?.kind === 'api' && ['included', 'workspace_key'].includes(value.payer) || value?.kind === 'subscription' && typeof value.connectionId === 'string' || value?.kind === 'manual' && ['higgsfield', 'heygen'].includes(value.provider) ? value : null; } catch { return null; }
};
const storageWrite = (key: string, value: VideoAccessV2) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Access choice still works when browser storage is unavailable. */ } };
// Numeric intervals let SWR retain its timer across approval-clock renders and
// restart it when a loaded or explicitly resumed job becomes active.
const jobsRefreshInterval = (data?: VideoJobUiV2[]) => data?.some(job => VIDEO_ACTIVE_STATES.has(job.state) || VIDEO_UNRESOLVED_STATES_V2.has(job.state)) ? 4000 : 0;
const jobRefreshInterval = (data?: VideoJobUiV2) => data && (VIDEO_ACTIVE_STATES.has(data.state) || VIDEO_UNRESOLVED_STATES_V2.has(data.state)) ? 4000 : 0;

/** The same saved draft and durable job are opened from pieces, media and chat. */
export function VideoWorkspace({ pieceId: initialPieceId = '', draftId, jobId, personalConnectionId, embedded = false, chatThreadId, onBindChatVideo }: { pieceId?: string; draftId?: string; jobId?: string; personalConnectionId?: string; embedded?: boolean; chatThreadId?: string; onBindChatVideo?: (value: {threadId: string; draftId: string; pieceId?: string; jobId?: string}) => Promise<void> }) {
  const personal = useVideoPersonalWords();
  const words = useVideoWords();
  const accessWords = useVideoAccessWords();
  const language = useInterfaceLanguage();
  const request = useFetch();
  const { mutate: mutateCache } = useSWRConfig();
  const user = useUser();
  const canWrite = isOrganizationEditor(user?.role);
  const openMediaBox = useOpenMediaBox();
  const [pieceId, setPieceId] = useState(initialPieceId);
  const [draft, setDraft] = useState<VideoDraftUiV1 | null>(null);
  const [draftReaderId, setDraftReaderId] = useState(draftId ?? '');
  const [conflictingDraft, setConflictingDraft] = useState<VideoDraftUiV1 | null>(null);
  const [brief, setBrief] = useState(() => blankBrief(language.replace('_', '-')));
  const [settings, setSettings] = useState(() => defaultSettings(language.replace('_', '-')));
  const [dirty, setDirty] = useState(false);
  const [heygenDirty, setHeygenDirty] = useState(false);
  const [personBusy, setPersonBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const heygenBusy = personBusy || feedbackBusy;
  const heygenEditing = useCallback((changed: boolean) => {setHeygenDirty(changed);if(changed)setPreflight(null);}, []);
  const [access, setAccess] = useState<VideoAccessV2 | null>(() => personalConnectionId ? {kind: 'subscription', connectionId: personalConnectionId} : null);
  const [preflight, setPreflight] = useState<VideoApprovalUiV2 | null>(null);
  const [pendingIntent, setPendingIntent] = useState<VideoPendingIntentV2 | null>(null);
  const [selectedJobId, setSelectedJobId] = useState(jobId ?? '');
  const [busy, setBusy] = useState<'save' | 'prepare' | 'preflight' | 'launch' | 'job' | 'attach' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const operationLock = useRef(false);
  const [, setClock] = useState(0);
  const [jobsPollInterval, setJobsPollInterval] = useState(0);
  const [jobPollInterval, setJobPollInterval] = useState(0);
  const read = useCallback(async <T,>(path: string): Promise<T> => {
    const response = await request(path);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403 || response.status === 404 ? 'VIDEO_ACCESS_DENIED' : videoErrorCode(body));
    return body;
  }, [request]);
  const catalogPath = access?.kind === 'api' ? '/media/video-catalog' : '/media/video-catalog?assets=none';
  const catalog = useSWR<VideoCatalogUiV1>(['video-catalog-v1', user?.orgId, catalogPath], () => read(catalogPath), { revalidateOnFocus: false });
  const accessChoices = useVideoAccessChoicesV2();
  const apiPayer = (catalog.data?.settings as VideoProviderSettingsUiV1 | undefined)?.usageMode ?? 'included';
  const actorKey = videoActorKeyV2(user?.orgId ?? '', user?.id ?? '');
  const pieces = useSWR<{ pieces: Array<{ id: string; title: string }> }>(['video-source-pieces-v1', user?.orgId], () => read('/content-intelligence/pieces'), { revalidateOnFocus: false });
  const draftListUrl = `/media/video-prompts${pieceId ? `?pieceId=${encodeURIComponent(pieceId)}` : ''}`;
  const drafts = useSWR<VideoDraftUiV1[]>(draftListUrl ? [draftListUrl, user?.orgId] : null, () => read(draftListUrl!), { revalidateOnFocus: false });
  const draftUrl = draftReaderId ? `/media/video-prompts/${encodeURIComponent(draftReaderId)}` : null;
  const savedDraft = useSWR<VideoDraftUiV1>(draftUrl ? [draftUrl, user?.orgId] : null, () => read(draftUrl!), { revalidateOnFocus: true });
  const jobsUrl = `/media/video-v2/jobs${pieceId ? `?pieceId=${encodeURIComponent(pieceId)}` : ''}`;
  const jobs = useSWR<VideoJobUiV2[]>([jobsUrl, user?.orgId, user?.id], () => read(jobsUrl), { refreshInterval: jobsPollInterval, revalidateOnFocus: true });
  const selectedJob = useSWR<VideoJobUiV2>(selectedJobId ? ['video-job-v2', user?.orgId, user?.id, selectedJobId] : null, () => read(`/media/video-v2/jobs/${encodeURIComponent(selectedJobId)}`), { refreshInterval: jobPollInterval });
  useEffect(() => { setJobsPollInterval(jobsRefreshInterval(jobs.data)); }, [jobs.data]);
  useEffect(() => { setJobPollInterval(jobRefreshInterval(selectedJob.data)); }, [selectedJob.data]);
  const route = catalog.data?.routes.find(item => item.provider === settings.provider && item.model === settings.model && item.mode === settings.mode);
  const effective = (catalog.data?.settings as VideoProviderSettingsUiV1 | undefined)?.effective?.[settings.provider];
  const unavailable = access?.kind === 'api' && effective && !effective.available;
  const connection = access?.kind === 'subscription' ? accessChoices.data?.connections.find(item => item.id === access.connectionId) : undefined;
  const identityUnavailable = !!connection && accessChoices.data?.providers.find(item => item.provider === connection.provider)?.blockers?.includes('VIDEO_WALLET_IDENTITY_UNVERIFIED') === true;
  const personalReadiness = useSWR<VideoPersonalReadinessUi>(access?.kind === 'subscription' && connection && !identityUnavailable ? ['video-personal-readiness', user?.orgId, user?.id, connection.id, connection.generation] : null, () => read(`/media/video-v2/connections/${encodeURIComponent(connection!.id)}/readiness`), {revalidateOnFocus: true});
  const subscriptionAssets = useSWR<VideoPersonalAssetsUi>(access?.kind === 'subscription' && connection && ['connected', 'discovery_required'].includes(connection.state) && connection.workspaceGranted && connection.provider === settings.provider && settings.mode === 'presenter' ? ['video-subscription-assets-v2', user?.orgId, user?.id, connection.id, connection.generation] : null, () => read(`/media/video-v2/connections/${encodeURIComponent(connection!.id)}/assets`), {revalidateOnFocus: true});
  const privateCatalog = subscriptionAssets.data?.ownedOnly === true && subscriptionAssets.data.accountGeneration === connection?.generation && subscriptionAssets.data.catalog?.scope === 'authenticated_private_account' && subscriptionAssets.data.catalog.readOnly === true ? subscriptionAssets.data.catalog : undefined;
  const ownedAssets = privateCatalog ? {avatars: privateCatalog.avatars, voices: privateCatalog.voices, engines: [...new Set(privateCatalog.avatars.flatMap(item => item.engines ?? []))]}
    : subscriptionAssets.data?.status === 'ready' && subscriptionAssets.data.ownedOnly === true && subscriptionAssets.data.accountGeneration === connection?.generation && Array.isArray(subscriptionAssets.data.blockers) && subscriptionAssets.data.blockers.length === 0 && Array.isArray(subscriptionAssets.data.avatars) && Array.isArray(subscriptionAssets.data.voices) ? { avatars: subscriptionAssets.data.avatars.filter(item => item.ownership === 'owned' && item.state === 'available'), voices: subscriptionAssets.data.voices.filter(item => item.ownership === 'owned' && item.state === 'available'), engines: subscriptionAssets.data.engines } : undefined;
  const operation = personalReadiness.data?.operations?.find(item => item.kind === (settings.mode === 'presenter' ? 'presenter' : 'generated_clip'));
  const ownSelectionReady = settings.mode !== 'presenter' || !!ownedAssets?.avatars.some(item => item.id === settings.avatarId) && !!ownedAssets?.voices.some(item => item.id === settings.voiceId);
  const nativeBinding = draft?.settings.heygenV2?.binding;
  const nativeCheckReady = !!nativeBinding && access?.kind === 'subscription' && settings.provider === 'heygen' && connection?.provider === 'heygen' &&
    ['connected', 'discovery_required'].includes(connection.state) && connection.workspaceGranted && nativeBinding.connectionId === connection.id &&
    nativeBinding.accountGeneration === connection.generation && !!nativeBinding.profileId && Number.isInteger(nativeBinding.profileRevision) && nativeBinding.profileRevision > 0 &&
    /^[a-f0-9]{64}$/.test(nativeBinding.profileDigest) && nativeBinding.sourcePin?.pieceId === draft?.pieceId && nativeBinding.sourcePin.sourceRevision === draft?.pieceRevision;
  const nativeApproved = nativeCheckReady && preflight?.unknownPrice === true && preflight.billing === 'personal_subscription' &&
    JSON.stringify(preflight.settings) === JSON.stringify(draft?.settings) && preflight.brief.script === draft?.brief.script &&
    videoCanLaunchV2(draft, preflight, access, dirty || heygenDirty);
  const subscriptionUnavailable = access?.kind === 'subscription' && !nativeApproved && (!accessChoices.data?.providers.find(item => item.provider === settings.provider)?.generationReady || !connection || connection.state !== 'connected' || connection.walletVerified !== true || !connection.workspaceGranted || !videoDecimalValidV2(connection.perJob, true) || !videoDecimalValidV2(connection.perMonth, true) || connection.provider !== settings.provider || personalReadiness.data?.accountGeneration !== connection.generation || personalReadiness.data?.connectionId !== connection.id || personalReadiness.data?.provider !== connection.provider || personalReadiness.data?.walletVerified !== true || personalReadiness.data?.schema?.reviewed !== true || !personalReadiness.data?.schema?.digest || operation?.ready !== true || !Array.isArray(operation.blockers) || operation.blockers.length > 0 || !ownSelectionReady);
  const payerChanged = access?.kind === 'api' && access.payer !== apiPayer;
  const job = selectedJob.data && (!draftReaderId || selectedJob.data.draftId === draftReaderId) ? selectedJob.data : undefined;
  const chatReturn = embedded ? videoChatReturnPath(chatThreadId, draft?.id, pieceId || undefined, job?.id) : null;
  const bindingState = useRef({dirty, chatReturn, draftVersion: draft?.version});
  bindingState.current = {dirty, chatReturn, draftVersion: draft?.version};
  const unresolved = pendingIntent !== null || !!job && (VIDEO_UNRESOLVED_STATES_V2.has(job.state) || VIDEO_ACTIVE_STATES.has(job.state));
  const ready = videoCanLaunchV2(draft, preflight, access, dirty || heygenDirty) && (!draft?.settings.heygenV2 || preflight?.unknownPrice !== true || nativeApproved) && !heygenBusy && !conflictingDraft && !unavailable && !subscriptionUnavailable && !payerChanged && !unresolved && canWrite;
  const updateLocation = (params: { pieceId?: string; draftId?: string; jobId?: string }) => {
    if (!embedded) window.history.replaceState(null, '', videoWorkspacePath(params));
  };

  const acceptDraft = useCallback((value: VideoDraftUiV1, preserveAccess = false) => {
    setDraft(value); setBrief(value.brief); setSettings(value.settings); setPieceId(value.pieceId); setDirty(false); setHeygenDirty(false); setPreflight(null); setError(''); setNotice('');
    setDraftReaderId(value.id); setConflictingDraft(null);
    const pending = pendingRead(videoPendingKeyV2(user?.orgId ?? '', user?.id ?? '', value.id), 2) ?? pendingRead(videoPendingKey(user?.orgId ?? '', value.id), 1);
    setPendingIntent(pending);
    setAccess(current => pending ? pending.access ?? {kind: 'api', payer: apiPayer} : personalConnectionId ? {kind: 'subscription', connectionId: personalConnectionId}
      : (preserveAccess ? current : null) ?? accessRead(`${videoActorKeyV2(user?.orgId ?? '', user?.id ?? '')}:${value.id}`)
        ?? (value.settings.heygenV2?.binding.connectionId ? {kind: 'subscription', connectionId: value.settings.heygenV2.binding.connectionId} : null));
  }, [user?.orgId, user?.id, apiPayer, personalConnectionId]);
  const currentDraftState = useRef({id: draft?.id,version: draft?.version,dirty,connectionId: connection?.id});
  currentDraftState.current={id:draft?.id,version:draft?.version,dirty,connectionId:connection?.id};
  const adoptHeygenDraft = async (next: VideoDraftUiV1, expected: {id:string;version:number}) => {
    const current=currentDraftState.current;
    if(current.id!==expected.id||current.version!==expected.version||current.dirty||next.id!==expected.id||next.version<expected.version||
      next.settings.heygenV2?.binding.connectionId!==current.connectionId)throw new Error('VIDEO_DRAFT_CHANGED');
    acceptDraft(next,true);await savedDraft.mutate(next,false);await drafts.mutate();
    updateLocation({pieceId:next.pieceId,draftId:next.id});
  };
  const restoredActor = useRef('');
  useEffect(() => {
    if (!user || !catalog.data || restoredActor.current === actorKey) return;
    restoredActor.current = actorKey;
    setPreflight(null); setPendingIntent(null);
    setAccess(personalConnectionId ? {kind: 'subscription', connectionId: personalConnectionId} : draftReaderId ? accessRead(`${actorKey}:${draftReaderId}`) : selectedJobId ? null : accessRead(actorKey));
  }, [actorKey, user, draftReaderId, selectedJobId, apiPayer, catalog.data, personalConnectionId]);
  const restoredJob = useRef('');
  useEffect(() => {
    const next = selectedJob.data;
    if (next && draftReaderId && next.draftId !== draftReaderId) { setSelectedJobId(''); return; }
    if (!next || restoredJob.current === `${actorKey}:${next.id}`) return;
    restoredJob.current = `${actorKey}:${next.id}`;
    if (!draftReaderId && next.draftId) setDraftReaderId(next.draftId);
    const savedAccess: VideoAccessV2 = next.access?.kind === 'subscription' ? {kind: 'subscription', connectionId: next.access.connectionId ?? ''} : next.access?.kind === 'manual' ? {kind: 'manual', provider: next.snapshot?.settings?.provider === 'heygen' ? 'heygen' : 'higgsfield'} : {kind: 'api', payer: next.access?.payer ?? apiPayer};
    setAccess(savedAccess); setPreflight(null);
  }, [selectedJob.data, actorKey, apiPayer, draftReaderId]);
  useEffect(() => {
    if (preflight?.access.kind !== 'subscription') return;
    const connectionId = preflight.access.connectionId;
    const current = accessChoices.data?.connections.find(item => item.id === connectionId);
    const native = !!preflight.settings.heygenV2 && preflight.unknownPrice === true && preflight.billing === 'personal_subscription';
    if (accessChoices.error || !current || current.generation !== preflight.accountGeneration || !current.workspaceGranted ||
      (native ? current.provider !== 'heygen' || !['connected', 'discovery_required'].includes(current.state)
        : current.perJob !== preflight.perJob || current.perMonth !== preflight.perMonth || current.state !== 'connected')) setPreflight(null);
  }, [accessChoices.data, accessChoices.error, preflight]);
  const selectAccess = (next: VideoAccessV2 | null) => {
    setAccess(next); setPreflight(null); setError(''); setNotice('');
    if (next) { storageWrite(actorKey, next); if (draft) storageWrite(`${actorKey}:${draft.id}`, next); }
  };
  const lastDraftRead = useRef<VideoDraftUiV1 | null>(null);
  useEffect(() => {
    const value = savedDraft.data;
    if (!value || lastDraftRead.current === value) return;
    lastDraftRead.current = value;
    if (draft?.id === value.id && dirty) {
      if (value.version !== draft.version) { setConflictingDraft(value); setPreflight(null); }
      return;
    }
    if (draft?.id !== value.id || draft.version !== value.version) acceptDraft(value, selectedJob.data?.draftId === value.id);
  }, [savedDraft.data, draft?.id, draft?.version, dirty, acceptDraft, selectedJob.data?.draftId]);
  useEffect(() => {
    const interval = setInterval(() => setClock(value => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!draft && !draftReaderId && !settings.model && catalog.data?.routes.length) {
      const route = catalog.data.routes[0];
      setSettings(videoSettingsForRoute(route, language.replace('_', '-')));
    }
  }, [catalog.data, draft, draftReaderId, settings.model, language]);

  const editBrief = (patch: Partial<VideoBriefUiV1>) => { setBrief(current => ({ ...current, ...patch })); setDirty(true); setPreflight(null); setNotice(''); };
  const editSettings = (patch: Partial<VideoSettingsV1>) => {
    setSettings(current => patchHeygenVideoSettings(current, patch));
    if (patch.locale) setBrief(current => ({ ...current, outputLocale: patch.locale! }));
    setDirty(true); setPreflight(null); setNotice('');
  };
  const action = async (kind: NonNullable<typeof busy>, callback: () => Promise<void>) => {
    if (operationLock.current || heygenBusy) return;
    operationLock.current = true; setBusy(kind); setError(''); setNotice('');
    try { await callback(); } catch (err) { setPreflight(null); setError(err instanceof Error ? err.message : 'VIDEO_REQUEST_FAILED'); }
    finally { operationLock.current = false; setBusy(null); }
  };
  const write = async <T,>(path: string, body: unknown, method = 'POST'): Promise<T> => {
    const response = await request(path, { method, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 403 ? 'VIDEO_ACCESS_DENIED' : videoErrorCode(data)) as Error & { rejected?: boolean };
      error.rejected = response.status >= 400 && response.status < 500;
      throw error;
    }
    return data;
  };
  const save = async (prepareWithAi: boolean) => action(prepareWithAi ? 'prepare' : 'save', async () => {
    if (!pieceId || !route) return;
    let next: VideoDraftUiV1;
    if (conflictingDraft) return;
    if (draft && !prepareWithAi) next = await write(`/media/video-prompts/${encodeURIComponent(draft.id)}`, { version: draft.version, brief, settings }, 'PUT');
    else next = await write('/media/video-prompts', { pieceId, settings, intent: brief.intent, audience: brief.audience, keyMessage: brief.keyMessage, visualIntent: brief.visualIntent, referenceMediaIds: brief.referenceMediaIds, scriptPolicy: brief.scriptPolicy, prepareWithAi, ...(draft ? {fromDraftId: draft.id, fromDraftVersion: draft.version} : {}) });
    acceptDraft(next, true); if (access) storageWrite(`${actorKey}:${next.id}`, access); setNotice(words.saved);
    if (draftReaderId === next.id) await savedDraft.mutate(next, false);
    await drafts.mutate();
    updateLocation({ pieceId: next.pieceId, draftId: next.id });
  });
  const check = () => action('preflight', async () => {
    if (!draft || dirty || heygenDirty) return;
    if (!access || access.kind === 'manual') return;
    const result = await write<VideoApprovalUiV2>('/media/video-v2/preflight', {draftId: draft.id, version: draft.version, access});
    setPreflight(result);
  });
  const launch = (retry = false) => action('launch', async () => {
    if (!draft || (!retry && !ready)) return;
    const intent: VideoPendingIntentV2 | null = retry ? pendingIntent : {draftId: draft.id, version: draft.version, preflightId: preflight!.preflightId, intentId: crypto.randomUUID(), accessVersion: 2, access: access!};
    if (!intent) return;
    // Persist before the network boundary. Recovery only reads; it never submits.
    const pendingKey = intent.accessVersion === 1 ? videoPendingKey(user?.orgId ?? '', draft.id) : videoPendingKeyV2(user?.orgId ?? '', user?.id ?? '', draft.id);
    sessionStorage.setItem(pendingKey, JSON.stringify(intent));
    setPendingIntent(intent);
    let value: VideoJobUiV2;
    try { value = intent.accessVersion === 1 ? await write<VideoJobUiV2>('/media/video-jobs', {draftId: intent.draftId, version: intent.version, preflightId: intent.preflightId, intentId: intent.intentId}) : await write<VideoJobUiV2>('/media/video-v2/jobs', {preflightId: intent.preflightId, intentId: intent.intentId}); }
    catch (error) {
      if ((error as Error & { rejected?: boolean }).rejected) {
        sessionStorage.removeItem(pendingKey);
        setPendingIntent(null); setPreflight(null);
      }
      throw error;
    }
    sessionStorage.removeItem(pendingKey);
    setPendingIntent(null); setSelectedJobId(value.id); await mutateCache(['video-job-v2', user?.orgId, user?.id, value.id], value, false); await jobs.mutate();
    setPreflight(null);
    updateLocation({ pieceId: draft.pieceId, draftId: draft.id, jobId: value.id });
  });
  const jobAction = (suffix: 'retry-save' | 'cancel' | 'resume') => action('job', async () => {
    if (!job) return;
    const next = await write<VideoJobUiV2>(`/media/video-v2/jobs/${encodeURIComponent(job.id)}/${suffix}`, {});
    await selectedJob.mutate(next, false); await jobs.mutate();
  });
  const attach = (mediaId: string) => action('attach', async () => {
    if (!draft || dirty || access?.kind !== 'manual') return;
    const value = await write<VideoJobUiV2>('/media/video-v2/manual-attachments', {draftId: draft.id, version: draft.version, mediaId});
    setSelectedJobId(value.id); await mutateCache(['video-job-v2', user?.orgId, user?.id, value.id], value, false); await jobs.mutate();
    updateLocation({pieceId: draft.pieceId, draftId: draft.id, jobId: value.id});
  });
  const setSource = (id: string) => {
    setPieceId(id); setDraft(null); setDraftReaderId(''); setConflictingDraft(null); setBrief(blankBrief(settings.locale)); setDirty(false); setPreflight(null); setPendingIntent(null); setSelectedJobId(''); setError(''); setNotice('');
  };
  const disabled = !canWrite || busy !== null || heygenBusy || !!unresolved;
  const assets = access?.kind === 'subscription' ? ownedAssets : access?.kind === 'api' ? catalog.data?.assets : undefined;
  const engineOptions = videoPresenterEngineOptionsV2(access?.kind, assets, settings.avatarId);
  const deliveryWords = heygenPerformanceCopy[language.startsWith('ru')?'ru':'en'];
  const failure = error === 'VIDEO_PERFORMANCE_CUE_UNAVAILABLE' ? deliveryWords.preflightCueUnavailable
    : error === 'VIDEO_PERFORMANCE_PLAN_STALE' ? deliveryWords.preflightPlanStale
    : error === 'VIDEO_ACCESS_DENIED' ? words.restricted : /PREFLIGHT|DRAFT_CHANGED|SOURCE_CHANGED|PAYER_CHANGED|CONNECTION_CHANGED/.test(error) ? accessWords.approvalStale : /CREDIT|BUDGET/.test(error) ? accessWords.insufficient : /REAUTH/.test(error) ? accessWords.reauth : /SCHEMA|TOOL|UNSUPPORTED|TRIAL|API_KEY_REQUIRED|ELIGIBILITY/.test(error) ? accessWords.unsupported : /OAUTH|CONNECTION|WALLET/.test(error) ? accessWords.loginFailed : error === 'VIDEO_KEY_NOT_CONFIGURED' ? words.noKey : error === 'VIDEO_PRICE_UNAVAILABLE' ? words.unknown : words.failed;
  return <section className="split-container flex w-full min-w-0 flex-col gap-[24px] text-cf-ink" data-video-workspace="v2" data-video-access-kind={access?.kind ?? "unselected"} aria-busy={busy !== null || heygenBusy}>
    <div className="flex flex-wrap items-start justify-between gap-[12px]">
      <div className="flex min-w-0 flex-col gap-[8px]"><h1 className="cf-heading-lg [text-wrap:balance]">{words.title}</h1><p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{words.sourceNote}</p></div>
      {!embedded && <a href="/media" className={buttonClassName({ variant: 'quiet' })}>{words.close}</a>}
    </div>
    {!canWrite && <p className="cf-body-sm text-cf-ink-muted">{words.restricted}</p>}
    <section className="flex min-w-0 flex-col gap-[12px] border-b border-cf-border pb-[20px]" aria-label={accessWords.access}>
      <LabelledField id="video-access-method" label={accessWords.access}><Select standalone id="video-access-method" value={access?.kind ?? ''} disabled={busy !== null || !!unresolved || !canWrite} onChange={event => selectAccess(event.target.value === 'subscription' ? {kind: 'subscription', connectionId: ''} : event.target.value === 'api' ? {kind: 'api', payer: apiPayer} : event.target.value === 'manual' ? {kind: 'manual', provider: settings.provider} : null)}><option value="">{accessWords.choose}</option><option value="subscription">{accessWords.subscription}</option><option value="api">{accessWords.api}</option><option value="manual">{accessWords.manual}</option></Select></LabelledField>
      {access?.kind === 'api' && <p className="cf-body-sm text-cf-ink-muted">{words.payer}: {access.payer === 'included' ? words.included : words.workspaceKey}</p>}
      {access?.kind === 'manual' && <LabelledField id="video-manual-provider" label={words.route}><Select standalone id="video-manual-provider" value={access.provider} disabled={busy !== null || !!unresolved} onChange={event => selectAccess({kind: 'manual', provider: event.target.value as 'higgsfield' | 'heygen'})}><option value="higgsfield">Higgsfield</option><option value="heygen">HeyGen</option></Select></LabelledField>}
      {access?.kind === 'subscription' && <>
        <LabelledField id="video-subscription-account" label={accessWords.account}><Select standalone id="video-subscription-account" value={access.connectionId} disabled={busy !== null || !!unresolved} onChange={event => selectAccess({kind: 'subscription', connectionId: event.target.value})}><option value="">{personal.chooseAccount}</option>{accessChoices.data?.connections.map(item => <option key={item.id} value={item.id}>{item.provider === 'higgsfield' ? 'Higgsfield' : 'HeyGen'}{accessChoices.data!.connections.filter(other => other.provider === item.provider).length > 1 ? ` · ${item.id.slice(-4)}` : ''} · {['connected', 'discovery_required'].includes(item.state) ? accessWords.connected : item.state === 'reauth_required' ? accessWords.reconnect : accessWords.disconnected}</option>)}</Select></LabelledField>
        {connection && connection.provider !== settings.provider && <p role="status" className="cf-body-sm text-cf-warning">{accessWords.mismatch}</p>}
        <VideoSubscriptions managementOnly providerFilter={settings.provider} selectedConnection={connection} returnPath={embedded ? chatReturn ?? '' : videoWorkspacePath({pieceId, draftId: draft?.id, jobId: job?.id})} canConnect={!dirty && (!embedded || !!chatReturn && !!onBindChatVideo)} connectBlockedMessage={embedded && (!chatReturn || !onBindChatVideo) ? personal.saveChatFirst : undefined} beforeConnect={embedded ? async () => {
          if (!chatThreadId || !draft || !chatReturn || !onBindChatVideo) throw new Error('VIDEO_CHAT_BIND_FAILED');
          await onBindChatVideo({threadId: chatThreadId, draftId: draft.id, ...(pieceId ? {pieceId} : {}), ...(job?.id ? {jobId: job.id} : {})});
          if (bindingState.current.dirty || bindingState.current.chatReturn !== chatReturn || bindingState.current.draftVersion !== draft.version) throw new Error('VIDEO_CHAT_BIND_FAILED');
        } : undefined} onChanged={() => { setPreflight(null); void personalReadiness.mutate(); void subscriptionAssets.mutate(); }} />
        {connection && ['connected', 'discovery_required'].includes(connection.state) && !nativeCheckReady && (identityUnavailable ? <p role="status" className="cf-body-sm text-cf-ink-muted">{personal.integrationNotReady}</p> : <section aria-label={personal.readiness} className="flex flex-col gap-[8px]">
          <h3 className="cf-label-md">{personal.readiness}</h3>
          {personalReadiness.error ? <p role="status" className="cf-body-sm">{personal.checkAccount} <Button variant="quiet" onClick={() => personalReadiness.mutate()}>{words.refresh}</Button></p> : !personalReadiness.data ? <SkeletonRows rows={2} label={words.loading} /> : <>
            {operation && <p className="cf-body-sm">{personal[operation.kind as 'presenter' | 'generated_clip']}: {operation.ready && operation.blockers.length === 0 ? personal.ready : personal.blocked}{operation.blockers.length > 0 && ` — ${[...new Set(operation.blockers.map(code => videoPersonalBlocker(code, personal)))].join(' ')}`}</p>}
          </>}
        </section>)}
      </>}
    </section>
    {catalog.error ? <ErrorState title={words.failed} action={<Button variant="secondary" onClick={() => catalog.mutate()}>{words.refresh}</Button>} /> : !catalog.data || !!draftReaderId && !draft && !savedDraft.error ? <SkeletonRows rows={4} label={words.loading} /> : <>
      <div className="grid min-w-0 gap-[24px] lg:split:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-[20px]">
          <LabelledField id="video-source-piece" label={words.source}><Select standalone id="video-source-piece" value={pieceId} disabled={disabled || !!draft} onChange={event => setSource(event.target.value)}><option value="">{words.choosePiece}</option>{pieceId && !pieces.data?.pieces.some(item => item.id === pieceId) && <option value={pieceId}>{pieceId}</option>}{pieces.data?.pieces.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></LabelledField>
          {pieces.data?.pieces.length === 0 && !initialPieceId && <p className="cf-body-sm text-cf-ink-muted">{words.noPieces} <a className="underline" href="/content?tab=materials">{words.source}</a></p>}
          {pieces.error && <p role="alert" className="cf-body-sm text-cf-danger">{words.failed} <Button variant="quiet" onClick={() => pieces.mutate()}>{words.refresh}</Button></p>}
          {drafts.error && <p role="alert" className="cf-body-sm text-cf-danger">{words.failed} <Button variant="quiet" onClick={() => drafts.mutate()}>{words.refresh}</Button></p>}
          {!!drafts.data?.length && <div className="flex flex-wrap items-center gap-[8px]"><LabelledField id="video-draft-picker" label={words.reopen} className="min-w-0 flex-1"><Select standalone id="video-draft-picker" value={draft?.id ?? ''} disabled={busy !== null || heygenBusy || dirty || heygenDirty || !!unresolved} onChange={event => { const next = drafts.data?.find(item => item.id === event.target.value); if (next) { acceptDraft(next); updateLocation({ pieceId: next.pieceId, draftId: next.id }); } }}><option value="">{words.choosePiece}</option>{drafts.data.map(item => <option key={item.id} value={item.id}>{item.title || videoDraftTitle(item)}</option>)}</Select></LabelledField>{draft && !dirty && !unresolved && <Button variant="quiet" onClick={() => setSource(pieceId)}>{words.another}</Button>}</div>}
          {savedDraft.error && <ErrorState title={words.failed} action={<Button variant="secondary" onClick={() => savedDraft.mutate()}>{words.refresh}</Button>} />}
          {conflictingDraft && <div role="alert" className="flex flex-col gap-[8px]"><p className="cf-body-sm text-cf-warning">{words.draftChanged}</p><div><Button variant="secondary" onClick={() => acceptDraft(conflictingDraft)}>{words.reloadDraft}</Button></div></div>}
          <div className="grid gap-[16px] split:grid-cols-2">
            <LabelledField id="video-mode" label={words.mode}><Select standalone id="video-mode" value={settings.mode} disabled={disabled} onChange={event => { const route = catalog.data?.routes.find(item => item.mode === event.target.value); if (route) editSettings(videoSettingsForRoute(route, settings.locale)); }}><option value="clip">{words.clip}</option><option value="presenter">{words.presenter}</option></Select></LabelledField>
            <LabelledField id="video-route" label={words.route}><Select standalone id="video-route" value={`${settings.provider}:${settings.model}`} disabled={disabled} onChange={event => { const route = catalog.data?.routes.find(item => `${item.provider}:${item.model}` === event.target.value); if (route) editSettings(videoSettingsForRoute(route, settings.locale)); }}>{catalog.data.routes.filter(item => item.mode === settings.mode).map(item => <option key={`${item.provider}:${item.model}`} value={`${item.provider}:${item.model}`}>{item.label}</option>)}</Select></LabelledField>
            <Input standalone name="video-output-locale" label={words.locale} value={settings.locale} disabled={disabled} onChange={event => editSettings({ locale: event.target.value })} placeholder="ru-RU, en-US, de-DE…" />
            {route?.durations.values?.length && !settings.heygenV2 ? <LabelledField id="video-duration" label={words.duration}><Select standalone id="video-duration" value={settings.duration} disabled={disabled} onChange={event => editSettings({ duration: Number(event.target.value) })}>{!route.durations.values.includes(settings.duration) && <option value={settings.duration} disabled>{settings.duration}</option>}{route.durations.values.map(value => <option key={value} value={value}>{value}</option>)}</Select></LabelledField> : <Input standalone name="video-duration" label={words.duration} type="number" value={settings.duration} min={settings.heygenV2?2:route?.durations.min} max={settings.heygenV2?300:route?.durations.max} step="1" disabled={disabled} onChange={event => editSettings({ duration: Number(event.target.value) })} helper={settings.mode === 'presenter' ? words.durationNote : `${route?.durations.min ?? ''}–${route?.durations.max ?? ''}`} />}
            <LabelledField id="video-ratio" label={words.ratio}><Select standalone id="video-ratio" value={settings.aspectRatio} disabled={disabled} onChange={event => editSettings({ aspectRatio: event.target.value as VideoSettingsV1['aspectRatio'] })}>{(settings.heygenV2?['9:16','16:9','1:1','4:5','5:4','auto']:route?.aspectRatios)?.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}</Select></LabelledField>
            {!!route?.resolutions.length && <LabelledField id="video-resolution" label={words.resolution}><Select standalone id="video-resolution" value={settings.resolution ?? ''} disabled={disabled} onChange={event => editSettings({ resolution: event.target.value })}>{route.resolutions.map(value => <option key={value} value={value}>{value}</option>)}</Select></LabelledField>}
          </div>
          {settings.mode === 'presenter' && <div className="grid gap-[16px] split:grid-cols-2">
            {access?.kind === 'subscription' && <p className="cf-body-sm split:col-span-2">{personal.ownedAssets}</p>}
            {privateCatalog && <p role="status" className="cf-body-sm text-cf-ink-muted split:col-span-2">{personal.catalogOnly}</p>}
            {access?.kind === 'subscription' && subscriptionAssets.data && (!ownedAssets || !ownedAssets.avatars.length || !ownedAssets.voices.length) && <p role="status" className="cf-body-sm split:col-span-2">{subscriptionAssets.data.status === 'needs_owned_assets' || subscriptionAssets.data.status === 'ready' && ownedAssets ? personal.assetsUnavailable : subscriptionAssets.data.status === 'discovery_required' ? personal.connectedNeedsDiscovery : personal.checkAccount} {subscriptionAssets.data.status === 'needs_owned_assets' && subscriptionAssets.data.guidance && <a className="underline" href={VIDEO_PROVIDER_SITES_V2[settings.provider]} target="_blank" rel="noreferrer">{personal.openProvider}</a>} · <Button variant="quiet" onClick={() => subscriptionAssets.mutate()}>{words.refresh}</Button></p>}
            {access?.kind === 'subscription' && ownedAssets && !ownSelectionReady && (settings.avatarId || settings.voiceId) && <p role="status" className="cf-body-sm split:col-span-2">{personal.staleAssets}</p>}
            {access?.kind === 'subscription' && subscriptionAssets.error && <p role="alert" className="cf-body-sm text-cf-danger split:col-span-2">{accessWords.unsupported} <Button variant="quiet" onClick={() => subscriptionAssets.mutate()}>{words.refresh}</Button></p>}
            {access?.kind === 'subscription' && connection?.state === 'connected' && connection.workspaceGranted && connection.provider === settings.provider && !subscriptionAssets.data && !subscriptionAssets.error && <SkeletonRows rows={2} label={words.loading} />}
            {access?.kind === 'api' && catalog.data.assetsError && <p role="alert" className="cf-body-sm text-cf-danger split:col-span-2">{words.failed}</p>}
            {access?.kind === 'manual' ? <>
              <Input standalone name="video-manual-avatar" label={words.avatar} value={settings.avatarId ?? ''} disabled={disabled} onChange={event => editSettings({avatarId: event.target.value || undefined})} />
              <Input standalone name="video-manual-voice" label={words.voice} value={settings.voiceId ?? ''} disabled={disabled} onChange={event => editSettings({voiceId: event.target.value || undefined})} />
              <Input standalone name="video-manual-engine" label={words.engine} value={settings.engine ?? ''} disabled={disabled} onChange={event => editSettings({engine: event.target.value || undefined})} />
            </> : <>
              <LabelledField id="video-avatar" label={words.avatar}><Select standalone id="video-avatar" value={settings.avatarId ?? ''} disabled={disabled || !!settings.heygenV2} onChange={event => editSettings({ avatarId: event.target.value || undefined, engine: undefined })}><option value="">—</option>{settings.avatarId && !assets?.avatars?.some(item => item.id === settings.avatarId) && <option disabled value={settings.avatarId}>{personal.staleAssets}</option>}{assets?.avatars?.map(item => <option key={item.id} value={item.id} disabled={'selectableForDraft' in item ? item.selectableForDraft !== true : 'state' in item && ['failed', 'training'].includes(String(item.state))}>{item.name}{'state' in item && item.state !== 'available' ? ` · ${item.state === 'failed' ? personal.failedAsset : item.state === 'training' ? personal.trainingAsset : personal.consentUnknown}` : ''}</option>)}</Select></LabelledField>
              <LabelledField id="video-voice" label={words.voice}><Select standalone id="video-voice" value={settings.voiceId ?? ''} disabled={disabled || !!settings.heygenV2} onChange={event => editSettings({ voiceId: event.target.value || undefined })}><option value="">—</option>{settings.voiceId && !assets?.voices?.some(item => item.id === settings.voiceId) && <option disabled value={settings.voiceId}>{personal.staleAssets}</option>}{assets?.voices?.map(item => <option key={item.id} value={item.id}>{item.name}{'language' in item && typeof item.language === 'string' ? ` · ${item.language}` : ''}</option>)}</Select></LabelledField>
              <LabelledField id="video-engine" label={words.engine}><Select standalone id="video-engine" value={access?.kind === 'subscription' && !engineOptions.includes(settings.engine ?? '') ? '' : settings.engine ?? ''} disabled={disabled || !!settings.heygenV2} onChange={event => editSettings({ engine: event.target.value || undefined })}><option value="">—</option>{access?.kind !== 'subscription' && settings.engine && !engineOptions.includes(settings.engine) && <option value={settings.engine}>{settings.engine}</option>}{engineOptions.map(engine => <option key={engine} value={engine}>{engine}</option>)}</Select></LabelledField>
            </>}
          </div>}
          {access?.kind === 'subscription' && connection?.provider === 'heygen' && settings.provider === 'heygen' && settings.mode === 'presenter' &&
            (ownedAssets || nativeBinding?.connectionId === connection.id) && <VideoHeygenPersonControls
            key={`${actorKey}:${connection.id}:${connection.generation}`} actorKey={actorKey} connectionId={connection.id} connectionGeneration={connection.generation}
            draft={draft} avatars={ownedAssets?.avatars ?? []} voices={ownedAssets?.voices ?? []} disabled={!canWrite || busy !== null || feedbackBusy || !!unresolved || !!conflictingDraft}
            draftDirty={dirty} onDirtyChange={heygenEditing} onBusyChange={setPersonBusy} onSaved={adoptHeygenDraft} />}
          <div className="flex flex-wrap gap-[16px]">
            {route?.audio && <CheckboxField label={words.audio} checked={settings.audio} disabled={disabled || settings.mode === 'presenter'} onChange={event => editSettings({ audio: event.target.checked })} />}
            {route?.captions && <CheckboxField label={words.captions} checked={settings.captions} disabled={disabled} onChange={event => editSettings({ captions: event.target.checked })} />}
          </div>
          <div className="grid gap-[16px] split:grid-cols-2">
            <Input standalone name="video-intent" label={words.intent} value={brief.intent} disabled={disabled} onChange={event => editBrief({ intent: event.target.value })} />
            <Input standalone name="video-audience" label={words.audience} value={brief.audience} disabled={disabled} onChange={event => editBrief({ audience: event.target.value })} />
          </div>
          <Input standalone name="video-key-message" label={words.keyMessage} value={brief.keyMessage} disabled={disabled} onChange={event => editBrief({ keyMessage: event.target.value })} />
          <VideoTextField id="video-visual-intent" label={words.visualIntent} value={brief.visualIntent} disabled={disabled} onChange={value => editBrief({ visualIntent: value })} short />
          {route?.inputs.includes('image') && <div className="flex flex-col gap-[8px]"><h2 className="cf-label-md">{words.references}</h2><ul className="flex flex-col gap-[4px]">{brief.referenceMediaIds.map(id => <li key={id} className="flex min-w-0 items-center justify-between gap-[8px]"><span className="break-all cf-caption">{id}</span><Button variant="quiet" density="dense" disabled={disabled} onClick={() => editBrief({ referenceMediaIds: brief.referenceMediaIds.filter(value => value !== id) })}>{words.remove}</Button></li>)}</ul><div><Button variant="secondary" disabled={disabled} onClick={() => openMediaBox(items => editBrief({ referenceMediaIds: items.map(item => item.id) }), { type: 'image' })}>{words.chooseReference}</Button></div></div>}
          {draft && <>
            <VideoTextField id="video-prompt" label={words.prompt} value={brief.prompt} disabled={disabled} onChange={value => editBrief({ prompt: value })} />
            {settings.mode === 'presenter' && <><VideoTextField id="video-script" label={words.script} value={brief.script} disabled={disabled} onChange={value => editBrief({ script: value })} /><LabelledField id="video-script-policy" label={words.scriptPolicy}><Select standalone id="video-script-policy" value={brief.scriptPolicy} disabled={disabled} onChange={event => editBrief({ scriptPolicy: event.target.value as VideoBriefUiV1['scriptPolicy'] })}><option value="exact">{words.exact}</option><option value="adaptable">{words.adaptable}</option></Select></LabelledField></>}
            <section className="flex flex-col gap-[12px] border-t border-cf-border pt-[16px]"><h2 className="cf-heading-md">{words.facts}</h2>{brief.facts.map((fact, index) => <div key={`${fact.sourceId}-${index}`} className="grid min-w-0 gap-[8px] split:grid-cols-[minmax(0,1fr)_180px]"><p className="break-words cf-body-sm">{fact.text}<span className="block break-all cf-caption text-cf-ink-muted">{fact.sourceId}</span></p><Select standalone aria-label={`${fact.text}: ${words.facts}`} value={fact.policy} disabled={disabled} onChange={event => editBrief({ facts: brief.facts.map((item, i) => i === index ? { ...item, policy: event.target.value as typeof fact.policy } : item) })}><option value="must_include">{words.mustInclude}</option><option value="context_only">{words.contextOnly}</option></Select></div>)}</section>
            <VideoTextField id="video-avoid" label={words.avoid} value={brief.avoidImplications.join('\n')} disabled={disabled} onChange={value => editBrief({ avoidImplications: value.split('\n') })} short />
          </>}
          <div className="flex flex-wrap items-center gap-[8px]">
            <Button variant="secondary" disabled={disabled || heygenDirty || !!conflictingDraft || !pieceId || !route || (!!draft && !dirty)} loading={busy === 'save'} loadingLabel={words.saving} onClick={() => save(false)}>{words.save}</Button>
            <Button variant="quiet" disabled={disabled || heygenDirty || !!conflictingDraft || !pieceId || !route || dirty && !!draft} loading={busy === 'prepare'} loadingLabel={words.loading} onClick={() => save(true)}>{words.prepare}</Button>
            <span className="cf-body-sm text-cf-ink-muted">{dirty ? words.dirty : notice}</span>
          </div><p className="cf-body-sm text-cf-ink-muted">{words.prepareNote}</p>
        </div>
        <aside className="flex min-w-0 flex-col gap-[20px] border-t border-cf-border pt-[20px] lg:split:border-t-0 lg:split:pt-0">
          {access?.kind === 'manual' ? <VideoManualV2 draft={draft} provider={access.provider} dirty={dirty} busy={busy !== null} canWrite={canWrite} onAttach={attach} /> : <section className="flex flex-col gap-[12px] bg-cf-surface-subtle p-[16px] rounded-[8px]" aria-label={words.preflight}>
            <h2 className="cf-heading-md">{words.preflight}</h2>
            {route && <p className="cf-body-sm">{route.label} · {settings.locale} · {settings.aspectRatio} · {settings.duration}s</p>}
            {!access && <p className="cf-body-sm">{accessWords.choose}</p>}
            {!catalog.data.routes.length && <p className="cf-body-sm">{words.noRoutes}</p>}
            {unavailable && <p role="status" className="cf-body-sm">{effective?.hasKey ? words.noBudget : words.noKey} <a href="/settings?tab=global_settings" className="underline">{words.settings}</a></p>}
            {payerChanged && <p role="status" className="cf-body-sm">{accessWords.approvalStale} <Button variant="quiet" onClick={() => selectAccess({kind: 'api', payer: apiPayer})}>{accessWords.api}</Button></p>}
            {subscriptionUnavailable && !nativeCheckReady && <p role="status" className="cf-body-sm">{!connection || connection.provider !== settings.provider ? accessWords.mismatch : connection.state !== 'connected' ? accessWords.reauth : !connection.perJob || !connection.perMonth ? accessWords.limitsNote : accessWords.unavailable}</p>}
            {preflight && <><VideoApprovalDetailsV2 approval={preflight} />{!videoApprovalCurrentV2(preflight) && <p role="status" className="cf-body-sm text-cf-warning">{accessWords.approvalStale}</p>}</>}
            <Button variant="secondary" disabled={disabled || heygenDirty || !access || !draft || dirty || !!unavailable || !!subscriptionUnavailable && !nativeCheckReady || !!payerChanged} loading={busy === 'preflight'} loadingLabel={words.loading} onClick={check}>{words.preflight}</Button>
            <Button disabled={!ready || busy !== null} loading={busy === 'launch'} loadingLabel={words.submitting} onClick={() => launch()}>{job ? words.another : words.launch}</Button>
            {pendingIntent && <div className="flex flex-col gap-[8px]" role="status"><p className="cf-label-md">{words.uncertain}</p><p className="cf-body-sm">{words.uncertainNote}</p><Button variant="secondary" disabled={busy !== null} onClick={() => launch(true)}>{words.retrySubmit}</Button></div>}
          </section>}
          {error && <p role="alert" className="break-words cf-body-sm text-cf-danger">{failure}</p>}
          {selectedJob.error && <ErrorState title={words.failed} action={<Button variant="secondary" onClick={() => selectedJob.mutate()}>{words.refresh}</Button>} />}
          {job && <VideoJobView job={job} words={words} busy={busy !== null} canWrite={canWrite} onRefresh={() => selectedJob.mutate()} onRetrySave={() => jobAction('retry-save')} onCancel={() => jobAction('cancel')} onResume={() => jobAction('resume')} />}
          {draft?.settings.heygenV2&&canWrite&&<VideoHeygenPerformanceFeedback actorKey={actorKey} draftId={draft.id} draftVersion={draft.version}
            jobId={job?.draftId===draft.id&&job.state==='completed'&&job.access?.kind==='subscription'&&job.snapshot?.settings?.heygenV2?job.id:undefined}
            disabled={busy!==null||personBusy||dirty||heygenDirty||!!unresolved||!!conflictingDraft}
            onBusyChange={setFeedbackBusy} onSaved={adoptHeygenDraft}/>}
          <section className="flex min-w-0 flex-col gap-[12px] border-t border-cf-border pt-[16px]"><h2 className="cf-heading-md">{words.jobs}</h2>
            {jobs.error ? <ErrorState title={words.failed} action={<Button variant="secondary" onClick={() => jobs.mutate()}>{words.refresh}</Button>} /> : !jobs.data ? <SkeletonRows rows={2} label={words.loading} /> : jobs.data.length === 0 ? <p className="cf-body-sm text-cf-ink-muted">{words.emptyJob}</p> : <ul className="flex min-w-0 flex-col divide-y divide-cf-border">{jobs.data.map(item => <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-[8px] py-[12px]"><div className="min-w-0 flex-1"><p className="break-words cf-body-sm">{item.snapshot?.brief?.keyMessage || item.snapshot?.settings?.model || item.id}</p><span className="cf-caption text-cf-ink-muted">{videoJobWord(item.state, words, accessWords)} · {item.access?.kind === 'manual' ? accessWords.manual : item.access?.kind === 'subscription' ? accessWords.subscription : accessWords.api}</span></div><a className={buttonClassName({ variant: 'quiet', density: 'dense' })} href={videoWorkspacePath({ pieceId: item.pieceId, draftId: item.draftId, jobId: item.id })}>{words.reopen}</a></li>)}</ul>}
          </section>
        </aside>
      </div>
    </>}
  </section>;
}
function VideoTextField({ id, label, value, disabled, onChange, short = false }: { id: string; label: string; value: string; disabled: boolean; onChange: (value: string) => void; short?: boolean }) {
  return <LabelledField id={id} label={label}><Textarea standalone id={id} layout={short ? 'content' : 'composer'} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /></LabelledField>;
}
export function videoJobWord(state: string, words: VideoWordsV1, accessWords?: VideoAccessWordsV2): string {
  if (state === 'access_unavailable') return accessWords?.actionRequired ?? words.failedState;
  if (state === 'submission_unknown') return accessWords?.submissionUnknown ?? words.uncertain;
  if (state === 'status_delayed') return accessWords?.statusDelayed ?? words.uncertain;
  if (state === 'reauth_required') return accessWords?.reconnect ?? words.uncertain;
  if (state === 'failed') return words.failedState;
  if (state === 'save_failed' || state === 'saving_failed') return words.saveFailed;
  return (words as Record<string, string>)[state] ?? words.uncertain;
}
function VideoJobView({ job, words, busy, canWrite, onRefresh, onRetrySave, onCancel, onResume }: { job: VideoJobUiV2; words: VideoWordsV1; busy: boolean; canWrite: boolean; onRefresh: () => void; onRetrySave: () => void; onCancel: () => void; onResume: () => void }) {
  const request = useFetch();
  const language=useInterfaceLanguage(),captionWords=heygenControlsCopy[language.startsWith('ru')?'ru':'en'];
  const accessWords = useVideoAccessWords(); const unit = useVideoUnitV2();
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const downloadLock = useRef(false);
  const download = async () => {
    if (downloadLock.current || !job.result) return;
    downloadLock.current = true; setDownloading(true); setDownloadFailed(false);
    try { await downloadOwnedVideoV2(request, job.id, job.result.name); }
    catch { setDownloadFailed(true); }
    finally { downloadLock.current = false; setDownloading(false); }
  };
  const downloadSubtitle=async(subtitle:NonNullable<VideoJobUiV2['subtitles']>[number])=>{
    if(downloadLock.current)return;
    downloadLock.current=true;setDownloading(true);setDownloadFailed(false);
    try{await downloadOwnedVideoSubtitleV2(request,job.id,subtitle.id,subtitle.name);}
    catch{setDownloadFailed(true);}
    finally{downloadLock.current=false;setDownloading(false);}
  };
  const saveFailed = job.state === 'save_failed' || job.state === 'saving_failed';
  const canControl = canWrite && (job.access?.kind !== 'subscription' || !!job.access.connectionId);
  return <section className="flex min-w-0 flex-col gap-[12px]" data-video-job-id={job.id} data-video-job-state={job.state}>
    <div role="status"><Status tone={job.state === 'completed' ? 'accent' : VIDEO_UNRESOLVED_STATES_V2.has(job.state) || saveFailed ? 'warning' : job.state === 'failed' ? 'danger' : 'neutral'}>{videoJobWord(job.state, words, accessWords)}</Status></div>
    <p className="break-all cf-caption text-cf-ink-muted">{job.id}</p>
    <p className="cf-body-sm">{accessWords.access}: {job.access?.kind === 'manual' ? accessWords.manual : job.access?.kind === 'subscription' ? accessWords.subscription : accessWords.api}</p>
    <p className="cf-body-sm">{job.access?.kind === 'manual' ? accessWords.externalCost : <>{job.access?.kind === 'subscription' ? accessWords.actualCreditCost : words.actualCost}: {job.cost ? job.cost.amount === null ? words.unknown : `${job.cost.amount} ${unit(job.cost.unit)}` : job.costUsd == null ? words.unknown : `USD ${job.costUsd.toFixed(2)}`}</>}</p>
    {job.cost?.certainty === 'owner_reconciled' && <p className="cf-body-sm text-cf-ink-muted">{accessWords.ownerReconciled}</p>}
    {job.cost?.certainty === 'provider_confirmed' && <p className="cf-body-sm text-cf-ink-muted">{accessWords.providerReported}</p>}
    {job.reserved && <p className="cf-body-sm text-cf-ink-muted">{accessWords.reserved}: {job.reserved} {unit(job.cost?.unit)}</p>}
    {job.actionRequired?.kind === 'replace_owned_voice' && job.access?.kind === 'subscription' && <div role="status" className="flex flex-col items-start gap-[8px]">
      <p className="cf-body-sm">{accessWords.voiceUnusable}</p>
      <a className={buttonClassName({variant: 'secondary'})} href={VIDEO_PROVIDER_SITES_V2.heygen} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{accessWords.open}</a>
    </div>}
    {job.state === 'submission_unknown' && <p role="status" className="cf-body-sm">{accessWords.submissionUnknown}</p>}
    {job.state === 'reauth_required' && <p role="status" className="cf-body-sm">{accessWords.reauth}</p>}
    {job.state === 'status_delayed' && <p role="status" className="cf-body-sm">{accessWords.statusDelayed}</p>}
    {['reauth_required', 'status_delayed'].includes(job.state) && job.access?.kind === 'subscription' && job.access.connectionId && <Button variant="secondary" disabled={busy || !canControl} onClick={onResume}>{accessWords.resume}</Button>}
    {job.state === 'uncertain' && <p className="cf-body-sm">{words.uncertainNote}</p>}
    {saveFailed && <><p className="cf-body-sm">{words.saveFailedNote}</p>{canControl && <Button variant="secondary" disabled={busy} onClick={onRetrySave}>{words.retrySave}</Button>}</>}
    {['completed','save_failed','saving_failed'].includes(job.state) && job.result && <><video className="w-full rounded-[8px] bg-cf-surface-subtle" controls playsInline preload="metadata" src={job.result.path} aria-label={job.result.name} /><Button variant="secondary" disabled={downloading} loading={downloading} loadingLabel={words.loading} onClick={download}>{words.download}</Button>{downloadFailed && <p role="alert" className="cf-body-sm text-cf-danger">{words.failed}</p>}</>}
    {job.state==='completed'&&job.subtitles?.map(subtitle=><Button key={subtitle.id} variant="quiet" disabled={downloading} onClick={()=>downloadSubtitle(subtitle)}>{captionWords.captions} · {subtitle.mimeType==='text/vtt'?'VTT':'SRT'}</Button>)}
    <div className="flex flex-wrap gap-[8px]"><Button variant="quiet" disabled={busy} onClick={onRefresh}>{words.refresh}</Button>{job.canCancel && VIDEO_ACTIVE_STATES.has(job.state) && <Button variant="quiet" disabled={busy || !canWrite} onClick={onCancel}>{words.cancel}</Button>}</div>
  </section>;
}
