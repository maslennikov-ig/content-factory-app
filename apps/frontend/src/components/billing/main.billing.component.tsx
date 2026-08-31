'use client';

import { Slider } from '@contentfactory/react/form/slider';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Subscription } from '@prisma/client';
import { useDebouncedCallback } from 'use-debounce';
import ReactLoading from '@contentfactory/frontend/components/layout/loading';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import { FAQComponent } from '@contentfactory/frontend/components/billing/faq.component';
import { useSWRConfig } from 'swr';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { Textarea } from '@contentfactory/react/form/textarea';
import { useUtmUrl } from '@contentfactory/helpers/utils/utm.saver';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { FinishTrial } from '@contentfactory/frontend/components/billing/finish.trial';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import { LogoutComponent } from '@contentfactory/frontend/components/layout/logout.component';
import i18next from 'i18next';
import { BillingManageView } from './billing-manage.view';

export const Prorate: FC<{
  period: 'MONTHLY' | 'YEARLY';
  pack: 'STANDARD' | 'PRO';
}> = (props) => {
  const { period, pack } = props;
  const t = useT();
  const fetch = useFetch();
  const [price, setPrice] = useState<number | false>(0);
  const [loading, setLoading] = useState(false);
  const calculatePrice = useDebouncedCallback(async () => {
    setLoading(true);
    setPrice(
      (
        await (
          await fetch('/billing/prorate', {
            method: 'POST',
            body: JSON.stringify({
              period,
              billing: pack,
            }),
          })
        ).json()
      ).price
    );
    setLoading(false);
  }, 500);
  useEffect(() => {
    setPrice(false);
    calculatePrice();
  }, [period, pack]);
  if (loading) {
    return (
      <div className="pt-[12px]">
        <ReactLoading type="spin" color="#fff" width={20} height={20} />
      </div>
    );
  }
  if (price === false) {
    return null;
  }
  return (
    <div className="text-[12px] flex pt-[12px]">
      ({t('pay_today', 'Pay Today')} ${(price < 0 ? 0 : price)?.toFixed(1)})
    </div>
  );
};
export const Features: FC<{
  pack: 'FREE' | 'STANDARD' | 'PRO';
}> = (props) => {
  const { pack } = props;
  const features = useMemo(() => {
    const currentPricing = pricing[pack];
    const channelsOr = currentPricing.channel;
    const list = [];
    list.push(`${channelsOr} ${channelsOr === 1 ? 'channel' : 'channels'}`);
    list.push(
      `${
        currentPricing.posts_per_month > 10000
          ? 'Unlimited'
          : currentPricing.posts_per_month
      } posts per month`
    );
    if (currentPricing.team_members) {
      list.push(`Unlimited team members`);
    }
    if (currentPricing?.ai) {
      list.push(`AI auto-complete`);
      list.push(`AI copilots`);
      list.push(`AI Autocomplete`);
    }
    list.push(`Advanced Picture Editor`);
    if (currentPricing?.image_generator) {
      list.push(
        `${currentPricing?.image_generation_count} AI Images per month`
      );
    }
    if (currentPricing?.generate_videos) {
      list.push(`${currentPricing?.generate_videos} AI Videos per month`);
    }
    return list;
  }, [pack]);
  return (
    <div className="flex flex-col gap-[10px] justify-center text-[16px] text-customColor18">
      {features.map((feature) => (
        <div key={feature} className="flex gap-[20px]">
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M16.2806 9.21937C16.3504 9.28903 16.4057 9.37175 16.4434 9.46279C16.4812 9.55384 16.5006 9.65144 16.5006 9.75C16.5006 9.84856 16.4812 9.94616 16.4434 10.0372C16.4057 10.1283 16.3504 10.211 16.2806 10.2806L11.0306 15.5306C10.961 15.6004 10.8783 15.6557 10.7872 15.6934C10.6962 15.7312 10.5986 15.7506 10.5 15.7506C10.4014 15.7506 10.3038 15.7312 10.2128 15.6934C10.1218 15.6557 10.039 15.6004 9.96938 15.5306L7.71938 13.2806C7.57865 13.1399 7.49959 12.949 7.49959 12.75C7.49959 12.551 7.57865 12.3601 7.71938 12.2194C7.86011 12.0786 8.05098 11.9996 8.25 11.9996C8.44903 11.9996 8.6399 12.0786 8.78063 12.2194L10.5 13.9397L15.2194 9.21937C15.289 9.14964 15.3718 9.09432 15.4628 9.05658C15.5538 9.01884 15.6514 8.99941 15.75 8.99941C15.8486 8.99941 15.9462 9.01884 16.0372 9.05658C16.1283 9.09432 16.211 9.14964 16.2806 9.21937ZM21.75 12C21.75 13.9284 21.1782 15.8134 20.1068 17.4168C19.0355 19.0202 17.5127 20.2699 15.7312 21.0078C13.9496 21.7458 11.9892 21.9389 10.0979 21.5627C8.20656 21.1865 6.46928 20.2579 5.10571 18.8943C3.74215 17.5307 2.81355 15.7934 2.43735 13.9021C2.06114 12.0108 2.25422 10.0504 2.99218 8.26884C3.73013 6.48726 4.97982 4.96451 6.58319 3.89317C8.18657 2.82183 10.0716 2.25 12 2.25C14.585 2.25273 17.0634 3.28084 18.8913 5.10872C20.7192 6.93661 21.7473 9.41498 21.75 12ZM20.25 12C20.25 10.3683 19.7661 8.77325 18.8596 7.41655C17.9531 6.05984 16.6646 5.00242 15.1571 4.37799C13.6497 3.75357 11.9909 3.59019 10.3905 3.90852C8.79017 4.22685 7.32016 5.01259 6.16637 6.16637C5.01259 7.32015 4.22685 8.79016 3.90853 10.3905C3.5902 11.9908 3.75358 13.6496 4.378 15.1571C5.00242 16.6646 6.05984 17.9531 7.41655 18.8596C8.77326 19.7661 10.3683 20.25 12 20.25C14.1873 20.2475 16.2843 19.3775 17.8309 17.8309C19.3775 16.2843 20.2475 14.1873 20.25 12Z"
                fill="#06ff00"
              />
            </svg>
          </div>
          <div>{feature}</div>
        </div>
      ))}
    </div>
  );
};

