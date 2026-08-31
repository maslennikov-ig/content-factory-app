'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Slider } from '@contentfactory/react/form/slider';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

interface EmailNotifications {
  sendSuccessEmails: boolean;
  sendFailureEmails: boolean;
  sendStreakEmails: boolean;
}

export const useEmailNotifications = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/user/email-notifications')).json();
  }, []);

  return useSWR<EmailNotifications>('email-notifications', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const EmailNotificationsComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading } = useEmailNotifications();

  const [localSettings, setLocalSettings] = useState<EmailNotifications>({
    sendSuccessEmails: true,
    sendFailureEmails: true,
    sendStreakEmails: true,
  });

  // Keep a ref to always have the latest state
  const settingsRef = useRef(localSettings);
  settingsRef.current = localSettings;

  // Sync local state with fetched data
  useEffect(() => {
    if (data) {
      setLocalSettings(data);
    }
  }, [data]);

  const updateSetting = useCallback(
    async (key: keyof EmailNotifications, value: boolean) => {
      // Use ref to get the latest state
      const currentSettings = settingsRef.current;
      const newData = {
        ...currentSettings,
        [key]: value,
      };

      // Update local state immediately
      setLocalSettings(newData);

      await fetch('/user/email-notifications', {
        method: 'POST',
        body: JSON.stringify(newData),
      });

      toaster.show(t('settings_updated', 'Settings updated'), 'success');
    },
    []
  );

  const handleSuccessEmailsChange = useCallback(
    (value: 'on' | 'off') => {
      updateSetting('sendSuccessEmails', value === 'on');
    },
    [updateSetting]
  );

  const handleFailureEmailsChange = useCallback(
    (value: 'on' | 'off') => {
      updateSetting('sendFailureEmails', value === 'on');
    },
    [updateSetting]
  );

  const handleStreakEmailsChange = useCallback(
    (value: 'on' | 'off') => {
      updateSetting('sendStreakEmails', value === 'on');
    },
    [updateSetting]
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
        {t('email_notifications', 'Email Notifications')}
      </h4>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="cf-label-md text-cf-ink">
            {t('success_emails', 'Success Emails')}
          </div>
          <div className="cf-body-sm text-cf-ink-muted">
            {t(
              'success_emails_description',
              'Receive email notifications when posts are published successfully'
            )}
          </div>
        </div>
        <Slider
          value={localSettings.sendSuccessEmails ? 'on' : 'off'}
          onChange={handleSuccessEmailsChange}
          fill={true}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="cf-label-md text-cf-ink">
            {t('failure_emails', 'Failure Emails')}
          </div>
          <div className="cf-body-sm text-cf-ink-muted">
            {t(
              'failure_emails_description',
              'Receive email notifications when posts fail to publish'
            )}
          </div>
        </div>
        <Slider
          value={localSettings.sendFailureEmails ? 'on' : 'off'}
          onChange={handleFailureEmailsChange}
          fill={true}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="cf-label-md text-cf-ink">
            {t('streak_emails', 'Streak Reminder Emails')}
          </div>
          <div className="cf-body-sm text-cf-ink-muted">
            {t(
              'streak_emails_description',
              'Receive email reminders when your posting streak is about to end'
            )}
          </div>
        </div>
        <Slider
          value={localSettings.sendStreakEmails ? 'on' : 'off'}
          onChange={handleStreakEmailsChange}
          fill={true}
        />
      </div>
    </section>
  );
};

export default EmailNotificationsComponent;
