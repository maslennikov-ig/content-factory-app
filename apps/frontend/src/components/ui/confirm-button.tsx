'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Button,
  type ButtonDensity,
} from '@contentfactory/react/form/button';

/**
 * An irreversible action confirmed by a second press (`97dq.39`, rule «Armed
 * confirm»).
 *
 * The product had four confirmation models for four irreversible actions — an
 * armed button on the piece, none at all on an adaptation, an inline strip on
 * the avatar and a SweetAlert in the post window. This is the one the owner
 * already accepted on the piece (`PieceDeleteButton`, `97dq.30`), made
 * general: the first press arms the button — it turns destructive and asks
 * «Удалить насовсем?» — and the second press does it. Losing focus, Escape or
 * four quiet seconds disarm it, so a stray first press costs nothing.
 *
 * Two things the piece button did not do, and every new caller gets:
 *
 * - the width does not jump. Both labels are laid in one grid cell and the
 *   inactive one is `invisible`, so the button is as wide as the longer of the
 *   two in both states and the row beside it stays put (rule «Busy buttons keep
 *   width»). `visibility: hidden` also keeps the inactive label out of the
 *   accessible name;
 * - arming is announced. The label changes under the focus, and a screen
 *   reader does not re-read a focused button's name, so the armed question is
 *   said once more through a polite live region.
 *
 * Words come from the caller's copy file; the button knows no language.
 */

export const CONFIRM_ARMED_MS = 4_000;

export type ConfirmButtonProps = {
  /** Resting label: «Удалить», «Удалить адаптацию». */
  label: string;
  /** Armed label, a question: «Удалить насовсем?». */
  armedLabel: string;
  /** Runs on the second press only. */
  onConfirm: () => void;
  disabled?: boolean;
  /** The action is running: the shared Button spinner, width kept. */
  loading?: boolean;
  /** What is happening while `loading`, for a screen reader. */
  loadingLabel?: string;
  /** Resting paint. Armed is always `destructive`. */
  variant?: 'quiet' | 'secondary';
  density?: ButtonDensity;
  /** How long the armed state waits for the second press. */
  armedMs?: number;
  className?: string;
  /** Called whenever the armed state changes, e.g. to hide neighbours. */
  onArmedChange?: (armed: boolean) => void;
} & Record<`data-${string}`, string | undefined>;

export function ConfirmButton({
  label,
  armedLabel,
  onConfirm,
  disabled = false,
  loading = false,
  loadingLabel,
  variant = 'quiet',
  density = 'dense',
  armedMs = CONFIRM_ARMED_MS,
  className,
  onArmedChange,
  ...rest
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useRef(onArmedChange);
  notify.current = onArmedChange;
  const mounted = useRef(false);

  useEffect(() => {
    // Report changes, not the first render: nothing was armed or disarmed.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    notify.current?.(armed);
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), armedMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed, armedMs]);

  // A button that became disabled or busy while armed must not stay armed:
  // the next enabled press would otherwise confirm at once.
  useEffect(() => {
    if (disabled || loading) setArmed(false);
  }, [disabled, loading]);

  return (
    <>
      <Button
        {...rest}
        type="button"
        variant={armed ? 'destructive' : variant}
        density={density}
        className={clsx('shrink-0', className)}
        disabled={disabled}
        loading={loading}
        loadingLabel={loadingLabel}
        data-confirm-armed={armed ? 'true' : 'false'}
        onBlur={() => setArmed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && armed) {
            event.stopPropagation();
            setArmed(false);
          }
        }}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          onConfirm();
        }}
      >
        <span className="grid">
          <span
            className={clsx('[grid-area:1/1]', armed && 'invisible')}
            aria-hidden={armed || undefined}
          >
            {label}
          </span>
          <span
            className={clsx('[grid-area:1/1]', !armed && 'invisible')}
            aria-hidden={!armed || undefined}
          >
            {armedLabel}
          </span>
        </span>
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {armed ? armedLabel : ''}
      </span>
    </>
  );
}

export default ConfirmButton;
