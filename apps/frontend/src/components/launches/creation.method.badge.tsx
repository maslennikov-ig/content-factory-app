import { FC } from 'react';
import clsx from 'clsx';

type CreationMethod = 'UNKNOWN' | 'WEB' | 'API' | 'MCP' | 'AUTOPOST' | 'CLI';

interface Props {
  creationMethod?: CreationMethod | string | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  ringColor?: string;
}

/** One paint per method, from the status tones' fills and their ink. */
const METHOD_PAINT: Record<string, string> = {
  WEB: 'bg-cf-ink-muted text-cf-ink-inverse',
  API: 'bg-cf-info text-cf-ink-inverse',
  MCP: 'bg-cf-accent text-cf-accent-ink',
  AUTOPOST: 'bg-cf-warning text-cf-ink-inverse',
  CLI: 'bg-cf-signature text-cf-ink-inverse',
};

const tooltipFor = (m: string) =>
  m === 'AUTOPOST' ? 'Auto-posted by system' : `Created via ${m}`;

export const CreationMethodBadge: FC<Props> = ({
  creationMethod,
  size = 'xs',
  className,
  ringColor,
}) => {
  if (!creationMethod || creationMethod === 'UNKNOWN') return null;

  const sizeClasses =
    size === 'xs'
      ? 'h-[12px] px-[4px] text-[7px]'
      : size === 'md'
      ? 'h-[22px] px-[10px] text-[12px]'
      : 'h-[18px] px-[8px] text-[10px]';

  return (
    <div
      className={clsx(
        // Theme tokens, not five hex fills (`97dq.76`, audit §5.4): the badge
        // is seen only under impersonation, but it is drawn in both themes,
        // and a hardcoded white label loses its contrast on the dark one. The
        // method codes are capitals already; no `uppercase` is needed.
        'inline-flex items-center justify-center rounded-full font-bold tracking-wide leading-none cursor-default',
        sizeClasses,
        METHOD_PAINT[creationMethod] ?? METHOD_PAINT.WEB,
        className
      )}
      style={ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined}
      data-tooltip-id="tooltip"
      data-tooltip-content={tooltipFor(creationMethod)}
    >
      {creationMethod}
    </div>
  );
};
