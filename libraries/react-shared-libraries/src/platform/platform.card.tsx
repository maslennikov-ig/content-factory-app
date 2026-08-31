'use client';

import { FC, ReactNode, useState } from 'react';
import { clsx } from 'clsx';
import { ControlButton } from '../choice/control.button';
import { PLATFORM_SYMBOLS } from './platform.families';
import { platformAsset } from './platform.asset';

/**
 * A platform, drawn as an element card.
 *
 * The product's own mark is a chemical element card — symbol `Cf`, atomic
 * number `98`, mass `251` (`docs/design/desert-lab/mark.md`). This is the same
 * device applied to the thing it fits best: the logo takes the symbol position,
 * the atomic-number slot takes the count of channels already connected, and the
 * platform name sits below the symbol the way an element's name does. Everything
 * except the logo is ours.
 *
 * The logo is a third-party trademark and is not redrawn, recoloured, tinted to
 * a family colour or cropped. It is given clear space and left alone; the style
 * arrives through the frame.
 *
 * Below this size the number and the name shed and only the frame and the logo
 * remain — see `platform.badge.tsx`. That is the mark's own shedding rule,
 * applied one step earlier, because the symbol position here holds a picture
 * with its own internal detail rather than a two-letter glyph.
 *
 * Geometry: 152 tall on the 4px rhythm — 8 padding, 16 number band, 8, 56 logo,
 * 8, 44 caption block. The caption block is a fixed height holding either a
 * two-line name or a one-line name above its qualifier, so every card in a band
 * is the same height without absolute positioning.
 *
 * Small on purpose, and twice over. The table this borrows from is dense — its
 * whole point is that you see every element at once — and a card big enough to
 * be comfortable turns thirty-five destinations into six screens of scrolling.
 * And the logos are 50x50 bitmaps: at 32px they are drawn smaller than they
 * are, which is the only size range where a raster mark stays crisp. An earlier
 * pass drew them at 56 and the softness was the first thing anyone noticed.
 *
 * Width belongs to the grid, not to the card. A minimum here looked tidy and
 * was wrong: `auto-fill` then answers to whatever padding happens to surround
 * the picker, and on a 390px screen that produced a single column and
 * thirty-five rows to scroll.
 *
 * Colour is spent on one thing only: the current choice. There is no family
 * colour on the card — measurement retired it, and `DESIGN.md` keeps the screen
 * on neutrals. There is no ochre either: `signature` is the mark and one or two
 * points of recognition per screen, not a stencil on every tile.
 */

