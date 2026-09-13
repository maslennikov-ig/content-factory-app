'use client';

import {
  DetailedHTMLProps,
  InputHTMLAttributes,
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
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
 *
 * The box is drawn rather than painted with `accent-color`. That shortcut is
 * what the owner saw on 13.09.2026 and read as a foreign control: `accent-color`
 * only reaches the *filled* state, so an unchecked box stayed the browser's own
 * white square with the browser's own border and radius — a light-theme control
 * sitting on a dark-theme surface, next to fields the system draws itself. The
 * native input stays for semantics and keyboard; it is visually hidden and the
 * sibling `span` carries the appearance through `peer-*`, so checked,
 * indeterminate, hover, focus and disabled are all states of one element that
 * the theme actually owns.
 */

/**
 * The shared focus ring, moved onto the drawn box.
 *
 * It is written out instead of derived from `CONTROL_FOCUS_RING` because
 * Tailwind only generates the classes it can read literally in the source; a
 * string built at runtime produces markup with no CSS behind it. The two are
 * kept in step by `tests/checkbox-field.test.cjs`, which compares them
 * token for token and fails if the shared ring changes alone.
 */
const BOX_FOCUS_RING =
  'peer-focus-visible:outline-none peer-focus-visible:ring-2 ' +
  'peer-focus-visible:ring-cf-focus peer-focus-visible:ring-offset-2 ' +
  'peer-focus-visible:ring-offset-cf-surface';

/** Order-independent by design: whichever variant Tailwind emits last, the
 * hovered box reads as the same one action in both the empty and filled state. */
const BOX_HOVER = 'group-hover:border-cf-accent-hover';

const BOX = [
  'relative block size-[20px] shrink-0',
  'rounded-[4px] border border-cf-border-control bg-cf-surface',
  'text-cf-accent-ink transition-colors duration-state',
  // Filled: the mark and the dash are children, so the peer reaches them
  // through the box rather than as siblings of the input.
  'peer-checked:border-cf-accent peer-checked:bg-cf-accent',
  'peer-checked:[&>svg]:opacity-100',
  'peer-indeterminate:border-cf-accent peer-indeterminate:bg-cf-accent',
  'peer-indeterminate:[&>span]:opacity-100',
  'peer-disabled:border-cf-border',
].join(' ');

export type CheckboxFieldProps = Omit<
  DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>,
  'type'
> & {
  /** The text beside the box. Clicking it toggles the control. */
  label: ReactNode;
  /**
   * Neither on nor off: some of what this box stands for is selected. It is a
   * DOM property rather than an attribute, so it is set on the element.
   */
  indeterminate?: boolean;
  /** Classes for the row, not the box; the box owns its own geometry. */
  className?: string;
};

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ className, label, disabled, indeterminate = false, ...props }, ref) => {
    const input = useRef<HTMLInputElement | null>(null);

    const attach = useCallback(
      (node: HTMLInputElement | null) => {
        input.current = node;
        if (node) node.indeterminate = indeterminate;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref, indeterminate]
    );

    // Re-rendering with the same node does not run the callback ref again, so
    // a later change of the flag is applied here.
    useEffect(() => {
      if (input.current) input.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <label
        className={clsx(
          'group flex min-h-[44px] min-w-0 items-start gap-[12px] rounded-[8px] py-[12px] text-cf-ink transition-colors duration-state',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer hover:bg-cf-surface-subtle active:bg-cf-surface-subtle',
          className
        )}
      >
        <input
          {...props}
          ref={attach}
          type="checkbox"
          disabled={disabled}
          className="peer sr-only"
        />
        <span aria-hidden="true" className={clsx(BOX, BOX_FOCUS_RING, !disabled && BOX_HOVER)}>
          {/*
            Both marks sit in the same place rather than side by side: the box
            is 20px and a checkbox is never checked and indeterminate at once.
            The `viewBox` matches the padding box, so the mark keeps its
            proportions without a second hand-computed offset.
          */}
          <svg
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-state"
          >
            <path d="M4 9.4 7.3 12.6 14 5.4" />
          </svg>
          <span className="absolute left-1/2 top-1/2 h-[4px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-cf-accent-ink opacity-0 transition-opacity duration-state" />
        </span>
        <span className="cf-body-sm min-w-0 flex-1 break-words text-pretty">
          {label}
        </span>
      </label>
    );
  }
);
