'use client';

import { ComponentPropsWithoutRef, forwardRef, useState } from 'react';
import { Input } from './input';
import { Button } from './button';

export type PasswordInputProps = Omit<
  ComponentPropsWithoutRef<typeof Input>,
  'action' | 'type'
> & {
  /** Localized accessible name for the action that reveals the password. */
  showPasswordLabel: string;
  /** Localized accessible name for the action that masks the password. */
  hidePasswordLabel: string;
};

/**
 * An account-password field with one local display state.
 *
 * `Input` continues to own labels, messages, native form wiring and the field
 * frame. This component only chooses the native type and supplies the related
 * in-field action, so every password flow keeps one control contract.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showPasswordLabel, hidePasswordLabel, disabled, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <Input
        {...props}
        ref={ref}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        action={
          <Button
            iconOnly
            density="dense"
            variant="quiet"
            type="button"
            aria-label={visible ? hidePasswordLabel : showPasswordLabel}
            aria-pressed={visible}
            disabled={disabled}
            onClick={() => setVisible((current) => !current)}
            className="rounded-[4px] text-cf-ink-muted hover:text-cf-ink"
          >
            {visible ? <VisibleIcon /> : <HiddenIcon />}
          </Button>
        }
      />
    );
  }
);

const VisibleIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="size-[20px]"
    fill="none"
  >
    <path
      d="M2.5 12s3.25-5 9.5-5 9.5 5 9.5 5-3.25 5-9.5 5-9.5-5-9.5-5Z"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const HiddenIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="size-[20px]"
    fill="none"
  >
    <path
      d="m4 4 16 16M10.65 6.2A11.6 11.6 0 0 1 12 6c6.25 0 9.5 6 9.5 6a15.6 15.6 0 0 1-3.16 3.55M6.12 7.17A15.5 15.5 0 0 0 2.5 12S5.75 18 12 18c.5 0 .98-.04 1.42-.12"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);
