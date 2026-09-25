import type { ReactNode } from 'react';
import { Panel } from '@contentfactory/react/layout';
import type { BillingPlanViewModel } from './billing-first-use.view';

export function resolveBillingManageState({
  isLoading,
  error,
  subscriptionLoaded,
}: {
  isLoading: boolean;
  error?: unknown;
  subscriptionLoaded: boolean;
}) {
  if (isLoading) return 'loading' as const;
  if (error || !subscriptionLoaded) return 'error' as const;
  return 'default' as const;
}

export function BillingManageView({
  state,
  locale,
  plans,
  currentPlan,
  period,
  notice,
  controls,
  planControls,
  footer,
  adminOnly = false,
}: {
  state:
    | 'loading'
    | 'default'
    | 'selected'
    | 'success'
    | 'error'
    | 'restricted'
    | 'disabled'
    | 'long-content'
    | 'unavailable';
  locale: 'en' | 'ru';
  plans: readonly BillingPlanViewModel[];
  currentPlan: string;
  period: 'MONTHLY' | 'YEARLY';
  notice?: string;
  controls?: ReactNode;
  planControls?: ReactNode;
  footer?: ReactNode;
  /**
   * The viewer is not an administrator (`zg8w`): subscribe, cancel, discount
   * and trial answer 403 for them, so the buttons are off and this says why.
   */
  adminOnly?: boolean;
}) {
  const ru = locale === 'ru';
  if (state === 'loading')
    return (
      <div
        aria-busy="true"
        className="h-[360px] rounded-[8px] bg-cf-surface-subtle"
      />
    );
  /**
   * The instance has no payments at all (no `STRIPE_PUBLISHABLE_KEY`,
   * 2q28.30). Upstream's tiers in dollars are not this product's offer, and
   * with no Stripe nothing on them could be bought, so the screen says the
   * one thing that is true and stops.
   */
  if (state === 'unavailable')
    return (
      <section
        data-billing-view="unavailable"
        className="min-w-0 bg-cf-canvas p-[24px] text-cf-ink mobile:p-[16px]"
      >
        <h1 className="cf-heading-lg text-balance">
          {ru ? 'Тариф и оплата' : 'Plan and billing'}
        </h1>
        <Panel
          as="div"
          role="status"
          contentPadding="snug"
          className="mt-[16px] max-w-[70ch]"
        >
          <p className="cf-body-md text-cf-ink text-pretty">
            {ru
              ? 'Оплата пока не подключена. Пока идёт тест, всё доступно без оплаты.'
              : 'Payments are not connected yet. While we are testing, everything is available without paying.'}
          </p>
        </Panel>
      </section>
    );
  if (state === 'restricted')
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[16px] cf-body-md text-cf-warning"
      >
        {ru
          ? 'Для управления оплатой нужен доступ администратора рабочего пространства.'
          : 'Workspace administrator access is required to manage billing.'}
      </div>
    );
  if (state === 'error')
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[16px] cf-body-md text-cf-danger"
      >
        {ru
          ? 'Не удалось загрузить подписку. Повторите запрос безопасно.'
          : 'The subscription could not be loaded. Retry safely.'}
      </div>
    );

  return (
    <section
      data-billing-view="manage"
      className="min-w-0 bg-cf-canvas p-[24px] text-cf-ink mobile:p-[16px]"
    >
      <div className="flex items-start justify-between gap-[20px] mobile:flex-col">
        <div>
          <h1 className="cf-heading-lg text-balance">
            {ru ? 'Тариф и оплата' : 'Plan and billing'}
          </h1>
          <p className="cf-body-md mt-[8px] max-w-[70ch] text-cf-ink-muted text-pretty">
            {state === 'long-content'
              ? ru
                ? 'Измените тариф, период оплаты или способ платежа для этого рабочего пространства. Длинное название организации не должно скрывать текущий тариф и безопасное действие.'
                : 'Change the plan, billing period, or payment method for this workspace. A deliberately long organization name must not hide the current plan or safe action.'
              : ru
              ? 'Управляйте подпиской этого рабочего пространства.'
              : 'Manage this workspace subscription.'}
          </p>
        </div>
        {controls}
      </div>
      {adminOnly ? (
        <p
          role="note"
          data-billing-admin-only="manage"
          className="cf-body-sm mt-[16px] max-w-[70ch] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] text-cf-ink-muted text-pretty"
        >
          {ru
            ? 'Менять тариф и способ оплаты и отменять подписку может только администратор пространства. Здесь видно, какой тариф сейчас; если нужен другой — попросите администратора.'
            : 'Only a workspace administrator can change the plan or the payment method, or cancel the subscription. Here you can see the current plan; if you need another one, ask an administrator.'}
        </p>
      ) : null}
      {state === 'success' && (
        <p className="cf-body-sm mt-[16px] rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] text-cf-accent">
          {notice ?? (ru ? 'Изменение сохранено.' : 'Coupon applied.')}
        </p>
      )}
      {planControls ?? (
        <fieldset
          disabled={state === 'disabled'}
          className="mt-[24px] grid grid-cols-3 gap-[12px] border-0 p-0 tablet:grid-cols-2 mobile:grid-cols-1"
        >
          {plans.map((plan) => {
            const current = plan.id === currentPlan;
            return (
              <article
                key={plan.id}
                className={`rounded-[8px] border p-[20px] ${
                  current
                    ? 'border-cf-accent bg-cf-accent-soft'
                    : 'border-cf-border bg-cf-surface'
                }`}
              >
                <h2 className="cf-heading-md">{plan.name}</h2>
                <p className="cf-heading-lg mt-[8px] tabular-nums">
                  ${period === 'MONTHLY' ? plan.monthly : plan.yearly}
                </p>
                <p className="cf-caption mt-[4px] text-cf-ink-muted">
                  {period === 'MONTHLY'
                    ? ru
                      ? 'в месяц'
                      : 'Monthly'
                    : ru
                    ? 'в год'
                    : 'Yearly'}
                </p>
                <p className="cf-label-md mt-[16px] text-cf-accent">
                  {current
                    ? ru
                      ? 'Текущий тариф'
                      : 'Current plan'
                    : ru
                    ? 'Доступен для выбора'
                    : 'Available to select'}
                </p>
              </article>
            );
          })}
        </fieldset>
      )}
      {notice && state !== 'success' && (
        <p className="cf-body-sm mt-[16px] text-cf-ink-muted">{notice}</p>
      )}
      {footer}
    </section>
  );
}
