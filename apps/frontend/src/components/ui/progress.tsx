'use client';

import { clsx } from 'clsx';

type ProgressCommonProps = Readonly<{
  /** Accessible name for the operation whose progress is shown. */
  label: string;
  /** Localized value announced instead of the numeric range. */
  valueText?: string;
  className?: string;
}>;

export type ProgressProps = ProgressCommonProps &
  (
    | Readonly<{
        mode: 'percent';
        /** Completed share, from 0 to 100. Values outside the range are clamped. */
        value: number;
        /** Keeps the sweep moving while a measured operation is still running. */
        active?: boolean;
      }>
    | Readonly<{
        mode: 'steps';
        /** Completed steps. Values outside 0..total are clamped. */
        value: number;
        total: number;
        /** Keeps the sweep moving while the current step is still running. */
        active?: boolean;
      }>
    | Readonly<{
        mode: 'indeterminate';
      }>
  );

const clamp = (value: number, maximum: number) =>
  Math.min(maximum, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * The single progress indicator for measured, stepped and unknown-duration work.
 *
 * A measured run keeps its real value while the sweep says that work is still
 * happening. An indeterminate run omits numeric ARIA values instead of making
 * up a percentage. Reduced-motion users keep the filled track and lose only
 * the moving sweep.
 */
export function Progress(props: ProgressProps) {
  const maximum =
    props.mode === 'steps'
      ? Math.max(1, Number.isFinite(props.total) ? props.total : 1)
      : 100;
  const value =
    props.mode === 'indeterminate' ? null : clamp(props.value, maximum);
  const width =
    props.mode === 'indeterminate' ? 0 : ((value ?? 0) / maximum) * 100;
  const active = props.mode === 'indeterminate' || props.active === true;

  return (
    <div
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={props.mode === 'indeterminate' ? undefined : 0}
      aria-valuemax={
        props.mode === 'indeterminate' ? undefined : maximum
      }
      aria-valuenow={value ?? undefined}
      aria-valuetext={props.valueText}
      aria-busy={active || undefined}
      className={clsx(
        'relative h-[8px] w-full overflow-hidden rounded-[4px] border border-cf-border bg-cf-surface-subtle',
        props.className
      )}
    >
      <div
        aria-hidden="true"
        className="h-full rounded-[4px] bg-cf-accent"
        style={{ width: `${width}%` }}
      />
      {active ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-[cf-skeleton-sweep_1.4s_ease-in-out_infinite] motion-reduce:hidden"
        >
          <div className="h-full w-1/3 bg-cf-accent opacity-50" />
        </div>
      ) : null}
    </div>
  );
}
