'use client';

import {
  DetailedHTMLProps,
  forwardRef,
  InputHTMLAttributes,
  Ref,
  ReactNode,
  useEffect,
  useId,
  useMemo,
} from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';
import { FieldMessage } from './field-message';
import { withoutConsumerHeight, withoutConsumerHeightStyle } from './control-height';

export type InputProps =
  DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
    removeError?: boolean;
    error?: any;
    disableForm?: boolean;
    customUpdate?: () => void;
    label?: string;
    name?: string;
    /** Render a controlled field without requiring a react-hook-form provider. */
    standalone?: boolean;
    density?: 'standard' | 'dense';
    /** Layout classes for the outer field, e.g. `flex-1` or `w-full`. */
    fieldClassName?: string;
    /** Classes for the editable input; `className` still styles the control frame. */
    inputClassName?: string;
    icon?: ReactNode;
    /**
     * A control that belongs to the field itself rather than to the form —
     * clearing a stored value, for example. It sits inside the box, after the
     * text, so it reads as part of the field and not as a page-level action.
     */
    action?: ReactNode;
    helper?: ReactNode;
    translationKey?: string;
    translationParams?: Record<string, string | number>;
    /**
     * An opaque secret the operator pastes — an API key, a token — which is not
     * a password and must not be treated as one. `type="password"` hands the
     * field to the password manager, and there is no value of `autocomplete`
     * that gets it back: `off` is ignored on a password field, so the manager
     * offers the site login; `new-password` stops that but declares the user is
     * creating a password here, so the browser offers to generate one and then
     * to save it. Both readings are wrong, and both put the operator one
     * unnoticed click away from storing their own login password as the model
     * key. The field is therefore an ordinary text field the browser has no
     * reason to touch, masked in CSS.
     */
    secret?: boolean;
  };

const assignRef = (
  target: Ref<HTMLInputElement> | undefined,
  element: HTMLInputElement | null
) => {
  if (typeof target === 'function') target(element);
  else if (target) target.current = element;
};

export const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const {
    label,
    icon,
    action,
    helper,
    standalone,
    density = 'standard',
    fieldClassName,
    inputClassName,
    removeError,
    customUpdate,
    className,
    disableForm,
    error,
    translationKey,
    translationParams,
    secret,
    style,
    ...rest
  } = props;
  const form = useFormContext();
  const generatedId = useId();
  const inputId = props.id || `${props.name}-${generatedId}`;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const err = useMemo(() => {
    if (error) return error;
    if (!form || !form.formState.errors[props?.name!]) return;
    return form?.formState?.errors?.[props?.name!]?.message! as string;
  }, [form?.formState?.errors?.[props?.name!]?.message, error]);

  const watch = customUpdate ? form?.watch(props.name) : null;
  useEffect(() => {
    if (customUpdate) {
      customUpdate();
    }
  }, [watch]);

  const describedBy =
    [helper ? helperId : null, err ? errorId : null].filter(Boolean).join(' ') ||
    undefined;

  // The `data-*` attributes are what the third-party managers read; the browser
  // built-ins need nothing beyond the field not being a password.
  const secretProps = secret
    ? {
        type: 'text',
        autoComplete: 'off',
        autoCorrect: 'off',
        autoCapitalize: 'off',
        spellCheck: false,
        'data-1p-ignore': '',
        'data-lpignore': 'true',
        'data-bwignore': 'true',
        'data-form-type': 'other',
      }
    : undefined;
  const registration =
    disableForm || standalone || !form || !props.name
      ? undefined
      : form.register(props.name);

  return (
    <div
      className={clsx(
        'flex flex-col gap-[6px]',
        props.disabled && 'opacity-60',
        withoutConsumerHeight(fieldClassName)
      )}
    >
      {!!label && (
        <label htmlFor={inputId} className="text-[13px] font-[600] text-cf-ink">
          <TranslatedLabel
            label={label}
            translationKey={translationKey}
            translationParams={translationParams}
          />
        </label>
      )}
      <div
        className={clsx(
          // `overflow-hidden` keeps the autofill fill inside the rounded box:
          // the browser paints it on the input, which has square corners.
          'bg-cf-surface border rounded-[8px] overflow-hidden flex items-center transition-colors duration-state',
          density === 'dense' ? 'h-[32px]' : 'h-[40px]',
          'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cf-focus',
          err ? 'border-cf-danger' : 'border-cf-border-control',
          withoutConsumerHeight(className)
        )}
      >
        {icon && <div className="ps-[12px] text-cf-ink-muted">{icon}</div>}
        <input
          id={inputId}
          aria-invalid={err ? true : undefined}
          aria-describedby={describedBy}
          {...registration}
          {...rest}
          {...secretProps}
          ref={(element) => {
            assignRef(registration?.ref, element);
            assignRef(ref, element);
          }}
          style={withoutConsumerHeightStyle(style)}
          className={clsx(
            'h-full bg-transparent outline-none flex-1 min-w-0 text-[14px] text-cf-ink placeholder:text-cf-ink-muted',
            icon ? 'ps-[8px]' : 'ps-[12px]',
            action ? 'pe-[4px]' : 'pe-[12px]',
            secret && 'cf-secret-input',
            inputClassName
          )}
        />
        {action && <div className="pe-[6px] flex items-center">{action}</div>}
      </div>
      {helper && (
        <div id={helperId} className="text-[12px] text-cf-ink-muted">
          {helper}
        </div>
      )}
      {!removeError && (!standalone || err) && (
        <FieldMessage id={errorId} error={err} />
      )}
    </div>
  );
});
