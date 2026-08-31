import type { ReactNode } from 'react';
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
}: {
  state:
    | 'loading'
    | 'default'
    | 'selected'
    | 'success'
    | 'error'
    | 'restricted'
    | 'disabled'
    | 'long-content';
  locale: 'en' | 'ru';
  plans: readonly BillingPlanViewModel[];
  currentPlan: string;
  period: 'MONTHLY' | 'YEARLY';
  notice?: string;
  controls?: ReactNode;
  planControls?: ReactNode;
  footer?: ReactNode;
}) {
  const ru = locale === 'ru';
  if (state === 'loading')
    return (
      <div
        aria-busy="true"
        className="h-[360px] rounded-[8px] bg-cf-surface-subtle"
      />
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
