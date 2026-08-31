'use client';

import type { ComponentPropsWithoutRef, FC, MouseEventHandler, ReactNode } from 'react';
import Link from 'next/link';
import {
  buttonClassName,
  type ButtonDensity,
  type ButtonVariant,
} from './button';

/**
 * A navigation action with the same visual and interaction contract as Button.
 *
 * It lives beside the button rather than inside it because it is the one part
 * of the action scale that needs Next's router. `button.tsx` is imported by
 * everything that renders a control, including surfaces that have no Next
 * runtime, and a routed link at the top of that file would make the router a
 * dependency of every one of them.
 */
type ButtonLinkProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  'children' | 'className' | 'onClick'
> & {
  variant?: ButtonVariant;
  density?: ButtonDensity;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export const ButtonLink: FC<ButtonLinkProps> = ({
  variant = 'secondary',
  density = 'standard',
  disabled = false,
  children,
  className,
  onClick,
  ...rest
}) => (
  <Link
    {...rest}
    aria-disabled={disabled || undefined}
    tabIndex={disabled ? -1 : rest.tabIndex}
    className={buttonClassName({ variant, density, className })}
    onClick={(event) => {
      // An anchor has no `disabled`, so the refusal has to be spelled out: the
      // click is stopped before navigation and the row leaves the tab order.
      if (disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    }}
  >
    {children}
  </Link>
);
