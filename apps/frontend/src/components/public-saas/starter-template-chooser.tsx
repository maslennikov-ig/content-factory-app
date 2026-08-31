'use client';

import type { StarterTemplate } from '@contentfactory/nestjs-libraries/dtos/auth/starter-template';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';

export type StarterTemplateChooserCopy = {
  legend: string;
  blank: string;
  blankDescription: string;
  workflow: string;
  workflowDescription: string;
};

export function StarterTemplateChooser({
  value,
  onChange,
  copy,
}: {
  value: StarterTemplate;
  onChange: (value: StarterTemplate) => void;
  copy: StarterTemplateChooserCopy;
}) {
  const choices: Array<{
    id: StarterTemplate;
    label: string;
    description: string;
  }> = [
    { id: 'blank', label: copy.blank, description: copy.blankDescription },
    {
      id: 'content-workflow',
      label: copy.workflow,
      description: copy.workflowDescription,
    },
  ];

  return (
    <fieldset className="grid gap-[8px]">
      <legend className="cf-label-sm text-cf-ink">{copy.legend}</legend>
      <RadioGroup
        aria-label={copy.legend}
        className="grid gap-[8px] sm:grid-cols-2"
        value={value}
        onChange={(nextValue) => onChange(nextValue as StarterTemplate)}
      >
        {choices.map((choice) => (
          <RadioOption
            key={choice.id}
            value={choice.id}
            layout="content"
            className={`flex gap-[8px] rounded-cf border p-[12px] text-left transition-colors duration-state ${
              value === choice.id
                ? 'border-cf-accent bg-cf-accent-soft'
                : 'border-cf-border-control bg-cf-surface hover:bg-cf-surface-subtle'
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-[4px] flex size-[16px] shrink-0 items-center justify-center rounded-full border ${
                value === choice.id
                  ? 'border-cf-accent'
                  : 'border-cf-border-control'
              }`}
            >
              {value === choice.id ? (
                <span className="size-[8px] rounded-full bg-cf-accent" />
              ) : null}
            </span>
            <span className="grid gap-[4px]">
              <span className="cf-label-md text-cf-ink">{choice.label}</span>
              <span className="cf-caption text-cf-ink-muted">
                {choice.description}
              </span>
            </span>
          </RadioOption>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
