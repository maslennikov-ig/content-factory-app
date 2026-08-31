'use client';

import { type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Range } from './range';

/**
 * Two handles on one track: a span, set by dragging its ends.
 *
 * The pattern turns up wherever a product asks for a range rather than a point
 * — a price filter, a date window, the corridor a measured style habit is
 * allowed to move in. Written by hand each time it comes out subtly different:
 * one copy lets the handles cross and silently swaps them, another clamps the
 * wrong one, a third loses the keyboard entirely.
 *
 * The rule here is that the handle being moved is the one that gives. Clamping
 * the mover against its neighbour keeps a range a range; swapping the two ends
 * under somebody's finger is the interface rewriting what they meant.
 *
 * What it does not own is the look of the track. A range is almost never shown
 * bare — behind it there is a measured bar, a histogram, a mark for the current
 * value — so the decoration arrives as `children` and the caller keeps the
 * geometry. The primitive owns the handles, the bounds and the keys.
 */

export type RangePairProps = {
  /** Data attributes travel to the track, which is the element to hook onto. */
  [key: `data-${string}`]: string | undefined;
  min: number;
  max: number;
  step?: number;
  low: number;
  high: number;
  /** Each handle is named: two sliders called the same thing are one control. */
  lowLabel: string;
  highLabel: string;
  disabled?: boolean;
  onChange: (next: { low: number; high: number }) => void;
  /** The track, drawn by the caller behind the handles. */
  children?: ReactNode;
  className?: string;
};

export function RangePair({
  min,
  max,
  step = 1,
  low,
  high,
  lowLabel,
  highLabel,
  disabled = false,
  onChange,
  children,
  className,
  ...rest
}: RangePairProps) {
  const move = (edge: 'low' | 'high', raw: number) =>
    onChange(
      edge === 'low'
        ? { low: Math.min(raw, high), high }
        : { low, high: Math.max(raw, low) }
    );

  return (
    <div {...rest} className={clsx('relative w-full', className)}>
      {children}
      <Range
        min={min}
        max={max}
        step={step}
        value={low}
        disabled={disabled}
        aria-label={lowLabel}
        onChange={(event) => move('low', Number(event.target.value))}
      />
      <Range
        min={min}
        max={max}
        step={step}
        value={high}
        disabled={disabled}
        aria-label={highLabel}
        onChange={(event) => move('high', Number(event.target.value))}
      />
    </div>
  );
}

export default RangePair;
