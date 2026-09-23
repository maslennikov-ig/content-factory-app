'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Panel } from '@contentfactory/react/layout';
import { intakeCopy } from '../intake/intake.copy';
import {
  CTA_KINDS,
  FORMAT_PREFERENCES,
  HASHTAG_POLICIES,
  LENGTH_PRESET_ORDER,
  LINK_POLICIES,
  PROFILE_NOTES_MAX,
  emojiStopOf,
  type ChannelWritingProfileV1,
  type EmojiLevel,
  type LengthPreset,
} from '../intake/writing-profile.adapter';
import { EmojiCeilingSlider } from '../intake/emoji-ceiling.slider';
import {
  CHANNEL_PLAN_MODES,
  channelPlanModeCopy,
} from '../intake/channel-plan-mode';
import { FieldLabel } from '../../ui/field-label';
import { SplitButton } from '../../ui/split-button';
import { writingProfileLabels } from '../intake/writing-profile.fields';
import {
  DEFAULT_POST_BASELINE,
  DEFAULT_POST_OPTIONS,
  POST_LINK_NONE,
  POST_WISH_MAX,
  changedPostFields,
  channelValueOf,
  postChangeCount,
  postOptionsOfProfile,
  profilePatchOfOptions,
  readLinkAddress,
  type PlanModeWordV1,
  type PostOptionsBaselineV1,
  type PostOptionsV1,
  type PostProfileField,
} from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import { SectionLabel } from '../../ui/section-label';

export type PostAvatarOption = { id: string; label: string };

/** Где рисуется панель: карточка канала или правая колонка вкладки канала. */
export type SettingsScope = 'channel' | 'post';

export type SaveStateV1 = 'idle' | 'saving' | 'saved' | 'failed';

/** Пресеты длины по возрастанию: «короче» и «длиннее» считаются по ним. */
const LENGTH_STEPS: readonly LengthPreset[] = ['short', 'ideal', 'long', 'max'];

/**
 * Поле «План» панели. В области поста `value` — свой режим поста, а `null` —
 * «как в канале»; в области канала — режим канала.
 */
export type PlanFieldProps = {
  value: PlanModeWordV1 | null;
  /** Режим канала: с ним сравнивается «как в канале». */
  channel: PlanModeWordV1;
  onChange: (next: PlanModeWordV1 | null) => void;
  disabled?: boolean;
  /** Под полем: «Сохранено», отказ, вопрос «Только к новым / Ко всем N». */
  slot?: ReactNode;
};

type CommonProps = {
  locale: PiecesLocale;
  avatars: readonly PostAvatarOption[];
  disabled?: boolean;
  /** Без поля «План» панель рисует только поля текста. */
  plan?: PlanFieldProps;
  /** Слова под полями и над кнопками области: сохранение и его итог. */
  footer?: ReactNode;
  describedBy?: string;
};

export type PostScopeProps = CommonProps & {
  scope?: 'post';
  options: PostOptionsV1;
  /** Как решено для канала: от этого считается «изменено». */
  baseline?: PostOptionsBaselineV1;
  /**
   * Ответ заготовки на «Какую ссылку поставить в пост?» (`97dq.75`): с него
   * начинается «Ссылка для поста». `null` — вопрос ещё без ответа.
   */
  pieceLink?: { url: string | null } | null;
  onChange: (next: PostOptionsV1) => void;
  /** «Переписать с этим» — новая версия. Нет адаптации — кнопки нет. */
  onRewrite?: () => void;
  /** Меню «Переписать с этим»: «Переписать и запомнить для канала». */
  onRewriteAndRemember?: () => void;
  /** Текст старше настроек: «применится при переписывании». */
  rewritePending?: boolean;
  /** Автосохранение поста: «Сохранено · ЧЧ:ММ». */
  saveState?: SaveStateV1;
  savedAt?: string | null;
  onSaveForPost?: () => void;
  onSaveForChannel?: () => void;
  channelSaveState?: SaveStateV1;
};

