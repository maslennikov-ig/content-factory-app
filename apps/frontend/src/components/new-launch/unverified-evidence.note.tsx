'use client';

import type { FC, ReactNode } from 'react';
import {
  composeCopy,
  type ComposeLocale,
} from '@contentfactory/frontend/components/new-launch/compose.copy';

/**
 * Что стало с материалом, который человек взял, — сказать там, где это видно.
 *
 * `content-factory-next-fn33.131`, переписано под решение владельца от
 * 05.09.2026 (`content-factory-next-ec48`). Человек находит материал на
 * вкладке «Бриф», нажимает «Взять как доказательство» и генерирует пост.
 * Раньше строитель контекста отбрасывал всё взятое поиском как
 * неподтверждённое (`rejected: [{reason: 'UNVERIFIED'}]`), и записка говорила
 * об одном — о потере. Теперь такое идёт в текст с пометкой «взято из
 * поиска», и записок стало две, потому что вопросов два: что в тексте есть и
 * под каким именем, и чего в нём всё-таки нет.
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
const Note: FC<{
  testId: string;
  countAttribute: number;
  attributeName: 'data-unverified-evidence' | 'data-search-evidence';
  body: ReactNode;
  nextStep: string;
  /**
   * Ссылка на витрину стоит только там, где фрагмент на витрине есть. Находка,
   * которую генератор сохранил сам, ни к какому факту не привязана и на
   * «Откуда факты» не показывается (рецензия `content-factory-next-ec48`,
   * P2-1), поэтому записка о ней ссылки не несёт: совет, ведущий на экран, где
   * искомого нет, хуже отсутствия совета.
   */
  link?: string;
}> = ({ testId, countAttribute, attributeName, body, nextStep, link }) => (
  <div
    data-testid={testId}
    {...{ [attributeName]: countAttribute }}
    className="mt-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
  >
    <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">{body}</p>
    <p className="cf-body-sm mt-[8px] text-cf-ink-muted [text-wrap:pretty]">
      {nextStep}
      {link ? (
        <>
          {' '}
          <a
            href="/content?tab=provenance"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 text-cf-ink hover:text-cf-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
          >
            {link}
          </a>
        </>
      ) : null}
    </p>
  </div>
);

export const UnverifiedEvidenceNote: FC<{
  /**
   * Сколько взятых фрагментов контекст отбросил — по причине `UNVERIFIED` и
   * только по ней. С 05.09.2026 это уже не «всё взятое поиском», а остаток:
   * найденное, которое успело устареть или исчезнуть до сборки.
   */
  count?: number | undefined;
  /**
   * Сколько взятых поиском фрагментов вошло в текст с пометкой. Разговор
   * прямо противоположный — про состав, а не про потерю, — поэтому и число
   * своё.
   */
  searchCount?: number | undefined;
  locale: ComposeLocale;
}> = ({ count, searchCount, locale }) => {
  const copy = composeCopy[locale];
  const dropped = count && count > 0 ? count : 0;
  const searched = searchCount && searchCount > 0 ? searchCount : 0;
  if (!dropped && !searched) return null;

  return (
    <>
      {/*
        Сначала то, что в тексте есть: человек читает пост, а не отчёт о
        сборке, и первый вопрос у него про прочитанное.
      */}
      {searched > 0 && (
        <Note
          testId="search-evidence-note"
          attributeName="data-search-evidence"
          countAttribute={searched}
          body={copy.searchEvidenceUsed(searched)}
          nextStep={copy.searchNextStep}
        />
      )}
      {dropped > 0 && (
        <Note
          testId="unverified-evidence-note"
          attributeName="data-unverified-evidence"
          countAttribute={dropped}
          body={copy.unverifiedDropped(dropped)}
          nextStep={copy.unverifiedNextStep}
          link={copy.unverifiedLink}
        />
      )}
    </>
  );
};
