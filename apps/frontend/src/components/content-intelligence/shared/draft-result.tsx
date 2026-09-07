'use client';

import type { ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import type { QualityChecksV1 } from '../intake/intake.adapter';
import { intakeCopy, type IntakeLocale } from '../intake/intake.copy';
import { QualityLine } from './quality-line';

/**
 * Готовый текст и то, что рядом с ним: общий блок входа и страницы заготовки.
 *
 * `content-factory-next-tu3k.9.9`, поток Z5. До этой волны блок жил внутри
 * `intake.screen.tsx`, и странице заготовки он понадобился слово в слово —
 * текст, «Открыть в редакторе» и то, что о тексте известно. Второй такой же
 * блок рядом с первым — это два разных ответа на вопрос «что показать после
 * генерации» через месяц, поэтому он вынесен, а не скопирован.
 *
 * Блок ничего не просит у сервера — вообще ничего. До 07.09.2026 здесь стояла
 * кнопка «Проверить на штампы»: человек, только что получивший текст, должен
 * был сам догадаться нажать её, чтобы узнать о нём хоть что-то. Проверки
 * приезжают вместе с текстом даром (`checks`), и строка качества называет
 * только то, на что стоит взглянуть. Чистому тексту она не говорит ничего.
 *
 * Заголовок и правая колонка отданы вызывающему (`aside`): у входа справа
 * стоит квитанция брифа, у страницы заготовки — то, что решает она сама.
 */

export function DraftResult({
  locale,
  title,
  text,
  checks,
  draftGaps,
  onOpenEditor,
  openEditorLabel,
  actions,
  aside,
}: {
  locale: IntakeLocale;
  title?: string;
  text: string;
  /** Проверки, снятые сервером при сборке этого текста. */
  checks?: QualityChecksV1 | null;
  /** Чего в тексте нет из привычек автора — приезжает тем же событием. */
  draftGaps?: readonly unknown[] | null;
  onOpenEditor?: () => void;
  openEditorLabel?: string;
  /** Кнопки рядом с «Открыть в редакторе» — например «Пересобрать». */
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  const t = intakeCopy[locale];

  return (
    <div className="grid min-w-0 gap-[16px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-[8px]">
        <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {title ?? t.draftTitle}
        </h3>
        <article
          data-intake-draft="true"
          className="min-w-0 whitespace-pre-wrap rounded-[8px] border border-cf-border bg-cf-surface p-[16px] cf-body-md text-cf-ink [text-wrap:pretty]"
        >
          {text}
        </article>
        <QualityLine
          locale={locale}
          slop={checks?.slop}
          antiCopy={checks?.antiCopy}
          voice={checks?.voice}
          draftGaps={draftGaps}
        />
        <div className="flex flex-wrap gap-[8px]">
          {onOpenEditor && (
            <Button type="button" variant="primary" onClick={onOpenEditor}>
              {openEditorLabel ?? t.openInEditor}
            </Button>
          )}
          {actions}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-[16px]">{aside}</div>
    </div>
  );
}

export default DraftResult;
