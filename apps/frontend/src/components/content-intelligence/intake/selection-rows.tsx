'use client';

import type { ReactNode } from 'react';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';

/**
 * Rows the person keeps or drops, several at once: a box, the statement, and
 * under it what backs it. One component for every «what to keep» list —
 * the found facts of `intake.research.tsx` (the entry screen and the piece
 * page) and the agent's selection card (`kcxz.16`: research findings now,
 * review changes next) — so the row does not come out differently on each.
 *
 * `editable` off draws the same rows read-only: a check that is green when
 * kept, grey when not. Nothing here knows what a row is about; callers pass
 * the words and the details.
 */

export type SelectionRow = {
  id: string;
  label: ReactNode;
  /** The row's accessible name when `label` is not plain text. */
  name?: string;
  selected: boolean;
  /** A quote or a note under the statement. */
  detail?: ReactNode;
  /** The source, a status: one caption line. */
  meta?: ReactNode;
  /** A failure about this row only, announced. */
  error?: string | null;
};

/** The check of a kept row; stroke, 16px, painted by `currentColor`. */
export const SelectionCheckIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="size-[16px] shrink-0"
  >
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

/**
 * The box of a row (`kcxz.31`, D13). Green here means «kept»: in a column of
 * kept rows a hovered empty box with a green frame read as ticked. So an
 * empty box answers the pointer with the neutral strong ink, and only a kept
 * one stays green. The box's own hover tint says «this one» for both.
 *
 * Unticking snaps (`tbuj`, W2 walk D13): the green fill and the tick used to
 * fade out over the state duration while the pointer still rested on the
 * box, so the box just unticked read as ticked (`s2b-facts-selection-*`).
 * A transition takes the destination state's property, so the empty box
 * drops its fill and tick at once, and ticking still fades in.
 */
const SELECTION_BOX = [
  'min-h-0 py-0',
  '[&:hover_input:not(:checked):not(:disabled)]:border-cf-ink-muted',
  '[&_input:not(:checked)]:transition-none',
  '[&_input:not(:checked)~span_svg]:transition-none',
].join(' ');

export function SelectionRows({
  rows,
  includeLabel,
  editable,
  busy = false,
  onToggle,
  className,
}: {
  rows: readonly SelectionRow[];
  /** «Взять», read as «Взять: <statement>» by a screen reader. */
  includeLabel: string;
  editable: boolean;
  busy?: boolean;
  onToggle?: (id: string, selected: boolean) => void;
  className?: string;
}) {
  return (
    <ul className={className ?? 'flex min-w-0 flex-col divide-y divide-cf-border'}>
      {rows.map((row) => {
        const name =
          row.name ?? (typeof row.label === 'string' ? row.label : row.id);
        return (
          <li
            key={row.id}
            data-selection-row={row.id}
            data-selection-kept={row.selected ? 'true' : 'false'}
            className="flex min-w-0 items-start gap-[12px] py-[8px]"
          >
            {editable && onToggle ? (
              <CheckboxField
                aria-label={`${includeLabel}: ${name}`}
                checked={row.selected}
                disabled={busy}
                onChange={(event) => onToggle(row.id, event.target.checked)}
                label={<span className="sr-only">{includeLabel}</span>}
                className={SELECTION_BOX}
              />
            ) : (
              <span className={row.selected ? 'text-cf-accent' : 'text-cf-ink-muted'}>
                <SelectionCheckIcon />
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
              <p className="cf-body-md text-cf-ink [overflow-wrap:anywhere] [text-wrap:pretty]">
                {row.label}
              </p>
              {row.detail}
              {row.meta}
              {row.error ? (
                <p role="alert" className="cf-body-sm text-cf-danger">
                  {row.error}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