export const PlatformCard: FC<{
  /** Platform name, shown below the logo. */
  name: string;
  /**
   * Shown under the name when a logo cannot tell two destinations apart —
   * personal Instagram against the standalone account, `mastodon.social`
   * against a self-hosted server, a LinkedIn profile against a company page.
   * Only those six carry it.
   */
  qualifier?: string;
  /**
   * Channels already connected on this platform. A platform you use and one you
   * have never touched stop looking identical, with no extra badge.
   */
  connectedChannels: number;
  /**
   * The count spelled out for a screen reader, already translated — e.g.
   * "3 channels connected". Supplied by the caller because the card sits in the
   * shared library and owns no translations.
   */
  connectedLabel?: string;
  /**
   * Whether this platform is currently chosen.
   *
   * Leave it undefined where the card performs an action rather than answering
   * a question — the picker that connects a channel starts an OAuth flow on
   * click, and announcing an unpressed toggle there tells a screen-reader user
   * something that is not true.
   */
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** The logo, normally a `PlatformBadge`-free `<img>` supplied by the caller. */
  logo: ReactNode;
  onSelect?: () => void;
  className?: string;
}> = ({
  name,
  qualifier,
  connectedChannels,
  connectedLabel,
  selected,
  disabled = false,
  loading = false,
  logo,
  onSelect,
  className,
}) => {
  const connected = connectedChannels > 0;

  /**
   * The number slot is working information for a sighted reader: `ink` against
   * `ink-muted` separates a platform in use from one never touched before the
   * digit is even read. A screen reader gets none of that, and the card would
   * otherwise announce itself as "0 Instagram business" — a bare number with no
   * unit, leading. The label spells it out instead.
   */
  const accessibleName = [name, qualifier, connectedLabel]
    .filter(Boolean)
    .join(', ');

  if (loading) {
    return (
      <div
        className="h-[152px] w-full animate-pulse rounded-[8px] border border-cf-border bg-cf-surface-subtle"
        aria-hidden={true}
      />
    );
  }

  return (
    // `ControlButton` rather than a bare element or `Button`: the surface owns
    // the appearance here, and what a hand-written control forgets — the button
    // type, a visible focus ring, a disabled state that reads as disabled —
    // comes with it.
    <ControlButton
      layout="card"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={accessibleName}
      className={clsx(
        'relative flex w-full flex-col items-center',
        'box-border rounded-[8px] border p-[8px] text-start',
        'transition-colors duration-state',
        selected
          ? 'border-cf-accent bg-cf-accent-soft hover:border-cf-accent-hover'
          : 'border-cf-border-control bg-cf-surface-raised hover:bg-cf-surface-subtle',
        // Disabled keeps `border-control` and lets the primitive's opacity say
        // it is disabled. Swapping the border to `border` measured 1.37:1 on
        // the dark surface — below the 3:1 a control border owes — and bought
        // nothing the dimming was not already saying.
        // The pressed shadow is the one value the system allows outside the
        // palette; it lives in `tailwind.config.cjs` so it is written once.
        !disabled && 'cf-pressed',
        className
      )}
    >
      {/*
        The atomic-number slot. Monospaced, because a count is working
        information.

        Empty at zero, and that is the point of the slot rather than a detail of
        it. In the table this device comes from the number is an identity: no
        two elements share one. Here it counts channels, and a customer with six
        connected has twenty-nine cards reading `0` — the mark that was supposed
        to separate them becomes the most repeated glyph on the screen. An empty
        slot separates at a glance; a wall of zeroes does not.
      */}
      <span
        className={clsx(
          'cf-caption h-[16px] w-full',
          connected && !disabled ? 'text-cf-ink' : 'text-cf-ink-muted'
        )}
      >
        {connected ? connectedChannels : ''}
      </span>

      {/*
        Selection is not carried by colour alone: the corner marker is a shape
        that appears, and the name changes weight with it. The marker's outer
        corner follows the card's radius so the two read as one object.
      */}
      {selected && (
        <span
          className="absolute top-0 end-0 flex h-[16px] w-[16px] items-center justify-center rounded-[0_8px_0_8px] bg-cf-accent text-cf-accent-ink"
          aria-hidden={true}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden={true}
          >
            <path
              d="M2 6.4 4.6 9 10 3.2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}

      <span className="mt-[8px] flex h-[56px] w-[56px] items-center justify-center">
        {logo}
      </span>

      {/*
        Fixed height, so every card in a band lines up without the caller
        measuring anything — which means the block has to refuse to overflow
        rather than hope it does not. A two-line name is 38px and a qualifier
        strip is 20px; together with the gap that is 62px in a 44px box, so the
        name gives up its second line whenever a qualifier is showing.
      */}
      <span className="mt-[8px] flex h-[44px] w-full flex-col items-center justify-center gap-[4px] overflow-hidden">
        <span
          className={clsx(
            'text-center [text-wrap:pretty]',
            qualifier ? 'line-clamp-1' : 'line-clamp-2',
            selected ? 'cf-label-md' : 'cf-body-sm',
            connected && !disabled ? 'text-cf-ink' : 'text-cf-ink-muted'
          )}
        >
          {name}
        </span>
        {qualifier && (
          <span className="cf-label-sm flex h-[20px] max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] border border-cf-border-control px-[4px] text-cf-ink">
            {qualifier}
          </span>
        )}
      </span>
    </ControlButton>
  );
};

/**
 * The logo as the card wants it: square, uncropped, with clear space around it.
 *
 * Kept beside the card rather than inside it so a call site that already holds
 * an image element — a channel picture, say — can pass its own node instead.
 */
export const PlatformCardLogo: FC<{ identifier: string }> = ({
  identifier,
}) => {
  const [broken, setBroken] = useState(false);
  const asset = platformAsset(identifier);

  // A mark that fails to load leaves a hole where the symbol should be. The
  // assigned two-letter symbol fills it the way the table this borrows from
  // would: `Tg`, `Lk`, `Wp`. It is a fallback and never competes with the logo.
  if (broken) {
    return (
      <span
        className="cf-label-sm flex h-[56px] w-[56px] items-center justify-center rounded-[4px] border border-cf-border-control text-cf-ink"
        aria-hidden={true}
      >
        {PLATFORM_SYMBOLS[identifier] ?? '—'}
      </span>
    );
  }

  const logo = (
    <img
      src={asset.source}
      alt=""
      // Immutable vectors can use the full symbol field; retained 50px rasters
      // remain at 48px inside it, never upscaled past their source asset.
      className={asset.vector ? 'h-[56px] w-[56px] object-contain' : 'h-[48px] w-[48px] object-contain'}
      onError={() => setBroken(true)}
    />
  );

  // Dark only. The plate exists because black artwork disappears on the dark
  // canvas; in the light theme every surface is already light and the mark is
  // already black, so a plate there is a 56px square of a different colour than
  // the card behind it — the card is `surface-subtle` on hover and
  // `accent-soft` when selected — on four platforms out of thirty-five.
  return asset.neutralPlate ? (
    <span className="inline-flex h-[56px] w-[56px] items-center justify-center rounded-[4px] dark:bg-cf-ink">
      {logo}
    </span>
  ) : (
    logo
  );
};