export type ChannelScopeProps = CommonProps & {
  scope: 'channel';
  profile: ChannelWritingProfileV1;
  onProfileChange: (patch: Partial<ChannelWritingProfileV1>) => void;
  /** «Как пишем в «X»» — одно имя карточки канала во всём продукте. */
  title: ReactNode;
};

/**
 * Одна панель настроек в двух областях (`97dq.70`, тринадцатый заход,
 * владелец: «настройки канала и настройки конкретного поста должны быть
 * одним и тем же компонентом… и настройки должны быть там и там одни и те
 * же»).
 *
 * Поля, их порядок и их «?» — одни: План, Кто говорит, Длина, Эмодзи,
 * Хэштеги, Ссылки, Призыв. Своё у области только то, что к ней относится:
 * у поста — «Пожелание» к одному тексту, у канала — формат по умолчанию и
 * заметка о канале, которые пост не перекрывает.
 *
 * Область поста (правая колонка вкладки канала): каждое поле по умолчанию
 * показывает значение канала приглушённым с подписью «как в канале»,
 * изменённое отмечено рамкой `signature`, изменения сохраняются сами как
 * переопределения поста. «План» применяется к посту сразу; поля, меняющие
 * текст, — при переписывании, и пока текст старше настроек, рядом с
 * «Переписать с этим» стоит тихое «применится при переписывании».
 *
 * Область канала (карточка канала): те же поля с его значениями, сохраняются
 * кнопкой карточки; «План» — сразу, отдельно от карточки.
 */
