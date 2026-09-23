'use client';

import React, {
  FC,
  Ref,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import useSWR from 'swr';
import Link from 'next/link';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import timezones from 'timezones-list';
import { UserDetailDto } from '@contentfactory/nestjs-libraries/dtos/users/user.details.dto';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { displayName } from '@contentfactory/react/helpers/display-name';
import { formatLocalizedDate } from '@contentfactory/react/helpers/localized.date';
import { providerLabel } from '@contentfactory/react/helpers/provider-label';
import { languages } from '@contentfactory/react/translation/i18n.config';
import { useFieldErrorMessage } from '@contentfactory/frontend/components/auth/form.errors';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useOpenMediaBox } from '@contentfactory/frontend/components/media/media.component';
import { Avatar } from '@contentfactory/frontend/components/ui/avatar';
import { Panel } from '@contentfactory/frontend/components/ui/surface';
import { SectionLabel } from '@contentfactory/frontend/components/ui/section-label';
import { useAccountLanguage } from '@contentfactory/frontend/components/layout/language.component';
import { getLanguageLabel } from '@contentfactory/frontend/components/layout/language.presentation';
import { getTimezone } from '@contentfactory/frontend/components/layout/set.timezone';
import { useOrganizationRoleName } from '@contentfactory/frontend/components/settings/teams.component';
import { settingsWordsFor } from '@contentfactory/frontend/components/settings/settings.copy';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * `timezones-list` writes the standard offset as `+05:30`; `User.timezone` is
 * that offset in minutes (`330`). `undefined` for a zone the list does not
 * know, so the column is left alone rather than set to a guess.
 */
export const offsetMinutes = (
  offset: string | undefined
): number | undefined => {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset ?? '');
  if (!match) return undefined;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
};

/**
 * A time zone the way a person names it: «Москва, UTC+3», not
 * «Europe/Moscow (GMT+03:00)». The city is the last segment of the IANA name
 * unless the words have a local one; the offset is the list's standard one,
 * the same number that is stored in `User.timezone`.
 */
export const timezoneLabel = (
  tzCode: string,
  utc: string | undefined,
  cities: Readonly<Record<string, string>>
): string => {
  const city =
    cities[tzCode] ??
    (tzCode.split('/').pop() || tzCode).replace(/_/g, ' ');
  const minutes = offsetMinutes(utc);
  if (minutes === undefined) return city;
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '−' : '+';
  return `${city}, UTC${sign}${hours}${
    rest ? `:${String(rest).padStart(2, '0')}` : ''
  }`;
};

/**
 * Профиль одной колонкой (`content-factory-next-97dq.51`, вариант A холста
 * одиннадцатой волны). Владелец 23.09.2026: «он очень растянутый… что-то ещё
 * полезного и интересного в профиль можно добавить».
 *
 * Колонка не шире 720: шапка с лицом и одной строкой о человеке, «О вас»
 * (имя, фамилия, коротко о себе), «Язык и время» и строка «Вход и пароль» со
 * ссылкой во вкладку способов входа. Все поля уже жили у `User`, ни одно не
 * редактировалось.
 *
 * Сохранение — кнопкой, как было: общего помощника автосохранения в продукте
 * нет, а писать третий рукописный — значит завести ещё одно мнение о том, когда
 * поле «сохранено». Язык — исключение, и оно старше этой вкладки: смена языка
 * уходит своей дверью сразу (`useAccountLanguage`), как в меню языка.
 *
 * Часовой пояс действует там же, где действовал всегда, — в этом браузере
 * (`localStorage.timezone`, `set.timezone.tsx`), а в `User.timezone` ложится
 * его смещение в минутах, чтобы у аккаунта оно тоже было записано.
 */
