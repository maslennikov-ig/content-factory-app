'use client';

import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';

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

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className={clsx(
      'shrink-0 text-cf-ink-muted transition-transform duration-state motion-reduce:transition-none',
      open && 'rotate-180'
    )}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export function HelpDisclosure({
  id,
  question,
  answer,
  defaultOpen = false,
  className,
}: HelpDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  // `useId` даёт разные значения на сервере и в браузере только если разойдётся
  // порядок рендера; связка «кнопка ↔ область» должна быть уникальной на
  // странице, а не читаемой, поэтому имени руками здесь не придумывают.
  const generated = useId();
  const questionId = `${generated}-question`;
  const answerId = `${generated}-answer`;

  return (
    <div
      className={clsx(
        'rounded-[8px] border border-cf-border bg-cf-surface',
        className
      )}
    >
      <Button
        variant="quiet"
        layout="content"
        id={questionId}
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        data-help-question={id}
        data-help-open={open ? 'true' : 'false'}
        // `layout="content"` — строка растёт по тексту вопроса, а не режет его
        // по высоте контрола: 40px здесь минимум, а не размер.
        className="w-full justify-start gap-[12px] rounded-[8px] p-[16px] text-start"
      >
        <span className="min-w-0 flex-1 text-cf-ink [text-wrap:pretty]">
          {question}
        </span>
        <ChevronIcon open={open} />
      </Button>
      <div
        id={answerId}
        role="region"
        aria-labelledby={questionId}
        hidden={!open}
      >
        <p
          data-help-answer={id}
          className="max-w-[70ch] select-text px-[16px] pb-[16px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
        >
          {answer}
        </p>
      </div>
    </div>
  );
}

export default HelpDisclosure;
