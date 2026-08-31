'use client';

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * Switch. On is an `accent` fill; off is `surface-subtle` inside a
 * `border-control` outline, so the off state is still a visible control rather
 * than a faint ghost.
 *
 * The whole label switches, not only the track: a 34px target is below the
 * touch floor, and a caption that does nothing when tapped reads as broken.
 * `role="switch"` with `aria-checked` is what makes it announce as on or off
 * rather than as a button whose state the reader has to infer from the paint.
 */
export const Toggle: FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}> = ({ checked, onChange, label, disabled, className }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={clsx(
      'inline-flex items-center gap-[10px] cf-body-md text-cf-ink',
      'disabled:opacity-55 disabled:cursor-not-allowed',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
      className
    )}
  >
    <span
      aria-hidden
      className={clsx(
        'relative h-[20px] w-[34px] shrink-0 rounded-full border transition-colors duration-state',
        checked
          ? 'bg-cf-accent border-cf-accent'
          : 'bg-cf-surface-subtle border-cf-border-control'
      )}
    >
      <span
        className={clsx(
          'absolute top-[2px] h-[14px] w-[14px] rounded-full transition-[left] duration-state',
          checked ? 'left-[16px] bg-cf-accent-ink' : 'left-[2px] bg-cf-ink-muted'
        )}
      />
    </span>
    <span>{label}</span>
  </button>
);
