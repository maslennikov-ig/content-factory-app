'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { writingSettingsAnswerSchema, writingSettingsWithinLimit, type WritingSettings } from '@contentfactory/helpers/utils/writing-settings';
import { AgentCard } from './agent.cards';
import type { AgentQuestion, AgentQuestionHistory } from './agent.contract';
import type { AgentWords } from './agent.copy';
import { useQuestionDraft } from './agent.question-draft';

type Question = Extract<AgentQuestion, { kind: 'writing-settings' }>;
type Draft = { settings: WritingSettings; min: string; ideal: string; hard: string };
const copy = {
  ru: {
    title: 'Настройки для этого поста', draftsTitle: 'Настройки для материала', before: 'Настройки канала', proposed: 'Предложение для поста', draftsProposed: 'Предложение для материала', reason: 'Почему предлагаю изменить',
    note: 'Изменения действуют только для этого поста. Чтобы изменить настройки канала, попросите об этом отдельно.', draftsNote: 'Только для текущего материала; если получится серия — для всех её частей. Чтобы изменить настройки канала, попросите об этом отдельно.', cap: (max: number) => `Предел площадки: ${max} знаков.`,
    lengthPolicy: 'Длина', emojiLevel: 'Эмодзи', hashtagPolicy: 'Хештеги', linkPolicy: 'Ссылки', ctaKind: 'Призыв к действию',
    min: 'Минимум, знаков', ideal: 'Желаемый максимум, знаков', hard: 'Жёсткий максимум, знаков', optional: 'не задан',
    platformInvalid: (max: number) => `Значения диапазона не должны превышать предел площадки: ${max} знаков.`,
    invalid: 'Проверьте диапазон: от 50 до 100 000 знаков; минимум не больше желаемого максимума, а он не больше жёсткого.',
    apply: 'Применить к посту', applyDrafts: 'Применить к материалу', keptDrafts: 'Оставлены настройки канала', appliedDrafts: 'Применены настройки для материала', keep: 'Оставить настройки канала', applied: 'Применены настройки для поста', kept: 'Оставлены настройки канала',
    options: { channel: 'Как в канале', auto: 'Автоматически', range: 'Задать диапазон', shorter: 'Короче', longer: 'Длиннее', none: 'Нет', few: 'Мало', medium: 'Умеренно', many: 'Много', max: 'Максимум', end_1_3: '1–3 в конце', free: 'Свободно', end: 'В конце', inline: 'В тексте', question: 'Вопрос', comment: 'Комментарий', link: 'Ссылка', subscribe: 'Подписка', reply: 'Ответ' },
  },
  en: {
    title: 'Settings for this post', draftsTitle: 'Settings for this material', before: 'Channel settings', proposed: 'Proposed for this post', draftsProposed: 'Proposed for this material', reason: 'Why this change is suggested',
    note: 'Changes apply only to this post. Ask separately to change channel settings.', draftsNote: 'Only for this material; if it becomes a series, for all its parts. Ask separately to change channel settings.', cap: (max: number) => `Platform limit: ${max} characters.`,
    lengthPolicy: 'Length', emojiLevel: 'Emoji', hashtagPolicy: 'Hashtags', linkPolicy: 'Links', ctaKind: 'Call to action',
    min: 'Minimum characters', ideal: 'Preferred maximum characters', hard: 'Hard maximum characters', optional: 'not set',
    platformInvalid: (max: number) => `Range values must not exceed the platform limit of ${max} characters.`,
    invalid: 'Check the range: 50 to 100,000 characters; minimum must not exceed the preferred maximum, which must not exceed the hard maximum.',
    apply: 'Apply to post', applyDrafts: 'Apply to material', keptDrafts: 'Channel settings kept', appliedDrafts: 'Settings applied to this material', keep: 'Keep channel settings', applied: 'Settings applied to this post', kept: 'Channel settings kept',
    options: { channel: 'Use channel settings', auto: 'Automatic', range: 'Set range', shorter: 'Shorter', longer: 'Longer', none: 'None', few: 'Few', medium: 'Moderate', many: 'Many', max: 'Maximum', end_1_3: '1–3 at the end', free: 'Flexible', end: 'At the end', inline: 'In text', question: 'Question', comment: 'Comment', link: 'Link', subscribe: 'Subscribe', reply: 'Reply' },
  },
} as const;
const fields = {
  lengthPolicy: ['channel', 'auto', 'range', 'shorter', 'longer'],
  emojiLevel: ['none', 'few', 'medium', 'many', 'max', 'auto'],
  hashtagPolicy: ['none', 'end_1_3', 'free', 'auto'],
  linkPolicy: ['none', 'end', 'inline', 'auto'],
  ctaKind: ['auto', 'none', 'question', 'comment', 'link', 'subscribe', 'reply'],
} as const;
const draftOf = (settings: WritingSettings): Draft => ({ settings, min: settings.lengthRange?.idealMin?.toString() ?? '', ideal: settings.lengthRange?.idealMax?.toString() ?? '', hard: settings.lengthRange?.hardMax?.toString() ?? '' });

