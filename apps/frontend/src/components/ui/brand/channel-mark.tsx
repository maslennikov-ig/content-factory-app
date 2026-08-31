import { FC } from 'react';
import { clsx } from 'clsx';

/**
 * A channel avatar fallback, built on the same device as the compact brand
 * mark: two letters in a bordered card, monospaced.
 *
 * The card is the fallback and the label — it is not a replacement for a real
 * channel picture. Where an account has one, the picture still carries the
 * identification; this stands in when there is none. Provider identity remains
 * the job of the platform logo.
 *
 * Colour carries exactly one distinction, and only one: the channel marked as
 * primary takes `signature` for both border and text. Channel cards have no
 * other colours — a per-network palette is what turns a channel list into
 * confetti.
 */

/** First letters of the name, so `Content Factory` reads as `CF`. */
function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => [...word][0])
    .filter((letter) => /\p{L}|\p{N}/u.test(letter ?? ''));

  if (words.length >= 2) return (words[0] + words[1]).toUpperCase();

  // One word: take its first two characters rather than a lonely single letter.
  const letters = [...name.trim()].filter((letter) =>
    /\p{L}|\p{N}/u.test(letter)
  );
  return letters.slice(0, 2).join('').toUpperCase() || '—';
}

export const ChannelMark: FC<{
  /** Channel name; the card shows its first two letters. */
  name: string;
  size?: number;
  /** The channel assigned as primary — the only card that changes colour. */
  primary?: boolean;
  className?: string;
  /**
   * Decorative when the name is already written next to the card, which is the
   * usual case in a list. Otherwise the card announces the name itself.
   */
  decorative?: boolean;
}> = ({ name, size = 32, primary = false, className, decorative = true }) => {
  const colour = primary ? 'var(--cf-signature)' : undefined;
  const fontSize = Math.max(10, Math.round((13 / 32) * size * 100) / 100);

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center',
        className
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '4px',
        border: `1px solid ${colour ?? 'var(--cf-border-control)'}`,
        // Preserve the 13px/32px proportion without allowing tiny unreadable type.
        fontSize: `${fontSize}px`,
        fontWeight: 600,
        lineHeight: 1,
        fontFamily:
          'var(--font-cf-mono), ui-monospace, SFMono-Regular, monospace',
        color: colour ?? 'var(--cf-ink)',
      }}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': name })}
    >
      {initials(name)}
    </span>
  );
};
