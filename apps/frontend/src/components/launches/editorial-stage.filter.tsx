'use client';

import { FC } from 'react';
import { Select } from '@contentfactory/react/form/select';
import {
  EDITORIAL_STAGE_VALUES,
  EditorialStageValue,
  editorialStageCopy,
  resolveEditorialStageLocale,
} from '@contentfactory/frontend/components/launches/editorial-stage.copy';
import { useVariables } from '@contentfactory/react/helpers/variable.context';

/**
 * Filters the calendar and the list by editorial stage — the same row as
 * `SelectCustomer`, next to it. Carried to the server as a query parameter
 * (`calendar.context.tsx`'s `filters.editorialStage`), not applied over an
 * already-fetched page: a stage that has thousands of posts outside the
 * current date range still has to be findable.
 */
export const EditorialStageFilter: FC<{
  value: EditorialStageValue | null;
  onChange: (value: EditorialStageValue | null) => void;
}> = ({ value, onChange }) => {
  const { language } = useVariables();
  const locale = resolveEditorialStageLocale(language);
  const copy = editorialStageCopy[locale];

  return (
    <Select
      name="editorialStageFilter"
      label=""
      disableForm
      hideErrors
      aria-label={copy.filterLabel}
      value={value ?? ''}
      onChange={(event) => {
        const next = event.target.value as EditorialStageValue | '';
        onChange(next === '' ? null : next);
      }}
      fieldClassName="min-w-[140px]"
    >
      <option value="">{copy.filterAll}</option>
      {EDITORIAL_STAGE_VALUES.map((stage) => (
        <option key={stage} value={stage}>
          {copy[stage]}
        </option>
      ))}
    </Select>
  );
};
