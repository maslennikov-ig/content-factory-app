'use client';

import React from 'react';
import { Input } from '@contentfactory/react/form/input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Hint } from '@contentfactory/react/layout/hint';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Disclosure } from '../ui/disclosure';
import { FieldLabel, LabelledField } from '../ui/field-label';
import { aiProviderCopy } from './ai-provider.copy';

export interface ModelRouting {
  enabled: boolean;
  advancedModel: string;
  advancedFlex: boolean;
}

interface ModelOption {
  id: string;
  name: string;
  contextLength: number | null;
}

/**
 * A free-text field with a datalist rather than a plain select: OpenRouter
 * publishes hundreds of models, and a new one must be usable the day it
 * appears without waiting for this list to refresh.
 *
 * The sentence under the field moved into the «?» beside its name
 * (`97dq.62`, variant B): with the fields in pairs, a helper line under one
 * of them pushed its neighbour's row out of line.
 */
export const ModelField = ({
  id,
  label,
  hint,
  hintLabel,
  placeholder,
  value,
  options,
  listId,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  hint: string;
  hintLabel: string;
  placeholder: string;
  value: string;
  options: ModelOption[];
  listId: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) => (
  <LabelledField id={id} label={label} hint={hint} hintLabel={hintLabel}>
    <Input
      id={id}
      label=""
      name={listId}
      value={value}
      placeholder={placeholder}
      disableForm={true}
      list={listId}
      // A model id is typed a character at a time and none of the intermediate
      // ones is a model, so this field is saved when it is left rather than as
      // it is written. A key field has no such handler at all.
      onBlur={() => onCommit()}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onChange(e.target.value)
      }
    />
    <datalist id={listId}>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </datalist>
  </LabelledField>
);

const STAGE_ROLES = ['agent', 'draft', 'adapt', 'review'] as const;
const UTILITY_ROLES = [
  'classify',
  'extract',
  'research',
  'judge',
  'image',
] as const;

/** Workspace and operator defaults share the same routing and stage controls. */
export const ModelRoutingFields = ({
  idPrefix,
  value,
  roleModels,
  primaryModel,
  textOptions = [],
  imageOptions = [],
  words,
  onRoutingChange,
  onRoutingCommit,
  onRoleChange,
  onRoleCommit,
}: {
  idPrefix: string;
  value?: ModelRouting;
  roleModels: Partial<Record<string, string>>;
  primaryModel: string;
  textOptions?: ModelOption[];
  imageOptions?: ModelOption[];
  words: (typeof aiProviderCopy)['ru'];
  onRoutingChange: (next: ModelRouting) => void;
  onRoutingCommit: (next: ModelRouting) => void;
  onRoleChange: (role: string, model: string) => void;
  onRoleCommit: () => void;
}) => {
  const t = useT();
  const routingWords = words.routing;
  const roleField = (
    role: (typeof STAGE_ROLES)[number] | (typeof UTILITY_ROLES)[number],
    stage: boolean
  ) => {
    const label = stage
      ? routingWords.stages[role as (typeof STAGE_ROLES)[number]]
      : t(`ai_role_${role}`, role);
    return (
      <ModelField
        key={role}
        id={`${idPrefix}-role-model-${role}`}
        label={label}
        hintLabel={words.hintFor(label)}
        hint={words.roles[role].what}
        value={roleModels[role] ?? ''}
        placeholder={
          role === 'image'
            ? routingWords.defaultValue
            : stage && value?.enabled
            ? routingWords.autoPlaceholder
            : primaryModel || routingWords.defaultValue
        }
        options={role === 'image' ? imageOptions : textOptions}
        listId={`${idPrefix}-role-models-${role}`}
        onChange={(model) => onRoleChange(role, model)}
        onCommit={onRoleCommit}
      />
    );
  };
  const utilityOverrides = UTILITY_ROLES.filter((role) =>
    roleModels[role]?.trim()
  ).length;
  return (
    <div
      data-ai-model-routing="true"
      className="flex flex-col gap-[16px] border-t border-cf-border pt-[16px]"
    >
      {value && (
        <div className="flex flex-col gap-[12px]">
          <FieldLabel
            headingLevel={5}
            label={routingWords.title}
            labelClassName="cf-label-sm text-cf-ink-muted"
          />
          <CheckboxField
            name={`${idPrefix}-model-routing-enabled`}
            label={routingWords.enabledLabel}
            checked={value.enabled}
            aria-describedby={`${idPrefix}-model-routing-explanation`}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onRoutingCommit({ ...value, enabled: event.target.checked })
            }
          />
          <p
            id={`${idPrefix}-model-routing-explanation`}
            className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
          >
            {routingWords.explanation}
          </p>
          <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-2">
            <ModelField
              id={`${idPrefix}-advanced-model`}
              label={routingWords.advancedLabel}
              hintLabel={words.hintFor(routingWords.advancedLabel)}
              hint={routingWords.advancedHint}
              placeholder={routingWords.defaultValue}
              value={value.advancedModel}
              options={textOptions}
              listId={`${idPrefix}-advanced-models`}
              onChange={(advancedModel) =>
                onRoutingChange({ ...value, advancedModel })
              }
              onCommit={() => onRoutingCommit(value)}
            />
            <div className="flex min-w-0 items-start gap-[4px] lg:self-end">
              <CheckboxField
                name={`${idPrefix}-advanced-flex`}
                label={routingWords.advancedFlexLabel}
                checked={value.advancedFlex}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  onRoutingCommit({
                    ...value,
                    advancedFlex: event.target.checked,
                  })
                }
              />
              <Hint label={words.hintFor(routingWords.advancedFlexLabel)}>
                {routingWords.advancedFlexHint}
              </Hint>
            </div>
          </div>
        </div>
      )}
      <div data-ai-stage-models="true" className="flex flex-col gap-[12px]">
        <FieldLabel
          headingLevel={5}
          label={routingWords.stageTitle}
          labelClassName="cf-label-sm text-cf-ink-muted"
        />
        <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {value?.enabled
            ? routingWords.stageAutoEmpty
            : routingWords.stagePrimaryEmpty}
        </p>
        <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-2">
          {STAGE_ROLES.map((role) => roleField(role, true))}
        </div>
      </div>
      <Disclosure
        className="flex flex-col"
        summary={
          <span data-ai-roles-summary="true" className="cf-body-sm">
            {routingWords.utilityTitle}
            {utilityOverrides ? ` · ${utilityOverrides}` : ''}
          </span>
        }
        contentClassName="flex flex-col gap-[12px] pt-[8px]"
      >
        <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {words.rolesEmpty}
        </p>
        <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-2">
          {UTILITY_ROLES.map((role) => roleField(role, false))}
        </div>
      </Disclosure>
    </div>
  );
};
