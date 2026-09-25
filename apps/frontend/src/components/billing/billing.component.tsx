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
import { useVariables } from '@contentfactory/react/helpers/variable.context';
export const BillingComponent = () => {
  const fetch = useFetch();
  // Billing exists only where Stripe is configured — the same flag the menu
  // and the first-billing gate read. Without it nothing is fetched and the
  // screen is one card instead of upstream's tiers (2q28.30).
  const { billingEnabled } = useVariables();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const {
    isLoading: isLoadingTier,
    error: tiersError,
    data: tiers,
  } = useSWR(billingEnabled ? '/user/subscription/tiers' : null, load);
  const {
    isLoading: isLoadingSubscription,
    error: subscriptionError,
    data: subscription,
  } = useSWR(billingEnabled ? '/user/subscription' : null, load);
  const locale = i18next.resolvedLanguage?.startsWith('ru') ? 'ru' : 'en';
  if (!billingEnabled) {
    return (
      <BillingManageView
        state="unavailable"
        locale={locale}
        plans={[]}
        currentPlan="FREE"
        period="MONTHLY"
      />
    );
  }
  const state = resolveBillingManageState({
    isLoading: isLoadingSubscription || isLoadingTier,
    error: subscriptionError || tiersError,
    subscriptionLoaded: subscription !== undefined && tiers !== undefined,
  });
  if (state !== 'default') {
    return (
      <BillingManageView
        state={state}
        locale={locale}
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
