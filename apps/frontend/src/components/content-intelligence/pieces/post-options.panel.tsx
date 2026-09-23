'use client';

import { useId, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Panel } from '@contentfactory/react/layout';
import { intakeCopy } from '../intake/intake.copy';
import {
  CTA_KINDS,
  HASHTAG_POLICIES,
  LENGTH_PRESET_ORDER,
  LINK_POLICIES,
  emojiStopOf,
  type EmojiLevel,
  type LengthPreset,
} from '../intake/writing-profile.adapter';
import { EmojiCeilingSlider } from '../intake/emoji-ceiling.slider';
import { FieldLabel } from '../../ui/field-label';
import { writingProfileLabels } from '../intake/writing-profile.fields';
import {
  DEFAULT_POST_BASELINE,
  DEFAULT_POST_OPTIONS,
  POST_WISH_MAX,
  changedPostFields,
  channelValueOf,
  postChangeCount,
  type PostOptionsBaselineV1,
  type PostOptionsV1,
  type PostProfileField,
} from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import { SectionLabel } from '../../ui/section-label';

export type PostAvatarOption = { id: string; label: string };

/** Пресеты длины по возрастанию: «короче» и «длиннее» считаются по ним. */
const LENGTH_STEPS: readonly LengthPreset[] = ['short', 'ideal', 'long', 'max'];

/**
 * «Для этого поста» (`97dq.37`, §3.4; вариант A двенадцатой волны,
 * `97dq.48`): разовые настройки одной адаптации.
 *
 * Ни канал, ни аватар отсюда не меняются — ради этого панель и существует:
 * владелец на десятом заходе просил «иногда пост побольше, иногда поменьше»,
 * не трогая скрытых настроек канала. На одиннадцатом он попросил больше
 * опций, компактности и убрать «Изменить»: панель всегда раскрыта, и в ней
 * те же поля, что в карточке «Как пишем в «X»», с теми же значениями —
 * Длина, Эмодзи, Хэштеги, Ссылки, Призыв. Каждое по умолчанию показывает
 * значение канала приглушённым, с подписью «как в канале» под названием; изменённое отмечено рамкой
 * `signature`, над полями — сколько изменено. Обращения («на ты / на вы»)
 * здесь нет с `97dq.45`: кто его хочет, пишет его в «Пожелании».
 *
 * «Переписать с этим» — главная, пока есть что переписывать: без изменений
 * она выключена. «Сбросить» возвращает всё к каналу. «Кто говорит» не
 * показан, когда аватар в пространстве один: выбирать не из чего (правило
 * владельца «решать за человека»). «Запомнить для канала» — тихая ссылка, а
 * не вторая главная кнопка: разовое остаётся разовым, пока человек сам не
 * решит иначе.
 */
