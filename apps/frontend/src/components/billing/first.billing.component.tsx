'use client';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { OrganizationSelector } from '@contentfactory/frontend/components/layout/organization.selector';
import { LanguageComponent } from '@contentfactory/frontend/components/layout/language.component';
import { AdminBarToggle } from '@contentfactory/frontend/components/layout/impersonate';
import NotificationComponent from '@contentfactory/frontend/components/notifications/notification.component';
import dynamic from 'next/dynamic';
import { Wordmark } from '@contentfactory/frontend/components/ui/brand/wordmark';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import { capitalize } from 'lodash';
import clsx from 'clsx';
import { LoadingComponent } from '@contentfactory/frontend/components/layout/loading';
import { CheckIconComponent } from '@contentfactory/frontend/components/ui/check.icon.component';
import {
  FAQComponent,
  FAQSection,
} from '@contentfactory/frontend/components/billing/faq.component';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { LogoutComponent } from '@contentfactory/frontend/components/layout/logout.component';
import { DeveloperIconComponent } from '@contentfactory/frontend/components/developer/developer.icon.component';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import i18next from 'i18next';
import {
  BillingFirstUseView,
  resolveBillingFirstUseState,
} from './billing-first-use.view';

const ModeComponent = dynamic(
  () => import('@contentfactory/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

const EmbeddedBilling = dynamic(
  () =>
    import('@contentfactory/frontend/components/billing/embedded.billing').then(
      (mod) => mod.EmbeddedBilling
    ),
  {
    ssr: false,
  }
);

export const FirstBillingComponent = () => {
  const { stripeClient } = useVariables();
  const user = useUser();
  const [stripe, setStripe] = useState<null | Promise<Stripe>>(null);
  const [tier, setTier] = useState('STANDARD');
  const [period, setPeriod] = useState('MONTHLY');
  const fetch = useFetch();
  const modals = useModals();
  const t = useT();

  useEffect(() => {
    setStripe(loadStripe(stripeClient));
  }, []);

  const loadCheckout = useCallback(async () => {
    return (
      await fetch('/billing/embedded', {
        method: 'POST',
        body: JSON.stringify({
          billing: tier,
          period: period,
        }),
      })
    ).json();
  }, [tier, period]);

  const { data, error, isLoading } = useSWR(
    `/billing-${tier}-${period}`,
    loadCheckout,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      refreshWhenOffline: false,
      refreshWhenHidden: false,
    }
  );

  const price = useMemo(
    () => Object.entries(pricing).filter(([key, value]) => key !== 'FREE'),
    []
  );

  const PlanIntro = () => {
    return (
      <>
        <div className="text-[28px] tablet:text-[24px] mobile:!text-[22px] font-[650] leading-[1.2] tracking-[-0.02em] text-balance">
          {t(
            'billing_choose_plan_heading',
            'Choose the plan for this workspace'
          )}
        </div>
        <p className="mt-[8px] text-[15px] leading-[1.55] text-cf-ink-muted max-w-[60ch] [text-wrap:pretty]">
          {t(
            'billing_choose_plan_intro',
            'Plans differ in connected channels, monthly posts and generation limits. You can change or cancel a plan from settings at any time.'
          )}
        </p>

        {!!user?.allowTrial && (
          <ul className="flex flex-col gap-[8px] mt-[24px] text-[14px]">
            <li className="flex gap-[8px] items-center">
              <CheckIconComponent />
              <span>
                {t('billing_no_risk_trial', '100% No-Risk Free Trial')}
              </span>
            </li>
            <li className="flex gap-[8px] items-center">
              <CheckIconComponent />
              <span>
                {t(
                  'billing_pay_nothing_7_days',
                  'Pay NOTHING for the first 7-days'
                )}
              </span>
            </li>
            <li className="flex gap-[8px] items-center">
              <CheckIconComponent />
              <span>
                {t('billing_cancel_anytime', 'Cancel anytime, from settings')}
              </span>
            </li>
          </ul>
        )}
      </>
    );
  };

  return (
    <div className="blurMe flex flex-1 flex-col bg-cf-surface pb-[60px] mobile:pb-[100px]">
      <div className="h-[64px] px-[40px] tablet:px-[24px] mobile:!px-[16px] flex items-center border-b border-cf-border">
        <div className="flex-1 flex items-center">
          <Wordmark size="sm" />
        </div>
        <div className="flex items-center gap-[4px] text-cf-ink-muted">
          <OrganizationSelector />
          {/* И здесь тоже: свёрнутая полоса больше не оставляет ярлыка, и без
              этого значка суперадмин на платёжном экране не вернул бы её. */}
          {user?.isSuperAdmin ? <AdminBarToggle /> : null}
          <ModeComponent />
          <LanguageComponent />
          <DeveloperIconComponent />
          {user?.tier.current === 'FREE' && <LogoutComponent isIcon={true} />}
        </div>
      </div>
      <BillingFirstUseView
        state={resolveBillingFirstUseState({ isLoading, error, data })}
        locale={i18next.resolvedLanguage?.startsWith('ru') ? 'ru' : 'en'}
        plans={price.map(([key, value]) => ({
          id: key,
          name: capitalize(key),
          monthly: value.month_price,
          yearly: value.year_price,
          features: [],
        }))}
        selectedPlan={tier}
        period={period as 'MONTHLY' | 'YEARLY'}
        allowTrial={Boolean(user?.allowTrial)}
        checkoutBoundary={
          !data?.blocked && data?.client_secret && stripe ? (
            <EmbeddedBilling
              stripe={stripe}
              secret={data.client_secret}
              showCoupon={period === 'MONTHLY'}
              autoApplyCoupon={data.auto_apply_coupon}
            />
          ) : undefined
        }
        planControls={
          <div className="mt-[24px]">
            <RadioGroup
              value={period}
              onChange={(next) => setPeriod(next as 'MONTHLY' | 'YEARLY')}
              aria-label={t('billing_period', 'Billing period')}
              className="mb-[12px] flex min-h-[40px] gap-[4px] rounded-[8px] border border-cf-border p-[4px]"
            >
              {(['MONTHLY', 'YEARLY'] as const).map((value) => (
                <RadioOption
                  key={value}
                  value={value}
                  density="dense"
                  className={clsx(
                    'flex-1 rounded-[6px] px-[12px] cf-label-md transition-colors duration-state',
                    value === period
                      ? 'bg-cf-accent-soft text-cf-accent'
                      : 'text-cf-ink-muted hover:bg-cf-surface-subtle'
                  )}
                >
                  {value === 'MONTHLY'
                    ? t('billing_monthly', 'Monthly')
                    : t('billing_yearly', 'Yearly')}
                </RadioOption>
              ))}
            </RadioGroup>
            <RadioGroup
              value={tier}
              onChange={setTier}
              aria-label={t('billing_plan', 'Plan')}
              className="grid grid-cols-2 gap-[8px] mobile:grid-cols-1"
            >
              {price.map(([key, value]) => (
                <RadioOption
                  value={key}
                  key={key}
                  density="card"
                  className={clsx(
                    'w-full rounded-[8px] border p-[16px] text-start transition-colors duration-state',
                    key === tier
                      ? 'border-cf-accent bg-cf-accent-soft'
                      : 'border-cf-border hover:bg-cf-surface-subtle'
                  )}
                >
                  <span className="cf-heading-md block">{capitalize(key)}</span>
                  <span className="cf-heading-lg mt-[8px] block tabular-nums">
                    $
                    {value[period === 'MONTHLY' ? 'month_price' : 'year_price']}
                  </span>
                </RadioOption>
              ))}
            </RadioGroup>
            <div className="mt-[24px]">
              <BillingFeatures tier={tier} />
            </div>
          </div>
        }
      />
    </div>
  );
};

type FeatureItem = {
  key: string;
  defaultValue: string;
  prefix?: string | number;
};

export const BillingFeatures: FC<{ tier: string }> = ({ tier }) => {
  const t = useT();
  const features = useMemo(() => {
    const currentPricing = pricing[tier];
    const channelsOr = currentPricing.channel;
    const list: FeatureItem[] = [];

    list.push({
      key: channelsOr === 1 ? 'billing_channel' : 'billing_channels',
      defaultValue: channelsOr === 1 ? 'channel' : 'channels',
      prefix: channelsOr,
    });

    list.push({
      key: 'billing_posts_per_month',
      defaultValue: 'posts per month',
      prefix:
        currentPricing.posts_per_month > 10000
          ? 'unlimited'
          : currentPricing.posts_per_month,
    });

    if (currentPricing.team_members) {
      list.push({
        key: 'billing_unlimited_team_members',
        defaultValue: 'Unlimited team members',
      });
    }
    if (currentPricing?.ai) {
      list.push({
        key: 'billing_ai_auto_complete',
        defaultValue: 'AI auto-complete',
      });
      list.push({ key: 'billing_ai_copilots', defaultValue: 'AI copilots' });
      list.push({
        key: 'billing_ai_autocomplete',
        defaultValue: 'AI Autocomplete',
      });
    }
    list.push({
      key: 'billing_advanced_picture_editor',
      defaultValue: 'Advanced Picture Editor',
    });
    if (currentPricing?.image_generator) {
      list.push({
        key: 'billing_ai_images_per_month',
        defaultValue: 'AI Images per month',
        prefix: currentPricing?.image_generation_count,
      });
    }
    if (currentPricing?.generate_videos) {
      list.push({
        key: 'billing_ai_videos_per_month',
        defaultValue: 'AI Videos per month',
        prefix: currentPricing?.generate_videos,
      });
    }
    return list;
  }, [tier]);

  const renderFeature = (feature: FeatureItem) => {
    const translatedText = t(feature.key, feature.defaultValue);
    if (feature.prefix === 'unlimited') {
      return `${t('billing_unlimited', 'Unlimited')} ${translatedText}`;
    }
    if (feature.prefix !== undefined) {
      return `${feature.prefix} ${translatedText}`;
    }
    return translatedText;
  };

  return (
    <div className="grid grid-cols-2 mobile:grid-cols-1 gap-y-[8px] gap-x-[32px]">
      {features.map((feature) => (
        <div key={feature.key} className="flex items-center gap-[8px]">
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="17"
              height="17"
              viewBox="0 0 17 17"
              fill="none"
            >
              <path
                d="M11.825 0H4.84167C1.80833 0 0 1.80833 0 4.84167V11.8167C0 14.8583 1.80833 16.6667 4.84167 16.6667H11.8167C14.85 16.6667 16.6583 14.8583 16.6583 11.825V4.84167C16.6667 1.80833 14.8583 0 11.825 0ZM12.3167 6.41667L7.59167 11.1417C7.475 11.2583 7.31667 11.325 7.15 11.325C6.98333 11.325 6.825 11.2583 6.70833 11.1417L4.35 8.78333C4.10833 8.54167 4.10833 8.14167 4.35 7.9C4.59167 7.65833 4.99167 7.65833 5.23333 7.9L7.15 9.81667L11.4333 5.53333C11.675 5.29167 12.075 5.29167 12.3167 5.53333C12.5583 5.775 12.5583 6.16667 12.3167 6.41667Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>{renderFeature(feature)}</div>
        </div>
      ))}
    </div>
  );
};
