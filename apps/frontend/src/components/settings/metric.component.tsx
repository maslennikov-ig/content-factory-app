'use client';

import { Select } from '@contentfactory/react/form/select';
import React, { useState } from 'react';
import { isUSCitizen } from '@contentfactory/frontend/components/launches/helpers/isuscitizen.utils';
import timezones from 'timezones-list';
const dateMetrics = [
  { label: 'AM:PM', value: 'US' },
  { label: '24 hours', value: 'GLOBAL' },
];

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(timezone);

const MetricComponent = () => {
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
    console.log(value);
    setTimezone(value);
    localStorage.setItem('timezone', value);
    dayjs.tz.setDefault(value);
  };
  return (
    <section className="my-[16px] flex flex-col gap-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[24px]">
      <h4 className="cf-label-md text-cf-ink">Date format</h4>
      <Select
        name="metric"
        disableForm={true}
        label=""
        onChange={changeMetric}
        value={currentMetric ? 'US' : 'GLOBAL'}
      >
        {dateMetrics.map((metric) => (
          <option key={metric.value} value={metric.value}>
            {metric.label}
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
    </section>
  );
};

export default MetricComponent;
