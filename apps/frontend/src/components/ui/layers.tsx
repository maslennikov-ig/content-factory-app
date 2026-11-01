'use client';

import { useFocusTrap } from './use-focus-trap';
import { FC, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { MenuCommand } from '@contentfactory/react/choice/choice.menu';
import type { ComponentProps, RefObject } from 'react';
import { autoUpdate, computePosition, flip, offset, shift, size, type Placement, type SizeOptions } from '@floating-ui/dom';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { containsIncludingHints } from '@contentfactory/react/layout/hint-portal';

export function DescribedMenuItem({
  title,
  description,
  className,
  ...props
}: Omit<ComponentProps<typeof MenuCommand>, 'children' | 'title'> & {
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <MenuCommand
      {...props}
      layout="content"
      className={clsx(
        'flex flex-col items-start gap-[4px] rounded-[8px] px-[12px] py-[8px] text-start hover:bg-cf-surface-subtle',
        className
      )}
    >
      <span className="cf-label-md text-cf-ink">{title}</span>
      <span className="cf-caption text-cf-ink-muted">{description}</span>
    </MenuCommand>
  );
}

/**
 * Everything that floats above the content: dialog, popover/menu, toast.
 *
 * All three render through a portal on `document.body`. Rendering them inline
 * is how a menu ends up clipped by the first ancestor with `overflow: hidden`,
 * and the calendar and tables are full of those.
 *
 * These are the only surfaces allowed to carry `overlay-shadow`; an ordinary
 * panel gets a border instead.
 */

const Portal: FC<{ children: ReactNode }> = ({ children }) => {
  // `document` is absent during the server render, so mount is the gate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
};

export const Dialog: FC<{
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}> = ({ open, onClose, title, children, footer, className }) => {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Callers routinely pass an inline arrow. Holding it in a ref keeps the
  // effect keyed on `open` alone — otherwise every parent render would tear the
  // dialog down and set it up again, yanking focus back on each pass.
  const close = useRef(onClose);
  close.current = onClose;

  // Tab stays inside while open; focus goes back on close (shared with the
  // legacy `openModal` shell, `use-focus-trap.ts`).
  useFocusTrap(panel, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-[16px]"
        style={{ background: 'var(--cf-backdrop)' }}
        onClick={onClose}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          // Points at the heading, so the dialog is named even when the title
          // is a node rather than a plain string.
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          className={clsx(
            'w-full max-w-[560px] max-h-full overflow-auto rounded-[12px]',
            'bg-cf-surface-raised border border-cf-border shadow-menu',
            className
          )}
        >
          <header className="flex items-start justify-between gap-[12px] px-[20px] pt-[18px] pb-[12px] border-b border-cf-border">
            <h2 id={titleId} className="min-w-0 cf-heading-md text-cf-ink">
              {title}
            </h2>
            <Button iconOnly density="dense" variant="quiet" aria-label={t('close', 'Close')} onClick={onClose} className="shrink-0">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </Button>
          </header>
          <div className="p-[20px] cf-body-md text-cf-ink">{children}</div>
          {footer && (
            <footer className="flex justify-end gap-[8px] px-[20px] pb-[18px]">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </Portal>
  );
};

/** Popover and dropdown menu share one shell: raised surface, 8px, shadow. */
type PopoverProps = {
  children: ReactNode;
  className?: string;
  role?: 'menu' | 'dialog' | 'listbox';
  anchorRef?: RefObject<HTMLElement | null>;
  onClose?: () => void;
  placement?: Placement;
  ariaLabel?: string;
};

const POPOVER_SURFACE = 'rounded-[8px] p-[6px] bg-cf-surface-raised border border-cf-border shadow-menu';

// Portals opened by controls inside another popover remain part of that layer.
const anchoredPopovers = new Map<HTMLElement, HTMLElement>();
const containsPopoverTree = (root: HTMLElement, target: EventTarget | null, visited = new Set<HTMLElement>()): boolean => {
  if (containsIncludingHints(root, target)) return true;
  if (visited.has(root)) return false;
  visited.add(root);
  for (const [panel, anchor] of anchoredPopovers) {
    if (root.contains(anchor) && containsPopoverTree(panel, target, visited)) return true;
  }
  return false;
};

const AnchoredPopover: FC<PopoverProps> = ({ children, className, role = 'menu', anchorRef, onClose, placement = 'bottom-end', ariaLabel }) => {
  const floating = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [positioned, setPositioned] = useState(false);

  useEffect(() => {
    const anchor = anchorRef?.current;
    const element = floating.current;
    if (!anchor || !element) return;
    let active = true;
    let revision = 0;
    const update = () => {
      const current = ++revision;
      void computePosition(anchor, element, {
        strategy: 'fixed', placement,
        middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 }), size({ padding: 8, apply({ availableWidth, availableHeight, elements }: Parameters<NonNullable<SizeOptions['apply']>>[0]) {
          Object.assign(elements.floating.style, { maxWidth: `${Math.max(0, availableWidth)}px`, maxHeight: `${Math.max(0, availableHeight)}px` });
        } })],
      }).then(({ x, y }) => {
        if (!active || current !== revision) return;
        Object.assign(element.style, { left: `${x}px`, top: `${y}px` });
        setPositioned(true);
      });
    };
    anchoredPopovers.set(element, anchor);
    const cleanup = autoUpdate(anchor, element, update);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containsIncludingHints(anchor, target) && !containsPopoverTree(element, target)) close.current?.();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !Array.from(anchoredPopovers.values()).some((childAnchor) => element.contains(childAnchor))) {
        anchor.focus();
        if (document.activeElement !== anchor) {
          anchor.querySelector<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
        }
        close.current?.();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    return () => {
      active = false;
      anchoredPopovers.delete(element);
      cleanup();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown);
    };
  }, [anchorRef, placement]);

  return <div ref={floating} role={role} aria-label={ariaLabel} style={{ position: 'fixed', top: 0, left: 0, opacity: positioned ? 1 : 0, minWidth: 'min(180px, calc(100vw - 16px))', overflowY: 'auto' }} className={clsx('z-[60]', POPOVER_SURFACE, className)}>{children}</div>;
};

