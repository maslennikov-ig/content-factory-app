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
import { useSWRConfig } from 'swr';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { Textarea } from '@contentfactory/react/form/textarea';
import { useUtmUrl } from '@contentfactory/helpers/utils/utm.saver';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { FinishTrial } from '@contentfactory/frontend/components/billing/finish.trial';
import { interfaceDayjs } from '@contentfactory/react/helpers/localized.date';
import { LogoutComponent } from '@contentfactory/frontend/components/layout/logout.component';
import i18next from 'i18next';
import { BillingManageView } from './billing-manage.view';
import { BillingFeatures } from './first.billing.component';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';

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
/**
 * The tier's feature list. The same list the first-use screen draws
 * (`BillingFeatures`), so both read in the person's language (2q28.30); this
 * used to be a second, English-only copy of it.
 */
export const Features: FC<{
  pack: 'FREE' | 'STANDARD' | 'PRO';
}> = ({ pack }) => <BillingFeatures tier={pack} stacked={true} />;

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
        <Button variant="destructive" onClick={() => resolve(false)}>
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
  /*
    Subscribe, cancel, the discount and finishing the trial are the
    administrator's (`zg8w`, owner's decision of 24.09.2026): the server
    answers 403 to anyone else, so their buttons are off here and the view
    says why, instead of a press that fails.
  */
  const canManage = isOrganizationAdmin(user?.role);
  // Unknown user — loading, not «only an administrator» (review F9).
  const userKnown = Boolean(user);
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
    const response = await fetch('/billing/portal');
    if (!response.ok) return;
    const { portal } = await response.json();
    if (portal) window.location.href = portal;
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

          toast.show(
            t('subscription_reactivated', 'Subscription reactivated successfully')
          );
          setLoading(false);
          return;
        }

        const messages = [];
        if (
          !pricing[billing].team_members &&
          pricing[subscription?.subscriptionTier!]?.team_members
        ) {
          messages.push(
            t(
              'billing_team_members_will_be_removed',
              'Your team members will be removed from your workspace'
            )
          );
        }
        if (billing === 'FREE') {
          if (
            subscription?.cancelAt ||
            (await deleteDialog(
              [
                t(
                  'billing_cancel_subscription_confirm',
                  'Are you sure you want to cancel your subscription?'
                ),
                messages.join(', '),
              ]
                .filter(Boolean)
                .join(' '),
              t('yes_cancel_subscription', 'Yes, cancel subscription'),
              t('cancel_subscription', 'Cancel Subscription')
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
              toast.show(
                t(
                  'billing_subscription_set_to_canceled',
                  'Subscription set to canceled successfully'
                )
              );
            setLoading(false);
          }
          return;
        }
        if (
          messages.length &&
          !(await deleteDialog(
            messages.join(', '),
            t('billing_yes_continue', 'Yes, continue')
          ))
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
              t(
                'billing_payment_method_update_required',
                'We could not charge your credit card, please update your payment method'
              ),
              t('update', 'Update'),
              t('billing_payment_method_required', 'Payment Method Required')
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
          toast.show(
            t('subscription_updated', 'Subscription updated successfully')
          );
        }
        setLoading(false);
      },
    [monthlyOrYearly, subscription, user, utm, t]
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
      {finishTrial && canManage && (
        <FinishTrial close={() => setFinishTrial(false)} />
      )}
      <BillingManageView
        state={!userKnown ? 'loading' : loading ? 'disabled' : 'default'}
        locale={i18next.resolvedLanguage?.startsWith('ru') ? 'ru' : 'en'}
        plans={visiblePlans.map(([id, plan]) => ({
          id,
          name: id,
          monthly: plan.month_price,
          yearly: plan.year_price,
          features: [],
        }))}
        currentPlan={currentPackage || subscription?.subscriptionTier || 'FREE'}
        adminOnly={!canManage}
        period={monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY'}
        notice={
          subscription?.cancelAt && isGeneral
            ? `${t(
                'your_subscription_will_be_canceled_at',
                'Your subscription will be canceled at'
              )} ${interfaceDayjs(subscription.cancelAt).format('LL')}`
            : undefined
        }
        controls={
          <div className="flex items-center gap-[12px] cf-label-md">
            <span>{t('billing_monthly', 'Monthly')}</span>
            <Slider value={monthlyOrYearly} onChange={setMonthlyOrYearly} />
            <span>{t('billing_yearly', 'Yearly')}</span>
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
                    {monthlyOrYearly === 'on'
                      ? t('billing_per_year', '/ year')
                      : t('billing_per_month', '/ month')}
                  </div>
                  <div className="mt-[16px]">
                    <Button
                      loading={loading}
                      disabled={
                        !canManage ||
                        current ||
                        (!!subscription?.cancelAt && name === 'FREE')
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
                {/* The portal is the administrator's too (review F5 of the
                    fifteenth walk): the server answers 403 to anyone else. */}
                <Button
                  variant="secondary"
                  disabled={!canManage}
                  onClick={updatePayment}
                >
                  {t(
                    'update_payment_method_invoices_history',
                    'Update payment method / invoices'
                  )}
                </Button>
                {isGeneral && !subscription?.cancelAt && (
                  <Button
                    variant="destructive"
                    disabled={!canManage}
                    loading={loading}
                    onClick={moveToCheckout('FREE')}
                  >
                    {t('cancel_subscription_1', 'Cancel subscription')}
                  </Button>
                )}
              </div>
            )}
            <div className="mt-[20px] flex justify-center">
              <LogoutComponent />
            </div>
          </div>
        }
      />
    </>
  );
};
