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
 * The editor's own choice of the four editorial-stage values, plus the fifth
 * choice this field always had before it had a name: unset. Unset has to be
 * a real, selectable option here — not only the value a fresh post starts
 * with — because a post that was given a stage by mistake needs a way back
 * to "no stage recorded" without deleting and recreating the post.
 */
export const EditorialStageSelect: FC<{
  value: EditorialStageValue | null;
  onChange: (value: EditorialStageValue | null) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const { language } = useVariables();
  const locale = resolveEditorialStageLocale(language);
  const copy = editorialStageCopy[locale];

  return (
    <Select
      name="editorialStage"
      label=""
      disableForm
      hideErrors
      aria-label={copy.fieldLabel}
      value={value ?? ''}
      onChange={(event) => {
        const next = event.target.value as EditorialStageValue | '';
        onChange(next === '' ? null : next);
      }}
      fieldClassName={className}
    >
      <option value="">{copy.unset}</option>
      {EDITORIAL_STAGE_VALUES.map((stage) => (
        <option key={stage} value={stage}>
          {copy[stage]}
        </option>
      ))}
    </Select>
  );
};