export function WritingSettingsPanel(props: PostScopeProps | ChannelScopeProps) {
  const { locale, avatars, disabled = false, plan, footer, describedBy } = props;
  const scope: SettingsScope = props.scope === 'channel' ? 'channel' : 'post';
  const post = props.scope === 'channel' ? null : props;
  const channelProps = props.scope === 'channel' ? props : null;
  const t = piecesCopy[locale];
  const ti = intakeCopy[locale];
  const tp = channelPlanModeCopy[locale];
  const labels = writingProfileLabels(locale);
  const baseId = useId();

  const options: PostOptionsV1 = channelProps
    ? postOptionsOfProfile(channelProps.profile)
    : post!.options;
  const baseline: PostOptionsBaselineV1 = channelProps
    ? DEFAULT_POST_BASELINE
    : post!.baseline ?? DEFAULT_POST_BASELINE;
  const emit = (next: PostOptionsV1) => {
    if (channelProps)
      channelProps.onProfileChange(
        profilePatchOfOptions(channelProps.profile, next)
      );
    else post!.onChange(next);
  };

  // «Изменено» и «как в канале» — только у поста: у канала нечего перекрывать.
  const marks = scope === 'post';
  const changed = new Set(marks ? changedPostFields(options, baseline) : []);
  const count = marks ? postChangeCount(options, baseline) : 0;
  const choosesAvatar = avatars.length > 1;
  const speakerChanged =
    marks &&
    Boolean(
      options.brandProfileId &&
        options.brandProfileId !== baseline.brandProfileId
    );

  const channelLength = marks ? channelValueOf('length', baseline.profile) : null;
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
    const same = marks && value === channelValueOf(field, baseline.profile);
    emit({ ...options, [field]: same ? 'channel' : value });
  };

  /*
    Эмодзи — бегунок «до N» (`97dq.61`). Деление, на котором стоит канал, —
    это «как в канале», даже если канал хранит старое слово.
  */
  const channelEmoji = marks ? channelValueOf('emoji', baseline.profile) : null;
  const emojiInChannel = marks && options.emoji === 'channel';
  const emojiValue: EmojiLevel =
    options.emoji === 'channel' ? channelEmoji ?? 'few' : options.emoji;
  const emojiChanged = changed.has('emoji');
  const chooseEmoji = (stop: EmojiLevel) =>
    emit({
      ...options,
      emoji:
        marks && channelEmoji && emojiStopOf(channelEmoji) === emojiStopOf(stop)
          ? 'channel'
          : stop,
    });

  /* ---- План ------------------------------------------------------------- */

  const planValue = plan ? plan.value ?? plan.channel : null;
  const planInChannel = Boolean(plan && marks && plan.value === null);
  const planRow = plan ? (
    <div
      key="plan"
      data-settings-plan={planValue ?? ''}
      data-settings-plan-own={marks && plan.value !== null ? 'true' : 'false'}
      className="contents"
    >
      <SettingsRowLabel
        id={`${baseId}-plan`}
        field="plan"
        label={tp.label}
        help={scope === 'post' ? tp.postHint : tp.hint}
        helpLabel={ti.profileHintFor(tp.label)}
        hint={planInChannel ? t.asInChannel(null) : null}
      />
      <Select
        standalone
        disableForm
        density="dense"
        id={`${baseId}-plan`}
        value={planValue ?? 'reserve'}
        disabled={disabled || plan.disabled}
        data-post-option="plan"
        data-post-option-changed={marks && plan.value !== null ? 'true' : 'false'}
        aria-describedby={
          [planInChannel ? `${baseId}-plan-hint` : null, `${baseId}-plan-note`]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={clsx(
          'w-full min-w-0 [&>option]:text-cf-ink',
          planInChannel && 'text-cf-ink-muted',
          marks && plan.value !== null && 'border-cf-signature'
        )}
        onChange={(event) => {
          const next = event.target.value as PlanModeWordV1;
          plan.onChange(marks && next === plan.channel ? null : next);
        }}
      >
        {CHANNEL_PLAN_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {tp.options[mode].title}
          </option>
        ))}
      </Select>
      <p
        id={`${baseId}-plan-note`}
        data-post-option-note="plan"
        className="col-start-2 -mt-[4px] cf-caption text-cf-ink-muted [text-wrap:pretty]"
      >
        {tp.options[planValue ?? 'reserve'].hint}
      </p>
      {plan.slot ? <div className="col-span-2 min-w-0">{plan.slot}</div> : null}
    </div>
  ) : null;

  /* ---- Строки полей ----------------------------------------------------- */

  const rows = fields.map(({ field, label, help, values, word }) => {
    const channelValue = marks ? channelValueOf(field, baseline.profile) : null;
    const isChanged = changed.has(field);
    const inChannel = marks && options[field] === 'channel';
    const row = (
      <SettingsRow
        key={field}
        id={`${baseId}-${field}`}
        field={field}
        label={label}
        help={help}
        helpLabel={ti.profileHintFor(label)}
        hint={inChannel ? t.asInChannel(null) : null}
        note={field === 'links' ? ti.profileLinkSource : null}
        value={inChannel && channelValue ? channelValue : options[field]}
        changed={isChanged}
        muted={inChannel}
        disabled={disabled}
        onChange={(value) => choose(field, value)}
      >
        {marks && !channelValue ? (
          <option value="channel">{t.asInChannel(null)}</option>
        ) : null}
        {values.map((value) => (
          <option key={value} value={value}>
            {word(value)}
          </option>
        ))}
      </SettingsRow>
    );
    if (field !== 'length') return row;
    // Эмодзи идёт сразу за длиной и занимает всю ширину: шести делениям тесно.
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
          dataName={scope === 'post' ? 'post' : 'writing-profile'}
          describedBy={emojiInChannel ? `${baseId}-emoji-hint` : undefined}
          onChange={chooseEmoji}
        />
      </div>,
    ];
  });

  const speaker = choosesAvatar ? (
    <>
      <FieldLabel
        htmlFor={`${baseId}-speaker`}
        label={t.whoSpeaks}
        hint={scope === 'post' ? t.hintWhoSpeaks : ti.profileHintSpeaker}
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
          emit({ ...options, brandProfileId: event.target.value || null })
        }
      >
        <option value="">
          {scope === 'post' ? t.speakerChannel : ti.profileSpeakerDefault}
        </option>
        {avatars.map((avatar) => (
          <option key={avatar.id} value={avatar.id}>
            {avatar.label}
          </option>
        ))}
      </Select>
    </>
  ) : null;

  /* ---- Своё у области --------------------------------------------------- */

  const channelOnly = channelProps ? (
    <>
      <SettingsRow
        id={`${baseId}-format`}
        field="format"
        label={ti.profileFormat}
        help={ti.profileHintFormat}
        helpLabel={ti.profileHintFor(ti.profileFormat)}
        hint={null}
        value={channelProps.profile.formatPreference}
        changed={false}
        muted={false}
        disabled={disabled}
        onChange={(value) =>
          channelProps.onProfileChange({
            formatPreference:
              value as ChannelWritingProfileV1['formatPreference'],
          })
        }
      >
        {FORMAT_PREFERENCES.map((value) => (
          <option key={value} value={value}>
            {labels.format[value]}
          </option>
        ))}
      </SettingsRow>
      <div className="col-span-2 flex min-w-0 flex-col gap-[4px] pt-[4px]">
        <FieldLabel
          htmlFor={`${baseId}-notes`}
          label={ti.profileNotes}
          hint={ti.profileNotesHint}
          hintLabel={ti.profileHintFor(ti.profileNotes)}
          labelClassName="cf-caption text-cf-ink-muted"
        />
        <Textarea
          standalone
          id={`${baseId}-notes`}
          layout="content"
          name="writing-profile-notes"
          maxLength={PROFILE_NOTES_MAX}
          disabled={disabled}
          className="w-full"
          value={channelProps.profile.notes ?? ''}
          onChange={(event) =>
            channelProps.onProfileChange({
              notes: event.target.value.slice(0, PROFILE_NOTES_MAX),
            })
          }
        />
        <p className="cf-caption tabular-nums text-cf-ink-muted">
          {ti.profileNotesCount(
            (channelProps.profile.notes ?? '').length,
            PROFILE_NOTES_MAX
          )}
        </p>
      </div>
    </>
  ) : (
    <>
      <div className="col-span-2 flex min-w-0 flex-col gap-[4px] pt-[4px]">
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
          onChange={(event) => emit({ ...options, wish: event.target.value })}
        />
      </div>
      <PostLinkField
        locale={locale}
        id={`${baseId}-link`}
        value={options.link}
        pieceLink={post?.pieceLink ?? null}
        disabled={disabled}
        onChange={(link) => emit({ ...options, link })}
      />
    </>
  );

  /* ---- Действия поста --------------------------------------------------- */

  const postActions = post ? (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        {post.onRewrite ? (
          post.onRewriteAndRemember ? (
            <SplitButton
              dataName="rewrite"
              density="dense"
              disabled={disabled || !count}
              menuLabel={t.rewriteMore}
              placement="above"
              align="start"
              actionData={{ 'data-post-options-rewrite': 'true' }}
              onClick={post.onRewrite}
              items={[
                {
                  id: 'rewrite-remember',
                  title: t.rewriteAndRemember,
                  description: t.rewriteAndRememberHint,
                  onSelect: post.onRewriteAndRemember,
                },
              ]}
            >
              {t.rewriteWithThis}
            </SplitButton>
          ) : (
            <Button
              type="button"
              variant="primary"
              density="dense"
              disabled={disabled || !count}
              data-post-options-rewrite="true"
              onClick={post.onRewrite}
            >
              {t.rewriteWithThis}
            </Button>
          )
        ) : null}
        <Button
          type="button"
          variant="quiet"
          density="dense"
          disabled={disabled || !count}
          data-post-options-reset="true"
          onClick={() =>
            emit({
              ...DEFAULT_POST_OPTIONS,
              brandProfileId: baseline.brandProfileId,
            })
          }
        >
          {t.postOptionsReset}
        </Button>
      </div>
      {post.onRewrite && post.rewritePending ? (
        <p
          data-post-options-pending="true"
          className="-mt-[4px] cf-caption text-cf-ink-muted"
        >
          {t.appliesOnRewrite}
        </p>
      ) : null}
      {post.onSaveForPost ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px] border-t border-cf-border pt-[12px]">
          <SplitButton
            dataName="save-settings"
            variant="secondary"
            density="dense"
            disabled={disabled}
            loading={post.channelSaveState === 'saving'}
            loadingLabel={t.remembering}
            menuLabel={t.saveMore}
            placement="above"
            align="start"
            actionData={{ 'data-post-options-save': 'post' }}
            onClick={post.onSaveForPost}
            items={
              post.onSaveForChannel
                ? [
                    {
                      id: 'channel',
                      title: t.saveForChannel,
                      description: t.saveForChannelHint,
                      onSelect: post.onSaveForChannel,
                    },
                  ]
                : []
            }
          >
            {t.saveForPost}
          </SplitButton>
          <span
            data-post-options-saved={post.saveState ?? 'idle'}
            className="cf-caption tabular-nums text-cf-ink-muted"
          >
            {post.saveState === 'saving'
              ? t.settingsSaving
              : post.savedAt && post.saveState !== 'failed'
              ? t.settingsSaved(post.savedAt)
              : null}
          </span>
        </div>
      ) : null}
      {post.saveState === 'failed' ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {t.settingsSaveFailed}
        </p>
      ) : null}
      {post.channelSaveState === 'saved' ? (
        <p role="status" className="cf-caption text-cf-ink-muted">
          {t.savedForChannel}
        </p>
      ) : post.channelSaveState === 'failed' ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {t.rememberFailed}
        </p>
      ) : null}
    </>
  ) : null;

  return (
    <Panel
      className="min-w-0"
      contentClassName="flex min-w-0 flex-col gap-[12px]"
    >
      <div
        data-post-options={scope === 'post' ? 'panel' : undefined}
        data-settings-scope={scope}
        className="flex min-w-0 flex-wrap items-baseline gap-x-[8px] gap-y-[4px]"
      >
        <SectionLabel as="h3">
          {channelProps ? channelProps.title : t.postOptionsTitle}
        </SectionLabel>
        {count ? (
          <span
            data-post-options-count={count}
            className="ms-auto cf-caption tabular-nums text-cf-ink-muted"
          >
            {t.postOptionsChanges(count)}
          </span>
        ) : null}
      </div>

      <fieldset
        disabled={disabled}
        aria-describedby={describedBy}
        className={clsx(
          'grid min-w-0 items-center gap-x-[12px] gap-y-[8px]',
          scope === 'post'
            ? 'grid-cols-[112px_minmax(0,1fr)]'
            : 'grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[160px_minmax(0,1fr)]'
        )}
      >
        {planRow}
        {speaker}
        {rows}
        {channelOnly}
      </fieldset>

      {postActions}
      {footer}
    </Panel>
  );
}

