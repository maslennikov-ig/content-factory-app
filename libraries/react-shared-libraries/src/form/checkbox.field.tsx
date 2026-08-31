'use client';

import {
  DetailedHTMLProps,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { clsx } from 'clsx';
import { CONTROL_FOCUS_RING } from '../choice/control.button';

/**
 * A checkbox with its own label, built on the native control.
 *
 * The older `Checkbox` in this folder is an upstream `div` with an `onClick`
 * and two legacy colour names. It is not keyboard-operable as a checkbox, it
 * carries no checked state any assistive technology can read, and its colours
 * are not in the desert-lab system — so nothing new should be built on it, and
 * it stays only for the call sites that already use it.
 *
 * What was about to happen instead was worse: the registration form hand-rolled
 * a third pattern, which is how a design system acquires three checkboxes and no
 * checkbox. The parts that are easy to get wrong by hand live here — the 44px
 * target that covers the label as well as the box, the shared focus ring, and a
 * disabled state that reads as disabled on both halves.
 */

export type CheckboxFieldProps = Omit<
  DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>,
  'type'
> & {
  /** The text beside the box. Clicking it toggles the control. */
  label: ReactNode;
  /** Classes for the row, not the box; the box owns its own geometry. */
  className?: string;
};

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ className, label, disabled, ...props }, ref) => (
    <label
      className={clsx(
        'flex min-h-[44px] min-w-0 items-start gap-[12px] rounded-[8px] py-[12px] text-cf-ink transition-colors duration-state',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:bg-cf-surface-subtle active:bg-cf-surface-subtle',
        className
      )}
    >
      <input
        {...props}
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className={clsx(
          'size-[20px] shrink-0 accent-cf-accent',
          CONTROL_FOCUS_RING,
          'focus-visible:ring-offset-cf-surface'
        )}
      />
      <span className="cf-body-sm min-w-0 flex-1 break-words text-pretty">
        {label}
      </span>
    </label>
  )
);
