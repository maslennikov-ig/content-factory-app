'use client';

import { FC, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

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
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Callers routinely pass an inline arrow. Holding it in a ref keeps the
  // effect keyed on `open` alone — otherwise every parent render would tear the
  // dialog down and set it up again, yanking focus back on each pass.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Remember what had focus so it can be handed back on close.
    restoreTo.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab' || !panel.current) return;

      // Keep Tab inside the dialog while it is open.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreTo.current?.focus?.();
    };
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
          <header className="px-[20px] pt-[18px] pb-[12px] border-b border-cf-border">
            <h2 id={titleId} className="cf-heading-md text-cf-ink">
              {title}
            </h2>
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
export const Popover: FC<{
  children: ReactNode;
  className?: string;
  role?: 'menu' | 'dialog' | 'listbox';
}> = ({ children, className, role = 'menu' }) => (
  <div
    role={role}
    className={clsx(
      'min-w-[180px] rounded-[8px] p-[6px]',
      'bg-cf-surface-raised border border-cf-border shadow-menu',
      className
    )}
  >
    {children}
  </div>
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
      'flex w-full items-center gap-[8px] h-[32px] px-[10px] rounded-[4px]',
      'cf-body-md text-cf-ink text-left transition-colors duration-state',
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
    <span aria-hidden className={clsx('absolute left-0 inset-y-0 w-[3px]', TOAST_BAR[tone])} />
    {title && <p className="cf-label-md text-cf-ink">{title}</p>}
    <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{children}</p>
  </div>
);