export const ProfileSettings: FC<{ getRef?: Ref<any> }> = ({ getRef }) => {
  const t = useT();
  const { language: variablesLanguage, oauthDisplayName } = useVariables();
  const words = settingsWordsFor(variablesLanguage).profile;
  const fetch = useFetch();
  const toast = useToaster();
  const user = useUser();
  const modal = useModals();
  const roleName = useOrganizationRoleName();
  const fieldErrorMessage = useFieldErrorMessage();
  const noteId = useId();

  const resolver = useMemo(() => classValidatorResolver(UserDetailDto), []);
  const form = useForm({ resolver });
  const picture = form.watch('picture');
  const firstName: string = form.watch('fullname') || '';
  const lastName: string = form.watch('lastName') || '';

  const [zone, setZone] = useState<string>(() => getTimezone());
  const { current: currentLanguage, change: changeLanguage } =
    useAccountLanguage();
  const [language, setLanguage] = useState<string>(currentLanguage);

  const loadProfile = useCallback(async () => {
    const personal = await (await fetch('/user/personal')).json();
    form.setValue('fullname', personal.name || '');
    form.setValue('lastName', personal.lastName || '');
    form.setValue('bio', personal.bio || '');
    form.setValue('picture', personal.picture);
  }, []);

  useEffect(() => {
    loadProfile();
  }, []);

  // Тот же ключ и тот же загрузчик, что у переключателя пространств: имя
  // пространства приходит из общего кэша, а не вторым запросом.
  const { data: organizations } = useSWR(
    'organizations',
    async () => (await fetch('/user/organizations')).json(),
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      refreshWhenOffline: false,
      refreshWhenHidden: false,
      revalidateOnReconnect: false,
    }
  );
  const organizationName: string | undefined = Array.isArray(organizations)
    ? organizations.find((org: { id: string }) => org.id === user?.orgId)?.name
    : undefined;

  // Ключ вкладки «Способы входа»: список, загруженный там, виден здесь, и
  // наоборот.
  const identities = useSWR<Array<{ provider: string }>>(
    '/user/identities',
    async () => {
      const response = await fetch('/user/identities');
      if (!response.ok) throw new Error('sign_in_methods_load_failed');
      return response.json();
    },
    { revalidateOnFocus: false }
  );

  const openMediaBox = useOpenMediaBox();
  // The library answers with everything that was selected; a profile picture
  // is one image, and the form field is one `MediaDto`. Handing it the whole
  // array left the avatar with nothing to read (`content-factory-next-fn33.15`).
  const openMedia = useCallback(() => {
    openMediaBox((values) => {
      if (!values?.length) return;
      form.setValue('picture', values[0]);
    });
  }, [openMediaBox]);
  const remove = useCallback(() => {
    form.setValue('picture', null);
  }, []);

  const zoneOptions = useMemo(() => {
    const known = timezones.some((entry) => entry.tzCode === zone);
    return known
      ? timezones
      : [{ tzCode: zone, label: zone, name: zone, utc: '' }, ...timezones];
  }, [zone]);

  const submit = useCallback(
    async (values: any) => {
      const offset = offsetMinutes(
        timezones.find((entry) => entry.tzCode === zone)?.utc
      );
      const response = await fetch('/user/personal', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          ...(offset === undefined ? {} : { timezone: offset }),
        }),
      });
      if (!response.ok) {
        toast.show(words.saveFailed, 'warning');
        return;
      }
      localStorage.setItem('timezone', zone);
      dayjs.tz.setDefault(zone);
      if (getRef) {
        return;
      }
      toast.show(t('profile_updated', 'Profile updated'));
      modal.closeAll();
    },
    [zone, words, getRef, t]
  );

  const fullName =
    [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') ||
    displayName({ name: user?.name, email: user?.email });
  const since = user?.createdAt
    ? formatLocalizedDate(user.createdAt, variablesLanguage)
    : '';
  const caption = [
    user?.email,
    roleName(user?.role),
    organizationName,
    since ? words.memberSince(since) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const methods = identities.error
    ? t('sign_in_methods_load_failed', 'Could not load sign-in methods.')
    : !identities.data
    ? t('loading', 'Loading...')
    : identities.data.length
    ? [...new Set(identities.data.map(({ provider }) => provider))]
        .map((provider) => providerLabel(provider, oauthDisplayName, t))
        .join(' · ')
    : words.signInNone;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        {!!getRef && <Button type="submit" className="hidden" ref={getRef} />}
        <section
          className="flex w-full max-w-[720px] flex-col gap-[20px]"
          aria-labelledby="profile-heading"
        >
          <h2 id="profile-heading" className="sr-only">
            {t('profile', 'Profile')}
          </h2>

          <div
            data-profile-header="true"
            className="flex flex-wrap items-center gap-[16px] sm:flex-nowrap sm:gap-[20px]"
          >
            <Avatar
              size={72}
              src={picture?.path}
              name={firstName || user?.name}
              email={user?.email}
            />
            <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-[4px]">
              <p className="cf-heading-lg text-cf-ink [overflow-wrap:anywhere] [text-wrap:balance]">
                {fullName}
              </p>
              <p className="cf-caption text-cf-ink-muted [overflow-wrap:anywhere]">
                {caption}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-[8px]">
              <Button
                type="button"
                variant="secondary"
                density="dense"
                onClick={openMedia}
              >
                {words.changePhoto}
              </Button>
              {picture && (
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  onClick={remove}
                >
                  {t('remove', 'Remove')}
                </Button>
              )}
            </div>
          </div>

          <Panel as="section" contentClassName="flex flex-col gap-[16px]">
            <SectionLabel as="h3">{words.aboutTitle}</SectionLabel>
            <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2">
              {/* `content-factory-next-fn33.73`: a profile saved with an
                  empty name used to answer «fullname must be longer than or
                  equal to 3 characters» — the property name out of the DTO,
                  in English, on a Russian screen. */}
              <Input
                label={t('name', 'Name')}
                autoComplete="given-name"
                maxLength={100}
                {...form.register('fullname')}
                error={fieldErrorMessage(
                  'fullname',
                  form.formState.errors.fullname?.message
                )}
              />
              <Input
                label={words.lastName}
                autoComplete="family-name"
                maxLength={100}
                {...form.register('lastName')}
                error={fieldErrorMessage(
                  'lastName',
                  form.formState.errors.lastName?.message
                )}
              />
            </div>
            <Textarea
              label={words.bio}
              name="bio"
              layout="content"
              maxLength={500}
              placeholder={words.bioPlaceholder}
              error={fieldErrorMessage(
                'bio',
                form.formState.errors.bio?.message as string | undefined
              )}
            />
          </Panel>

          <Panel as="section" contentClassName="flex flex-col gap-[16px]">
            <SectionLabel as="h3">{words.languageTimeTitle}</SectionLabel>
            {/* `grid-cols-1` is `minmax(0, 1fr)`: without it the column
                took the width of the longest time-zone option and both
                selects ran past the card at 390px (20-profile-m). */}
            <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-[8px]">
                <Select
                  id="profile-language"
                  name="profileLanguage"
                  label={words.interfaceLanguage}
                  disableForm={true}
                  hideErrors={true}
                  value={language}
                  aria-describedby={`${noteId}-language`}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                    setLanguage(event.target.value);
                    changeLanguage(event.target.value);
                  }}
                >
                  {languages.map((code) => (
                    <option key={code} value={code}>
                      {getLanguageLabel(code)}
                    </option>
                  ))}
                </Select>
                <p
                  id={`${noteId}-language`}
                  className="cf-body-sm text-cf-ink-muted"
                >
                  {words.languageNote}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-[8px]">
                <Select
                  id="profile-timezone"
                  name="profileTimezone"
                  label={words.timezone}
                  disableForm={true}
                  hideErrors={true}
                  value={zone}
                  aria-describedby={`${noteId}-timezone`}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    setZone(event.target.value)
                  }
                >
                  {zoneOptions.map((entry) => (
                    <option key={entry.tzCode} value={entry.tzCode}>
                      {timezoneLabel(
                        entry.tzCode,
                        entry.utc,
                        words.timezoneCities
                      )}
                    </option>
                  ))}
                </Select>
                <p
                  id={`${noteId}-timezone`}
                  className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                >
                  {words.timezoneNote}
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            as="section"
            contentPadding="none"
            contentClassName="flex flex-wrap items-center gap-[12px] px-[20px] py-[16px]"
          >
            <div
              data-profile-sign-in="true"
              className="flex min-w-0 flex-1 flex-col gap-[4px]"
            >
              <h3 className="cf-label-md text-cf-ink">{words.signInTitle}</h3>
              <p
                className={
                  identities.error
                    ? 'cf-body-sm text-cf-danger'
                    : 'cf-body-sm text-cf-ink-muted [overflow-wrap:anywhere]'
                }
              >
                {methods}
              </p>
            </div>
            <Link
              href="/settings?tab=sign_in_methods"
              className="inline-flex min-h-[40px] items-center gap-[8px] rounded-[8px] cf-label-md text-cf-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
            >
              {t('sign_in_methods', 'Sign-in methods')}
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="rtl:-scale-x-100"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </Panel>

          {!getRef && (
            <div className="flex items-center gap-[12px]">
              <Button
                type="submit"
                loading={form.formState.isSubmitting}
                loadingLabel={words.saving}
              >
                {t('save', 'Save')}
              </Button>
            </div>
          )}
        </section>
      </form>
    </FormProvider>
  );
};

export default ProfileSettings;
