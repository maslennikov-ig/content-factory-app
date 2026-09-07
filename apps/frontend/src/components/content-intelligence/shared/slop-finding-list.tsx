'use client';

import type { SlopFindingV1 } from '../intake/intake.adapter';
import type { IntakeLocale } from '../intake/intake.copy';

/**
 * Находки проверки на штампы — список, а не блок.
 *
 * Вынесен 07.09.2026 из `intake/slop-findings.tsx`, когда те же находки
 * понадобились строке качества (`quality-line.tsx`). Второй такой же список
 * рядом с первым — это два разных ответа на вопрос «как показать находку»
 * через месяц: там отрезок и подсказка, здесь отрезок и подсказка чуть
 * другим кеглем.
 *
 * Подсказка приходит с сервера на двух языках сразу, поэтому здесь берётся
 * нужная, а не переводится: своих слов у списка нет вовсе.
 */
export function SlopFindingList({
  locale,
  findings,
}: {
  locale: IntakeLocale;
  findings: readonly SlopFindingV1[];
}) {
  if (findings.length === 0) return null;

  return (
    <ul className="flex flex-col gap-[8px]">
      {findings.map((finding, index) => (
        <li
          key={`${finding.ruleId}-${finding.start}-${index}`}
          data-slop-finding={finding.ruleId}
          data-slop-severity={finding.severity}
          className="flex min-w-0 flex-col gap-[4px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[8px]"
        >
          <p className="max-w-[64ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
            «{finding.excerpt}»
          </p>
          <p className="max-w-[64ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {locale === 'ru' ? finding.hint.ru : finding.hint.en}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default SlopFindingList;
