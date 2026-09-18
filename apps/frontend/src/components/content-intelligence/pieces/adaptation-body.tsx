'use client';

import { useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { formatStoredMarkup, hasStoredMarkup } from './adaptation-markup';
import { piecesCopy, type PiecesLocale } from './pieces.copy';

/**
 * Тело адаптации, каким оно уйдёт в канал.
 *
 * По умолчанию показан текст, а не хранимая запись: `**жирный**` читается
 * жирным. Переключатель «Показать разметку» возвращает исходные знаки — он
 * нужен тому, кто правит текст руками и должен видеть, где стоит выделение.
 *
 * Переключателя нет там, где нечего переключать: в тексте без единого
 * выделения обе стороны одинаковы, и кнопка обещала бы разницу, которой нет.
 *
 * Состояние местное и живёт на одну строку адаптаций: соседние адаптации
 * читаются независимо, и общий переключатель менял бы текст, на который
 * человек в этот момент не смотрит.
 */
export function AdaptationBody({
  locale,
  text,
  draftId,
}: {
  locale: PiecesLocale;
  text: string;
  /** Идёт ли текст стримом прямо сейчас — этим помечен черновик на странице. */
  draftId?: string;
}) {
  const t = piecesCopy[locale];
  const [raw, setRaw] = useState(false);
  const markup = hasStoredMarkup(text);

  return (
    <div className="flex min-w-0 flex-col gap-[8px]">
      {markup ? (
        <div className="flex min-w-0 justify-end">
          <Button
            type="button"
            variant="quiet"
            density="dense"
            aria-pressed={raw}
            data-adaptation-markup={raw ? 'raw' : 'formatted'}
            onClick={() => setRaw((shown) => !shown)}
          >
            {raw ? t.hideMarkup : t.showMarkup}
          </Button>
        </div>
      ) : null}
      <article
        data-intake-draft="true"
        data-piece-draft-id={draftId}
        className="max-w-[72ch] whitespace-pre-wrap cf-body-lg text-cf-ink [overflow-wrap:anywhere]"
      >
        {raw ? text : formatStoredMarkup(text)}
      </article>
    </div>
  );
}
