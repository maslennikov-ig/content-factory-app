'use client';

import React from 'react';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import dynamic from 'next/dynamic';
import EmailNotificationsComponent from '@contentfactory/frontend/components/settings/email-notifications.component';
import ShortlinkPreferenceComponent from '@contentfactory/frontend/components/settings/shortlink-preference.component';
import AiProviderComponent from '@contentfactory/frontend/components/settings/ai-provider.component';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';

const MetricComponent = dynamic(
  () => import('@contentfactory/frontend/components/settings/metric.component'),
  {
    ssr: false,
  }
);

export const GlobalSettings = () => {
  const t = useT();
  const user = useUser();
  // `/settings/ai` and `/settings/ai/models` are both behind the ADMIN policy,
  // and this tab opens by default. Rendering the section for a member fired
  // both requests on open and answered a role refusal, so the refusal was the
  // first thing Settings did. The gate is the one Teams and Billing use.
  const isAdmin = isOrganizationAdmin(user?.role);
  // Не шире 960: подпись раздела слева, поля справа (`97dq.51`). Владелец
  // 23.09.2026: «в глобальных настройках тоже всё очень растянуто».
  return (
    <div className="flex w-full max-w-[960px] flex-col">
      <h2 className="pb-[8px] cf-heading-md text-cf-ink [text-wrap:balance]">
        {t('global_settings', 'Global Settings')}
      </h2>
      <MetricComponent />
      <EmailNotificationsComponent />
      {isAdmin && <ShortlinkPreferenceComponent />}
      {isAdmin && <AiProviderComponent />}
    </div>
  );
};
