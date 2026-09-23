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
}: {
  /** The control the label names. Absent — the label is plain text. */
  htmlFor?: string;
  id?: string;
  label: ReactNode;
  hint: ReactNode;
  /** «Подсказка: …» — what a screen reader says for the «?». */
  hintLabel: string;
  className?: string;
  labelClassName?: string;
  hintSide?: 'start' | 'end';
}) {
  return (
    <span
      data-field-label="true"
      className={clsx('flex min-w-0 flex-wrap items-center gap-[4px]', className)}
    >
      {htmlFor ? (
        <label id={id} htmlFor={htmlFor} className={labelClassName}>
          {label}
        </label>
      ) : (
        <span id={id} className={labelClassName}>
          {label}
        </span>
      )}
      <Hint label={hintLabel} side={hintSide}>
        {hint}
      </Hint>
    </span>
  );
}

export default FieldLabel;
