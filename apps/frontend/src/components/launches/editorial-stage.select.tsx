'use client';

import { FC, useMemo, useState } from 'react';
import { useClickOutside } from '@mantine/hooks';
import { DropdownArrowIcon } from '@contentfactory/frontend/components/ui/icons';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuOption,
} from '@contentfactory/react/choice/choice.menu';
import {
  EDITORIAL_STAGE_VALUES,
  EditorialStageValue,
  editorialStageCopy,
  resolveEditorialStageLocale,
} from '@contentfactory/frontend/components/launches/editorial-stage.copy';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';

/**
 * The editor's own choice of the four editorial-stage values, plus the fifth
 * choice this field always had before it had a name: unset.
 *
 * A new post no longer starts there — since 04.09.2026 it opens on `PLAN`, the
 * first rung, because opening the editor is already the answer to "has work
 * begun on this". Unset stays a real, selectable option all the same: a post
 * given a stage by mistake needs a way back to "no stage recorded" without
 * being deleted and recreated, and posts written before the stage existed
 * still carry it.
 *
 * Нарисовано тем же примитивом, что тег и повтор рядом
 * (`content-factory-next-fn33.28.12`). До 04.09.2026 это был нативный `select`,
 * и в ряду из трёх контролов одного назначения один рисовала система, а два —
 * продукт: измерено в браузере, у соседей `button` со своим указателем и
 * текстом 13px, здесь `appearance: auto`, браузерная стрелка другой формы и
 * толщины и текст 14px. Рамка, высота, радиус и фон совпадали и раньше —
 * расходилось именно то, что рисует не продукт.
 *
 * Значка слева у соседей есть, а здесь нет, и это осознанно: значка,
 * означающего «этап», в наборе нет, а брать чужой (календарь, часы) значило бы
 * приписать полю смысл даты. Заводить новый — решение дизайна, а не починка
 * этого расхождения.
 */
export const EditorialStageSelect: FC<{
  value: EditorialStageValue | null;
  onChange: (value: EditorialStageValue | null) => void;
  /**
   * Выключен, когда окно поста открыто на чтение
   * (`content-factory-next-fn33.90.10`). Выключенная кнопка не открывает
   * список: выбрать было бы можно, а сохранить — нет.
   */
  disabled?: boolean;
  className?: string;
}> = ({ value, onChange, disabled, className }) => {
  const locale = resolveEditorialStageLocale(useInterfaceLanguage());
  const copy = editorialStageCopy[locale];
  const [isOpen, setIsOpen] = useState(false);

  const ref = useClickOutside(() => {
    if (!isOpen) {
      return;
    }
    setIsOpen(false);
  });

  /**
   * Пятый выбор стоит первым, как и раньше: «этап не записан» — это состояние,
   * из которого поле начинало жить, и путь назад к нему не должен искаться.
   */
  const options = useMemo(
    () => [
      { value: null as EditorialStageValue | null, label: copy.unset },
      ...EDITORIAL_STAGE_VALUES.map((stage) => ({
        value: stage as EditorialStageValue | null,
        label: copy[stage],
      })),
    ],
    [copy]
  );

  const current = options.find((option) => option.value === (value ?? null));

  return (
    <div
      ref={ref}
      className={`relative flex select-none items-center ${className || ''}`}
    >
      <Menu open={isOpen} onOpenChange={setIsOpen}>
        <MenuButton
          name="editorialStage"
          aria-label={copy.fieldLabel}
          data-editorial-stage={value ?? ''}
          disabled={disabled}
          className="flex w-full items-center justify-between gap-[8px] rounded-[8px] border border-cf-border-control bg-cf-surface px-[12px] cf-label-md text-cf-ink hover:bg-cf-surface-subtle"
        >
          <span className="truncate">{current?.label ?? copy.unset}</span>
          <DropdownArrowIcon size={12} rotated={isOpen} />
        </MenuButton>
        {isOpen && !disabled && (
          <MenuList
            aria-label={copy.fieldLabel}
            style={{ boxShadow: 'var(--cf-overlay-shadow)' }}
            className="absolute bottom-[100%] start-0 z-[300] mb-[8px] flex w-[240px] flex-col rounded-[8px] border border-cf-border-strong bg-cf-surface-raised p-[8px]"
          >
            {options.map((option) => (
              <MenuOption
                key={option.value ?? 'unset'}
                layout="content"
                selected={option.value === (value ?? null)}
                data-editorial-stage-option={option.value ?? ''}
                onClick={() => onChange(option.value)}
                className="flex items-center rounded-[8px] px-[8px] text-start cf-body-sm text-cf-ink hover:bg-cf-surface-subtle"
              >
                {option.label}
              </MenuOption>
            ))}
          </MenuList>
        )}
      </Menu>
    </div>
  );
};
