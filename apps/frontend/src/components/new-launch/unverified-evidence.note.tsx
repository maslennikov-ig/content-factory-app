'use client';

import type { FC } from 'react';
import {
  composeCopy,
  type ComposeLocale,
} from '@contentfactory/frontend/components/new-launch/compose.copy';

/**
 * Взятое, но неподтверждённое — сказать об этом там, где это случилось.
 *
 * `content-factory-next-fn33.131`. Человек находит материал на вкладке
 * «Бриф», нажимает «Взять как доказательство» и генерирует пост. Строитель
 * контекста берёт в текст только подтверждённое человеком на витрине «Откуда
 * факты»; взятое поиском остаётся неподтверждённым и отбрасывается
 * (`rejected: [{reason: 'UNVERIFIED'}]`). Это решение продукта, и оно
 * правильное — но до сих пор оно было беззвучным: пост без единого факта
 * ничем не отличался от поста, собранного вообще без материала, и человек
 * узнавал об отказе только из панели поиска, мелким шрифтом и заранее.
 *
 * ## Почему это не тревога
 *
 * Ничего не сломалось и ничего не потеряно: фрагменты лежат на витрине и ждут
 * подтверждения. Поэтому поверхность здесь та же, что у соседней строки
 * происхождения и у предложения по черновику, а не предупреждающая заливка.
 * Цвет и так не был бы носителем смысла — смысл несёт предложение.
 *
 * ## Почему ссылка открывает вкладку
 *
 * Окно поста держит несохранённый черновик. Переход по ссылке в том же окне
 * увёл бы человека с текста, который ещё нигде не записан, — поэтому витрина
 * открывается рядом, а черновик остаётся на месте.
 */
export const UnverifiedEvidenceNote: FC<{
  /** Сколько взятых фрагментов контекст отбросил как неподтверждённые. */
  count: number | undefined;
  locale: ComposeLocale;
}> = ({ count, locale }) => {
  if (!count || count < 1) return null;
  const copy = composeCopy[locale];

  return (
    <div
      data-testid="unverified-evidence-note"
      data-unverified-evidence={count}
      className="mt-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
    >
      <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
        {copy.unverifiedDropped(count)}
      </p>
      <p className="cf-body-sm mt-[8px] text-cf-ink-muted [text-wrap:pretty]">
        {copy.unverifiedNextStep}{' '}
        <a
          href="/content?tab=provenance"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 text-cf-ink hover:text-cf-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
        >
          {copy.unverifiedLink}
        </a>
      </p>
    </div>
  );
};
