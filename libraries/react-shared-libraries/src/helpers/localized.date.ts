import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
// The same locale set the calendar loads, for the same reason: a date written
// in the wrong order is a different date to whoever reads it.
import 'dayjs/locale/en';
import 'dayjs/locale/he';
import 'dayjs/locale/ru';
import 'dayjs/locale/zh';
import 'dayjs/locale/fr';
import 'dayjs/locale/es';
import 'dayjs/locale/pt';
import 'dayjs/locale/de';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/ar';
import 'dayjs/locale/tr';
import 'dayjs/locale/vi';
import 'dayjs/locale/bn';
import 'dayjs/locale/ka';
import i18next from '@contentfactory/react/translation/i18next';

dayjs.extend(localizedFormat);

/**
 * A moment written the way the reader's language writes one.
 *
 * `content-factory-next-fn33.35` fixed this once, for the expiry of a team
 * invitation: `toLocaleString()` with no language printed «9/6/2026, 1:22:38
 * PM» on a Russian screen. `content-factory-next-fn33.115` found the same
 * decision made a second way in the list of accounts — `toISOString()` cut to
 * sixteen characters, so the registration date read «2026-09-04 12:26» in
 * every language, and in none of them the way a date is written.
 *
 * Two spellings of one decision are a defect waiting to be fixed twice, so the
 * decision lives here: `L, LT` is dayjs's own localized date and time, and the
 * language is the one i18next resolved for the interface, not the one the
 * process happens to run in. `ka_ge` is our locale id; dayjs calls that one
 * `ka`, and an id dayjs does not know falls back to English rather than
 * throwing.
 */
const dayjsLocale = (locale?: string) =>
  (locale || i18next.language || 'en').replace('ka_ge', 'ka');

export const formatLocalizedDateTime = (
  value: string | number | Date
): string => dayjs(value).locale(dayjsLocale()).format('L, LT');

/**
 * The same decision without the clock, and one that may answer «nothing».
 *
 * `content-factory-next-fn33.135`: a search provider dates its results in
 * RFC 822 — «Wed, 02 Sep 2026 15:54:46 GMT» — and the search panel printed the
 * first ten characters of whatever string arrived, which on that format is a
 * chopped English weekday. The hour is noise for a publication date, and a
 * date nobody can parse is better left unsaid than shown as a fragment, so
 * this returns an empty string and the caller prints nothing.
 *
 * The locale can be passed explicitly because one caller resolves the reader's
 * language itself, before i18next has settled on the server-rendered pass.
 */
export const formatLocalizedDate = (
  value: string | number | Date,
  locale?: string
): string => {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.locale(dayjsLocale(locale)).format('L') : '';
};
