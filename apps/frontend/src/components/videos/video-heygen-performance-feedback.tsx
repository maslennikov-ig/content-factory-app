'use client';

import { useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import type { HeygenPerformanceFeedbackViewV1 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-heygen-performance-record.v1';
import { LabelledField } from '../ui/field-label';
import { SectionLabel } from '../ui/section-label';
import { SkeletonRows } from '../ui/surface';
import type { VideoDraftUiV1 } from './video-ui.v1';

const copy = {
  ru: {
    title: 'Замечания к подаче', draft: 'Черновик', render: 'Готовый ролик', version: 'версия',
    observation: 'Что вы заметили?', placeholder: 'Например, ведущий несколько раз повторяет один жест.',
    start: 'С какой секунды', end: 'По какую секунду', timeHelp: 'Можно указать интервал в секундах.',
    noTiming: 'Длительность файла не подтверждена. Можно оставить замечание ко всему ролику.',
    badTime: 'Укажите начало и конец внутри ролика. Конец должен быть позже начала.',
    save: 'Сохранить замечание', saving: 'Сохраняем замечание…', saved: 'Замечание сохранено.',
    empty: 'Замечаний пока нет.', loading: 'Загружаем замечания…', loadFailed: 'Не удалось загрузить замечания.', failed: 'Не удалось сохранить изменение. Попробуйте ещё раз.',
    stale: 'Версия черновика изменилась. Откройте её заново, чтобы продолжить.', reload: 'Обновить',
    chooseNote: 'Замечание для правки', chooseCorrection: 'Что изменить в подаче?', choose: 'Выберите правку', propose: 'Показать правку', proposing: 'Готовим правку…',
    gaze: 'Направить взгляд в камеру', face: 'Сделать мимику сдержаннее', gestures: 'Убрать намеренные жесты',
    locked: 'Это поле закреплено вручную. Его можно изменить в настройках подачи.',
    proposal: 'Предложение для новой версии черновика. Возможности HeyGen проверятся при сохранении. Рендер запускается отдельным действием.',
    apply: 'Сохранить новую версию', applying: 'Сохраняем новую версию…',
  },
  en: {
    title: 'Delivery feedback', draft: 'Draft', render: 'Completed video', version: 'version',
    observation: 'What did you notice?', placeholder: 'For example, the presenter repeats the same hand gesture several times.',
    start: 'Start time in seconds', end: 'End time in seconds', timeHelp: 'Add a time range in seconds if helpful.',
    noTiming: 'The file duration could not be verified. You can leave a note on the whole video.',
    badTime: 'Enter a start and end within the video. The end must come after the start.',
    save: 'Save observation', saving: 'Saving observation…', saved: 'Observation saved.',
    empty: 'No observations yet.', loading: 'Loading observations…', loadFailed: 'Could not load observations.', failed: 'Could not save the change. Try again.',
    stale: 'The draft version changed. Reopen it to continue.', reload: 'Refresh',
    chooseNote: 'Observation for this correction', chooseCorrection: 'What should change in the delivery?', choose: 'Choose a correction', propose: 'Preview correction', proposing: 'Preparing correction…',
    gaze: 'Direct gaze toward the camera', face: 'Soften the facial expression', gestures: 'Remove intentional gestures',
    locked: 'This field is locked manually. You can change it in the delivery settings.',
    proposal: 'Proposed change for a new draft version. HeyGen support is checked when you save. Rendering is a separate step.',
    apply: 'Save new draft version', applying: 'Saving new draft version…',
  },
} as const;

const corrections = {gaze: {gaze: 'camera'}, face: {facialIntensity: 'low'}, gestures: {gestures: 'none'}} as const;
type Correction = keyof typeof corrections;
type Proposal = {draftId: string; draftVersion: number; expectedRevision: number; feedbackId: string;
  changes: Partial<{gaze: 'camera'; facialIntensity: 'low'; gestures: 'none'}>; lockedFields: string[]};

type Props = {
  actorKey: string;
  draftId: string;
  draftVersion: number;
  jobId?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: (next: VideoDraftUiV1, expected: {id: string; version: number}) => Promise<void>;
};

const secondsToMilliseconds = (value: string) => /^\d{1,8}(?:[.,]\d{1,3})?$/.test(value.trim())
  ? Math.round(Number(value.trim().replace(',', '.')) * 1000) : NaN;
const timeLabel = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;

export function VideoHeygenPerformanceFeedback(props: Props) {
  const {actorKey, draftId, draftVersion, jobId} = props;
  return <FeedbackPanel key={JSON.stringify([actorKey, draftId, draftVersion, jobId])} {...props} />;
}

function FeedbackPanel({actorKey, draftId, draftVersion, jobId, disabled, onBusyChange, onSaved}: Props) {
  const request = useFetch();
  const lang = useInterfaceLanguage();
  const w = copy[lang.startsWith('ru') ? 'ru' : 'en'];
  const id = useId();
  const basePath = '/media/video-v2';
  const [text, setText] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState<'failed' | 'stale' | 'time' | ''>('');
  const [feedbackId, setFeedbackId] = useState('');
  const [correction, setCorrection] = useState<Correction | ''>('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<'save' | 'propose' | 'apply' | ''>('');
  const operation = useRef<typeof busy>('');
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (operation.current === 'apply') busyCallback.current?.(false);
      operation.current = '';
    };
  }, []);
  const read = useSWR<HeygenPerformanceFeedbackViewV1>(['heygen-feedback-v1', actorKey, draftId, draftVersion, jobId], async () => {
    const response = await request(`${basePath}/drafts/${encodeURIComponent(draftId)}/performance-feedback${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''}`);
    if (!response.ok) throw Error(response.status === 409 ? 'stale' : 'failed');
    const value: HeygenPerformanceFeedbackViewV1 = await response.json();
    if (value.draftId !== draftId || value.draftVersion !== draftVersion) throw Error('stale');
    if (jobId ? value.target.kind !== 'render' || value.target.jobId !== jobId : value.target.kind !== 'draft') throw Error('failed');
    return value;
  }, {revalidateOnFocus: true, shouldRetryOnError: false});
  const snapshot = read.data;
  const selectedFeedbackId = snapshot?.observations.find(note => note.id === feedbackId)?.id ?? snapshot?.observations[0]?.id;
  const durationMs = snapshot?.target.kind === 'render' ? snapshot.target.durationMs : null;
  const frozen = disabled || !!busy || !!read.error || error === 'stale';
  const reload = () => { setError(''); void read.mutate().catch(() => undefined); };

  async function run(kind: 'save' | 'propose' | 'apply') {
    if (!snapshot || frozen || operation.current) return;
    let range: {startMs: number; endMs: number} | undefined;
    if (kind === 'save' && jobId && (start || end)) {
      const startMs = secondsToMilliseconds(start), endMs = secondsToMilliseconds(end);
      if (!durationMs || !Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs >= endMs || endMs > durationMs) {
        setError('time');
        return;
      }
      range = {startMs, endMs};
    }
    const input = {draftId, version: draftVersion, expectedRevision: snapshot.revision};
    const selection = correction ? corrections[correction] : null;
    if (kind === 'propose' && (!selection || !selectedFeedbackId) || kind === 'apply' && (!proposal || !onSaved ||
      proposal.expectedRevision !== snapshot.revision || proposal.feedbackId !== selectedFeedbackId)) return;
    operation.current = kind;
    setBusy(kind);
    setError('');
    setNotice(false);
    if (kind === 'apply') busyCallback.current?.(true);
    try {
      const path = kind === 'save' ? 'performance-feedback' : kind === 'propose' ? 'performance-feedback/correction' : 'performance';
      const details = kind === 'save' ? {text, ...(jobId ? {render: {jobId, ...range}} : {})}
        : {feedbackId: selectedFeedbackId, changes: kind === 'propose' ? selection : proposal?.changes};
      const response = await request(`${basePath}/${path}`, {method: 'POST', body: JSON.stringify({...input, ...details})});
      const result = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (!response.ok) {
        const code = result?.code;
        throw Error(code === 'VIDEO_PERFORMANCE_TIME_RANGE_INVALID' ? 'time' : /CHANGED|STALE|CONFLICT/.test(code ?? '') ? 'stale' : 'failed');
      }
      if (result?.draftId !== draftId) throw Error('failed');
      if (kind === 'save') {
        if (result.feedbackSaved !== true || typeof result.feedbackId !== 'string' || result.draftVersion !== draftVersion) throw Error('failed');
        setText('');
        setStart('');
        setEnd('');
        setFeedbackId(result.feedbackId);
        setProposal(null);
        setNotice(true);
        await read.mutate().catch(() => undefined);
      } else if (kind === 'propose') {
        if (result.feedbackId !== selectedFeedbackId || result.draftVersion !== draftVersion || result.expectedRevision !== snapshot.revision ||
          !result.changes || !Array.isArray(result.lockedFields) || result.generated !== false || result.submitted !== false) throw Error('failed');
        setProposal(result);
      } else {
        const next: VideoDraftUiV1 | undefined = result.draft;
        if (!next || next.id !== draftId || next.version !== draftVersion + 1 || result.draftVersion !== next.version || !next.settings.heygenV2 ||
          result.generated !== false || result.submitted !== false) throw Error('stale');
        await onSaved!(next, {id: draftId, version: draftVersion});
      }
    } catch (cause) {
      if (!mounted.current) return;
      const message = cause instanceof Error ? cause.message : '';
      setError(message === 'stale' || /DRAFT_CHANGED|CONFLICT/.test(message) ? 'stale' : message === 'time' ? 'time' : 'failed');
    } finally {
      if (mounted.current) {
        operation.current = '';
        setBusy('');
        if (kind === 'apply') busyCallback.current?.(false);
      }
    }
  }

  return <section aria-label={w.title} className="flex flex-col gap-[12px] border-t border-cf-border pt-[16px]">
    <SectionLabel>{w.title}</SectionLabel>
    {!snapshot && !read.error && <SkeletonRows rows={2} label={w.loading} />}
    {read.error && <p role="alert" className="cf-body-sm text-cf-danger">{read.error.message === 'stale' ? w.stale : w.loadFailed} <Button type="button" variant="quiet" disabled={!!busy} onClick={reload}>{w.reload}</Button></p>}
    {snapshot && <>
      <p className="cf-caption text-cf-ink-muted">{snapshot.target.kind === 'render' ? w.render : w.draft} · {w.version} {snapshot.target.draftVersion}</p>
      <LabelledField id={`${id}-text`} label={w.observation}>
        <Textarea id={`${id}-text`} standalone layout="content" value={text} maxLength={1500} placeholder={w.placeholder} disabled={frozen} onChange={event => setText(event.target.value)} />
      </LabelledField>
      {jobId && (durationMs ? <div className="grid gap-[8px] sm:grid-cols-2">
        <p id={`${id}-time`} role={error === 'time' ? 'alert' : undefined} className={`cf-body-sm sm:col-span-2 ${error === 'time' ? 'text-cf-danger' : 'text-cf-ink-muted'}`}>{error === 'time' ? w.badTime : w.timeHelp}</p>
        <LabelledField id={`${id}-start`} label={w.start}>
          <Input id={`${id}-start`} standalone inputMode="decimal" aria-describedby={`${id}-time`} aria-invalid={error === 'time' || undefined}
            value={start} disabled={frozen} onChange={event => {setStart(event.target.value); if (error === 'time') setError('');}} />
        </LabelledField>
        <LabelledField id={`${id}-end`} label={w.end}>
          <Input id={`${id}-end`} standalone inputMode="decimal" aria-describedby={`${id}-time`} aria-invalid={error === 'time' || undefined}
            value={end} disabled={frozen} onChange={event => {setEnd(event.target.value); if (error === 'time') setError('');}} />
        </LabelledField>
      </div> : <p className="cf-body-sm text-cf-ink-muted">{w.noTiming}</p>)}
      <div className="flex flex-wrap items-center gap-[8px]">
        <Button type="button" variant="secondary" disabled={frozen || !text.trim()} loading={busy === 'save'} loadingLabel={w.saving} onClick={() => run('save')}>{w.save}</Button>
        {notice && <p role="status" className="cf-body-sm">{w.saved}</p>}
      </div>
      {snapshot.observations.length ? <ul className="flex flex-col gap-[12px]">
        {snapshot.observations.map(note => <li key={note.id} className="flex min-w-0 flex-col gap-[4px] border-t border-cf-border pt-[8px]">
          <p className="cf-caption text-cf-ink-muted">{note.render ? w.render : w.draft} · {w.version} {note.draftVersion}
            {note.render?.startMs !== undefined && note.render.endMs !== undefined ? ` · ${timeLabel(note.render.startMs)}–${timeLabel(note.render.endMs)}` : ''}</p>
          {note.fragment && <blockquote className="cf-body-sm break-words text-cf-ink-muted">{note.fragment.exactText}</blockquote>}
          <p className="cf-body-sm whitespace-pre-wrap break-words text-cf-ink">{note.text}</p>
        </li>)}
      </ul> : <p className="cf-body-sm text-cf-ink-muted">{w.empty}</p>}
      {!!snapshot.observations.length && <div className="flex flex-col gap-[8px] border-t border-cf-border pt-[12px]">
        <LabelledField id={`${id}-note`} label={w.chooseNote}>
          <Select id={`${id}-note`} standalone className="w-full" value={selectedFeedbackId} disabled={frozen}
            onChange={event => {setFeedbackId(event.target.value); setProposal(null);}}>
            {snapshot.observations.map(note => <option key={note.id} value={note.id}>{note.text.slice(0, 100)}</option>)}
          </Select>
        </LabelledField>
        <LabelledField id={`${id}-correction`} label={w.chooseCorrection}>
          <Select id={`${id}-correction`} standalone className="w-full" value={correction} disabled={frozen}
            onChange={event => {setCorrection(event.target.value as Correction); setProposal(null);}}>
            <option value="">{w.choose}</option>
            {(Object.keys(corrections) as Correction[]).map(key => <option key={key} value={key}>{w[key]}</option>)}
          </Select>
        </LabelledField>
        <div className="flex flex-wrap gap-[8px]">
          <Button type="button" variant="quiet" disabled={frozen || !correction} loading={busy === 'propose'} loadingLabel={w.proposing}
            onClick={() => run('propose')}>{w.propose}</Button>
          {onSaved && proposal && Object.keys(proposal.changes).length > 0 && <Button type="button" variant="secondary"
            disabled={frozen || proposal.expectedRevision !== snapshot.revision || proposal.feedbackId !== selectedFeedbackId}
            loading={busy === 'apply'} loadingLabel={w.applying} onClick={() => run('apply')}>{w.apply}</Button>}
        </div>
        {proposal && <p role="status" className="cf-body-sm text-cf-ink-muted">{proposal.lockedFields.length ? w.locked : w.proposal}</p>}
      </div>}
      {error === 'failed' && <p role="alert" className="cf-body-sm text-cf-danger">{w.failed}</p>}
      {error === 'stale' && <p role="alert" className="cf-body-sm text-cf-danger">{w.stale} <Button type="button" variant="quiet" onClick={reload}>{w.reload}</Button></p>}
    </>}
  </section>;
}
