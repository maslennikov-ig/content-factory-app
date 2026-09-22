'use client';

import { useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Panel } from '@contentfactory/react/layout';
import { Segmented } from '../../ui/segmented';
import {
  DEFAULT_POST_BASELINE,
  POST_WISH_MAX,
  postOptionsChanged,
  type AddressFormV1,
  type PostLengthV1,
  type PostOptionsBaselineV1,
  type PostOptionsV1,
} from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import { SectionLabel } from '../../ui/section-label';

export type PostAvatarOption = { id: string; label: string };

/**
 * «Для этого поста» (`97dq.37`, §3.2 и §3.4): разовые настройки одной
 * адаптации.
 *
 * Ни канал, ни аватар отсюда не меняются — ради этого панель и существует:
 * владелец на десятом заходе просил «иногда пост побольше, иногда поменьше» и
 * «на „вы“», не трогая скрытых настроек канала. Пока ничего не выбрано, она
 * свёрнута до трёх строк сводки: большинство постов пишутся «как в канале»,
 * и форма из четырёх полей над каждым из них была бы шумом.
 *
 * «Кто говорит» не показан, когда аватар в пространстве один: выбирать не из
 * чего (правило владельца «решать за человека»). «Запомнить для канала» —
 * тихая ссылка, а не вторая главная кнопка: разовое остаётся разовым, пока
 * человек сам не решит иначе.
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
  const changed = postOptionsChanged(options, baseline);
  const [open, setOpen] = useState(false);
  const expanded = open || changed;

  const lengthWord: Record<PostLengthV1, string> = {
    shorter: t.lengthShorter,
    channel: t.lengthChannel,
    longer: t.lengthLonger,
  };
  const addressWord: Record<AddressFormV1, string> = {
    avatar: t.addressAvatar,
    ty: t.addressTy,
    vy: t.addressVy,
  };
  const speaker =
    avatars.find((avatar) => avatar.id === options.brandProfileId)?.label ??
    t.speakerChannel;
  const choosesAvatar = avatars.length > 1;

  return (
    <Panel
      className="min-w-0"
      contentClassName="flex min-w-0 flex-col gap-[12px]"
    >
      <div
        data-post-options={expanded ? 'open' : 'summary'}
        className="flex min-w-0 flex-col gap-[4px]"
      >
        <SectionLabel as="h3">{t.postOptionsTitle}</SectionLabel>
        <p className="cf-caption text-cf-ink-muted">{t.postOptionsLead}</p>
      </div>

      {!expanded ? (
        <>
          <dl className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-x-[12px] gap-y-[8px]">
            {choosesAvatar ? (
              <>
                <dt className="cf-caption text-cf-ink-muted">{t.whoSpeaks}</dt>
                <dd className="min-w-0 cf-body-sm text-cf-ink">{speaker}</dd>
              </>
            ) : null}
            <dt className="cf-caption text-cf-ink-muted">{t.lengthLabel}</dt>
            <dd className="cf-body-sm text-cf-ink">
              {lengthWord[options.length]}
            </dd>
            <dt className="cf-caption text-cf-ink-muted">{t.addressLabel}</dt>
            <dd className="cf-body-sm text-cf-ink">
              {addressWord[options.addressForm]}
            </dd>
          </dl>
          <Button
            type="button"
            variant="quiet"
            density="dense"
            className="self-start"
            disabled={disabled}
            aria-expanded={false}
            onClick={() => setOpen(true)}
          >
            {t.postOptionsChange}
          </Button>
        </>
      ) : (
        <>
          {choosesAvatar ? (
            <label className="flex min-w-0 flex-col gap-[4px]">
              <span className="cf-caption text-cf-ink-muted">
                {t.whoSpeaks}
              </span>
              <Select
                standalone
                value={options.brandProfileId ?? ''}
                disabled={disabled}
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
            </label>
          ) : null}
          <div className="flex min-w-0 flex-col gap-[4px]">
            <span className="cf-caption text-cf-ink-muted">
              {t.lengthLabel}
            </span>
            <Segmented<PostLengthV1>
              label={t.lengthLabel}
              value={options.length}
              options={(['shorter', 'channel', 'longer'] as const).map(
                (value) => ({ value, label: lengthWord[value] })
              )}
              onChange={(length) => onChange({ ...options, length })}
              className="max-w-full flex-wrap"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-[4px]">
            <span className="cf-caption text-cf-ink-muted">
              {t.addressLabel}
            </span>
            <Segmented<AddressFormV1>
              label={t.addressLabel}
              value={options.addressForm}
              options={(['avatar', 'ty', 'vy'] as const).map((value) => ({
                value,
                label: addressWord[value],
              }))}
              onChange={(addressForm) => onChange({ ...options, addressForm })}
              className="max-w-full flex-wrap"
            />
          </div>
          <Input
            standalone
            label={t.wishLabel}
            placeholder={t.wishPlaceholder}
            maxLength={POST_WISH_MAX}
            value={options.wish}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...options, wish: event.target.value })
            }
          />
          <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
            {onRewrite ? (
              <Button
                type="button"
                variant="secondary"
                density="dense"
                disabled={disabled || !changed}
                data-post-options-rewrite="true"
                onClick={onRewrite}
              >
                {t.rewriteWithThis}
              </Button>
            ) : null}
            {onRemember ? (
              <Button
                type="button"
                variant="quiet"
                density="dense"
                disabled={disabled || !changed}
                loading={rememberState === 'saving'}
                loadingLabel={t.remembering}
                data-post-options-remember="true"
                onClick={onRemember}
              >
                {t.rememberForChannel}
              </Button>
            ) : null}
          </div>
          {rememberState === 'saved' ? (
            <p role="status" className="cf-caption text-cf-ink-muted">
              {t.remembered}
            </p>
          ) : rememberState === 'failed' ? (
            <p role="alert" className="cf-body-sm text-cf-danger">
              {t.rememberFailed}
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

export default PostOptionsPanel;