export function WritingSettingsCard({ question, busy, onAnswer, words, draftStorageKey, failure = false, readOnly = false, history }: {
  question: Question; busy: boolean; onAnswer: (answer: Record<string, unknown>) => void | Promise<void>; words: AgentWords; draftStorageKey?: string; failure?: boolean; readOnly?: boolean; history?: AgentQuestionHistory;
}) {
  const w = copy[words.locale];
  const rangeErrorId = useId();
  const [draft, setDraft] = useQuestionDraft<Draft>(draftStorageKey, draftOf(question.proposed));
  const [sent, setSent] = useState<'apply' | 'keep-channel' | null>(null);
  const [rejected, setRejected] = useState(false);
  const sending = useRef(false);
  useEffect(() => { if (failure) { sending.current = false; setSent(null); } }, [failure]);
  const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value);
  const settings = { ...draft.settings, lengthRange: draft.settings.lengthPolicy === 'auto' ? null : draft.settings.lengthPolicy === 'range' ? { idealMin: numberOrNull(draft.min), idealMax: numberOrNull(draft.ideal), hardMax: numberOrNull(draft.hard) } : draft.settings.lengthRange };
  const valid = writingSettingsAnswerSchema.safeParse({ action: 'apply', settings });
  const exceedsPlatform = question.maxCharacters !== undefined && valid.success && valid.data.action === 'apply' && !writingSettingsWithinLimit(valid.data.settings, question.maxCharacters);
  const invalid = !valid.success || exceedsPlatform;
  const locked = busy || sent !== null || readOnly;
  const send = async (action: 'apply' | 'keep-channel') => {
    const answer = action === 'apply' ? valid : writingSettingsAnswerSchema.safeParse({ action });
    if (!answer.success || (action === 'apply' && invalid) || sending.current || locked) return;
    sending.current = true; setSent(action); setRejected(false);
    try { await onAnswer(answer.data); if (draftStorageKey) try { window.sessionStorage.removeItem(draftStorageKey); } catch { /* Browser drafts are optional. */ } }
    catch { sending.current = false; setSent(null); setRejected(true); }
  };
  const summary = (value: WritingSettings) => <dl className="grid min-w-0 gap-[8px] sm:grid-cols-2">{(Object.keys(fields) as Array<keyof typeof fields>).map((key) => <div key={key} className="min-w-0"><dt className="cf-caption text-cf-ink-muted">{w[key]}</dt><dd className="cf-body-sm text-cf-ink">{w.options[value[key]]}{key === 'lengthPolicy' && (value.lengthPolicy === 'channel' || value.lengthPolicy === 'range') && value.lengthRange ? ` (${value.lengthRange.idealMin ?? w.optional}–${value.lengthRange.idealMax}; ${value.lengthRange.hardMax ?? w.optional})` : ''}</dd></div>)}</dl>;
  return <AgentCard cardKind="writing-settings" glyph="ask" kind={question.scope === 'drafts' ? w.draftsTitle : w.title} label={question.scope === 'drafts' ? w.draftsTitle : w.title} aside={<span className="cf-caption text-cf-ink-muted">{question.channel.name}</span>} footer={!readOnly ? <><Button type="button" density="dense" disabled={locked || invalid} loading={sent === 'apply'} loadingLabel={words.question.sending} onClick={() => send('apply')}>{question.scope === 'drafts' ? w.applyDrafts : w.apply}</Button><Button type="button" density="dense" variant="secondary" disabled={locked} loading={sent === 'keep-channel'} loadingLabel={words.question.sending} onClick={() => send('keep-channel')}>{w.keep}</Button></> : undefined}>
    <div className="flex min-w-0 flex-col gap-[16px]">
      {question.text ? <p className="cf-body-sm text-cf-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{question.text}</p> : null}
      <p className="cf-body-sm text-cf-ink-muted">{question.scope === 'drafts' ? w.draftsNote : w.note}</p>
      {question.maxCharacters !== undefined ? <p className="cf-body-sm text-cf-ink-muted">{w.cap(question.maxCharacters)}</p> : null}
      <div><p className="cf-label-md text-cf-ink">{w.reason}</p><p className="cf-body-sm text-cf-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{question.reason}</p></div>
      <div><p className="mb-[8px] cf-label-md text-cf-ink">{w.before}</p>{summary(question.current)}</div>
      {readOnly ? <div><p className="mb-[8px] cf-label-md text-cf-ink">{question.scope === 'drafts' ? w.draftsProposed : w.proposed}</p>{summary(question.proposed)}{history?.writingAnswer ? <div className="mt-[12px]"><p className="cf-label-md text-cf-ink">{history.writingAnswer.action === 'apply' ? (question.scope === 'drafts' ? w.appliedDrafts : w.applied) : (question.scope === 'drafts' ? w.keptDrafts : w.kept)}</p>{history.writingAnswer.action === 'apply' ? summary(history.writingAnswer.settings) : null}</div> : null}</div> : <div className="flex min-w-0 flex-col gap-[12px]"><p className="cf-label-md text-cf-ink">{question.scope === 'drafts' ? w.draftsProposed : w.proposed}</p><div className="grid min-w-0 gap-[12px] sm:grid-cols-2">{(Object.keys(fields) as Array<keyof typeof fields>).map(key => <Select key={key} name={`writing-${key}`} label={w[key]} disableForm hideErrors fieldClassName="min-w-0" value={draft.settings[key]} disabled={locked} onChange={event => setDraft(old => ({ ...old, settings: { ...old.settings, [key]: event.target.value } }))}>{fields[key].map(value => <option key={value} value={value}>{w.options[value]}</option>)}</Select>)}</div>
        {draft.settings.lengthPolicy === 'range' ? <div className="grid min-w-0 gap-[12px] sm:grid-cols-3">{(['min', 'ideal', 'hard'] as const).map(key => <Input key={key} name={`writing-range-${key}`} label={w[key]} disableForm removeError fieldClassName="min-w-0" type="number" min={50} max={question.maxCharacters ?? 100000} step={1} value={draft[key]} disabled={locked} aria-invalid={invalid || undefined} aria-describedby={invalid ? rangeErrorId : undefined} onChange={event => setDraft(old => ({ ...old, [key]: event.target.value }))} />)}</div> : null}
        {invalid ? <p id={rangeErrorId} role="status" className="cf-body-sm text-cf-warning">{exceedsPlatform && question.maxCharacters !== undefined ? w.platformInvalid(question.maxCharacters) : w.invalid}</p> : null}
      </div>}
      {failure || rejected ? <p role="status" className="cf-body-sm text-cf-warning">{words.question.answerFailed}</p> : null}
    </div>
  </AgentCard>;
}
