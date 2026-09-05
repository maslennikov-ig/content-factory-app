'use client';

import { FC, useMemo, useState } from 'react';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useClickOutside } from '@mantine/hooks';
import { RepeatIcon, DropdownArrowIcon } from '@contentfactory/frontend/components/ui/icons';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuOption,
} from '@contentfactory/react/choice/choice.menu';
const getList = (t: (key: string, fallback: string) => string) => [
  {
    value: 1,
    label: t('day', 'Day'),
  },
  {
    value: 2,
    label: t('two_days', 'Two Days'),
  },
  {
    value: 3,
    label: t('three_days', 'Three Days'),
  },
  {
    value: 4,
    label: t('four_days', 'Four Days'),
  },
  {
    value: 5,
    label: t('five_days', 'Five Days'),
  },
  {
    value: 6,
    label: t('six_days', 'Six Days'),
  },
  {
    value: 7,
    label: t('week', 'Week'),
  },
  {
    value: 14,
    label: t('two_weeks', 'Two Weeks'),
  },
  {
    value: 30,
    label: t('month', 'Month'),
  },
  {
    // «Не повторять» — это выбор, а не отказ от диалога. Раньше здесь стояло
    // «Отмена», и пункт читался как «закрыть список», хотя он снимает повтор
    // (`content-factory-next-fn33.76`).
    value: null,
    label: t('repeat_post_none_option', 'Do not repeat'),
  },
];
export const RepeatComponent: FC<{
  repeat: number | null;
  /**
   * Выключен, когда окно поста открыто на чтение
   * (`content-factory-next-fn33.90.10`). Выключенная кнопка не открывает
   * список: выбрать было бы можно, а сохранить — нет.
   */
  disabled?: boolean;
  onChange: (newVal: number) => void;
}> = (props) => {
  const { repeat, disabled } = props;
  const t = useT();
  const list = getList(t);
  const [isOpen, setIsOpen] = useState(false);

  const ref = useClickOutside(() => {
    if (!isOpen) {
      return;
    }
    setIsOpen(false);
  });

  const everyLabel = useMemo(() => {
    if (!repeat) {
      return '';
    }
    return list.find((p) => p.value === repeat)?.label;
  }, [repeat, list]);

  return (
    <div ref={ref} className="relative flex select-none items-center">
      <Menu open={isOpen} onOpenChange={setIsOpen}>
        <MenuButton
          disabled={disabled}
          className="flex items-center gap-[8px] rounded-[8px] border border-cf-border-control bg-cf-surface px-[12px] cf-label-md text-cf-ink hover:bg-cf-surface-subtle"
        >
          <RepeatIcon />
          {/*
            Подпись кнопки выбора, а не пустое поле.

            «Повторять публикацию каждые…» с многоточием и без значения
            читалось как незаполненный ввод — человек ждал, что туда пишут
            (`content-factory-next-fn33.76`). Теперь кнопка называет предмет
            выбора и текущий ответ: «Повтор: не повторять» или «Повтор:
            Неделя».
          */}
          <span>
            {`${t('repeat_post_button', 'Repeat')}: ${
              repeat
                ? everyLabel
                : t('repeat_post_none', 'do not repeat')
            }`}
          </span>
          <DropdownArrowIcon size={12} rotated={isOpen} />
        </MenuButton>
        {isOpen && !disabled && (
          <MenuList
            aria-label={t('repeat_post_every', 'Repeat Post Every...')}
            style={{ boxShadow: 'var(--cf-overlay-shadow)' }}
            className="absolute bottom-[100%] start-0 z-[300] mb-[8px] flex w-[240px] flex-col rounded-[8px] border border-cf-border-strong bg-cf-surface-raised p-[8px]"
          >
            {list.map((p) => (
              <MenuOption
                key={p.label}
                layout="content"
                selected={repeat === p.value}
                onClick={() => props.onChange(Number(p.value))}
                className="flex items-center rounded-[8px] px-[8px] text-start cf-body-sm text-cf-ink hover:bg-cf-surface-subtle"
              >
                {p.label}
              </MenuOption>
            ))}
          </MenuList>
        )}
      </Menu>
    </div>
  );
};
