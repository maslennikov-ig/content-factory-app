import { FC } from 'react';
import { clsx } from 'clsx';
import { CfMark } from '@contentfactory/frontend/components/ui/brand/cf-mark';

export const PRODUCT_NAME = 'Content Factory';

// Name sizes stay on the DESIGN.md type ramp: 16 is `body-lg` and the size the
// mark sheet fixes for the lock, 18 is `heading-md`, 24 is `heading-lg`.
const SIZES = {
  sm: { mark: 24, text: 'text-[16px]' },
  md: { mark: 32, text: 'text-[18px]' },
  lg: { mark: 40, text: 'text-[24px]' },
} as const;

/**
 * The primary Content Factory mark: the element card plus the product name set
 * in the repository's own Geologica. Nothing is rasterised, so it stays sharp
 * at every size and follows the active theme.
 *
 * This is the lock from the mark sheet — card, 12px gap, name at 650 with
 * −0.01em. The 24px card takes its symbol in `signature`, the one place the
 * symbol matches its own border.
 */
export const Wordmark: FC<{
  size?: keyof typeof SIZES;
  className?: string;
  /** Renders the name for assistive tech only — for collapsed navigation. */
  markOnly?: boolean;
}> = ({ size = 'md', className, markOnly = false }) => {
  const { mark, text } = SIZES[size];

  return (
    <span className={clsx('inline-flex items-center gap-[12px]', className)}>
      <CfMark size={mark} tone={mark <= 24 ? 'signature' : 'ink'} decorative />
      <span
        className={clsx(
          markOnly
            ? 'sr-only'
            : 'font-[650] tracking-[-0.01em] whitespace-nowrap',
          !markOnly && text
        )}
      >
        {PRODUCT_NAME}
      </span>
    </span>
  );
};
