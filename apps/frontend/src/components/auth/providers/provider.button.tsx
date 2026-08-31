'use client';

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * The single shape of a federated sign-in control. Farcaster wraps a vendor
 * component and so ships its own markup, which is why the geometry lives here
 * as a constant and is imported instead of retyped.
 *
 * `min-w` keeps the wrapping row balanced on wider screens. At 401px and below,
 * each provider takes a full row so its visible label never truncates.
 */
export const AUTH_PROVIDER_BUTTON_CLASS = clsx(
  'flex-1 min-w-[120px] h-[40px] px-[12px] rounded-cf border border-cf-border-control bg-cf-surface text-cf-ink',
  'flex justify-center items-center gap-[8px] text-[14px] font-[600] cursor-pointer',
  'transition-colors duration-state hover:bg-cf-surface-subtle',
  'xs:w-full xs:flex-none disabled:cursor-wait disabled:opacity-60'
);

/**
 * One shape for every federated sign-in route, so the auth screen never grows a
 * second button system. Rendered as a real button: reachable by keyboard and
 * announced with its own accessible name.
 */
export const AuthProviderButton: FC<{
  onClick: () => void;
  icon: ReactNode;
  label: string;
  className?: string;
}> = ({ onClick, icon, label, className }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(AUTH_PROVIDER_BUTTON_CLASS, className)}
  >
    <span aria-hidden className="flex items-center shrink-0">
      {icon}
    </span>
    <span className="truncate">{label}</span>
  </button>
);
