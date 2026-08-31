'use client';

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

/** The row's own type, written once so the two branches cannot drift apart. */
const MESSAGE_TYPE = 'text-[12px] min-h-[16px]';

/**
 * The one message row under a field.
 *
 * It is always the same height whether it says anything or not, so a field that
 * starts valid and then fails validation does not shove the rest of the form
 * down the page. That reserved row is the whole reason the row exists as a
 * component rather than as a conditional paragraph per control.
 *
 * An error carries a mark as well as a colour. Colour alone is the one thing
 * the design rules forbid a state to rely on, and the field is where that rule
 * is easiest to break: red text on a beige surface reads as ordinary text to
 * anyone who cannot separate the two.
 */
export const FieldMessage: FC<{
  id: string;
  error?: ReactNode;
  className?: string;
}> = ({ id, error, className }) =>
  error ? (
    <div
      id={id}
      // `alert` and not `status`: a refused value is the reason the reader is
      // still on this field, and it has to interrupt.
      role="alert"
      className={clsx(
        'flex items-start gap-[6px] text-cf-danger',
        MESSAGE_TYPE,
        className
      )}
    >
      <ErrorGlyph />
      <span>{error}</span>
    </div>
  ) : (
    <div
      id={id}
      className={clsx('text-cf-danger', MESSAGE_TYPE, className)}
    >
      &nbsp;
    </div>
  );

const ErrorGlyph: FC = () => (
  <svg
    aria-hidden
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    className="mt-[2px] shrink-0"
  >
    <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M8 5v3.6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <circle cx="8" cy="11.2" r="0.9" fill="currentColor" />
  </svg>
);
