import type { ReactNode } from 'react';

export type DeveloperSurfaceState =
  | 'loading'
  | 'empty'
  | 'default'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

const copy = {
  en: {
    eyebrow: 'Developer workspace',
    title: 'OAuth application',
    loading: 'Loading application details',
    empty: 'No application has been created yet.',
    selected: 'Application settings are being edited.',
    success: 'The local change is ready for review.',
    error: 'Application details could not be loaded. Try again safely.',
    restricted: 'Administrator access is required for this section.',
    disabled: 'Application actions are temporarily unavailable.',
  },
  ru: {
    eyebrow: 'Раздел разработчика',
    title: 'OAuth-приложение',
    loading: 'Загружаем сведения о приложении',
    empty: 'Приложение ещё не создано.',
    selected: 'Настройки приложения открыты для редактирования.',
    success: 'Локальное изменение готово к проверке.',
    error: 'Не удалось загрузить приложение. Можно безопасно повторить.',
    restricted: 'Для этого раздела нужны права администратора.',
    disabled: 'Действия с приложением временно недоступны.',
  },
} as const;

export function DeveloperSurface({
  state,
  locale = 'en',
  name,
  description,
  children,
}: {
  state: DeveloperSurfaceState;
  locale?: keyof typeof copy;
  name?: string;
  description?: string;
  children?: ReactNode;
}) {
  const text = copy[locale];
  const message = state === 'long-content' ? description : text[state as keyof typeof text];

  return (
    <section
      data-product-surface="developer"
      data-surface-state={state}
      aria-busy={state === 'loading'}
      aria-disabled={state === 'disabled'}
      className="flex min-w-0 flex-col gap-[20px] text-cf-ink"
    >
      <header className="flex min-w-0 flex-col gap-[8px]">
        <p className="cf-label-sm text-cf-ink-muted">{text.eyebrow}</p>
        <h2 className="cf-heading-md text-balance">{name || text.title}</h2>
        {message && <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">{message}</p>}
      </header>
      {state === 'loading' ? (
        <div className="h-[96px] animate-pulse rounded-cf bg-cf-surface-subtle motion-reduce:animate-none" />
      ) : (
        children
      )}
    </section>
  );
}
