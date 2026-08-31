'use client';

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * Respect a call site that already picked its own bottom margin.
 *
 * Tailwind prints the margin utilities in scale order, so `.mb-4` lands after
 * `.mb-0` in the stylesheet and wins at equal specificity. A column that wants
 * no gap therefore cannot get one by writing `mb-0` beside the default; the
 * default has to be left off instead. The chat column is the case that made
 * this matter: its band carries `border-b`, so the shared `mb-4` opened a 16px
 * gap under the divider that the column never had before the band was
 * extracted.
 */
const ownsBottomMargin = (className: string) =>
  className
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/^!/, ''))
    .some((token) => /^-?m[by]?-/.test(token));

export const OpeningBand: FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={clsx(
      'flex h-16 items-center',
      !ownsBottomMargin(className ?? '') && 'mb-4',
      className
    )}
  >
    {children}
  </div>
);
