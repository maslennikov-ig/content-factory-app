'use client';

import { useRef, type FC } from 'react';
import { Button, type ButtonVariant } from './button';

/**
 * Choosing files, as a control rather than as a bare `<input type="file">`.
 *
 * The native file input cannot be given the product's own control height,
 * focus ring or disabled treatment — a browser draws it its own way and
 * ignores most of what is asked of it. Every interface that wants one
 * therefore hides it and puts a real button in front, and doing that in each
 * call site is how a product ends up with three file pickers that behave
 * differently. This is that pattern, once, where the rest of the controls
 * live.
 *
 * The hidden input keeps `tabIndex={-1}` and `aria-hidden`: the button in
 * front of it is the tab stop and the accessible name, and leaving both
 * reachable would give a keyboard two stops for one control, one of which
 * announces nothing.
 *
 * The value is cleared after every choice. Without it, picking the same file
 * twice in a row fires no `change` at all and the second attempt silently does
 * nothing.
 */
export const FileInput: FC<{
  /** The button's caption, and the hidden control's accessible name. */
  label: string;
  name: string;
  onFiles: (files: readonly File[]) => void;
  /** A filter for the dialog, never a rule: the server checks regardless. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  className?: string;
}> = ({
  label,
  name,
  onFiles,
  accept,
  multiple,
  disabled,
  variant = 'secondary',
  className,
}) => {
  const picker = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        className={className}
        onClick={() => picker.current?.click()}
      >
        {label}
      </Button>
      <input
        ref={picker}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={label}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </>
  );
};

export default FileInput;
