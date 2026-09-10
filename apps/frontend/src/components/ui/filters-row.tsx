'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

/**
 * One toolbar row for list filters.
 *
 * Labels stay in the controls as accessible names rather than taking a second
 * visual row above some controls and not others. The row owns wrapping,
 * spacing and vertical alignment; screens only choose which filters belong in
 * it. A trailing action is pushed to the far edge while there is room and
 * wraps with the rest on a narrow screen.
 */
export function FiltersRow({
  children,
  trailing,
  className,
  ...rest
}: {
  children: ReactNode;
  trailing?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-filters-row="true"
      role="group"
      className={clsx(
        'flex min-w-0 flex-wrap items-center gap-[12px]',
        className
      )}
      {...rest}
    >
      {children}
      {trailing ? (
        <div className="relative ms-auto flex-none">{trailing}</div>
      ) : null}
    </div>
  );
}
