'use client';

import { Select } from '@contentfactory/react/form/select';
import React, { useState } from 'react';
import { isUSCitizen } from '@contentfactory/frontend/components/launches/helpers/isuscitizen.utils';
import timezones from 'timezones-list';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { SettingsSection } from '@contentfactory/frontend/components/settings/settings-section';
import { settingsWordsFor } from '@contentfactory/frontend/components/settings/settings.copy';
import { useVariables } from '@contentfactory/react/helpers/variable.context';

// The two option labels are wording, not data: they have to travel through the
// catalogue like every other visible string, so the pair keeps its fallback
// here and its translation key beside it.
const dateMetrics = [
  { key: 'date_format_12h', label: 'AM:PM', value: 'US' },
  { key: 'date_format_24h', label: '24 hours', value: 'GLOBAL' },
];

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(timezone);

const MetricComponent = () => {
  const t = useT();
  const words = settingsWordsFor(useVariables().language).global;
  const [currentMetric, setCurrentMetric] = useState(isUSCitizen());
  const [timezone, setTimezone] = useState(
    localStorage.getItem('timezone') || dayjs.tz.guess()
  );
  const changeMetric = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setCurrentMetric(value === 'US');
    localStorage.setItem('isUS', value);
  };

  const changeTimezone = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setTimezone(value);
    localStorage.setItem('timezone', value);
    dayjs.tz.setDefault(value);
  };
  return (
    <SettingsSection
      layout="row"
      title={t('date_format', 'Date format')}
      caption={words.dateFormat}
    >
      <Select
        name="metric"
        disableForm={true}
        label=""
        aria-label={t('date_format', 'Date format')}
        fieldClassName="w-full sm:w-[240px]"
        onChange={changeMetric}
        value={currentMetric ? 'US' : 'GLOBAL'}
      >
        {dateMetrics.map((metric) => (
          <option key={metric.value} value={metric.value}>
            {t(metric.key, metric.label)}
          </option>
        ))}
      </Select>

      {/*<div className="mt-[4px]">Current Timezone</div>*/}
      {/*<Select*/}
      {/*  name="timezone"*/}
      {/*  disableForm={true}*/}
      {/*  label=""*/}
      {/*  onChange={changeTimezone}*/}
      {/*>*/}
      {/*  {timezones.map((metric) => (*/}
      {/*    <option*/}
      {/*      key={metric.name}*/}
      {/*      value={metric.tzCode}*/}
      {/*      selected={metric.tzCode === timezone}*/}
      {/*    >*/}
      {/*      {metric.label}*/}
      {/*    </option>*/}
      {/*  ))}*/}
      {/*</Select>*/}
    </SettingsSection>
  );
};

export default MetricComponent;
