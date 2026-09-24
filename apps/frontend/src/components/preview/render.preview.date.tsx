'use client';

import { FC } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { formatLocalizedDateTime } from '@contentfactory/react/helpers/localized.date';
dayjs.extend(utc);

/**
 * The publication moment in the reader's language (fn33.144, 97dq.43 item 6).
 *
 * A fixed English pattern printed «September 5, 2026 5:00 AM» — and, with a
 * Russian dayjs locale loaded, «сентябрь 23, 2026 2:10 дня» — where the
 * calendar writes «05.09.2026, 05:00». Rendered client-only, so the zone and
 * language are the reader's; the stored moment is UTC, as before.
 */
export const RenderPreviewDate: FC<{ date: string }> = ({ date }) => {
  return <>{formatLocalizedDateTime(dayjs.utc(date).toDate())}</>;
};
