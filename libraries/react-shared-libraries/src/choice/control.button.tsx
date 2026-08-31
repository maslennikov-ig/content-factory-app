'use client';

import { ButtonHTMLAttributes, DetailedHTMLProps, forwardRef } from 'react';
import { clsx } from 'clsx';
import {
  withoutConsumerHeight,
  withoutConsumerHeightStyle,
} from '../form/control-height';

/**
 * A control whose appearance belongs to the surface it sits on.
 *
 * `Button` is the action control: it owns a colour variant, a height and a
 * content wrapper. A choice option, a navigation row or a dismissal surface
 * cannot accept any of that — their look is decided by the panel, the rail or
 * the overlay around them. What they still share is the part that is easy to
 * forget by hand: `type="button"`, a visible focus ring, and a disabled state
 * that reads as disabled.
 *
 * This is the base every primitive in this folder is built on. It is not a
 * general escape hatch from `Button`; reach for it when the call site owns the
 * appearance and the semantics come from the surrounding pattern.
 */

export const CONTROL_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-focus focus-visible:ring-offset-2';

export type ControlButtonProps = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> & {
  /** Product control rhythm; consumers do not own visual height. */
  density?: 'standard' | 'dense' | 'card';
  layout?: 'control' | 'content' | 'card';
  /** Reserve mobile flow space before a composed primitive expands its hit area. */
  mobileTouchTarget?: boolean;
};

export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  (
    {
      className,
      style,
      type,
      density = 'standard',
      layout = 'control',
      mobileTouchTarget = false,
      ...props
    },
    ref
  ) => {
    const reservesMobileTouchTarget =
      mobileTouchTarget && layout === 'control' && density === 'dense';

    return (
      <button
        {...props}
        ref={ref}
        type={type || 'button'}
        style={withoutConsumerHeightStyle(style)}
        className={clsx(
          CONTROL_FOCUS_RING,
          layout === 'content'
            ? 'min-h-[40px]'
            : layout === 'card'
            ? 'h-[152px]'
            : density === 'dense'
            ? 'h-[32px]'
            : density === 'card'
            ? 'h-[128px]'
            : 'h-[40px]',
          reservesMobileTouchTarget && [
            'cf-dense-choice-touch-target before:-inset-y-1.5',
            "relative before:absolute before:inset-x-0 before:content-[''] md:before:inset-y-0",
          ],
          'disabled:cursor-not-allowed disabled:opacity-50',
          withoutConsumerHeight(className)
        )}
      />
    );
  }
);
