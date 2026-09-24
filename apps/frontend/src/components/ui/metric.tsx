'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';
import { FieldLabel } from './field-label';

/**
 * One measured number with its name, its «?» and an optional note.
 *
 * `cf-display-num` is the measured number (`DESIGN.md`, «display-num»), one
 * per card, next to a `cf-label-md` name. Производство, Аудитория and «План
 * впереди» each drew this card themselves, and Аудитория drew the number in
 * `cf-heading-lg` (`content-factory-next-97dq.76`, audit §6.3).
 *
 * `subtle` is the card inside another card (Аудитория's metrics sit on its
 * channel panel); a card on the page canvas is `surface`.
 */
export function Metric({
  label,
  value,
  hint,
  hintLabel,
  note,
  headingLevel = 4,
  tone = 'surface',
  className,
  ...data
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  hintLabel?: string;
  note?: ReactNode;
  headingLevel?: 3 | 4 | 5;
  tone?: 'surface' | 'subtle';
  className?: string;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <article
      {...data}
      className={clsx(
        'flex min-w-0 flex-col gap-[8px] rounded-[8px] border border-cf-border p-[20px]',
        tone === 'subtle' ? 'bg-cf-surface-subtle' : 'bg-cf-surface',
        className
      )}
    >
      <FieldLabel
        headingLevel={headingLevel}
        label={label}
        hint={hint}
        hintLabel={hintLabel}
        labelClassName="cf-label-md min-w-0 text-cf-ink-muted [text-wrap:pretty]"
      />
      <p className="cf-display-num tabular-nums text-cf-ink">{value}</p>
      {note ? <p className="cf-caption text-cf-ink-muted">{note}</p> : null}
    </article>
  );
}

export default Metric;
