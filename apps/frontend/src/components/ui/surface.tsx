'use client';

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';
export { Panel, PageHeader } from '@contentfactory/react/layout';

/**
 * Shared Content Factory surface vocabulary.
 *
 * One panel, one status, one empty state, one error state, one skeleton for the
 * whole product. Hierarchy comes from surface colour, border and space — never
 * from a wide shadow stacked on a border.
 */

export type StatusTone = 'neutral' | 'accent' | 'info' | 'warning' | 'danger';

const STATUS_TONES: Record<StatusTone, string> = {
  neutral: 'bg-cf-surface-subtle text-cf-ink border-cf-border',
  accent: 'bg-cf-accent-soft text-cf-accent border-cf-accent',
  info: 'bg-cf-info-soft text-cf-info border-cf-info',
  warning: 'bg-cf-warning-soft text-cf-warning border-cf-warning',
  danger: 'bg-cf-danger-soft text-cf-danger border-cf-danger',
};

/**
 * Colour is never the only carrier: the pill always shows its own words, and
 * takes an icon where the distinction has to survive a glance. Set in
 * `label-sm`, which is the monospaced token — a status reads as a stamped
 * marking, not as a caption.
 */
export const Status: FC<{
  children: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
}> = ({ children, tone = 'neutral', icon, className }) => (
  <span
    className={clsx(
      'inline-flex items-center gap-[6px] h-[22px] px-[8px] rounded-full border cf-label-sm whitespace-nowrap',
      STATUS_TONES[tone],
      className
    )}
  >
    {icon}
    {children}
  </span>
);

/** Teaches the next safe step instead of showing an empty box. */
export const EmptyState: FC<{
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}> = ({ title, description, action, className }) => (
  <div
    className={clsx(
      'flex flex-col items-center text-center gap-[8px] py-[40px] px-[20px]',
      className
    )}
  >
    <p className="cf-heading-md text-cf-ink">{title}</p>
    {description && (
      <p className="cf-body-sm text-cf-ink-muted max-w-[60ch] [text-wrap:pretty]">
        {description}
      </p>
    )}
    {action && <div className="mt-[8px]">{action}</div>}
  </div>
);

/** States the cause and offers one recovery, announced to assistive tech. */
export const ErrorState: FC<{
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}> = ({ title, description, action, className }) => (
  <div
    role="alert"
    className={clsx(
      'flex flex-col gap-[8px] p-[16px] rounded-[8px] border border-cf-danger bg-cf-danger-soft',
      className
    )}
  >
    <p className="cf-label-md text-cf-danger">{title}</p>
    {description && (
      <p className="cf-body-sm text-cf-ink max-w-[70ch] [text-wrap:pretty]">
        {description}
      </p>
    )}
    {action && <div className="mt-[4px]">{action}</div>}
  </div>
);

/**
 * Access limit. Says which limit was hit and offers the one route out, rather
 * than hiding the feature and leaving the user to guess it exists.
 */
export const RestrictedState: FC<{
  title: ReactNode;
  reason: ReactNode;
  action?: ReactNode;
  className?: string;
}> = ({ title, reason, action, className }) => (
  <div
    className={clsx(
      'flex flex-col gap-[8px] p-[16px] rounded-[8px] border border-cf-border bg-cf-surface-subtle',
      className
    )}
  >
    <p className="cf-label-md text-cf-ink">{title}</p>
    <p className="cf-body-sm text-cf-ink-muted max-w-[70ch] [text-wrap:pretty]">
      {reason}
    </p>
    {action && <div className="mt-[4px]">{action}</div>}
  </div>
);

/** Repeats the shape of the content that is loading. */
export const Skeleton: FC<{ className?: string }> = ({ className }) => (
  <div aria-hidden className={clsx('cf-skeleton', className)} />
);

export const SkeletonRows: FC<{
  rows?: number;
  className?: string;
  label?: string;
}> = ({ rows = 4, className, label = 'Loading' }) => (
  <div
    className={clsx('flex flex-col gap-[8px]', className)}
    role="status"
    aria-live="polite"
  >
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }).map((_, index) => (
      <Skeleton key={index} className="h-[44px] w-full" />
    ))}
  </div>
);
