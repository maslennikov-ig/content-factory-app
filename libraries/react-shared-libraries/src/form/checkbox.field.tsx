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
 * sitting on a dark-theme surface, next to fields the system draws itself.
 *
 * The drawn box *is* the native input, with `appearance: none`. Until
 * 26.09.2026 the input was visually hidden beside a drawn `span`, and a hidden
 * input is a box nobody can aim at: automation refused to press it
 * (`locator.check()` waits for a visible control and timed out on the avatar
 * consent, live walk 25.09.2026, `2q28.36`), and a pointer on the square landed
 * on decoration rather than on the control. Now the square a person sees is the
 * element that takes the click, the Space key and the focus ring, and only the
 * tick and the dash are painted over it — with `pointer-events: none`, so they
 * never stand between the pointer and the control.
 */

/**
 * The shared focus ring, on the box itself.
 *
 * Written out rather than imported from `CONTROL_FOCUS_RING` so the box keeps
 * its own ring offset colour; `tests/checkbox-field.test.cjs` compares the two
 * token for token and fails if the shared ring changes alone.
 */
const BOX_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-cf-focus focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-cf-surface';

/** Order-independent by design: whichever variant Tailwind emits last, the
 * hovered box reads as the same one action in both the empty and filled state. */
const BOX_HOVER = 'group-hover:border-cf-accent-hover';

/** The native input, drawn by the theme in every state it can be in. */
const BOX = [
  'peer relative m-0 block size-[20px] shrink-0 cursor-[inherit] appearance-none',
  'rounded-[4px] border border-cf-border-control bg-cf-surface',
  'transition-colors duration-state',
  'checked:border-cf-accent checked:bg-cf-accent',
  'indeterminate:border-cf-accent indeterminate:bg-cf-accent',
  'disabled:border-cf-border',
].join(' ');

/** The tick and the dash: paint over the box, never a target of their own. */
const MARK_LAYER = [
  'pointer-events-none absolute inset-0 text-cf-accent-ink',
  'peer-checked:[&>svg]:opacity-100 peer-indeterminate:[&>span]:opacity-100',
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
        <span className="relative block size-[20px] shrink-0">
          <input
            {...props}
            ref={attach}
            type="checkbox"
            disabled={disabled}
            className={clsx(BOX, BOX_FOCUS_RING, !disabled && BOX_HOVER)}
          />
          {/*
            Both marks sit in the same place rather than side by side: the box
            is 20px and a checkbox is never checked and indeterminate at once.
            The `viewBox` is the padding box widened by the 1px border on each
            side, so the mark keeps its place over the whole 20px box.
          */}
          <span aria-hidden="true" data-checkbox-mark="" className={MARK_LAYER}>
            <svg
              viewBox="-1 -1 20 20"
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
        </span>
        <span className="cf-body-sm min-w-0 flex-1 break-words text-pretty">
          {label}
        </span>
      </label>
    );
  }
);
