'use client';

import { FC, useState } from 'react';
import { clsx } from 'clsx';
import { PLATFORM_SYMBOLS } from './platform.families';
import { platformAsset } from './platform.asset';

/**
 * The platform logo in a frame, sized for the corner of a channel avatar.
 *
 * This is the smallest size of the platform element card: at this scale the
 * number and the name shed and only the border and the symbol remain, exactly
 * as the compact brand mark sheds its atomic number and mass below 24px.
 * `docs/design/desert-lab/mark.md` sets that rule; `platform.card.tsx` carries
 * the same object at the size where the rest still fits.
 *
 * The logo is a third-party trademark. It is not redrawn, recoloured, tinted or
 * cropped — and cropping was not hypothetical: six call sites put `rounded-full`
 * on it, which clips the corners off a square mark. Our style arrives through
 * the frame; the glyph is left alone and given clear space.
 *
 * The badge is never the only carrier of the destination. Two platforms can
 * share a logo — personal Instagram against the standalone account, a LinkedIn
 * profile against a company page — and at this size nothing in the frame can
 * separate them. Wherever it appears, the channel name and its destination are
 * written beside it.
 */

/**
 * Three steps, each half its avatar: 32/16, 48/24, 64/32.
 *
 * The inherited sizes were 20px in most places and one undesigned `18.41px` in
 * four. Neither was chosen. These are, and they are chosen generously: 24 is the
 * default, 16 is reserved for the calendar cell where the row genuinely is
 * narrow, and 32 is for the places that have room.
 */
export type PlatformBadgeSize = 16 | 24 | 32;

/**
 * Frame to logo, written out rather than derived.
 *
 * A formula would put the logo off the 4px rhythm at one of the three steps.
 * Three pairs are cheaper to read and cheaper to check than an expression with
 * an exception in it, and the clear space around the mark stays deliberate:
 * 2px at the smallest step, 4px at the two that have room.
 */
const LOGO_SIZE: Record<PlatformBadgeSize, string> = {
  16: 'w-[12px] h-[12px]',
  24: 'w-[16px] h-[16px]',
  32: 'w-[24px] h-[24px]',
};

const FRAME_SIZE: Record<PlatformBadgeSize, string> = {
  16: 'w-[16px] h-[16px]',
  24: 'w-[24px] h-[24px]',
  32: 'w-[32px] h-[32px]',
};

export const PlatformBadge: FC<{
  /** Provider identifier, e.g. `telegram`, `linkedin-page`. */
  identifier: string;
  /** Platform name, announced when the badge stands without a written label. */
  name?: string;
  size?: PlatformBadgeSize;
  /**
   * Decorative when the destination is already written beside it, which is the
   * usual case in a list. Otherwise the badge announces the platform itself.
   */
  decorative?: boolean;
  className?: string;
}> = ({ identifier, name, size = 24, decorative = true, className }) => {
  const [broken, setBroken] = useState(false);
  const asset = platformAsset(identifier);

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        'rounded-[4px] border border-cf-border-control bg-cf-surface-raised',
        // The plate is a surface for the mark, so it belongs only where the
        // mark is. On the fallback below it would put `ink` text on an `ink`
        // plate — 1:1, an empty light square where `Dv` should be.
        !broken && asset.neutralPlate && 'dark:bg-cf-ink',
        FRAME_SIZE[size],
        className
      )}
      {...(decorative || !name
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': name })}
    >
      {broken ? (
        // Same fallback the card uses, so a missing mark reads as an element
        // symbol rather than as an empty frame. At 16px two letters do not fit;
        // there the frame alone is the honest answer.
        size === 16 ? null : (
          <span className="cf-caption text-cf-ink">
            {PLATFORM_SYMBOLS[identifier] ?? '—'}
          </span>
        )
      ) : (
        <img
          src={asset.source}
          alt=""
          // No radius: the mark keeps its own silhouette inside our frame.
          className={clsx('object-contain', LOGO_SIZE[size])}
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
};
