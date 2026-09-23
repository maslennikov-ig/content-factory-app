'use client';

import { useId } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { formatStoredMarkup } from './adaptation-markup';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

/**
 * Тело адаптации, каким оно уйдёт в канал, — там, где править его нельзя.
 *
 * Текст показан так, как его прочтут: `**жирный**` читается жирным. До
 * `97dq.46` рядом стоял переключатель «Показать разметку», и владелец на
 * одиннадцатом заходе назвал его нелогичным: смотреть на звёздочки незачем,
 * править текст можно в «Редактировать» у черновика.
 *
 * Если правка закрыта обратимо — пост стоит в расписании, — на месте
 * «Редактировать» стоит та же кнопка выключенной и строка, почему и как её
 * открыть. Без причины кнопки нет: у опубликованного поста и у того, кто
 * только смотрит, открывать нечего.
 */
export function AdaptationBody({
  locale,
  text,
  draftId,
  lockedReason,
}: {
  locale: PiecesLocale;
  text: string;
  /** Идёт ли текст стримом прямо сейчас — этим помечен черновик на странице. */
  draftId?: string;
  /** Почему «Редактировать» сейчас закрыто; без неё кнопки нет вовсе. */
  lockedReason?: string | null;
}) {
  const t = piecesCopy[locale];
  const reasonId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-[8px]">
      {lockedReason ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-[12px] gap-y-[4px]">
          <span id={reasonId} className="cf-caption text-cf-ink-muted">
            {lockedReason}
          </span>
          <Button
            type="button"
            variant="quiet"
            density="dense"
            disabled
            aria-describedby={reasonId}
            data-adaptation-edit="locked"
          >
            {t.editText}
          </Button>
        </div>
      ) : null}
      <article
        data-intake-draft="true"
        data-piece-draft-id={draftId}
        className="max-w-[72ch] whitespace-pre-wrap cf-body-lg text-cf-ink [overflow-wrap:anywhere]"
      >
        {formatStoredMarkup(text)}
      </article>
    </div>
  );
}
