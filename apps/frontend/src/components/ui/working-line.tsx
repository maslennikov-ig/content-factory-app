'use client';

import { ComponentPropsWithoutRef } from 'react';
import { clsx } from 'clsx';
import { Progress } from './progress';

/**
 * The width of a working track, owned in one place.
 *
 * The intake screen typed `w-[80px]` beside its `Progress`, the media library
 * typed `w-[32px]`, and on 13.09.2026 the owner photographed the result: a bar
 * stretched to the right edge of the window with the word for what was
 * happening pushed off the screen beside it. A track that says "something is
 * running" carries no measurement, so its width is not a layout decision the
 * call site gets to retype — it is one number, and this is it. The caption
 * takes whatever is left and truncates, which is why the bar can no longer be
 * squeezed out of the row.
 */
const TRACK = 'w-[96px] shrink-0';

export type WorkingLineProps = Readonly<{
  /**
   * What is happening, already localized. It names the progress bar for
   * assistive technology and is the visible caption beside it.
   */
  label: string;
}> &
  Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'aria-live'>;

/**
 * Work in progress, as one row: a track of fixed width and a caption.
 *
 * `Progress` on its own answers "how far"; this answers "what is running", and
 * it is the shape every screen was building by hand around an indeterminate
 * bar. The row announces itself politely, so a changed caption is heard rather
 * than only seen, and the caption truncates instead of wrapping — a second line
 * under a button row moves everything below it while the work is running.
 */
export function WorkingLine({ label, className, ...rest }: WorkingLineProps) {
  return (
    <div
      {...rest}
      aria-live="polite"
      data-working-line=""
      className={clsx('flex min-w-0 items-center gap-[8px]', className)}
    >
      <Progress mode="indeterminate" label={label} className={TRACK} />
      <span
        title={label}
        className="cf-body-sm min-w-0 truncate text-cf-ink-muted"
      >
        {label}
      </span>
    </div>
  );
}
