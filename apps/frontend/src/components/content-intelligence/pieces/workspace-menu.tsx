'use client';

import { useRef, useState, type ReactNode } from 'react';
import {
  Menu,
  MenuButton,
  MenuList,
} from '@contentfactory/react/choice/choice.menu';
import { DescribedMenuItem, Popover } from '../../ui/layers';

/**
 * Всплывающий список команд рабочего места заготовки.
 *
 * Два места на одной странице — «Ещё канал» у вкладок и стрелка рядом с
 * «Запланировать» в подвале — и одна поверхность на оба: `Popover` слоёв
 * (приподнятая, с рамкой и тенью слоя), закрытие по нажатию вне списка.
 * Второй экземпляр той же геометрии в соседнем файле был бы тем самым
 * третьим видом меню, который нашла сквозная проверка (`97dq.39`, A2).
 *
 * Оболочка `Popover` несёт роль диалога-всплывашки, а список внутри — роль
 * меню: кнопка ссылается на список (`aria-controls`), и стрелки ходят по
 * пунктам списка, а не по оболочке.
 *
 * Клавиатура, Escape и роль — у `Menu`/`MenuList`/`MenuCommand`; здесь только
 * место списка и то, чем он закрывается.
 */
export type WorkspaceMenuItem = {
  id: string;
  title: string;
  description: string;
  disabled?: boolean;
  onSelect: () => void;
};

export function WorkspaceMenu({
  label,
  trigger,
  triggerClassName,
  items,
  placement = 'below',
  align = 'start',
  disabled = false,
  density = 'standard',
  dataName,
}: {
  /** Доступное имя кнопки, когда на ней нет слов. */
  label?: string;
  trigger: ReactNode;
  triggerClassName: string;
  items: readonly WorkspaceMenuItem[];
  placement?: 'below' | 'above';
  align?: 'start' | 'end';
  disabled?: boolean;
  /** Высота кнопки: плотная — рядом с плотными кнопками (`2q28.39`). */
  density?: 'standard' | 'dense';
  /** Метка для тестов и стенда: `data-workspace-menu`. */
  dataName: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <div
        className="relative inline-flex"
        data-workspace-menu={dataName}
      >
        <MenuButton
          ref={anchor}
          aria-label={label}
          disabled={disabled}
          density={density}
          className={triggerClassName}
        >
          {trigger}
        </MenuButton>
        {open ? (
          <Popover
            role="dialog"
            anchorRef={anchor}
            onClose={() => setOpen(false)}
            placement={`${placement === 'below' ? 'bottom' : 'top'}-${align}`}
            className="w-[288px]"
          >
            <MenuList
              aria-label={label}
              className="flex flex-col gap-[4px]"
            >
              {items.map((item) => (
                <DescribedMenuItem
                  key={item.id}
                  data-workspace-menu-item={item.id}
                  title={item.title}
                  description={item.description}
                  disabled={item.disabled}
                  onClick={item.onSelect}
                />
              ))}
            </MenuList>
          </Popover>
        ) : null}
      </div>
    </Menu>
  );
}

export default WorkspaceMenu;