export const Popover: FC<PopoverProps> = ({ anchorRef, ...props }) => anchorRef ? (
  <Portal><AnchoredPopover {...props} anchorRef={anchorRef} /></Portal>
) : (
  <div role={props.role ?? 'menu'} className={clsx('min-w-[180px]', POPOVER_SURFACE, props.className)}>{props.children}</div>
);

export const MenuItem: FC<{
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ children, onClick, disabled, className }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className={clsx(
      'flex w-full h-fit min-h-[32px] items-center gap-[8px] px-[10px] py-[4px] rounded-[4px]',
      'cf-body-md text-cf-ink text-left [overflow-wrap:anywhere] transition-colors duration-state',
      'hover:bg-cf-surface-subtle disabled:opacity-55 disabled:cursor-not-allowed',
      className
    )}
  >
    {children}
  </button>
);

export type ToastTone = 'accent' | 'info' | 'warning' | 'danger';

const TOAST_BAR: Record<ToastTone, string> = {
  accent: 'bg-cf-accent',
  info: 'bg-cf-info',
  warning: 'bg-cf-warning',
  danger: 'bg-cf-danger',
};

/** The role shows as a 3px bar on the leading edge, plus its own words. */
export const Toast: FC<{
  children: ReactNode;
  tone?: ToastTone;
  title?: ReactNode;
  className?: string;
}> = ({ children, tone = 'accent', title, className }) => (
  <div
    role="status"
    aria-live="polite"
    className={clsx(
      'relative flex flex-col gap-[2px] overflow-hidden rounded-[8px]',
      'bg-cf-surface-raised border border-cf-border shadow-menu',
      'py-[12px] pl-[16px] pr-[14px] max-w-[420px]',
      className
    )}
  >
    <span
      aria-hidden
      className={clsx('absolute left-0 inset-y-0 w-[3px]', TOAST_BAR[tone])}
    />
    {title && <p className="cf-label-md text-cf-ink">{title}</p>}
    <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
      {children}
    </p>
  </div>
);