export function PostOptionsPanel({
  locale,
  options,
  baseline = DEFAULT_POST_BASELINE,
  avatars,
  disabled = false,
  onChange,
  onRewrite,
  onRemember,
  rememberState = 'idle',
}: {
  locale: PiecesLocale;
  options: PostOptionsV1;
  /** Как решено для канала: от этого считается «изменено». */
  baseline?: PostOptionsBaselineV1;
  avatars: readonly PostAvatarOption[];
  disabled?: boolean;
  onChange: (next: PostOptionsV1) => void;
  /** «Переписать с этим» — новая версия. Нет адаптации — кнопки нет. */
  onRewrite?: () => void;
  onRemember?: () => void;
  rememberState?: 'idle' | 'saving' | 'saved' | 'failed';
}) {
  const t = piecesCopy[locale];
  const ti = intakeCopy[locale];
  const labels = writingProfileLabels(locale);
  const baseId = useId();
  const changed = new Set(changedPostFields(options, baseline));
  const count = postChangeCount(options, baseline);
  const choosesAvatar = avatars.length > 1;
  const speakerChanged = Boolean(
    options.brandProfileId && options.brandProfileId !== baseline.brandProfileId
  );
  // Пожелание — слово к одному посту: в карточку канала его не запоминают.
  const rememberable = changed.size > 0 || speakerChanged;

  const channelLength = channelValueOf('length', baseline.profile);
  const lengthWord = (preset: LengthPreset) => {
    const at = LENGTH_STEPS.indexOf(preset);
    const from = channelLength ? LENGTH_STEPS.indexOf(channelLength) : -1;
    if (at < 0 || from < 0 || at === from) return labels.length[preset];
    return `${at < from ? t.lengthShorter : t.lengthLonger} · ${
      labels.length[preset]
    }`;
  };

  const fields: {
    field: Exclude<PostProfileField, 'emoji'>;
    label: string;
    help: string;
    values: readonly string[];
    word: (value: string) => string;
  }[] = [
    {
      field: 'length',
      label: ti.profileLength,
      help: ti.profileHintLength,
      values: LENGTH_PRESET_ORDER,
      word: (value) => lengthWord(value as LengthPreset),
    },
    {
      field: 'hashtags',
      label: ti.profileHashtag,
      help: ti.profileHintHashtag,
      values: HASHTAG_POLICIES,
      word: (value) => labels.hashtag[value as keyof typeof labels.hashtag],
    },
    {
      field: 'links',
      label: ti.profileLink,
      help: ti.profileHintLink,
      values: LINK_POLICIES,
      word: (value) => labels.link[value as keyof typeof labels.link],
    },
    {
      field: 'cta',
      label: ti.profileCta,
      help: ti.profileHintCta,
      values: CTA_KINDS,
      word: (value) => labels.cta[value as keyof typeof labels.cta],
    },
  ];

  /*
    Выбрать значение канала — это не изменение, а «как в канале»: иначе
    рамка «изменено» стояла бы на поле, которое ничего не меняет.
  */
  const choose = (field: PostProfileField, value: string) => {
    const same = value === channelValueOf(field, baseline.profile);
    onChange({ ...options, [field]: same ? 'channel' : value });
  };

  /*
    Эмодзи — бегунок «до N» (`97dq.61`). Деление, на котором стоит канал, —
    это «как в канале», даже если канал хранит старое слово («мало» стоит на
    «до 3»): иначе рамка «изменено» появлялась бы от того, что ручку
    сдвинули и вернули.
  */
  const channelEmoji = channelValueOf('emoji', baseline.profile);
  const emojiInChannel = options.emoji === 'channel';
  const emojiValue: EmojiLevel =
    options.emoji === 'channel' ? channelEmoji ?? 'few' : options.emoji;
  const emojiChanged = changed.has('emoji');
  const chooseEmoji = (stop: EmojiLevel) =>
    onChange({
      ...options,
      emoji:
        channelEmoji && emojiStopOf(channelEmoji) === emojiStopOf(stop)
          ? 'channel'
          : stop,
    });

  return (
    <Panel
      className="min-w-0"
      contentClassName="flex min-w-0 flex-col gap-[12px]"
    >
      <div
        data-post-options="panel"
        className="flex min-w-0 flex-wrap items-baseline gap-x-[8px] gap-y-[4px]"
      >
        <SectionLabel as="h3">{t.postOptionsTitle}</SectionLabel>
        {count ? (
          <span
            data-post-options-count={count}
            className="ms-auto cf-caption tabular-nums text-cf-ink-muted"
          >
            {t.postOptionsChanges(count)}
          </span>
        ) : null}
      </div>

      <div className="grid min-w-0 grid-cols-[112px_minmax(0,1fr)] items-center gap-x-[12px] gap-y-[8px]">
        {choosesAvatar ? (
          <>
            <FieldLabel
              htmlFor={`${baseId}-speaker`}
              label={t.whoSpeaks}
              hint={t.hintWhoSpeaks}
              hintLabel={ti.profileHintFor(t.whoSpeaks)}
              labelClassName="cf-caption text-cf-ink-muted"
            />
            <Select
              standalone
              disableForm
              density="dense"
              id={`${baseId}-speaker`}
              value={options.brandProfileId ?? ''}
              disabled={disabled}
              data-post-option="speaker"
              data-post-option-changed={speakerChanged ? 'true' : 'false'}
              className={clsx(
                'w-full min-w-0',
                speakerChanged && 'border-cf-signature'
              )}
              onChange={(event) =>
                onChange({
                  ...options,
                  brandProfileId: event.target.value || null,
                })
              }
            >
              <option value="">{t.speakerChannel}</option>
              {avatars.map((avatar) => (
                <option key={avatar.id} value={avatar.id}>
                  {avatar.label}
                </option>
              ))}
            </Select>
          </>
        ) : null}
        {fields.map(({ field, label, help, values, word }) => {
          const channelValue = channelValueOf(field, baseline.profile);
          const isChanged = changed.has(field);
          const inChannel = options[field] === 'channel';
          /*
            «Как в канале» — подпись под названием поля, а не часть
            значения: «как в канале · без хэштегов» в 218-пиксельном
            выборе обрезалось до «…без хэштег» (двенадцатый заход,
            01-channel-top-d). Выбор показывает само значение канала, а
            отдельный пункт «как в канале» остаётся, только когда значения
            у канала нет.
          */
          const row = (
            <PostOptionRow
              key={field}
              id={`${baseId}-${field}`}
              field={field}
              label={label}
              help={help}
              helpLabel={ti.profileHintFor(label)}
              hint={inChannel ? t.asInChannel(null) : null}
              note={field === 'links' ? ti.profileLinkSource : null}
              value={
                inChannel && channelValue ? channelValue : options[field]
              }
              changed={isChanged}
              muted={inChannel}
              disabled={disabled}
              onChange={(value) => choose(field, value)}
            >
              {channelValue ? null : (
                <option value="channel">{t.asInChannel(null)}</option>
              )}
              {values.map((value) => (
                <option key={value} value={value}>
                  {word(value)}
                </option>
              ))}
            </PostOptionRow>
          );
          if (field !== 'length') return row;
          /*
            Эмодзи идёт сразу за длиной, как в карточке канала, и занимает
            всю ширину панели: шести делениям с «без предела» в колонке
            значения тесно.
          */
          return [
            row,
            <div
              key="emoji"
              data-post-option="emoji"
              data-post-option-changed={emojiChanged ? 'true' : 'false'}
              className="col-span-2 flex min-w-0 flex-col gap-[4px] pt-[4px]"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-[8px]">
                <FieldLabel
                  htmlFor={`${baseId}-emoji`}
                  label={ti.profileEmoji}
                  hint={ti.profileHintEmoji}
                  hintLabel={ti.profileHintFor(ti.profileEmoji)}
                  labelClassName="cf-caption text-cf-ink-muted"
                />
                {emojiInChannel ? (
                  <span
                    id={`${baseId}-emoji-hint`}
                    data-post-option-hint="emoji"
                    className="cf-caption text-cf-ink-muted"
                  >
                    {t.asInChannel(null)}
                  </span>
                ) : null}
              </div>
              <EmojiCeilingSlider
                locale={locale}
                id={`${baseId}-emoji`}
                value={emojiValue}
                channel={channelEmoji}
                muted={emojiInChannel}
                changed={emojiChanged}
                disabled={disabled}
                dataName="post"
                describedBy={emojiInChannel ? `${baseId}-emoji-hint` : undefined}
                onChange={chooseEmoji}
              />
            </div>,
          ];
        })}
      </div>

      <div className="flex min-w-0 flex-col gap-[4px]">
        <FieldLabel
          htmlFor={`${baseId}-wish`}
          label={t.wishLabel}
          hint={t.hintWish}
          hintLabel={ti.profileHintFor(t.wishLabel)}
          labelClassName="cf-caption text-cf-ink-muted"
        />
        <Input
          standalone
          density="dense"
          id={`${baseId}-wish`}
          placeholder={t.wishPlaceholder}
          maxLength={POST_WISH_MAX}
          value={options.wish}
          disabled={disabled}
          onChange={(event) => onChange({ ...options, wish: event.target.value })}
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        {onRewrite ? (
          <Button
            type="button"
            variant="primary"
            density="dense"
            disabled={disabled || !count}
            data-post-options-rewrite="true"
            onClick={onRewrite}
          >
            {t.rewriteWithThis}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="quiet"
          density="dense"
          disabled={disabled || !count}
          data-post-options-reset="true"
          onClick={() =>
            onChange({
              ...DEFAULT_POST_OPTIONS,
              brandProfileId: baseline.brandProfileId,
            })
          }
        >
          {t.postOptionsReset}
        </Button>
      </div>

      {onRemember ? (
        <Button
          type="button"
          variant="quiet"
          density="dense"
          className="self-start"
          disabled={disabled || !rememberable}
          loading={rememberState === 'saving'}
          loadingLabel={t.remembering}
          data-post-options-remember="true"
          onClick={onRemember}
        >
          {t.rememberForChannel}
        </Button>
      ) : null}
      {rememberState === 'saved' ? (
        <p role="status" className="cf-caption text-cf-ink-muted">
          {t.remembered}
        </p>
      ) : rememberState === 'failed' ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {t.rememberFailed}
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * Одна строка: подпись и плотный выбор.
 *
 * «Как в канале» — приглушённым, изменённое — рамкой `signature`; список
 * значений всегда цветом текста, иначе приглушение выбранного перекрасило бы
 * и его.
 */
function PostOptionRow({
  id,
  field,
  label,
  help,
  helpLabel,
  hint,
  note = null,
  value,
  changed,
  muted,
  disabled,
  onChange,
  children,
}: {
  id: string;
  field: PostProfileField;
  label: string;
  /** Одна строка в «?» рядом с названием. */
  help: string;
  helpLabel: string;
  /** «как в канале» под названием, пока поле не менялось. */
  hint: string | null;
  /** Постоянная подсказка под выбором — та же, что в карточке канала. */
  note?: string | null;
  value: string;
  changed: boolean;
  muted: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-col">
        <FieldLabel
          htmlFor={id}
          label={label}
          hint={help}
          hintLabel={helpLabel}
          labelClassName="cf-caption text-cf-ink-muted"
        />
        {hint ? (
          <span
            id={`${id}-hint`}
            data-post-option-hint={field}
            className="cf-caption text-cf-ink-muted"
          >
            {hint}
          </span>
        ) : null}
      </div>
      <Select
        standalone
        disableForm
        density="dense"
        id={id}
        value={value}
        disabled={disabled}
        data-post-option={field}
        data-post-option-changed={changed ? 'true' : 'false'}
        aria-describedby={
          [hint ? `${id}-hint` : null, note ? `${id}-note` : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={clsx(
          'w-full min-w-0 [&>option]:text-cf-ink',
          muted && 'text-cf-ink-muted',
          changed && 'border-cf-signature'
        )}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </Select>
      {note ? (
        <p
          id={`${id}-note`}
          data-post-option-note={field}
          className="col-start-2 -mt-[4px] cf-caption text-cf-ink-muted"
        >
          {note}
        </p>
      ) : null}
    </>
  );
}

export default PostOptionsPanel;
