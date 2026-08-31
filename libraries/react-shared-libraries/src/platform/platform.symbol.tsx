'use client';

import { FC } from 'react';
import { clsx } from 'clsx';
import { PLATFORM_SYMBOLS } from './platform.families';

/**
 * A channel avatar built as an element cell: the platform's assigned two-letter
 * symbol, set into the top-left of a bordered square.
 *
 * Top-left because that is where the table this borrows from puts what
 * identifies a cell, and because the platform badge sits in the opposite
 * corner — anchoring the symbol in the centre put the two on top of each other.
 *
 * The symbols are assigned rather than derived, for a reason this product paid
 * for once already: taking the first two letters of the identifier rendered
 * `linkedin`, `linkedin-page` and `listmonk` all as `LI`. See
 * `PLATFORM_SYMBOLS`, which a test holds unique.
 *
 * What this deliberately does not do is tell two channels of the same platform
 * apart — four Telegram channels are four identical `Tg` cells. That is the
 * owner's decision, taken with the trade-off drawn side by side, and it is why
 * the rule that a channel's name is written beside its avatar is not optional
 * here: it is the only thing separating them.
 *
 * `ChannelMark` still exists and still takes the channel's initials. It remains
 * the right mark wherever a channel has to identify itself without a name
 * beside it.
 */

export type PlatformSymbolSize = 32 | 48 | 64;

/**
 * Type size follows the mark, not the nine tokens.
 *
 * `docs/design/desert-lab/mark.md` sizes the brand card's symbol by proportion —
 * 13px on a 32px card — and `ChannelMark` implements exactly that with an inline
 * size. This is the same device at the same proportion, so it is written the
 * same way rather than reaching for a body-copy token that would not match the
 * mark beside it. Stated plainly because `tests/design.typography.test.cjs`
 * cannot see an inline style: this is a documented exception to its ledger, not
 * a gap in it.
 */
const symbolFontSize = (size: PlatformSymbolSize) =>
  Math.round((13 / 32) * size * 100) / 100;

/** Inset per tier, on the 4px rhythm. */
const INSET: Record<PlatformSymbolSize, string> = {
  32: 'top-[4px] start-[4px]',
  48: 'top-[4px] start-[8px]',
  64: 'top-[8px] start-[8px]',
};

export const PlatformSymbol: FC<{
  /** Provider identifier, e.g. `telegram`, `linkedin-page`. */
  identifier: string;
  /** Channel name, announced when nothing beside the cell names it. */
  name?: string;
  size?: PlatformSymbolSize;
  /**
   * Decorative when the channel's name is written beside it, which is the usual
   * case — and, given that two channels of one platform share a symbol, the
   * case this expects.
   */
  decorative?: boolean;
  className?: string;
}> = ({ identifier, name, size = 48, decorative = true, className }) => (
  <span
    className={clsx(
      'relative inline-block shrink-0 overflow-hidden',
      'rounded-[4px] border border-cf-border-control bg-cf-surface-raised',
      className
    )}
    style={{ width: `${size}px`, height: `${size}px` }}
    {...(decorative || !name
      ? { 'aria-hidden': true }
      : { role: 'img', 'aria-label': name })}
  >
    <span
      className={clsx('absolute font-mono text-cf-ink', INSET[size])}
      style={{
        fontSize: `${symbolFontSize(size)}px`,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {PLATFORM_SYMBOLS[identifier] ?? '—'}
    </span>
  </span>
);
