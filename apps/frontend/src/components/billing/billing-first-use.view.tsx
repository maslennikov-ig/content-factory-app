import type { ReactNode } from 'react';

export type BillingPlanViewModel = Readonly<{
  id: string;
  name: string;
  monthly: number;
  yearly: number;
  features: readonly string[];
}>;

export function resolveBillingFirstUseState({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error?: unknown;
  data?: { blocked?: boolean };
}) {
  if (isLoading) return 'loading' as const;
  if (error || !data) return 'error' as const;
  if (data.blocked) return 'restricted' as const;
  return 'default' as const;
}

export function BillingFirstUseView({
  state,
  locale,
  plans,
  selectedPlan,
  period,
  allowTrial,
  checkoutBoundary,
  controls,
  planControls,
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
  selectedPlan: string;
  period: 'MONTHLY' | 'YEARLY';
  allowTrial: boolean;
  checkoutBoundary?: ReactNode;
  controls?: ReactNode;
  planControls?: ReactNode;
}) {
  const ru = locale === 'ru';
  if (state === 'loading') {
    return (
      <div
        aria-busy="true"
        className="h-[420px] rounded-[8px] bg-cf-surface-subtle"
      />
    );
  }
  if (state === 'restricted') {
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[20px] cf-body-md text-cf-warning"
      >
        {ru
          ? 'Другой аккаунт с этим адресом уже имеет активную подписку.'
          : 'Another account with this email already has an active subscription.'}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div
        role="alert"
        className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[20px] cf-body-md text-cf-danger"
      >
        {ru
          ? 'Не удалось подготовить безопасную форму оплаты. Повторите запрос.'
          : 'The secure payment form could not be prepared. Retry safely.'}
      </div>
    );
  }

  const selected = plans.find((plan) => plan.id === selectedPlan) ?? plans[0];
  return (
    <section
      data-billing-view="first-use"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] gap-[32px] bg-cf-surface p-[32px] text-cf-ink tablet:grid-cols-1 mobile:p-[16px]"
    >
      <div>
        <h1 className="cf-heading-lg text-balance">
          {ru
            ? 'Выберите тариф рабочего пространства'
            : 'Choose a workspace plan'}
        </h1>
        <p className="cf-body-md mt-[8px] max-w-[70ch] text-cf-ink-muted text-pretty">
          {state === 'long-content'
            ? ru
              ? 'Тариф определяет число подключённых каналов и доступные рабочие возможности. Этот длинный текст проверяет перенос без изменения структуры выбора и внешней границы оплаты.'
              : 'The plan controls connected channels and workspace capabilities. This deliberately long explanation verifies wrapping without changing plan selection or the external payment boundary.'
            : ru
            ? 'Тарифы различаются числом каналов и рабочими возможностями.'
            : 'Plans differ by connected channels and workspace capabilities.'}
        </p>
        {allowTrial && (
          <p className="cf-body-sm mt-[16px] text-cf-accent">
            {ru
              ? 'Пробный период доступен; точные условия показаны перед подтверждением.'
              : 'A trial is available; exact terms appear before confirmation.'}
          </p>
        )}
        {planControls ?? (
          <div className="mt-[24px] grid grid-cols-2 gap-[8px] mobile:grid-cols-1">
            {plans.map((plan) => (
              <article
                key={plan.id}
                aria-current={plan.id === selected?.id ? 'true' : undefined}
                className={`rounded-[8px] border p-[16px] ${
                  plan.id === selected?.id
                    ? 'border-cf-accent bg-cf-accent-soft'
                    : 'border-cf-border'
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
                <ul className="cf-body-sm mt-[12px] space-y-[4px] text-cf-ink-muted">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
        {controls}
      </div>
      <aside className="border-s border-cf-border ps-[32px] tablet:border-s-0 tablet:border-t tablet:ps-0 tablet:pt-[24px]">
        <h2 className="cf-heading-md">
          {ru ? 'Безопасная оплата' : 'Secure payment'}
        </h2>
        {state === 'success' && (
          <p className="cf-body-sm mt-[12px] rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] text-cf-accent">
            {ru ? 'Промокод применён.' : 'Coupon applied.'}
          </p>
        )}
        {state === 'disabled' && (
          <p className="cf-body-sm mt-[12px] text-cf-ink-muted">
            {ru
              ? 'Продолжение недоступно, пока форма оплаты не готова.'
              : 'Continue is disabled until the payment form is ready.'}
          </p>
        )}
        <div className="mt-[16px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[20px]">
          {checkoutBoundary ?? (
            <p className="cf-body-md text-cf-ink-muted">
              {ru
                ? 'Платёжные реквизиты предоставляет Stripe во внешней защищённой границе.'
                : 'Payment details are provided by Stripe in an external secure boundary.'}
            </p>
          )}
        </div>
      </aside>
    </section>
  );
}
