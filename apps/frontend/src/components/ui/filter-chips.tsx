'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';

/**
 * Полоса фишек — один вопрос и его ответы на виду.
 *
 * Вынесена из списка заготовок в `ui/` (`content-factory-next-97dq.76`,
 * аудит §2.2): фильтр «одно значение из короткого списка, ответы на виду»
 * берут отсюда, а не рисуют третий вид рядом с `Segmented`. `Segmented` —
 * для режима вида (день/неделя/месяц), фишки — для отбора.
 *
 * Роль, стрелки и остановку Tab пишет `RadioGroup`: выбор здесь дёшев и
 * обратим, так что он следует за фокусом, как и просит правило семейства. Вид
 * принадлежит этому экрану — примитив не навязывает ни цвета, ни геометрии, а
 * высоту фишки (32 px, плотный вариант) держит `density`, а не класс отсюда.
 *
 * На телефоне вопрос занимает две строки, а не четыре. Ниже экрана `table` —
 * того же, на котором таблица становится карточками, — подпись встаёт над
 * фишками, а сами фишки едут одной строкой вбок: два переносящихся ряда по
 * девять фишек на 400 px съедали весь первый экран, и список начинался под
 * сгибом. Прокрутка вертикальных полей не съедает: `overflow-x` делает
 * `overflow-y` тоже прокручиваемым, поэтому кольцо фокуса живёт в собственных
 * 4 px отступа, снятых отрицательным полем, — геометрия ряда от этого не
 * меняется.
 */
export function FilterChips({
  name,
  dataPrefix = 'filter-chips',
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string; icon?: ReactNode }[];
  onChange: (value: string) => void;
  /**
   * The prefix of the `data-*` hooks (`data-<prefix>-filter`, …). The pieces
   * list keeps `piece`, which its tests and review scenes read.
   */
  dataPrefix?: string;
}) {
  return (
    <div
      {...{ [`data-${dataPrefix}-filter`]: name }}
      className="flex min-w-0 flex-col gap-[4px] table:flex-row table:flex-wrap table:items-center table:gap-[8px]"
    >
      <span className="cf-label-sm text-cf-ink-muted">{label}</span>
      <RadioGroup
        value={value}
        onChange={onChange}
        aria-label={label}
        {...{ [`data-${dataPrefix}-filter-scroller`]: 'true' }}
        className={clsx(
          'flex min-w-0 flex-nowrap items-center gap-[8px] overflow-x-auto',
          '-my-[4px] py-[4px]',
          'table:flex-wrap table:overflow-visible table:my-0 table:py-0'
        )}
      >
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <RadioOption
              key={option.value}
              value={option.value}
              density="dense"
              {...{
                [`data-${dataPrefix}-filter-option`]: `${name}:${option.value}`,
              }}
              className={clsx(
                // Фишка не сжимается: на узкой полосе ряд едет вбок целиком,
                // а не превращается в колонку раздавленных слов.
                'inline-flex flex-none items-center gap-[8px] rounded-full border px-[12px] cf-label-sm',
                'transition-colors duration-state motion-reduce:transition-none',
                chosen
                  ? 'border-cf-accent bg-cf-accent-soft text-cf-accent'
                  : 'border-cf-border-control text-cf-ink hover:bg-cf-surface-subtle'
              )}
            >
              {option.icon}
              {option.label}
            </RadioOption>
          );
        })}
      </RadioGroup>
    </div>
  );
}
