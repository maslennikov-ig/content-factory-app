'use client';

import { FC, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { clsx } from 'clsx';

/**
 * The dense product table: 36px rows, `border` rules, no zebra fill.
 *
 * Numbers and dates are set in the monospaced face and aligned right, so digits
 * line up by column without hand-tuned padding. That is what `numeric` marks —
 * it is not a styling flag, it says the cell holds a measurement.
 */

export const Table: FC<{
  children: ReactNode;
  className?: string;
  /** Description announced instead of leaving the table unlabelled. */
  caption?: ReactNode;
}> = ({ children, className, caption }) => (
  // The wrapper is what scrolls, so a wide table never widens the page.
  <div className="w-full overflow-x-auto">
    <table className={clsx('w-full border-collapse text-left', className)}>
      {caption && <caption className="sr-only">{caption}</caption>}
      {children}
    </table>
  </div>
);

export const Th: FC<
  { numeric?: boolean } & ThHTMLAttributes<HTMLTableCellElement>
> = ({ numeric, className, children, ...rest }) => (
  <th
    scope="col"
    className={clsx(
      'h-[36px] px-[12px] border-b border-cf-border',
      'cf-label-sm text-cf-ink-muted font-[600]',
      numeric && 'text-right',
      className
    )}
    {...rest}
  >
    {children}
  </th>
);

export const Td: FC<
  { numeric?: boolean } & TdHTMLAttributes<HTMLTableCellElement>
> = ({ numeric, className, children, ...rest }) => (
  <td
    className={clsx(
      'h-[36px] px-[12px] border-b border-cf-border text-cf-ink',
      numeric ? 'cf-label-sm text-right tabular-nums' : 'cf-body-md',
      className
    )}
    {...rest}
  >
    {children}
  </td>
);

export const Tr: FC<{
  children: ReactNode;
  selected?: boolean;
  className?: string;
}> = ({ children, selected, className }) => (
  <tr
    aria-selected={selected || undefined}
    className={clsx(
      'transition-colors duration-state hover:bg-cf-surface-subtle',
      selected && 'bg-cf-accent-soft',
      className
    )}
  >
    {children}
  </tr>
);

/**
 * A titled band inside a panel. Panels do not nest — a card inside a card is
 * two borders saying the same thing — so grouping inside a panel is a section
 * and a tonal plate instead.
 */
export const Section: FC<{
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Lifts the band onto `surface-subtle` when it needs to read as nested. */
  tonal?: boolean;
}> = ({ title, children, className, tonal = false }) => (
  <section
    className={clsx(
      'flex flex-col gap-[12px]',
      tonal && 'rounded-[8px] bg-cf-surface-subtle p-[16px]',
      className
    )}
  >
    {title && <h4 className="cf-heading-md text-cf-ink">{title}</h4>}
    {children}
  </section>
);
