'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * The small label above a section or a field group inside a panel.
 *
 * Sentence case (`97dq.74`, thirteenth walk E3/B1). From 22.09 to 24.09.2026
 * this component uppercased its text, ratifying the 99 hand-typed copies of
 * `cf-label-sm uppercase` (audit 97dq.39, A5). The owner read the result as
 * shouting, and `DESIGN.md` now keeps capitals out of product copy entirely;
 * `tests/design.coherence.guard.test.cjs` rejects `uppercase` in product
 * components outside a short allowlist.
 *
 * A section that is a panel takes `Panel title` instead. A heading inside the
 * section never outranks this label — `h3.cf-heading-md` under it reads as the
 * bigger thing and inverts the hierarchy.
 */
export function SectionLabel({
  as: Tag = 'h2',
  id,
  className,
  children,
}: {
  /** The outline level the label holds; `span` when it names a field row. */
  as?: 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'dt';
  id?: string;
  /** Layout only (margins, flex); the type and colour are the component's. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      id={id}
      className={clsx('cf-label-sm text-cf-ink-muted', className)}
    >
      {children}
    </Tag>
  );
}

export default SectionLabel;
