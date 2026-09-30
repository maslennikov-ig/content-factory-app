import { FC } from 'react';
import { clsx } from 'clsx';

/**
 * The full Content Factory logo: the `Cf 98` plate as the nucleus, two orbits,
 * and the three things the product makes — text, image, video — riding them.
 *
 * A raster, unlike `CfMark`: the orbits and badges are drawn, not typeset, and
 * the source is the owner's own artwork (`docs/design/desert-lab/logo/`).
 * The files sit at the root of `public/` on purpose: the sign-in proxy lets
 * a root `name.ext` through, while a nested folder gets redirected to /auth
 * for a visitor without a session — exactly the one who sees this logo.
 * Each theme has its own drawing — off-white orbits vanish on the sand canvas
 * — so both are in the page and the body's theme class shows one. Below about
 * 96px the badges stop reading; use `CfMark` there.
 */
export const CfAtom: FC<{
  size?: number;
  className?: string;
  /** Decorative when the product name is already next to it in text. */
  decorative?: boolean;
}> = ({ size = 160, className, decorative = false }) => {
  const label = decorative ? '' : 'Content Factory';
  const common = {
    width: size,
    height: size,
    alt: label,
    'aria-hidden': decorative || undefined,
    decoding: 'async' as const,
  };

  return (
    <span
      className={clsx('inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <img
        {...common}
        src="/cf-atom-dark.webp"
        className="hidden size-full dark:block"
      />
      <img
        {...common}
        src="/cf-atom-light.webp"
        className="block size-full dark:hidden"
      />
    </span>
  );
};