/** Панель в области поста — прежнее имя, та же панель (`97dq.48`). */
export function PostOptionsPanel(props: Omit<PostScopeProps, 'scope'>) {
  return <WritingSettingsPanel {...props} scope="post" />;
}

/**
 * «Ссылка для поста» (`97dq.75`): начинается с ответа заготовки на «Какую
 * ссылку поставить в пост?» и правится для одного поста. Хранится
 * переопределением поста: `''` — как в заготовке, `none` — без ссылки,
 * иначе адрес http(s). Недописанный адрес не уходит в автосохранение, пока
 * не станет адресом; ошибка говорится под полем.
 */
function PostLinkField({
  locale,
  id,
  value,
  pieceLink,
  disabled,
  onChange,
}: {
  locale: PiecesLocale;
  id: string;
  value: string;
  pieceLink: { url: string | null } | null;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const t = piecesCopy[locale];
  const ti = intakeCopy[locale];
  const shown = (stored: string) =>
    stored === POST_LINK_NONE ? '' : stored || pieceLink?.url || '';
  const [draft, setDraft] = useState(() => shown(value));
  const [invalid, setInvalid] = useState(false);
  const emitted = useRef(value);
  const lastPiece = useRef(pieceLink?.url);

  // Сброс или новый ответ заготовки пришли снаружи — поле показывает их.
  useEffect(() => {
    const pieceMoved = lastPiece.current !== pieceLink?.url;
    lastPiece.current = pieceLink?.url;
    if (value === emitted.current && !pieceMoved) return;
    emitted.current = value;
    setDraft(shown(value));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, pieceLink?.url]);

  const send = (next: string) => {
    emitted.current = next;
    if (next !== value) onChange(next);
  };

  const type = (text: string) => {
    setDraft(text);
    if (!text.trim()) {
      setInvalid(false);
      // Пустое поле — «без ссылки», если заготовка её дала; иначе как было.
      send(pieceLink?.url ? POST_LINK_NONE : '');
      return;
    }
    const url = readLinkAddress(text);
    setInvalid(!url);
    if (url) send(url === pieceLink?.url ? '' : url);
  };

  const note =
    value === POST_LINK_NONE
      ? t.postLinkNoneForPost
      : value
      ? null
      : pieceLink
      ? t.postLinkFromPiece
      : t.postLinkNotChosen;
  const own = value !== '';

  return (
    <div
      data-post-option="link"
      data-post-option-changed={own ? 'true' : 'false'}
      className="col-span-2 flex min-w-0 flex-col gap-[4px] pt-[4px]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-[8px]">
        <FieldLabel
          htmlFor={id}
          label={t.postLinkLabel}
          hint={t.postLinkHint}
          hintLabel={ti.profileHintFor(t.postLinkLabel)}
          labelClassName="cf-caption text-cf-ink-muted"
        />
        {note ? (
          <span
            id={`${id}-note`}
            data-post-option-hint="link"
            className="cf-caption text-cf-ink-muted"
          >
            {note}
          </span>
        ) : null}
      </div>
      <Input
        standalone
        density="dense"
        id={id}
        type="url"
        inputMode="url"
        placeholder={ti.postLinkPlaceholder}
        value={draft}
        disabled={disabled}
        error={invalid ? ti.postLinkInvalid : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        className={clsx(
          !own && 'text-cf-ink-muted',
          own && 'border-cf-signature'
        )}
        onChange={(event) => type(event.target.value)}
      />
      <div className="flex min-w-0 flex-wrap gap-[8px]">
        {value !== POST_LINK_NONE && (draft || pieceLink?.url) ? (
          <Button
            type="button"
            variant="quiet"
            density="dense"
            disabled={disabled}
            data-post-link-clear="true"
            onClick={() => {
              setDraft('');
              setInvalid(false);
              send(POST_LINK_NONE);
            }}
          >
            {t.postLinkClear}
          </Button>
        ) : null}
        {own && pieceLink ? (
          <Button
            type="button"
            variant="quiet"
            density="dense"
            disabled={disabled}
            data-post-link-reset="true"
            onClick={() => {
              setDraft(pieceLink.url ?? '');
              setInvalid(false);
              send('');
            }}
          >
            {t.postLinkReset}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Подпись строки: название, «?» и «как в канале» под ним. */
function SettingsRowLabel({
  id,
  field,
  label,
  help,
  helpLabel,
  hint,
}: {
  id: string;
  field: string;
  label: string;
  help: string;
  helpLabel: string;
  hint: string | null;
}) {
  return (
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
  );
}

/**
 * Одна строка: подпись и плотный выбор.
 *
 * «Как в канале» — приглушённым, изменённое — рамкой `signature`; список
 * значений всегда цветом текста, иначе приглушение выбранного перекрасило бы
 * и его.
 */
function SettingsRow({
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
  field: string;
  label: string;
  /** Одна строка в «?» рядом с названием. */
  help: string;
  helpLabel: string;
  /** «как в канале» под названием, пока поле не менялось. */
  hint: string | null;
  /** Постоянная подсказка под выбором — одна для канала и поста. */
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
      <SettingsRowLabel
        id={id}
        field={field}
        label={label}
        help={help}
        helpLabel={helpLabel}
        hint={hint}
      />
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