const Accept: FC<{ resolve: (res: boolean) => void }> = ({ resolve }) => {
  const [loading, setLoading] = useState(false);
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();

  const apply = useCallback(async () => {
    setLoading(true);
    await fetch('/billing/apply-discount', {
      method: 'POST',
    });

    resolve(true);
    toaster.show(
      t('discount_applied_successfully', '50% discount applied successfully')
    );
  }, []);

  return (
    <div>
      <div className="mb-[20px]">
        {t(
          'accept_discount_offer',
          'Would you accept 50% discount for 3 months instead? 🙏🏻'
        )}
      </div>
      <div className="flex gap-[10px]">
        <Button loading={loading} onClick={apply}>
          {t('apply_discount_offer', 'Apply 50% discount for 3 months')}
        </Button>
        <Button onClick={() => resolve(false)} className="!bg-red-800">
          {t('cancel_my_subscription', 'Cancel my subscription')}
        </Button>
      </div>
    </div>
  );
};
const Info: FC<{
  proceed: (feedback: string) => void;
}> = (props) => {
  const [feedback, setFeedback] = useState('');
  const modal = useModals();
  const cancel = useCallback(() => {
    props.proceed(feedback);
    modal.closeAll();
  }, [modal, feedback]);

  const t = useT();

  return (
    <div className="relative flex gap-[20px] flex-col flex-1 rounded-[4px]">
      <div>
        {t(
          'would_you_mind_shortly_tell_us_what_we_could_have_done_better',
          'Would you mind shortly tell us what we could have done better?'
        )}
      </div>
      <div>
        <Textarea
          className="bg-newBgColorInner"
          label={'Feedback'}
          name="feedback"
          disableForm={true}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>
      <div>
        <Button disabled={feedback.length < 20} onClick={cancel}>
          {feedback.length < 20
            ? t('please_add_at_least', 'Please add at least 20 chars')
            : t('cancel_subscription', 'Cancel Subscription')}
        </Button>
      </div>
    </div>
  );
};
export const MainBillingComponent: FC<{
  sub?: Subscription;
}> = (props) => {
  const { sub } = props;
  const { isGeneral } = useVariables();
  const { mutate } = useSWRConfig();
  const fetch = useFetch();
  const toast = useToaster();
  const user = useUser();
  const modal = useModals();
  const router = useRouter();
  const utm = useUtmUrl();
  const t = useT();
  const queryParams = useSearchParams();
  const [finishTrial, setFinishTrial] = useState(
    !!queryParams.get('finishTrial')
  );

  const [subscription, setSubscription] = useState<Subscription | undefined>(
    sub
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [period, setPeriod] = useState<'MONTHLY' | 'YEARLY'>(
    subscription?.period || 'MONTHLY'
  );
  const [monthlyOrYearly, setMonthlyOrYearly] = useState<'on' | 'off'>(
    period === 'MONTHLY' ? 'off' : 'on'
  );
  const [initialChannels, setInitialChannels] = useState(
    sub?.totalChannels || 1
  );
  useEffect(() => {
    if (initialChannels !== sub?.totalChannels) {
      setInitialChannels(sub?.totalChannels || 1);
    }
    if (period !== sub?.period) {
      setPeriod(sub?.period || 'MONTHLY');
      setMonthlyOrYearly(
        (sub?.period || 'MONTHLY') === 'MONTHLY' ? 'off' : 'on'
      );
    }
    setSubscription(sub);
  }, [sub]);
  const updatePayment = useCallback(async () => {
    const { portal } = await (await fetch('/billing/portal')).json();
    window.location.href = portal;
  }, []);
  const currentPackage = useMemo(() => {
    if (!subscription) {
      return 'FREE';
    }
    if (period === 'YEARLY' && monthlyOrYearly === 'off') {
      return '';
    }
    if (period === 'MONTHLY' && monthlyOrYearly === 'on') {
      return '';
    }
    return subscription?.subscriptionTier;
  }, [subscription, initialChannels, monthlyOrYearly, period]);
  const moveToCheckout = useCallback(
    (billing: 'STANDARD' | 'PRO' | 'FREE', reactivate = false) =>
      async () => {
        if (reactivate) {
          setLoading(true);
          const { cancel_at } = await (
            await fetch('/billing/cancel', {
              method: 'POST',
              body: JSON.stringify({
                feedback: '',
              }),
              headers: {
                'Content-Type': 'application/json',
              },
            })
          ).json();
          setSubscription((subs) => ({
            ...subs!,
            cancelAt: cancel_at,
          }));

          toast.show('Subscription reactivated successfully');
          setLoading(false);
          return;
        }

        const messages = [];
        if (
          !pricing[billing].team_members &&
          pricing[subscription?.subscriptionTier!]?.team_members
        ) {
          messages.push(
            `Your team members will be removed from your organization`
          );
        }
        if (billing === 'FREE') {
          if (
            subscription?.cancelAt ||
            (await deleteDialog(
              `Are you sure you want to cancel your subscription?
              ${messages.join(', ')}`,
              'Yes, cancel',
              'Cancel Subscription'
            ))
          ) {
            const checkDiscount = await (
              await fetch('/billing/check-discount')
            ).json();
            if (checkDiscount.offerCoupon) {
              const info = await new Promise((res) => {
                modal.openModal({
                  title: t('before_you_cancel', 'Before you cancel'),
                  withCloseButton: true,
                  classNames: {
                    modal: 'bg-transparent text-textColor',
                  },
                  children: <Accept resolve={res} />,
                });
              });

              modal.closeAll();

              if (info) {
                return;
              }
            }

            const info = await new Promise((res) => {
              modal.openModal({
                title: t(
                  'we_are_sorry_to_see_you_go',
                  'We are sorry to see you go :('
                ),
                withCloseButton: true,
                classNames: {
                  modal: 'bg-transparent text-textColor',
                },
                children: <Info proceed={(e) => res(e)} />,
              });
            });

            setLoading(true);
            const { cancel_at } = await (
              await fetch('/billing/cancel', {
                method: 'POST',
                body: JSON.stringify({
                  feedback: info,
                }),
                headers: {
                  'Content-Type': 'application/json',
                },
              })
            ).json();
            setSubscription((subs) => ({
              ...subs!,
              cancelAt: cancel_at,
            }));
            if (cancel_at)
              toast.show('Subscription set to canceled successfully');
            setLoading(false);
          }
          return;
        }
        if (
          messages.length &&
          !(await deleteDialog(messages.join(', '), 'Yes, continue'))
        ) {
          return;
        }
        setLoading(true);
        const { url, portal, blocked } = await (
          await fetch('/billing/subscribe', {
            method: 'POST',
            body: JSON.stringify({
              period: monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY',
              utm,
              billing,
            }),
          })
        ).json();
        if (blocked) {
          setLoading(false);
          await deleteDialog(
            t(
              'billing_other_account_subscribed',
              'Another account with this email already has an active subscription. Please log off and sign in to that account to manage your subscription.'
            ),
            t('ok', 'OK'),
            t('already_subscribed', 'Already subscribed')
          );
          return;
        }
        if (url) {
          window.location.href = url;
          return;
        }
        if (portal) {
          if (
            await deleteDialog(
              'We could not charge your credit card, please update your payment method',
              'Update',
              'Payment Method Required'
            )
          ) {
            window.open(portal);
          }
        } else {
          setPeriod(monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY');
          setSubscription((subs) => ({
            ...subs!,
            subscriptionTier: billing,
            cancelAt: null,
          }));
          mutate(
            '/user/self',
            {
              ...user,
              tier: billing,
            },
            {
              revalidate: false,
            }
          );
          toast.show('Subscription updated successfully');
        }
        setLoading(false);
      },
    [monthlyOrYearly, subscription, user, utm]
  );
  if (user?.isLifetime) {
    router.replace('/');
    return null;
  }
  const visiblePlans = Object.entries(pricing).filter(
    ([name]) => !isGeneral || name !== 'FREE'
  );
  return (
    <>
      {finishTrial && <FinishTrial close={() => setFinishTrial(false)} />}
      <BillingManageView
        state={loading ? 'disabled' : 'default'}
        locale={i18next.resolvedLanguage?.startsWith('ru') ? 'ru' : 'en'}
        plans={visiblePlans.map(([id, plan]) => ({
          id,
          name: id,
          monthly: plan.month_price,
          yearly: plan.year_price,
          features: [],
        }))}
        currentPlan={currentPackage || subscription?.subscriptionTier || 'FREE'}
        period={monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY'}
        notice={
          subscription?.cancelAt && isGeneral
            ? `${t(
                'your_subscription_will_be_canceled_at',
                'Your subscription will be canceled at'
              )} ${newDayjs(subscription.cancelAt)
                .local()
                .format('D MMM, YYYY')}`
            : undefined
        }
        controls={
          <div className="flex items-center gap-[12px] cf-label-md">
            <span>{t('monthly', 'MONTHLY')}</span>
            <Slider value={monthlyOrYearly} onChange={setMonthlyOrYearly} />
            <span>{t('yearly', 'YEARLY')}</span>
          </div>
        }
        planControls={
          <div className="mt-[24px] grid grid-cols-3 gap-[12px] tablet:grid-cols-2 mobile:grid-cols-1">
            {visiblePlans.map(([name, values]) => {
              const current = currentPackage === name.toUpperCase();
              return (
                <article
                  key={name}
                  className={`rounded-[8px] border p-[18px] ${
                    current
                      ? 'border-cf-accent bg-cf-accent-soft'
                      : 'border-cf-border bg-cf-surface'
                  }`}
                >
                  <h2 className="cf-heading-md">{name}</h2>
                  <div className="cf-heading-lg mt-[8px] tabular-nums">
                    $
                    {monthlyOrYearly === 'on'
                      ? values.year_price
                      : values.month_price}
                  </div>
                  <div className="cf-caption mt-[2px] text-cf-ink-muted">
                    {monthlyOrYearly === 'on' ? '/year' : '/month'}
                  </div>
                  <div className="mt-[16px]">
                    <Button
                      loading={loading}
                      disabled={
                        current || (!!subscription?.cancelAt && name === 'FREE')
                      }
                      variant={
                        name === 'FREE' && subscription
                          ? 'destructive'
                          : 'primary'
                      }
                      onClick={
                        current && subscription?.cancelAt
                          ? moveToCheckout('FREE', true)
                          : moveToCheckout(
                              name.toUpperCase() as 'STANDARD' | 'PRO' | 'FREE'
                            )
                      }
                    >
                      {current
                        ? t('active', 'Active')
                        : name === 'FREE'
                        ? t('cancel_subscription_1', 'Cancel subscription')
                        : t('purchase_now', 'Purchase now')}
                    </Button>
                    {subscription && !current && name !== 'FREE' && (
                      <Prorate
                        period={monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY'}
                        pack={name.toUpperCase() as 'STANDARD' | 'PRO'}
                      />
                    )}
                  </div>
                  <div className="mt-[16px]">
                    <Features
                      pack={name.toUpperCase() as 'FREE' | 'STANDARD' | 'PRO'}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        }
        footer={
          <div className="mt-[24px]">
            {!!subscription?.id && (
              <div className="flex flex-wrap gap-[8px]">
                <Button variant="secondary" onClick={updatePayment}>
                  {t(
                    'update_payment_method_invoices_history',
                    'Update payment method / invoices'
                  )}
                </Button>
                {isGeneral && !subscription?.cancelAt && (
                  <Button
                    variant="destructive"
                    loading={loading}
                    onClick={moveToCheckout('FREE')}
                  >
                    {t('cancel_subscription_1', 'Cancel subscription')}
                  </Button>
                )}
              </div>
            )}
            <FAQComponent />
            <div className="mt-[20px] flex justify-center">
              <LogoutComponent />
            </div>
          </div>
        }
      />
    </>
  );
};
