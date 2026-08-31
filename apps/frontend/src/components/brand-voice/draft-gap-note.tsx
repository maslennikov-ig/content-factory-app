'use client';

import type { FC } from 'react';
import { voiceCopy, type VoiceLocale } from './voice-copy';

/**
 * Чего черновику не хватает — предложение рядом с готовым текстом.
 *
 * ## Почему это не предупреждение
 *
 * Предупреждение сообщает о свойстве продукта («будет непохоже»), и человек его
 * проматывает. Здесь сообщается свойство ЭТОГО текста: «вы обычно приводите
 * своё число, а в этом посте его нет». Такое закрывается за десять секунд, и
 * после этого текст становится тем, чем должен был быть.
 *
 * ## Три вещи, которые здесь намеренно НЕ происходят
 *
 * 1. **Текст не меняется.** Пост уже готов и уходит как есть, если человек
 *    ничего не сделает. Ни поля ввода, ни заготовки с дыркой: решение владельца
 *    28.08.2026 — модель предлагает решение, но отдаёт уже готовый текст.
 * 2. **Ничто не блокируется и не окрашивается тревогой.** Ни кнопок, ни
 *    предупреждающего цвета: человек может захотеть и без цифры, и это обычный
 *    исход, а не ошибка. Поверхность здесь та же, что у соседней ленты голоса.
 * 3. **Пример не выдуман.** Он взят из собственного поста автора и показывает
 *    ФОРМУ, а не факт: своих цифр продукт не знает и сочинять их не вправе.
 *    Поэтому он и подписан как «как это делаете вы», а не как подсказка.
 *
 * Долю продукт называет вместе со знаменателем: «54 % из 153 разобранных
 * постов». «54 %» на тридцати постах и на тысяче — разные утверждения, и
 * читатель вправе видеть, на чём число посчитано. Это то же правило, по
 * которому рядом печатаются две доли ошибок вердикта.
 */
export type DraftGap = Readonly<{
  metric: 'carriesOwnMeasurement';
  /** Доля постов автора с этой привычкой, целыми процентами. */
  authorShare: number;
  /** На скольких постах доля посчитана. */
  authorOf: number;
  /** Предложение из собственного поста автора; `null`, когда его не нашлось. */
  example: string | null;
}>;

export const DraftGapNote: FC<{
  gap: DraftGap | null | undefined;
  locale: VoiceLocale;
}> = ({ gap, locale }) => {
  if (!gap) return null;
  const t = voiceCopy[locale];

  return (
    <div
      data-draft-gap={gap.metric}
      className="mt-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
    >
      <div className="cf-label-sm uppercase text-cf-ink-muted">
        {t.draftGapLabel}
      </div>
      <p className="cf-body-sm mt-[8px] text-cf-ink">
        {t.draftGapOwnMeasurement} {t.draftGapHabit(gap.authorShare, gap.authorOf)}
      </p>
      {gap.example ? (
        <>
          <div className="cf-label-sm mt-[12px] uppercase text-cf-ink-muted">
            {t.draftGapExampleLabel}
          </div>
          <blockquote className="cf-body-sm mt-[8px] border-s-2 border-cf-border-strong ps-[12px] text-cf-ink-muted">
            {gap.example}
          </blockquote>
        </>
      ) : null}
      <p className="cf-caption mt-[12px] text-cf-ink-muted">
        {t.draftGapOptional}
      </p>
    </div>
  );
};
