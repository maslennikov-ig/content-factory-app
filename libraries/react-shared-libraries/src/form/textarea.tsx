'use client';

import {
  DetailedHTMLProps,
  forwardRef,
  TextareaHTMLAttributes,
  useId,
  useMemo,
} from 'react';
import clsx from 'clsx';
import { useFormContext } from 'react-hook-form';
import { TranslatedLabel } from '../translation/translated-label';
import { FieldMessage } from './field-message';
import { withoutConsumerHeight, withoutConsumerHeightStyle } from './control-height';

type NativeTextareaProps = DetailedHTMLProps<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  HTMLTextAreaElement
>;

type SharedTextareaProps = NativeTextareaProps & {
  layout?: 'content';
  error?: any;
  disableForm?: boolean;
  /** Layout classes for the outer field, e.g. `flex-1`; `className` paints the control. */
  fieldClassName?: string;
  translationKey?: string;
  translationParams?: Record<string, string | number>;
};

type TextareaProps =
  | (SharedTextareaProps & { standalone?: false; label: string; name: string })
  | (SharedTextareaProps & { standalone: true; label?: never });

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => {
  const {
    label,
    className,
    standalone,
    layout,
    disableForm,
    error,
    fieldClassName,
    translationKey,
    translationParams,
    style,
    ...rest
  } = props;
  const form = useFormContext();
  const generatedId = useId();
  const fieldId = props.id || `${props.name || 'textarea'}-${generatedId}`;
  const errorId = `${fieldId}-error`;

  const err = useMemo(() => {
    if (error) return error;
    if (standalone || !form || !props.name || !form.formState.errors[props.name]) return;
    return form?.formState?.errors?.[props?.name!]?.message! as string;
  }, [standalone, form?.formState?.errors?.[props.name!]?.message, error]);

  const control = (
    <textarea
      id={fieldId}
      ref={ref}
      aria-invalid={err ? true : undefined}
      aria-describedby={err ? errorId : undefined}
      {...(!standalone && !disableForm && props.name ? form.register(props.name) : {})}
      className={clsx(
        'bg-cf-surface p-[12px] border rounded-[8px] text-[14px] text-cf-ink placeholder:text-cf-ink-muted',
        layout === 'content' ? 'min-h-[80px]' : 'min-h-[150px]',
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
        'flex flex-col gap-[6px]',
        props.disabled && 'opacity-60',
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
      <FieldMessage id={errorId} error={err} />
    </div>
  );
});
