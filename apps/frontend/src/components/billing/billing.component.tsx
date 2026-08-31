'use client';

import { useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { LoadingComponent } from '@contentfactory/frontend/components/layout/loading';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { MainBillingComponent } from './main.billing.component';
import {
  BillingManageView,
  resolveBillingManageState,
} from './billing-manage.view';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import i18next from 'i18next';
export const BillingComponent = () => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const {
    isLoading: isLoadingTier,
    error: tiersError,
    data: tiers,
  } = useSWR('/user/subscription/tiers', load);
  const {
    isLoading: isLoadingSubscription,
    error: subscriptionError,
    data: subscription,
  } = useSWR('/user/subscription', load);
  const state = resolveBillingManageState({
    isLoading: isLoadingSubscription || isLoadingTier,
    error: subscriptionError || tiersError,
    subscriptionLoaded: subscription !== undefined && tiers !== undefined,
  });
  if (state !== 'default') {
    return (
      <BillingManageView
        state={state}
        locale={i18next.resolvedLanguage?.startsWith('ru') ? 'ru' : 'en'}
        plans={Object.entries(pricing).map(([id, plan]) => ({
          id,
          name: id,
          monthly: plan.month_price,
          yearly: plan.year_price,
          features: [],
        }))}
        currentPlan="FREE"
        period="MONTHLY"
      />
    );
  }
  return <MainBillingComponent sub={subscription?.subscription} />;
};
