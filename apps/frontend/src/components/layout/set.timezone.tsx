'use client';
import dayjs, { ConfigType } from 'dayjs';
import { FC, useEffect } from 'react';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';
import { firstKnownZone } from '@contentfactory/nestjs-libraries/chat/capabilities/person-time';
dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.extend(relativeTime);

const { utc: originalUtc } = dayjs;

export const getTimezone = () => {
  if (typeof window === 'undefined') {
    return dayjs.tz.guess();
  }
  return localStorage.getItem('timezone') || dayjs.tz.guess();
};

/**
 * The zone the screens read and write times in — exactly theirs, not the
 * machine's (review W2 F5): `getTimezone()`, the zone chosen in the profile
 * (`localStorage.timezone`), else dayjs's guess of the browser's; a value
 * `Intl` does not know, or storage that cannot be read, gives the browser's
 * own zone (`firstKnownZone`), `''` only when there is none. The chat sends it as
 * `x-agent-timezone`, and the server checks it and falls back on the saved
 * offset, then UTC; the fact form's «Свежо до» reads its day in it
 * (`kcxz.43`). Moved here from `agent.transport.ts`.
 */
export const screenTimeZone = (): string => {
  let profile = '';
  try {
    profile = getTimezone() || '';
  } catch {
    // Storage blocked: the browser's own zone below.
  }
  // One fallback for the facts form and the chat (`kcxz.43` review F5): a
  // profile zone `Intl` does not know reads as the browser's.
  let browser = '';
  try {
    browser = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    // No `Intl` zone: `''`, and the server falls back as before.
  }
  return firstKnownZone(profile, browser);
};

export const newDayjs = (config?: ConfigType) => {
  return dayjs(config);
};

const SetTimezone: FC = () => {
  useEffect(() => {
    dayjs.utc = (config?: ConfigType, format?: string, strict?: boolean) => {
      const result = originalUtc(config, format, strict);

      // Attach `.local()` method to the returned Dayjs object
      result.local = function () {
        return result.tz(getTimezone());
      };

      return result;
    };
    if (localStorage.getItem('timezone')) {
      dayjs.tz.setDefault(getTimezone());
    }
  }, []);
  return null;
};

export default SetTimezone;
