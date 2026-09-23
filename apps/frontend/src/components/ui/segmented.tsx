'use client';

import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import clsx from 'clsx';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { Hint } from '@contentfactory/react/layout/hint';

/**
 * Компактный переключатель: одна полоса, два-шесть слов, выбор виден целиком.
 *
 * Геометрия и краска полосы жили тремя копиями — вид списка материалов, вид
 * вкладки «Бриф» и, с волны «заготовка и адаптации», вид адаптации на странице
 * заготовки. Третья копия — уже не совпадение, а повторённый размер: рамка,
 * шаг 4px, радиус вложенной клетки и заливка текущего выбора здесь одни на
 * всех. Слова и значения остаются у call site — общими они не становятся.
 *
 * Внутри — `RadioGroup`: выбор следует за фокусом, стрелка и перемещает, и
 * выбирает. Это верно ровно там, где выбор дёшев и обратим и ничего сам по
 * себе не отправляет. Если нажатие на вариант уходит на сервер или
 * перезагружает панель — это `Menu` или `Tabs`, а не эта полоса.
 */

export type SegmentedOption<Value extends string> = {
  value: Value;
  /** Уже переведённое слово: полоса не знает ни одного языка. */
  label: string;
  /**
   * Подсказка «?» у положения — что станет со словами, если выбрать его
   * (`content-factory-next-97dq.36`). Кружок стоит рядом с положением, а не
   * внутри него: кнопка в кнопке недопустима. `label` — имя подсказки для
   * скринридера («Подсказка: свой текст»), `text` — само объяснение.
   */
  hint?: { label: string; text: ReactNode };
  /**
   * Пиктограмма перед словом. С `iconOnly` у полосы слово уходит в имя
   * кнопки и во всплывающую подпись, а видна только пиктограмма —
   * переключатель «Календарь · Список» в шапке календаря (`97dq.74`).
   */
  icon?: ReactNode;
};

/**
 * Стрелки, Home и End внутри подсказки не уходят в полосу.
 *
 * Подсказка живёт внутри `radiogroup`, и группа слушает клавиши у всех своих
 * потомков: стрелка на «?» перевела бы фокус на первое положение и заодно
 * выбрала его. Escape сюда не входит — подсказка ловит его на документе, и
 * остановленное событие туда бы не дошло.
 */
const HINT_KEEPS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
const keepKeysInHint = (event: KeyboardEvent<HTMLSpanElement>) => {
  if (HINT_KEEPS.has(event.key)) event.stopPropagation();
};

export function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
  className,
  iconOnly = false,
  ...rest
}: {
  /** Вопрос, на который отвечает полоса. Уходит в `aria-label` группы. */
  label: string;
  value: Value;
  options: readonly SegmentedOption<Value>[];
  onChange: (value: Value) => void;
  className?: string;
  /** Показывать только пиктограммы; слово остаётся в имени и в подсказке. */
  iconOnly?: boolean;
} & Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'className' | 'children'
>) {
  return (
    <RadioGroup
      {...rest}
      value={value}
      onChange={(next) => onChange(next as Value)}
      aria-label={label}
      className={clsx(
        // С подсказками полоса шире на три кружка и на 390 px уже не
        // помещается в строку — переносится, а не толкает страницу вбок.
        'inline-flex gap-[4px] self-start rounded-[8px] border border-cf-border bg-cf-surface p-[4px]',
        options.some((option) => option.hint) && 'flex-wrap',
        className
      )}
    >
      {options.map((option) => {
        const radio = (
          <RadioOption
            key={option.value}
            value={option.value}
            layout="content"
            aria-label={iconOnly && option.icon ? option.label : undefined}
            title={iconOnly && option.icon ? option.label : undefined}
            className={clsx(
              'rounded-[4px] cf-label-sm transition-colors duration-state motion-reduce:transition-none',
              iconOnly && option.icon ? 'px-[8px]' : 'px-[16px]',
              option.icon && 'inline-flex items-center gap-[8px]',
              value === option.value
                ? 'bg-cf-accent text-cf-accent-ink cf-pressed-fill'
                : 'text-cf-ink-muted hover:bg-cf-surface-subtle hover:text-cf-ink cf-pressed'
            )}
          >
            {option.icon ? (
              <span aria-hidden="true" className="inline-flex">
                {option.icon}
              </span>
            ) : null}
            {iconOnly && option.icon ? null : option.label}
          </RadioOption>
        );
        if (!option.hint) return radio;
        return (
          <span
            key={option.value}
            data-segmented-hint={option.value}
            className="inline-flex items-center"
          >
            {radio}
            <span className="inline-flex" onKeyDown={keepKeysInHint}>
              <Hint label={option.hint.label}>{option.hint.text}</Hint>
            </span>
          </span>
        );
      })}
    </RadioGroup>
  );
}

export default Segmented;
