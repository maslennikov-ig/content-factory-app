'use client';

import type { ReactNode } from 'react';
import { Disclosure } from '@contentfactory/frontend/components/ui/disclosure';

/**
 * Вопрос, который раскрывается ответом.
 *
 * В системе аккордеона нет, и `docs/design/component-inventory.md` называет
 * это прямо: «Чего в системе действительно нет… аккордеона». Там же сказано,
 * что третье самодельное раскрытие — это заявка на примитив, а не третья
 * копия. Второе — вот оно: первое живёт в `billing/faq.component.tsx`
 * (`FAQSection`). Здесь оно не переписано ещё раз, а сделано так, чтобы
 * извлечение в `@contentfactory/react` было переносом файла: своей краски
 * компонент не держит, геометрию строки берёт у `Button`, а всё, что знает о
 * помощи, приходит пропсами.
 *
 * Почему не `<details>`: содержимое ответа надо связать с кнопкой через
 * `aria-controls`, а состояние — прочитать из `aria-expanded` в тесте и в
 * скринридере. `<details>` даёт своё раскрытие, но не даёт ни того, ни
 * другого, и подменяет фокусируемый элемент `<summary>`, которому нельзя
 * задать роль кнопки без ручной обработки пробела.
 *
 * Ответ остаётся в разметке и в закрытом виде — атрибутом `hidden`, а не
 * размонтированием. Так `aria-controls` всегда указывает на существующий
 * элемент, а раскрытие не стоит перерисовки поддерева.
 */
export type HelpDisclosureProps = {
  /** Устойчивое имя строки: попадает в `data-help-question`. */
  id: string;
  question: string;
  answer: ReactNode;
  /** Раскрыт при первом показе. Открыт всегда ровно один — первый. */
  defaultOpen?: boolean;
  className?: string;
};

export function HelpDisclosure({
  id,
  question,
  answer,
  defaultOpen = false,
  className,
}: HelpDisclosureProps) {
  return (
    <Disclosure
      summary={question}
      defaultOpen={defaultOpen}
      className={`rounded-[8px] border border-cf-border bg-cf-surface ${className ?? ''}`}
      triggerClassName="rounded-[8px] p-[16px] text-cf-ink"
      contentClassName="max-w-[70ch] select-text px-[16px] pb-[16px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
      triggerProps={{
        'data-help-question': id,
        'data-help-open': undefined,
      } as React.ButtonHTMLAttributes<HTMLButtonElement>}
      regionProps={{ 'data-help-answer': id } as React.HTMLAttributes<HTMLDivElement>}
    >
      {answer}
    </Disclosure>
  );
}

export default HelpDisclosure;
