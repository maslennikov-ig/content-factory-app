'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { Select } from '@contentfactory/react/form/select';
import { Button } from '@contentfactory/react/form/button';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
// @ts-ignore
import useKeypress from 'react-use-keypress';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { sortBy } from 'lodash';
import { usePreventWindowUnload } from '@contentfactory/react/helpers/use.prevent.window.unload';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import clsx from 'clsx';
import {
  TrashIcon,
  PlusIcon,
  DelayIcon,
} from '@contentfactory/frontend/components/ui/icons';

dayjs.extend(utc);
dayjs.extend(timezone);

const hours = [...Array(24).keys()].map((i) => ({
  value: i,
}));

const minutes = [...Array(60).keys()].map((i) => ({
  value: i,
}));

export const TimeTable: FC<{
  integration: Integrations;
  mutate: () => void;
}> = (props) => {
  const t = useT();
  const {
    integration: { time },
    mutate,
  } = props;
  const [currentTimes, setCurrentTimes] = useState([...time]);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const fetch = useFetch();
  const modal = useModals();
  usePreventWindowUnload(true);

  const askClose = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_the_window',
          'Are you sure you want to close the window?'
        ),
        t('yes_close', 'Yes, close')
      ))
    ) {
      return;
    }
    modal.closeAll();
  }, []);

  useKeypress('Escape', askClose);

  const removeSlot = useCallback(
    (index: number) => async () => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_this_slot',
            'Are you sure you want to delete this slot?'
          )
        ))
      ) {
        return;
      }
      setCurrentTimes((prev) => prev.filter((_, i) => i !== index));
    },
    []
  );

  const addHour = useCallback(() => {
    const calculateMinutes =
      newDayjs()
        .utc()
        .startOf('day')
        .add(hour, 'hours')
        .add(minute, 'minutes')
        .diff(newDayjs().utc().startOf('day'), 'minutes') -
      dayjs.tz().utcOffset();
    setCurrentTimes((prev) => [
      ...prev,
      {
        time: calculateMinutes,
      },
    ]);
  }, [hour, minute]);

  const times = useMemo(() => {
    return sortBy(
      currentTimes.map(({ time }) => ({
        value: time,
        formatted: dayjs
          .utc()
          .startOf('day')
          .add(time, 'minutes')
          .local()
          .format('HH:mm'),
      })),
      (p) => p.value
    );
  }, [currentTimes]);

  const save = useCallback(async () => {
    await fetch(`/integrations/${props.integration.id}/time`, {
      method: 'POST',
      body: JSON.stringify({
        time: currentTimes,
      }),
    });
    mutate();
    modal.closeAll();
  }, [currentTimes]);

  return (
    <div className="relative w-full max-w-[400px] mx-auto">
      {/* Add Time Slot Section */}
      <div className="bg-newBgColorInner rounded-[12px] p-[20px] border border-newTableBorder">
        <div className="text-[15px] font-semibold mb-[16px] flex items-center gap-[8px]">
          <DelayIcon size={18} className="text-cf-accent" />
          {t('add_time_slot', 'Add Time Slot')}
        </div>

        <div className="flex gap-[12px] items-end">
          <div className="flex-1">
            <Select
              label={t('hour', 'Hour')}
              name="hour"
              disableForm={true}
              hideErrors={true}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
            >
              {hours.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.value.toString().padStart(2, '0')}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Select
              label={t('minutes', 'Minutes')}
              name="minutes"
              disableForm={true}
              hideErrors={true}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
            >
              {minutes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.value.toString().padStart(2, '0')}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            onClick={addHour}
 className="px-[16px] transition-colors rounded-[8px] flex items-center text-[14px] font-medium"
          >
            <PlusIcon size={14} />
            {t('add', 'Add')}
          </Button>
        </div>
      </div>

      {/* Time Slots List */}
      <div className="mt-[20px]">
        <div className="text-[14px] text-newTextColor/60 mb-[12px]">
          {t('scheduled_times', 'Scheduled Times')} ({times.length})
        </div>

        {times.length === 0 ? (
          <div className="text-center py-[32px] text-newTextColor/40 text-[14px] border border-dashed border-newTableBorder rounded-[12px]">
            {t('no_time_slots', 'No time slots added yet')}
          </div>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {times.map((timeSlot, index) => (
              <div
                key={`${timeSlot.value}-${index}`}
                className={clsx(
                  'group flex items-center justify-between',
                  'h-[48px] px-[16px] rounded-[8px]',
                  'bg-newBgColorInner border border-newTableBorder',
                  'hover:border-cf-accent transition-colors'
                )}
              >
                <div className="flex items-center gap-[12px]">
                  <div className="w-[8px] h-[8px] rounded-full bg-cf-accent" />
                  <span className="text-[15px] font-medium tabular-nums">
                    {timeSlot.formatted}
                  </span>
                </div>
                <Button
                  iconOnly
                  size={28}
                  aria-label={t('remove', 'Remove')}
                  variant="destructive"
                  type="button"
                  onClick={removeSlot(index)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-[8px] rounded-[6px]"
                >
                  <TrashIcon size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="mt-[24px]">
        <Button type="button" className="w-full rounded-[8px]" onClick={save}>
          {t('save_changes', 'Save Changes')}
        </Button>
      </div>
    </div>
  );
};
