'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useUser } from '../layout/user.context';
import { SettingsSection } from '../settings/settings-section';
import { ErrorState, SkeletonRows, Status } from '../ui/surface';
import { useVideoWords } from './video.copy';
import { VideoSubscriptions } from './video-subscriptions';
import { useVideoAccessWords } from './video-access.copy';

type Provider = 'higgsfield' | 'heygen';
export interface VideoPolicyUiV1 { hasKey: boolean; enabled: boolean; maxCostUsd: number | null; monthlyBudgetUsd: number | null; available: boolean }
export interface VideoProviderSettingsUiV1 {
  usageMode: 'included' | 'workspace_key';
  workspace: Record<Provider, VideoPolicyUiV1>;
  included: Record<Provider, VideoPolicyUiV1>;
  effective: Record<Provider, VideoPolicyUiV1>;
}
const API = '/media/video-provider-settings';
export function VideoProviderSettings() {
  const words = useVideoWords();
  const request = useFetch();
  const user = useUser();
  const canEdit = isOrganizationAdmin(user?.role);
  const [pending, setPending] = useState<Provider | null>(null);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const settings = useSWR<VideoProviderSettingsUiV1>(['video-provider-settings-v1', user?.orgId], async () => {
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
  return <><SettingsSection layout="row" title={words.settings} caption={words.budgetNote}>
    {!settings.data ? settings.error ? <ErrorState title={words.failed} action={<Button variant="secondary" onClick={() => settings.mutate()}>{words.refresh}</Button>} /> : <SkeletonRows rows={3} label={words.loading} /> : <>
      <p className="cf-body-sm text-cf-ink-muted">{words.payer}: {settings.data.usageMode === 'included' ? words.included : words.workspaceKey}</p>
      {!canEdit && <p className="cf-body-sm text-cf-ink-muted">{words.noAccess}</p>}
      {(['higgsfield', 'heygen'] as const).map(provider => <ProviderSettingsRow key={`${provider}-${settings.data?.workspace[provider].maxCostUsd}-${settings.data?.workspace[provider].monthlyBudgetUsd}-${settings.data?.workspace[provider].enabled}`} provider={provider} value={settings.data!.workspace[provider]} effective={settings.data!.effective[provider]} canEdit={canEdit} busy={pending !== null} loading={pending === provider} onSave={patch => save(provider, patch)} />)}
      {notice && <p role="status" className="cf-body-sm text-cf-accent">{notice}</p>}
      {failed && <p role="alert" className="cf-body-sm text-cf-danger">{words.failed}</p>}
    </>}
  </SettingsSection><PersonalVideoSettings /></>;
}
function PersonalVideoSettings() {
  const words = useVideoAccessWords();
  return <SettingsSection layout="row" title={words.subscriptions} caption={words.limitsNote}><VideoSubscriptions /></SettingsSection>;
}
function ProviderSettingsRow({ provider, value, effective, canEdit, busy, loading, onSave }: { provider: Provider; value: VideoPolicyUiV1; effective: VideoPolicyUiV1; canEdit: boolean; busy: boolean; loading: boolean; onSave: (patch: object) => Promise<void> }) {
  const words = useVideoWords();
  const [key, setKey] = useState('');
  const [enabled, setEnabled] = useState(value.enabled);
  const [cap, setCap] = useState(value.maxCostUsd?.toString() ?? '');
  const [budget, setBudget] = useState(value.monthlyBudgetUsd?.toString() ?? '');
  const valid = Number(cap) > 0 && Number(budget) >= Number(cap) && Number.isFinite(Number(cap)) && Number.isFinite(Number(budget));
  const save = async () => {
    try { await onSave({ ...(key.trim() ? { videoApiKeys: { [provider]: key.trim() } } : {}), videoSpendPolicy: { [provider]: { enabled, maxCostUsd: Number(cap), monthlyBudgetUsd: Number(budget) } } });
    setKey(''); } catch { /* Keep the entered key available for an explicit retry. */ }
  };
  return <section className="flex min-w-0 flex-col gap-[12px] border-t border-cf-border pt-[16px]" data-video-provider-settings={provider}>
    <div className="flex flex-wrap items-center gap-[8px]"><h4 className="cf-label-md text-cf-ink">{provider === 'higgsfield' ? 'Higgsfield' : 'HeyGen'}</h4>{effective.available && <Status>{words.prepared}</Status>}</div>
    <p className="cf-body-sm text-cf-ink-muted">{effective.available ? `${words.maxCost}: $${effective.maxCostUsd}; ${words.monthlyBudget}: $${effective.monthlyBudgetUsd}` : effective.hasKey ? words.noBudget : words.noKey}</p>
    <h5 className="cf-label-md">{words.workspaceKey}{value.hasKey && <span className="ms-[8px] cf-body-sm text-cf-ink-muted">{words.keySaved}</span>}</h5>
    <CheckboxField label={words.enabled} checked={enabled} disabled={!canEdit || busy} onChange={event => setEnabled(event.target.checked)} />
    <Input standalone name={`video-${provider}-key`} label={words.key} secret value={key} disabled={!canEdit || busy} onChange={event => setKey(event.target.value)} />
    <div className="grid gap-[12px] sm:grid-cols-2">
      <Input standalone name={`video-${provider}-cap`} label={words.maxCost} type="number" step="0.01" min="0.01" value={cap} disabled={!canEdit || busy} onChange={event => setCap(event.target.value)} />
      <Input standalone name={`video-${provider}-budget`} label={words.monthlyBudget} type="number" step="0.01" min="0.01" value={budget} disabled={!canEdit || busy} onChange={event => setBudget(event.target.value)} />
    </div>
    {!valid && <p className="cf-body-sm text-cf-ink-muted">{words.noBudget}</p>}
    {canEdit && <div className="flex flex-wrap gap-[8px]"><Button variant="secondary" disabled={busy || !valid} loading={loading} loadingLabel={words.saving} onClick={save}>{words.save}</Button>{value.hasKey && <Button variant="quiet" disabled={busy} onClick={() => onSave({ videoApiKeys: { [provider]: null } }).catch(() => {})}>{words.removeKey}</Button>}</div>}
  </section>;
}
