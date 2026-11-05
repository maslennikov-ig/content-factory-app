'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { Select } from '@contentfactory/react/form/select';
import { LabelledField } from '../ui/field-label';
import { Input } from '@contentfactory/react/form/input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useUser } from '../layout/user.context';
import { SettingsSection } from '../settings/settings-section';
import { ErrorState, SkeletonRows, Status } from '../ui/surface';
import { useVideoWords } from './video.copy';
import { useIntegrationHubWords } from '../third-parties/integration-hub.copy';

type Provider = 'higgsfield' | 'heygen';
export interface VideoApiSourceUiV1 { id: string; name: string }
export interface VideoPolicyUiV1 { hasKey: boolean; enabled: boolean; maxCostUsd: number | null; monthlyBudgetUsd: number | null; available: boolean;
  credentialSource?: {kind: 'third_party'; integrationId: string; name?: string; status: 'configured' | 'unavailable' | 'inactive'} }
export interface VideoProviderSettingsUiV1 {
  usageMode: 'included' | 'workspace_key';
  workspace: Record<Provider, VideoPolicyUiV1>;
  included: Record<Provider, VideoPolicyUiV1>;
  effective: Record<Provider, VideoPolicyUiV1>;
}
const API = '/media/video-provider-settings';
export function VideoProviderSettings({inHub = false, providerFilter, apiSources = []}: {inHub?: boolean; providerFilter?: Provider; apiSources?: VideoApiSourceUiV1[]} = {}) {
  const words = useVideoWords();
  const hubWords = useIntegrationHubWords();
  const request = useFetch();
  const user = useUser();
  const canEdit = isOrganizationAdmin(user?.role);
  const [pending, setPending] = useState<Provider | null>(null);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const settings = useSWR<VideoProviderSettingsUiV1>(inHub && canEdit ? ['video-provider-settings-v1', user?.orgId] : null, async () => {
    const response = await request(API);
    if (!response.ok) throw new Error('VIDEO_SETTINGS_UNAVAILABLE');
    const value = await response.json();
    if (!value.workspace?.higgsfield || !value.workspace?.heygen || !value.effective?.higgsfield || !value.effective?.heygen) throw new Error('VIDEO_SETTINGS_UNAVAILABLE');
    return value;
  }, { revalidateOnFocus: false });
  const save = async (provider: Provider, patch: object) => {
    setPending(provider); setFailed(false); setNotice('');
    try {
      const response = await request(API, { method: 'POST', body: JSON.stringify(patch) });
      if (!response.ok) throw new Error('VIDEO_SETTINGS_SAVE_FAILED');
      await settings.mutate(); setNotice(words.settingsSaved);
    } catch (error) { setFailed(true); throw error; }
    finally { setPending(null); }
  };
  if (!inHub) return <SettingsSection layout="row" title={words.settings} caption={hubWords.hubNote}><a href="/third-party" className={buttonClassName({variant: 'secondary'})}>{hubWords.manage}</a></SettingsSection>;
  if (!canEdit) return <p role="status" className="cf-body-sm text-cf-ink-muted">{hubWords.admin}</p>;
  return <SettingsSection layout="row" title={words.settings} caption={words.budgetNote}>
    {!settings.data ? settings.error ? <ErrorState title={words.failed} action={<Button variant="secondary" onClick={() => settings.mutate()}>{words.refresh}</Button>} /> : <SkeletonRows rows={3} label={words.loading} /> : <>
      <p className="cf-body-sm text-cf-ink-muted">{words.payer}: {settings.data.usageMode === 'included' ? words.included : words.workspaceKey}</p>
      {!canEdit && <p className="cf-body-sm text-cf-ink-muted">{words.noAccess}</p>}
      {(Object.keys(settings.data.workspace) as Provider[]).filter(provider => !providerFilter || provider === providerFilter).map(provider => <ProviderSettingsRow key={`${provider}-${settings.data?.workspace[provider].maxCostUsd}-${settings.data?.workspace[provider].monthlyBudgetUsd}-${settings.data?.workspace[provider].enabled}-${settings.data?.workspace[provider].credentialSource?.integrationId ?? 'inline'}-${settings.data?.workspace[provider].credentialSource?.status ?? ''}`} apiSources={provider === 'heygen' ? apiSources : []} provider={provider} value={settings.data!.workspace[provider]} effective={settings.data!.effective[provider]} canEdit={canEdit} busy={pending !== null} loading={pending === provider} onSave={patch => save(provider, patch)} />)}
      {notice && <p role="status" className="cf-body-sm text-cf-accent">{notice}</p>}
      {failed && <p role="alert" className="cf-body-sm text-cf-danger">{words.failed}</p>}
    </>}
  </SettingsSection>;
}
function ProviderSettingsRow({ provider, value, effective, apiSources, canEdit, busy, loading, onSave }: { provider: Provider; value: VideoPolicyUiV1; effective: VideoPolicyUiV1; apiSources: VideoApiSourceUiV1[]; canEdit: boolean; busy: boolean; loading: boolean; onSave: (patch: object) => Promise<void> }) {
  const words = useVideoWords();
  const hubWords = useIntegrationHubWords();
  const originalSource = value.credentialSource?.integrationId ?? '';
  const [source, setSource] = useState(originalSource);
  const [key, setKey] = useState('');
  const [enabled, setEnabled] = useState(value.enabled);
  const [cap, setCap] = useState(value.maxCostUsd?.toString() ?? '');
  const [budget, setBudget] = useState(value.monthlyBudgetUsd?.toString() ?? '');
  const valid = Number(cap) > 0 && Number(budget) >= Number(cap) && Number.isFinite(Number(cap)) && Number.isFinite(Number(budget));
  const sourceChanged = source !== originalSource;
  const validSource = !sourceChanged || !source || apiSources.some(item => item.id === source);
  const sourcePatch = sourceChanged ? {credentialSource: source ? {kind: 'third_party', integrationId: source} : null} : {};
  const save = async () => {
    try { await onSave({ ...(!source && key.trim() ? { videoApiKeys: { [provider]: key.trim() } } : {}), videoSpendPolicy: { [provider]: { enabled, maxCostUsd: Number(cap), monthlyBudgetUsd: Number(budget), ...sourcePatch } } });
    setKey(''); } catch { /* Keep the entered key available for an explicit retry. */ }
  };
  return <section className="flex min-w-0 flex-col gap-[12px] border-t border-cf-border pt-[16px]" data-video-provider-settings={provider}>
    <div className="flex flex-wrap items-center gap-[8px]"><h4 className="cf-label-md text-cf-ink">{provider === 'higgsfield' ? 'Higgsfield' : 'HeyGen'}</h4>{effective.available && <Status>{words.prepared}</Status>}</div>
    <p className="cf-body-sm text-cf-ink-muted">{effective.available ? `${words.maxCost}: $${effective.maxCostUsd}; ${words.monthlyBudget}: $${effective.monthlyBudgetUsd}` : effective.hasKey ? words.noBudget : words.noKey}</p>
    <h5 className="cf-label-md">{words.workspaceKey}{value.hasKey && <span className="ms-[8px] cf-body-sm text-cf-ink-muted">{words.keySaved}</span>}</h5>
    <CheckboxField label={words.enabled} checked={enabled} disabled={!canEdit || busy} onChange={event => setEnabled(event.target.checked)} />
    {provider === 'heygen' && <>
      <LabelledField id={`video-${provider}-source`} label={hubWords.source}>
        <Select standalone id={`video-${provider}-source`} value={source} disabled={!canEdit || busy} onChange={event => setSource(event.target.value)}>
          <option value="">{hubWords.inlineSource}</option>
          {!!originalSource && !apiSources.some(item => item.id === originalSource) && <option value={originalSource}>{value.credentialSource?.name ?? originalSource} · {hubWords.sourceUnavailable}</option>}
          {apiSources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </LabelledField>
      <p className="cf-body-sm text-cf-ink-muted">{hubWords.sourceNote}</p>
      {value.credentialSource?.status === 'unavailable' && !sourceChanged && <p role="status" className="cf-body-sm text-cf-danger">{hubWords.sourceUnavailable}</p>}
      {value.credentialSource?.status === 'inactive' && !sourceChanged && <p role="status" className="cf-body-sm text-cf-ink-muted">{hubWords.sourceInactive}</p>}
    </>}
    {!source && <Input standalone name={`video-${provider}-key`} label={words.key} secret value={key} disabled={!canEdit || busy} onChange={event => setKey(event.target.value)} />}
    <div className="grid gap-[12px] sm:grid-cols-2">
      <Input standalone name={`video-${provider}-cap`} label={words.maxCost} type="number" step="0.01" min="0.01" value={cap} disabled={!canEdit || busy} onChange={event => setCap(event.target.value)} />
      <Input standalone name={`video-${provider}-budget`} label={words.monthlyBudget} type="number" step="0.01" min="0.01" value={budget} disabled={!canEdit || busy} onChange={event => setBudget(event.target.value)} />
    </div>
    {!valid && <p className="cf-body-sm text-cf-ink-muted">{words.noBudget}</p>}
    {canEdit && <div className="flex flex-wrap gap-[8px]"><Button variant="secondary" disabled={busy || !valid || !validSource} loading={loading} loadingLabel={words.saving} onClick={save}>{hubWords.saveSettings}</Button>{!source && !value.credentialSource && value.hasKey && <Button variant="quiet" disabled={busy} onClick={() => onSave({ videoApiKeys: { [provider]: null } }).catch(() => {})}>{words.removeKey}</Button>}{value.credentialSource && <Button variant="quiet" disabled={busy || !value.maxCostUsd || !value.monthlyBudgetUsd} onClick={() => onSave({videoSpendPolicy: {[provider]: {enabled: false, maxCostUsd: value.maxCostUsd, monthlyBudgetUsd: value.monthlyBudgetUsd, credentialSource: null}}}).catch(() => {})}>{hubWords.removeSource}</Button>}</div>}
  </section>;
}
