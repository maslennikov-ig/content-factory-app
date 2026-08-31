'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

/**
 * One handle on a track, and the reason it is a native `input`.
 *
 * The whole keyboard contract of a slider — arrows, Home, End, the Page keys,
 * the value and its bounds announced as they change, the role, the orientation
 * — is a thing every browser already implements correctly. A `div` carrying
 * `role="slider"` is how a control comes out looking right and answering to
 * nothing, and this repository has the scar: `tests/choice-control.contract`
 * exists because the previous generation of choice controls spelled the roles
 * out by hand and shipped without the keys behind them.
 *
 * What this adds to the native element is the part that is easy to get wrong by
 * hand and must not differ between two call sites: the thumb's appearance, its
 * hit area, and a focus ring that is visible in both themes.
 *
 * The track is deliberately transparent and the input's own box has no
 * background. A range on its own is rare; what a product actually shows is a
 * measured bar, a corridor, a filled progress — drawn by the caller behind the
 * handle. `RangePair` is the composition that puts two of these on one track,
 * and it is a separate module because a control definition renders one native
 * element and no more.
 */

export type RangeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
> & {
  /** Required: a handle with no name announces a number and nothing else. */
  'aria-label': string;
};

/**
 * `pointer-events` is what lets two of these share one track.
 *
 * The input box spans the whole width, so two of them stacked would leave the
 * upper one taking every press including the ones meant for its neighbour's
 * handle. Transparent to the pointer everywhere except the thumb, both handles
 * stay reachable and the track underneath stays clickable.
 *
 * The thumb is 24px square because that is the floor WCAG 2.5.8 puts under a
 * pointer target, and a handle is the only part of a slider anybody presses.
 * The input fills its container's height rather than the painted bar's, so the
 * caller decides how tall the pressable band is — 44px where a finger is the
 * pointer — while the bar underneath stays as thin as the design wants it.
 */
const THUMB = [
  'pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-focus focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:h-[24px] [&::-webkit-slider-thumb]:w-[24px]',
  '[&::-webkit-slider-thumb]:rounded-full',
  // `border-solid` in full, because Tailwind's preflight sets the default
  // border style on elements and a UA pseudo-element is not one: `border`
  // alone gave the thumb a 1px border of no style, which paints nothing. The
  // handle came out as a hole cut in the bar.
  '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-solid',
  '[&::-webkit-slider-thumb]:border-cf-accent',
  '[&::-webkit-slider-thumb]:bg-cf-surface [&::-webkit-slider-thumb]:cursor-ew-resize',
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none',
  '[&::-moz-range-thumb]:h-[24px] [&::-moz-range-thumb]:w-[24px]',
  '[&::-moz-range-thumb]:rounded-full',
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-solid',
  '[&::-moz-range-thumb]:border-cf-accent [&::-moz-range-thumb]:bg-cf-surface',
  '[&::-moz-range-thumb]:cursor-ew-resize',
  '[&::-webkit-slider-runnable-track]:bg-transparent',
  '[&::-moz-range-track]:bg-transparent',
].join(' ');

export const Range = forwardRef<HTMLInputElement, RangeProps>(
  ({ className, ...props }, ref) => (
    <input {...props} ref={ref} type="range" className={clsx(THUMB, className)} />
  )
);

Range.displayName = 'Range';

export default Range;
