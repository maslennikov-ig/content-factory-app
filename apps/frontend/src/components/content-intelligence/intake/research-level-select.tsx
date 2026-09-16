'use client';

import { Select } from '@contentfactory/react/form/select';
import { intakeCopy, type IntakeLocale } from './intake.copy';

export type ResearchLevel = 'quick' | 'standard' | 'deep';

/** One depth control shared by initial intake and research for an existing core. */
export function ResearchLevelSelect({
  locale,
  value = 'standard',
  disabled,
  onChange,
}: {
  locale: IntakeLocale;
  value?: ResearchLevel;
  disabled?: boolean;
  onChange: (level: ResearchLevel) => void;
}) {
  const copy = intakeCopy[locale];
  return (
    <Select
      standalone
      disabled={disabled}
      aria-label={copy.researchLevelLabel}
      value={value}
      onChange={(event) => onChange(event.target.value as ResearchLevel)}
    >
      <option value="quick">{copy.researchQuick}</option>
      <option value="standard">{copy.researchStandard}</option>
      <option value="deep">{copy.researchDeep}</option>
    </Select>
  );
}
