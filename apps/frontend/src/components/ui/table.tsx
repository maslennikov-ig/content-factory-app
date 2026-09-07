'use client';

import {
  FC,
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
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
  {
    numeric?: boolean;
    /**
     * The header row as a tonal band: `surface-subtle` behind it and the
     * stronger rule under it, so a long table keeps its column names when the
     * body scrolls past them. It is a prop rather than two classes at the call
     * site because a `bg-*` and a `border-*` handed in from outside land at the
     * same specificity as the defaults here, and which of the pair wins is
     * decided by the order Tailwind happens to emit them in.
     */
    banded?: boolean;
  } & ThHTMLAttributes<HTMLTableCellElement>
> = ({ numeric, banded, className, children, ...rest }) => (
  <th
    scope="col"
    className={clsx(
      'h-[36px] px-[12px] border-b',
      banded
        ? 'bg-cf-surface-subtle border-cf-border-strong'
        : 'border-cf-border',
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

export const Tr: FC<
  {
    children: ReactNode;
    selected?: boolean;
  } & HTMLAttributes<HTMLTableRowElement>
> = ({ children, selected, className, ...rest }) => (
  <tr
    aria-selected={selected || undefined}
    className={clsx(
      'transition-colors duration-state hover:bg-cf-surface-subtle',
      selected && 'bg-cf-accent-soft',
      className
    )}
    {...rest}
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
