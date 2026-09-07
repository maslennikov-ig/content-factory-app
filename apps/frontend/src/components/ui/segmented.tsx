'use client';

import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';

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
};

export function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
  className,
  ...rest
}: {
  /** Вопрос, на который отвечает полоса. Уходит в `aria-label` группы. */
  label: string;
  value: Value;
  options: readonly SegmentedOption<Value>[];
  onChange: (value: Value) => void;
  className?: string;
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
        'inline-flex gap-[4px] self-start rounded-[8px] border border-cf-border bg-cf-surface p-[4px]',
        className
      )}
    >
      {options.map((option) => (
        <RadioOption
          key={option.value}
          value={option.value}
          layout="content"
          className={clsx(
            'rounded-[4px] px-[16px] cf-label-sm transition-colors duration-state motion-reduce:transition-none',
            value === option.value
              ? 'bg-cf-accent text-cf-accent-ink cf-pressed-fill'
              : 'text-cf-ink-muted hover:bg-cf-surface-subtle hover:text-cf-ink cf-pressed'
          )}
        >
          {option.label}
        </RadioOption>
      ))}
    </RadioGroup>
  );
}

export default Segmented;
