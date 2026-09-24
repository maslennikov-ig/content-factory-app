'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Hint } from '@contentfactory/react/layout/hint';

/**
 * A field's name and the «?» with the one sentence it could not fit.
 *
 * The owner on the twelfth-wave canvas: «чтобы у каждого параметра были
 * подсказки. Ну, вопросики с подсказками». The shared `Input`, `Select` and
 * `Textarea` take their label as a string, and a hint is a control rather than
 * a string, so screens that need one write the label themselves and hand the
 * field an `id`. This is that label, once, instead of a fourth local copy of
 * the same three lines.
 *
 * The hint is a sibling of the label and never its child: a bubble inside a
 * `<label>` would read its sentence into the field's accessible name, and a
 * bubble inside an uppercase caption would shout it.
 */
export function FieldLabel({
  htmlFor,
  id,
  label,
  hint,
  hintLabel,
  className,
  labelClassName = 'cf-label-md text-cf-ink',
  hintSide,
  headingLevel,
}: {
  /** The control the label names. Absent — the label is plain text. */
  htmlFor?: string;
  id?: string;
  label: ReactNode;
  /** Absent — a name with no «?» (a field whose name says it all). */
  hint?: ReactNode;
  /** «Подсказка: …» — what a screen reader says for the «?». */
  hintLabel?: string;
  className?: string;
  labelClassName?: string;
  hintSide?: 'start' | 'end';
  /**
   * The name is a block's heading rather than a field's: it becomes `h3`–`h5`
   * and the pair a `div` (a heading inside a `span` is not valid HTML).
   */
  headingLevel?: 3 | 4 | 5;
}) {
  const Wrapper = headingLevel ? 'div' : 'span';
  const Heading = headingLevel ? (`h${headingLevel}` as const) : null;
  return (
    <Wrapper
      data-field-label="true"
      className={clsx('flex min-w-0 flex-wrap items-center gap-[4px]', className)}
    >
      {Heading ? (
        <Heading id={id} className={labelClassName}>
          {label}
        </Heading>
      ) : htmlFor ? (
        <label id={id} htmlFor={htmlFor} className={labelClassName}>
          {label}
        </label>
      ) : (
        <span id={id} className={labelClassName}>
          {label}
        </span>
      )}
      {hint && hintLabel ? (
        <Hint label={hintLabel} side={hintSide}>
          {hint}
        </Hint>
      ) : null}
    </Wrapper>
  );
}

export default FieldLabel;

/**
 * A field with its name above it: `FieldLabel` and the control, 8px apart.
 *
 * Settings and the superadmin AI screen each carried a private copy of this
 * pair — 6px and 4px apart (`content-factory-next-97dq.76`, audit §4.3).
 * The control brings its own `id`; the label points at it.
 */
export function LabelledField({
  id,
  label,
  hint,
  hintLabel,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  hintLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={clsx('flex min-w-0 flex-col gap-[8px]', className)}>
      <FieldLabel htmlFor={id} label={label} hint={hint} hintLabel={hintLabel} />
      {children}
    </div>
  );
}
