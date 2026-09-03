'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Select } from '@contentfactory/react/form/select';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';

type ShortLinkPreference = 'ASK' | 'YES' | 'NO';

interface ShortlinkPreferenceResponse {
  shortlink: ShortLinkPreference;
}

export const useShortlinkPreference = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/settings/shortlink')).json();
  }, []);

  return useSWR<ShortlinkPreferenceResponse>('shortlink-preference', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const ShortlinkPreferenceComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const { data, isLoading, mutate } = useShortlinkPreference();

  // `POST /settings/shortlink` is behind the ADMIN policy but `GET` is not, so
  // the row opened fine for a member and only refused on save. The control is
  // disabled rather than hidden, unlike the AI provider section: the
  // preference governs how this member's own posts are handled, and they can
  // already read it, so hiding it would take away something they have.
  const canChange = isOrganizationAdmin(user?.role);

  const [localValue, setLocalValue] = useState<ShortLinkPreference>('ASK');

  // Sync local state with fetched data
  useEffect(() => {
    if (data?.shortlink) {
      setLocalValue(data.shortlink);
    }
  }, [data]);

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = event.target.value as ShortLinkPreference;

      // Update local state immediately
      setLocalValue(newValue);

      await fetch('/settings/shortlink', {
        method: 'POST',
        body: JSON.stringify({ shortlink: newValue }),
      });

      mutate({ shortlink: newValue });
      toaster.show(t('settings_updated', 'Settings updated'), 'success');
    },
    [fetch, mutate, toaster, t]
  );

  if (isLoading) {
    return (
      <div className="my-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  return (
    <section className="my-[16px] flex flex-col gap-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[24px]">
      <h4 className="cf-label-md text-cf-ink">
        {t('shortlink_settings', 'Shortlink Settings')}
      </h4>
      <div className="flex items-center justify-between gap-[24px]">
        <div className="flex flex-col flex-1">
          <div className="cf-label-md text-cf-ink">
            {t('shortlink_preference', 'Shortlink Preference')}
          </div>
          <div className="cf-body-sm text-cf-ink-muted">
            {t(
              'shortlink_preference_description',
              'Control how URLs in your posts are handled. Shortlinks provide click statistics.'
            )}
          </div>
          {!canChange && (
            <div className="mt-[4px] cf-body-sm text-cf-ink-muted">
              {t(
                'shortlink_preference_admin_only',
                'Only an administrator of your organization can change this setting.'
              )}
            </div>
          )}
        </div>
        <div className="w-[200px]">
          <Select
            name="shortlink"
            label=""
            disableForm={true}
            hideErrors={true}
            disabled={!canChange}
            value={localValue}
            onChange={handleChange}
          >
            <option value="ASK">{t('shortlink_ask', 'Ask every time')}</option>
            <option value="YES">
              {t('shortlink_yes', 'Always shortlink')}
            </option>
            <option value="NO">{t('shortlink_no', 'Never shortlink')}</option>
          </Select>
        </div>
      </div>
    </section>
  );
};

export default ShortlinkPreferenceComponent;
