'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * The small label above a section or a field group inside a panel.
 *
 * `cf-label-sm uppercase text-cf-ink-muted` was retyped 99 times in 33 files
 * by 22.09.2026 (audit 97dq.39, A5), while the authoring rule still said
 * uppercase belonged only inside a marker frame. Practice won, so the rule
 * now names this component, and `tests/design.coherence.guard.test.cjs`
 * counts the hand-typed copies per file: the number only goes down.
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
      className={clsx('cf-label-sm uppercase text-cf-ink-muted', className)}
    >
      {children}
    </Tag>
  );
}

export default SectionLabel;
