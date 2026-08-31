'use client';

import {
  createContext,
  DetailedHTMLProps,
  forwardRef,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import { ControlButton, ControlButtonProps } from './control.button';
import {
  directionForKey,
  enabledOptionNodes,
  OPTION_ATTRIBUTE,
  resolveTarget,
  useRovingTabStop,
} from './roving';

/**
 * A choice the user has to arrive at before they commit to it.
 *
 * Switching organization reloads the application. A radio group would fire
 * that on every arrow press, because there selection follows focus. In a menu
 * the arrows only move; Enter or Space is the commitment. That is the whole
 * reason this pattern exists next to `RadioGroup`, and it is why anything with
 * an expensive or one-way effect belongs here.
 *
 * `Menu` is state only — it renders no markup. The call site keeps owning
 * where the list sits, how it is dismissed by a click outside, and whether it
 * is a popup at all: `MenuList` works on its own as a permanently open list.
 */

type MenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuId: string;
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
  pendingFocus: MutableRefObject<'first' | 'last' | null>;
};

const MenuContext = createContext<MenuContextValue | null>(null);

export const Menu = ({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) => {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocus = useRef<'first' | 'last' | null>(null);
  const context = useMemo<MenuContextValue>(
    () => ({ open, setOpen: onOpenChange, menuId, triggerRef, pendingFocus }),
    [open, onOpenChange, menuId]
  );

  return <MenuContext.Provider value={context}>{children}</MenuContext.Provider>;
};

export const MenuButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  ({ onClick, onKeyDown, ...props }, forwardedRef) => {
    const menu = useContext(MenuContext);
    if (!menu) {
      throw new Error('MenuButton must be rendered inside a Menu');
    }

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      // detail 0 is a click the keyboard produced. Opening with Enter or Space
      // should land the user on the first item; opening with the pointer
      // should leave the pointer where it is.
      if (!menu.open && event.detail === 0) menu.pendingFocus.current = 'first';
      menu.setOpen(!menu.open);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      menu.pendingFocus.current = event.key === 'ArrowDown' ? 'first' : 'last';
      if (!menu.open) menu.setOpen(true);
    };

    return (
      <ControlButton
        {...props}
        ref={(element) => {
          menu.triggerRef.current = element;
          if (typeof forwardedRef === 'function') forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menu.menuId : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
    );
  }
);

type MenuListProps = Omit<
  DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
  'role'
> & {
  children: ReactNode;
};

export const MenuList = forwardRef<HTMLDivElement, MenuListProps>(
  ({ children, onKeyDown, ...props }, forwardedRef) => {
    const menu = useContext(MenuContext);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useRovingTabStop(
      containerRef,
      (node) => node.getAttribute('aria-checked') === 'true'
    );

    useEffect(() => {
      const pending = menu?.pendingFocus.current;
      if (!pending) return;
      menu!.pendingFocus.current = null;
      const nodes = enabledOptionNodes(containerRef.current);
      const target = pending === 'first' ? nodes[0] : nodes[nodes.length - 1];
      target?.focus();
    }, [menu]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      if (event.key === 'Escape' && menu) {
        event.preventDefault();
        menu.setOpen(false);
        menu.triggerRef.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        menu?.setOpen(false);
        return;
      }

      const direction = directionForKey(event.key, 'vertical');
      if (!direction) return;
      const nodes = enabledOptionNodes(containerRef.current);
      const target = resolveTarget(
        nodes,
        (event.target as Element)?.closest?.(`[${OPTION_ATTRIBUTE}]`) ?? null,
        direction
      );
      if (!target) return;
      event.preventDefault();
      target.focus();
    };

    return (
      <div
        {...props}
        id={props.id ?? menu?.menuId}
        role="menu"
        onKeyDown={handleKeyDown}
        ref={(element) => {
          containerRef.current = element;
          if (typeof forwardedRef === 'function') forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
      >
        {children}
      </div>
    );
  }
);

type MenuOptionProps = Omit<ControlButtonProps, 'role'> & {
  selected: boolean;
  /** Keep the menu open after choosing — rare, and never the default. */
  keepOpen?: boolean;
};

export const MenuOption = forwardRef<HTMLButtonElement, MenuOptionProps>(
  ({ selected, keepOpen, onClick, ...props }, ref) => {
    const menu = useContext(MenuContext);

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (!keepOpen) menu?.setOpen(false);
    };

    return (
      <ControlButton
        {...props}
        {...{ [OPTION_ATTRIBUTE]: '' }}
        ref={ref}
        role="menuitemradio"
        aria-checked={selected}
        tabIndex={selected ? 0 : -1}
        onClick={handleClick}
      />
    );
  }
);
