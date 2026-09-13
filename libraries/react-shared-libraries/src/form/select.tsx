'use client';

import { DetailedHTMLProps, forwardRef, SelectHTMLAttributes, useId, useMemo } from 'react';
import { clsx } from 'clsx';
import { useFormContext } from 'react-hook-form';
import { RegisterOptions } from 'react-hook-form/dist/types/validator';
import { TranslatedLabel } from '../translation/translated-label';
import { FieldMessage } from './field-message';
import { withoutConsumerHeight, withoutConsumerHeightStyle } from './control-height';

type NativeSelectProps = DetailedHTMLProps<
  SelectHTMLAttributes<HTMLSelectElement>,
  HTMLSelectElement
>;

type SharedSelectProps = NativeSelectProps & {
  density?: 'standard' | 'dense';
  error?: any;
  extraForm?: RegisterOptions<any>;
  disableForm?: boolean;
  hideErrors?: boolean;
  /** Layout classes for the outer field, e.g. `flex-1`; `className` paints the control. */
  fieldClassName?: string;
  translationKey?: string;
  translationParams?: Record<string, string | number>;
};

type SelectProps =
  | (SharedSelectProps & { standalone?: false; label: string; name: string })
  | (SharedSelectProps & { standalone: true; label?: never });

export const Select = forwardRef<HTMLSelectElement, SelectProps>((props, ref) => {
  const {
    label,
    className,
    standalone,
    density = 'standard',
    hideErrors,
    disableForm,
    error,
    extraForm,
    fieldClassName,
    translationKey,
    translationParams,
    style,
    ...rest
  } = props;
  const form = useFormContext();
  const generatedId = useId();
  const fieldId = props.id || `${props.name || 'select'}-${generatedId}`;
  const errorId = `${fieldId}-error`;

  const err = useMemo(() => {
    if (error) return error;
    if (standalone || !form || !props.name || !form.formState.errors[props.name]) return;
    return form?.formState?.errors?.[props?.name!]?.message! as string;
  }, [standalone, form?.formState?.errors?.[props.name!]?.message, error]);

  const control = (
    <select
      id={fieldId}
      ref={ref}
      aria-invalid={err ? true : undefined}
      aria-describedby={err ? errorId : undefined}
      {...(!standalone && !disableForm && props.name
        ? form.register(props.name, extraForm)
        : {})}
      className={clsx(
        density === 'dense' ? 'h-[32px]' : 'h-[40px]',
        /**
         * `cf-field-chevron` owns the mark and the room it needs, so only the
         * leading padding is written here. A `px-*` utility would set the
         * trailing side too and win the cascade over the component layer,
         * which is how the chevron would end up sitting on the text.
         *
         * The arrow is drawn rather than left to the platform because a
         * browser draws it wherever it likes: beside an `Input`'s clear
         * control, which this system does place, the two marks stood at
         * visibly different distances from the same edge. The native control
         * is otherwise untouched — this is `appearance`, not a `div` wearing
         * `role="listbox"` — so the keyboard, the mobile picker and the
         * screen reader all keep behaving as the platform's own.
         */
        'cf-field-chevron',
        'bg-cf-surface ps-[12px] border rounded-[8px] text-[14px] text-cf-ink',
        'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
        err ? 'border-cf-danger' : 'border-cf-border-control',
        withoutConsumerHeight(className)
      )}
      {...rest}
      style={withoutConsumerHeightStyle(style)}
    />
  );

  if (standalone) return control;

  return (
    <div
      className={clsx(
        'flex flex-col',
        label ? 'gap-[6px]' : '',
        withoutConsumerHeight(fieldClassName)
      )}
    >
      {!!label && (
        <label htmlFor={fieldId} className="text-[13px] font-[600] text-cf-ink">
          <TranslatedLabel
            label={label}
            translationKey={translationKey}
            translationParams={translationParams}
          />
        </label>
      )}
      {control}
      {!hideErrors && <FieldMessage id={errorId} error={err} />}
    </div>
  );
});
