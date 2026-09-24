import { FC, KeyboardEvent, useCallback, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import i18next from 'i18next';
import { Calendar, TimeInput } from '@mantine/dates';
import { useClickOutside } from '@mantine/hooks';
import { Button } from '@contentfactory/react/form/button';
import { formatDateTimeForReader } from './isuscitizen.utils';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import { CalendarIcon } from '@contentfactory/frontend/components/ui/icons';
export const DatePicker: FC<{
  date: dayjs.Dayjs;
  onChange: (day: dayjs.Dayjs) => void;
  /**
   * Выключен, когда окно поста открыто на чтение
   * (`content-factory-next-fn33.90.10`). Дата поста — запись, а не подпись:
   * под Пользователем календарь открывался и время выбиралось, хотя
   * `PUT /posts/:id/date` несёт `Sections.EDITOR` и отказал бы.
   */
  disabled?: boolean;
}> = (props) => {
  const { date, onChange, disabled } = props;
  const [open, setOpen] = useState(false);
  const t = useT();

  const changeShow = useCallback(() => {
    if (disabled) {
      return;
    }
    setOpen((prev) => !prev);
  }, [disabled]);
  const ref = useClickOutside<HTMLDivElement>(() => {
    setOpen(false);
  });
  const changeDate = useCallback(
    (type: 'date' | 'time') => (day: Date) => {
      onChange(
        newDayjs(
          type === 'time'
            ? date.format('YYYY-MM-DD') + ' ' + newDayjs(day).format('HH:mm:ss')
            : newDayjs(day).format('YYYY-MM-DD') + ' ' + date.format('HH:mm:ss')
        )
      );
    },
    [date]
  );
  // Escape closes the picker from anywhere inside it, and focus goes back to
  // the trigger that opened it.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    },
    [open, ref]
  );
  return (
    <div
      ref={ref}
      className="relative ml-[7px] flex min-w-0 flex-1"
      onKeyDown={onKeyDown}
    >
      {/*
        A button, not a clickable div (`content-factory-next-97dq.43`, item 7):
        it takes focus, opens on Enter and Space, says whether the calendar is
        open, and is disabled rather than only dimmed for a reader.
      */}
      <Button
        variant="secondary"
        className="w-full"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open && !disabled}
        onClick={changeShow}
      >
        <CalendarIcon />
        {/*
          The reader's own notation. Two hand-written format strings could
          only ever be right for two of the sixteen languages the product
          speaks, and the American one was reached from the browser's locale
          rather than from anything the person chose
          (`content-factory-next-fn33.87`).
        */}
        <span>{formatDateTimeForReader(date.toDate())}</span>
      </Button>
      {open && !disabled && (
        <div
          role="dialog"
          aria-label={t('pick_time', 'Pick time')}
          className="animate-fadeIn absolute bottom-[100%] mb-[16px] start-[50%] -translate-x-[50%] bg-sixth border border-tableBorder text-textColor rounded-[16px] z-[300] p-[16px] flex flex-col"
        >
          <Calendar
            // Язык и неделя читателя: месяц «сентябрь 2026», неделя с понедельника
            // (десятый заход, 97dq.37 — выбор даты теперь стоит во вкладке канала).
            locale={i18next.resolvedLanguage || 'en'}
            firstDayOfWeek="monday"
            onChange={changeDate('date')}
            value={date.toDate()}
            dayClassName={(date, modifiers) => {
              if (modifiers.outside) {
                return '!text-gray';
              }
              if (modifiers.selected) {
                return '!text-cf-accent !bg-seventh !outline-none';
              }
              return '!text-textColor';
            }}
            classNames={{
              day: 'hover:bg-seventh',
              calendarHeaderControl: 'text-textColor hover:bg-third',
              calendarHeaderLevel: 'text-textColor hover:bg-third', // cell: 'child:!text-textColor'
            }}
          />
          <TimeInput
            onChange={changeDate('time')}
            label={t('pick_time', 'Pick time')}
            classNames={{
              label: 'text-textColor py-[12px]',
              input:
                'bg-sixth h-[40px] border border-tableBorder text-textColor rounded-[4px] outline-none',
            }}
            defaultValue={date.toDate()}
          />
          <Button className="mt-[12px]" onClick={changeShow}>
            {t('close', 'Close')}
          </Button>
        </div>
      )}
    </div>
  );
};
