'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { RadioGroup, RadioOption } from '@contentfactory/react/choice/radio.group';
import { writingSettingsAnswerSchema, writingSettingsWithinLimit, type WritingSettings, type WritingLengthOption } from '@contentfactory/helpers/utils/writing-settings';
import { Disclosure } from '../ui/disclosure';
import { AgentCard } from './agent.cards';
import type { AgentQuestion, AgentQuestionHistory } from './agent.contract';
import type { AgentWords } from './agent.copy';
import { useQuestionDraft } from './agent.question-draft';

type Question = Extract<AgentQuestion, { kind: 'writing-settings' }>;
type Draft = { settings: WritingSettings; min: string; ideal: string; hard: string; selectedOptionId?: string | null };
const copy = {
  ru: {
    chooseTitle: 'Выберите объём', chooseReason: 'Почему такой объём', recommended: 'Рекомендую', editRange: 'Можно изменить числа выбранного варианта', customRange: 'Ваш диапазон', otherSettings: 'Другие настройки текста', applyLength: 'Применить объём', characters: 'знаков', hardLimit: 'жёсткий максимум',
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
    chooseTitle: 'Choose the length', chooseReason: 'Why this length', recommended: 'Recommended', editRange: 'You can edit the selected range', customRange: 'Your range', otherSettings: 'Other writing settings', applyLength: 'Apply length', characters: 'characters', hardLimit: 'hard maximum',
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
const optionDraft = (settings: WritingSettings, option: WritingLengthOption): Draft => ({ ...draftOf({ ...settings, lengthPolicy: 'range', lengthRange: option.lengthRange }), selectedOptionId: option.id });

export function WritingSettingsCard({ question, busy, onAnswer, words, draftStorageKey, failure = false, readOnly = false, history }: {
  question: Question; busy: boolean; onAnswer: (answer: Record<string, unknown>) => void | Promise<void>; words: AgentWords; draftStorageKey?: string; failure?: boolean; readOnly?: boolean; history?: AgentQuestionHistory;
}) {
  const w = copy[words.locale];
  const rangeErrorId = useId();
  const lengthOptions = question.lengthOptions;
  const recommended = lengthOptions?.find(option => option.recommended);
  const [draft, setDraft] = useQuestionDraft<Draft>(draftStorageKey, recommended ? optionDraft(question.proposed, recommended) : draftOf(question.proposed));
  const [sent, setSent] = useState<'apply' | 'keep-channel' | null>(null);
  const [rejected, setRejected] = useState(false);
  const sending = useRef(false);
  useEffect(() => { if (failure) { sending.current = false; setSent(null); } }, [failure]);
  const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value);
  const lengthPolicy = lengthOptions ? 'range' : draft.settings.lengthPolicy;
  const settings = { ...draft.settings, lengthPolicy, lengthRange: lengthPolicy === 'auto' ? null : lengthPolicy === 'range' ? { idealMin: numberOrNull(draft.min), idealMax: numberOrNull(draft.ideal), hardMax: numberOrNull(draft.hard) } : draft.settings.lengthRange };
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
  const keepChannel = <Button type="button" density="dense" variant="secondary" disabled={locked} loading={sent === 'keep-channel'} loadingLabel={words.question.sending} onClick={() => send('keep-channel')}>{w.keep}</Button>;
  const cardTitle = lengthOptions && !readOnly ? w.chooseTitle : question.scope === 'drafts' ? w.draftsTitle : w.title;
  const accepted = history?.writingAnswer;
  return <AgentCard cardKind="writing-settings" glyph="ask" kind={cardTitle} label={cardTitle} aside={<span className="cf-caption text-cf-ink-muted">{question.channel.name}</span>} footer={!readOnly ? <><Button type="button" density="dense" disabled={locked || invalid} loading={sent === 'apply'} loadingLabel={words.question.sending} onClick={() => send('apply')}>{lengthOptions ? w.applyLength : question.scope === 'drafts' ? w.applyDrafts : w.apply}</Button>{!lengthOptions ? keepChannel : null}</> : undefined}>
    <div className="flex min-w-0 flex-col gap-[16px]">
      {question.text ? <p className="cf-body-sm text-cf-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{question.text}</p> : null}
      <p className="cf-body-sm text-cf-ink-muted">{question.scope === 'drafts' ? w.draftsNote : w.note}</p>
      {question.maxCharacters !== undefined ? <p className="cf-body-sm text-cf-ink-muted">{w.cap(question.maxCharacters)}</p> : null}
      <div><p className="cf-label-md text-cf-ink">{lengthOptions ? w.chooseReason : w.reason}</p><p className="cf-body-sm text-cf-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{question.reason}</p></div>
      {!lengthOptions ? <div><p className="mb-[8px] cf-label-md text-cf-ink">{w.before}</p>{summary(question.current)}</div> : null}
      {readOnly ? <div><p className="mb-[8px] cf-label-md text-cf-ink">{accepted ? accepted.action === 'apply' ? (question.scope === 'drafts' ? w.appliedDrafts : w.applied) : (question.scope === 'drafts' ? w.keptDrafts : w.kept) : question.scope === 'drafts' ? w.draftsProposed : w.proposed}</p>{summary(accepted ? accepted.action === 'apply' ? accepted.settings : question.current : question.proposed)}</div> : <div className="flex min-w-0 flex-col gap-[12px]">
        {lengthOptions ? <>
          <RadioGroup aria-label={w.chooseTitle} orientation="vertical" value={draft.selectedOptionId ?? null} onChange={id => {
            if (locked) return;
            const option = lengthOptions.find(value => value.id === id);
            if (option) setDraft(old => optionDraft(old.settings, option));
          }} className="flex min-w-0 flex-col gap-[8px]">
            {lengthOptions.map(option => <RadioOption key={option.id} value={option.id} layout="content" disabled={locked} className={`w-full min-w-0 justify-start rounded-[8px] border px-[12px] py-[8px] text-start cf-body-sm [overflow-wrap:anywhere] ${draft.selectedOptionId === option.id ? 'border-cf-accent bg-cf-accent-soft text-cf-ink' : 'border-cf-border-control text-cf-ink hover:bg-cf-surface-subtle'}`}>
              <span className="flex min-w-0 flex-col gap-[4px]">
                <span className="cf-label-md whitespace-pre-wrap [overflow-wrap:anywhere]">{option.label}</span>
                {option.recommended && !/рекоменд|recommend/iu.test(option.label) ? <span className="cf-caption text-cf-ink-muted">{w.recommended}</span> : null}
                <span className="cf-body-sm text-cf-ink">{option.lengthRange.idealMin !== null ? `${option.lengthRange.idealMin}–` : '≤ '}{option.lengthRange.idealMax} {w.characters}{option.lengthRange.hardMax !== null ? `; ${w.hardLimit}: ${option.lengthRange.hardMax}` : ''}</span>
                <span className="cf-body-sm text-cf-ink-muted whitespace-pre-wrap [overflow-wrap:anywhere]">{option.description}</span>
              </span>
            </RadioOption>)}
          </RadioGroup>
          <p className="cf-body-sm text-cf-ink-muted">{draft.selectedOptionId ? w.editRange : w.customRange}</p>
        </> : <p className="cf-label-md text-cf-ink">{question.scope === 'drafts' ? w.draftsProposed : w.proposed}</p>}
        {!lengthOptions ? <div className="grid min-w-0 gap-[12px] sm:grid-cols-2">{(Object.keys(fields) as Array<keyof typeof fields>).map(key => <Select key={key} name={`writing-${key}`} label={w[key]} disableForm hideErrors fieldClassName="min-w-0" value={draft.settings[key]} disabled={locked} onChange={event => setDraft(old => ({ ...old, settings: { ...old.settings, [key]: event.target.value } }))}>{fields[key].map(value => <option key={value} value={value}>{w.options[value]}</option>)}</Select>)}</div> : null}
        {lengthPolicy === 'range' ? <div className="grid min-w-0 gap-[12px] sm:grid-cols-3">{(['min', 'ideal', 'hard'] as const).map(key => <Input key={key} name={`writing-range-${key}`} label={w[key]} disableForm removeError fieldClassName="min-w-0" type="number" inputMode="numeric" min={50} max={question.maxCharacters ?? 100000} step={1} value={draft[key]} disabled={locked} aria-invalid={invalid || undefined} aria-describedby={invalid ? rangeErrorId : undefined} onChange={event => setDraft(old => ({ ...old, [key]: event.target.value, ...(lengthOptions ? { selectedOptionId: null } : {}) }))} />)}</div> : null}
        {invalid ? <p id={rangeErrorId} role="status" className="cf-body-sm text-cf-warning">{exceedsPlatform && question.maxCharacters !== undefined ? w.platformInvalid(question.maxCharacters) : w.invalid}</p> : null}
        {lengthOptions ? <Disclosure summary={w.otherSettings} contentClassName="pt-[8px]"><div className="grid min-w-0 gap-[12px] sm:grid-cols-2">{(Object.keys(fields) as Array<keyof typeof fields>).filter(key => key !== 'lengthPolicy').map(key => <Select key={key} name={`writing-${key}`} label={w[key]} disableForm hideErrors fieldClassName="min-w-0" value={draft.settings[key]} disabled={locked} onChange={event => setDraft(old => ({ ...old, settings: { ...old.settings, [key]: event.target.value } }))}>{fields[key].map(value => <option key={value} value={value}>{w.options[value]}</option>)}</Select>)}</div></Disclosure> : null}
      </div>}
      {lengthOptions ? <Disclosure summary={w.before} contentClassName="flex min-w-0 flex-col gap-[12px] pt-[8px]">{summary(question.current)}{!readOnly ? keepChannel : null}</Disclosure> : null}
      {failure || rejected ? <p role="status" className="cf-body-sm text-cf-warning">{words.question.answerFailed}</p> : null}
    </div>
  </AgentCard>;
}
