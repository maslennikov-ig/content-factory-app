import { CSSProperties, FC } from 'react';
import { clsx } from 'clsx';

/**
 * Compact Content Factory mark: an element card.
 *
 * The symbol `Cf` is the product's own initials and doubles as an element
 * symbol, so the card carries an atomic number `98` and a mass `251` the way a
 * periodic table cell does. The periodic table is public domain, and this
 * shares no shape with the Postiz logo.  brand-scan:allow
 *
 * Built from CSS and the monospaced variable rather than SVG `<text>`: an SVG
 * label depends on the font being available at render time, which is exactly
 * what cannot be guaranteed in a favicon. The rasterised icons under `public/`
 * are drawn as outlines for the same reason.
 *
 * Detail drops as the card shrinks, so the strokes never merge: from 48px all
 * three figures, at 24px the number and the symbol, below that the symbol
 * alone.
 */

/** Measurements from `docs/design/desert-lab/mark.md`, keyed by card size. */
type Ramp = Record<number, number>;

const SYMBOL: Ramp = { 16: 9, 24: 11, 48: 21, 128: 56 };
const NUMBER: Ramp = { 24: 7, 48: 8, 128: 14 };
const MASS: Ramp = { 48: 7, 128: 12 };
const BORDER: Ramp = { 16: 1, 24: 1, 48: 1.5, 128: 2 };
const INSET_BLOCK: Ramp = { 48: 4, 128: 10 };
const INSET_INLINE: Ramp = { 48: 5, 128: 12 };

/**
 * Reads a measurement off its ramp, interpolating between the two nearest
 * anchors. Every size the sheet specifies therefore renders its exact
 * specified value, and the sizes in between scale smoothly instead of snapping
 * to the next tier.
 */
function measure(ramp: Ramp, size: number): number {
  const anchors = Object.keys(ramp)
    .map(Number)
    .sort((a, b) => a - b);

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (size <= first) return ramp[first];
  if (size >= last) return ramp[last];

  const upper = anchors.find((anchor) => anchor >= size)!;
  const lower = [...anchors].reverse().find((anchor) => anchor <= size)!;
  if (upper === lower) return ramp[upper];

  const ratio = (size - lower) / (upper - lower);
  return ramp[lower] + (ramp[upper] - ramp[lower]) * ratio;
}

/** Trims float noise from an interpolated pixel value. */
const px = (value: number) => `${Math.round(value * 100) / 100}px`;

export const CfMark: FC<{
  size?: number;
  /** `filled` is the dense plate for app avatars and tight badges. */
  variant?: 'outline' | 'filled';
  /**
   * Colour of the symbol in the outline variant. `signature` is the collapsed
   * navigation card — the one place the symbol matches its own border.
   */
  tone?: 'ink' | 'signature';
  className?: string;
  /** Decorative when the mark sits next to the product name in text. */
  decorative?: boolean;
  title?: string;
}> = ({
  size = 32,
  variant = 'outline',
  tone = 'ink',
  className,
  decorative = false,
  title = 'Content Factory',
}) => {
  const filled = variant === 'filled';
  const showsNumber = size >= 24;
  const showsMass = size >= 48 && !filled;

  const style: CSSProperties = {
    width: px(size),
    height: px(size),
    borderRadius: size >= 48 ? '8px' : '4px',
    fontFamily: 'var(--font-cf-mono), ui-monospace, SFMono-Regular, monospace',
    ...(filled
      ? { background: 'var(--cf-signature)' }
      : {
          border: `${px(measure(BORDER, size))} solid var(--cf-signature)`,
        }),
  };

  const symbolColour = filled
    ? 'var(--cf-ink-inverse)'
    : tone === 'signature'
    ? 'var(--cf-signature)'
    : 'var(--cf-ink)';

  const symbol = (
    <span
      style={{
        fontSize: px(measure(SYMBOL, size)),
        fontWeight: 600,
        letterSpacing: size >= 48 ? '-0.02em' : undefined,
        lineHeight: 1,
        color: symbolColour,
      }}
    >
      Cf
    </span>
  );

  const number = (
    <span
      style={{
        fontSize: px(measure(NUMBER, size)),
        fontWeight: 600,
        lineHeight: 1,
        color: filled ? 'var(--cf-ink-inverse)' : 'var(--cf-signature)',
        ...(filled ? { opacity: 0.8 } : null),
      }}
    >
      98
    </span>
  );

  // Below 24px only the symbol survives, so the card stays a legible glyph.
  const body = !showsNumber ? (
    <span className="flex h-full w-full items-center justify-center">
      {symbol}
    </span>
  ) : size < 48 ? (
    // At 24px the card turns into a stack: number above, symbol below.
    <span
      className="flex h-full w-full flex-col items-center justify-between"
      style={{ padding: '2px 3px' }}
    >
      {number}
      {symbol}
    </span>
  ) : (
    // From 48px the card is a periodic-table cell: number top-left, mass
    // bottom-left, symbol centred.
    <span className="relative flex h-full w-full items-center justify-center">
      <span
        className="absolute"
        style={{
          top: px(measure(INSET_BLOCK, size)),
          left: px(measure(INSET_INLINE, size)),
        }}
      >
        {number}
      </span>
      {symbol}
      {showsMass && (
        <span
          className="absolute"
          style={{
            bottom: px(measure(INSET_BLOCK, size)),
            left: px(measure(INSET_INLINE, size)),
            fontSize: px(measure(MASS, size)),
            lineHeight: 1,
            color: 'var(--cf-ink-muted)',
          }}
        >
          251
        </span>
      )}
    </span>
  );

  return (
    <span
      className={clsx('inline-flex shrink-0 select-none', className)}
      style={style}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': title })}
    >
      {body}
    </span>
  );
};
