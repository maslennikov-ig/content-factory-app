'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Menu,
  MenuButton,
  MenuList,
} from '@contentfactory/react/choice/choice.menu';
import {
  Button,
  buttonClassName,
  type ButtonDensity,
} from '@contentfactory/react/form/button';
import { DescribedMenuItem } from './layers';
import { containsIncludingHints } from '@contentfactory/react/layout/hint-portal';

/**
 * The one chevron every dropdown in a split button draws (`97dq.60`).
 *
 * 14px, a 1.5px round stroke on the system's 16px grid, `currentColor` —
 * so it follows the plate it sits on: accent ink on the primary plate, ink on
 * the secondary one, muted when the plate is off. Before this the schedule
 * bar and the post window each drew the old filled 6×4 triangle, which read
 * as a speck next to a 14px label.
 */
export const MENU_CHEVRON_SIZE = 14;

export function MenuChevron({ className }: { className?: string }) {
  return (
    <svg
      width={MENU_CHEVRON_SIZE}
      height={MENU_CHEVRON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-menu-chevron="true"
      className={clsx('shrink-0', className)}
    >
      <path d="M4.5 6.5 8 10l3.5-3.5" />
    </svg>
  );
}

export type SplitButtonItem = {
  id: string;
  title: ReactNode;
  description: ReactNode;
  onSelect: () => void;
};

export type SplitButtonProps = {
  /** The label of the main half — the action a plain press runs. */
  children: ReactNode;
  onClick: () => void;
  /** The commands behind the chevron, in the order they are read. */
  items: readonly SplitButtonItem[];
  /** Accessible name of the chevron half, which has no words of its own. */
  menuLabel: string;
  variant?: 'primary' | 'secondary';
  density?: ButtonDensity;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** Where the list opens: footers open it upwards. */
  placement?: 'above' | 'below';
  align?: 'start' | 'end';
  /** Classes for the main half only, e.g. a minimum width. */
  actionClassName?: string;
  /** Classes for the outer plate: layout in the row that holds it. */
  className?: string;
  'aria-describedby'?: string;
  /** Test and stand hooks on the main half, e.g. `data-schedule-action`. */
  actionData?: Record<`data-${string}`, string>;
  /** `data-split-button` on the plate. */
  dataName?: string;
};

/**
 * One plate, a divider, a chevron — the split button of the whole product
 * (`97dq.60`, variant A of the twelfth-wave canvas).
 *
 * The owner looked at the schedule bar's «Запланировать» and saw a button
 * with its left corners cut square and a triangle floating 60px away from
 * the label (canvas shot B4): two controls glued together by accident rather
 * than one control with a menu. Here it is one plate with one radius on the
 * outside; inside, a hairline in the plate's own ink at 35% separates the
 * part that runs the action from the part that opens the others. On the
 * secondary plate the hairline is the control border, the same colour as the
 * outline.
 *
 * Two real buttons under the paint, and that is not negotiable: the main half
 * runs the action on a press, the chevron half is a `MenuButton` that
 * announces a menu and opens it with the keyboard. The menu is the shared
 * `Menu`/`MenuList`/`DescribedMenuItem` family, so arrows, Escape, Tab and the
 * return of focus are the primitive's and not this file's. A press outside
 * closes it, which is the one thing `Menu` leaves to its caller.
 */
export function SplitButton({
  children,
  onClick,
  items,
  menuLabel,
  variant = 'primary',
  density = 'standard',
  disabled = false,
  loading = false,
  loadingLabel,
  placement = 'above',
  align = 'end',
  actionClassName,
  className,
  'aria-describedby': describedBy,
  actionData,
  dataName,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | MouseEvent) => {
      if (!containsIncludingHints(root.current, event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  const off = disabled || loading;

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <div
        ref={root}
        data-split-button={dataName ?? 'true'}
        className={clsx('relative inline-flex min-w-0', className)}
      >
        <Button
          {...actionData}
          type="button"
          variant={variant}
          density={density}
          disabled={disabled}
          loading={loading}
          loadingLabel={loadingLabel}
          aria-describedby={describedBy}
          onClick={onClick}
          className={clsx(
            'rounded-s-[8px] rounded-e-none border-e-0',
            actionClassName
          )}
        >
          {children}
        </Button>
        <MenuButton
          aria-label={menuLabel}
          aria-describedby={describedBy}
          disabled={off}
          density={density === 'dense' ? 'dense' : 'standard'}
          data-split-button-menu="true"
          className={buttonClassName({
            variant,
            density,
            className: clsx(
              'rounded-s-none rounded-e-[8px] border-s-0',
              density === 'dense' ? 'px-[8px]' : 'px-[12px]'
            ),
          })}
        >
          <span
            aria-hidden="true"
            data-split-button-divider="true"
            className={clsx(
              'pointer-events-none absolute inset-y-0 start-0 w-px',
              variant === 'primary'
                ? 'bg-current opacity-[.35]'
                : 'bg-cf-border-control'
            )}
          />
          <MenuChevron
            className={clsx(
              'transition-transform duration-state motion-reduce:transition-none',
              open && 'rotate-180'
            )}
          />
        </MenuButton>
        {open ? (
          <MenuList
            aria-label={menuLabel}
            className={clsx(
              'absolute z-[300] flex w-[288px] max-w-[calc(100vw-32px)] flex-col gap-[4px]',
              'rounded-[8px] border border-cf-border bg-cf-surface-raised p-[4px] shadow-menu',
              placement === 'above'
                ? 'bottom-[calc(100%+8px)]'
                : 'top-[calc(100%+4px)]',
              align === 'end' ? 'end-0' : 'start-0'
            )}
          >
            {items.map((item) => (
              <DescribedMenuItem
                key={item.id}
                data-split-item={item.id}
                title={item.title}
                description={item.description}
                onClick={item.onSelect}
              />
            ))}
          </MenuList>
        ) : null}
      </div>
    </Menu>
  );
}

export default SplitButton;
