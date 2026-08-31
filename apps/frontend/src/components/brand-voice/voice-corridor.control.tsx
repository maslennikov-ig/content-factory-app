'use client';

import clsx from 'clsx';
import { RangePair } from '@contentfactory/react/form/range-pair';
import { SCALE_DOMAIN, toDisplay, type StyleScaleKey } from './voice-copy';

/**
 * The corridor, moved with the hand on the bar that draws it.
 *
 * The bar was already the honest picture of a scale: a stretch of the axis
 * where eight of ten of this author's phrases fall, with a mark at their
 * average. What it was not was a control. Changing it meant pressing «Править
 * коридоры», which opened a small form far below the fold — from where a
 * person pressed it, nothing visibly happened at all — and typing two numbers
 * into boxes labelled «Нижняя граница» and «Верхняя граница», with the picture
 * they described scrolled off the screen.
 *
 * So the numbers moved onto the picture. `RangePair` owns the two handles, the
 * clamping and the keyboard; this owns what a scale's bar means.
 *
 * The domain is the scale's own, and that is the whole reason this file exists
 * rather than a bare `RangePair` at the call site. `sentenceLength` is measured
 * in words with a plausible range of 4 to 40, `questions` in per cent — handles
 * running 0 to 100 for both would let somebody set a corridor of "60 to 80
 * words per sentence" that no text can ever satisfy. The fill and the mark are
 * placed through the same mapping as the handles, which is what keeps the
 * corridor somewhere the value can actually fall.
 */

export function VoiceCorridorControl({
  scaleKey,
  low,
  high,
  /** The measured average, drawn as the mark the corridor is set around. */
  value,
  lowLabel,
  highLabel,
  disabled = false,
  onChange,
}: {
  scaleKey: StyleScaleKey;
  low: number;
  high: number;
  value: number;
  lowLabel: string;
  highLabel: string;
  disabled?: boolean;
  onChange: (next: { low: number; high: number }) => void;
}) {
  const [min, max] = SCALE_DOMAIN[scaleKey];
  const start = toDisplay(low, scaleKey);
  const end = toDisplay(high, scaleKey);
  const mark = toDisplay(value, scaleKey);

  return (
    <RangePair
      min={min}
      max={max}
      low={low}
      high={high}
      lowLabel={lowLabel}
      highLabel={highLabel}
      disabled={disabled}
      onChange={onChange}
      // The band a finger lands on, not the line it is aiming at. 44px below
      // the `sm` breakpoint and the system's 40px above it; the bar itself
      // stays 12px and sits in the middle of that band.
      className="h-[44px] sm:h-[40px]"
      data-voice-corridor-control={scaleKey}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-[12px] -translate-y-1/2 rounded-[4px] bg-cf-surface-subtle"
      />
      <span
        aria-hidden="true"
        className="absolute top-1/2 h-[12px] -translate-y-1/2 rounded-[4px] bg-cf-accent-soft"
        style={{
          insetInlineStart: `${start}%`,
          width: `${Math.max(2, end - start)}%`,
        }}
      />
      {/* The measured value keeps its mark while the corridor moves: the whole
          point of setting one by hand is watching where it lands relative to
          what was counted. */}
      <span
        aria-hidden="true"
        className={clsx(
          'absolute top-1/2 h-[16px] w-[4px] -translate-y-1/2 rounded-[4px]',
          value >= low && value <= high ? 'bg-cf-accent' : 'bg-cf-warning'
        )}
        style={{ insetInlineStart: `${Math.min(99, mark)}%` }}
      />
    </RangePair>
  );
}

export default VoiceCorridorControl;
