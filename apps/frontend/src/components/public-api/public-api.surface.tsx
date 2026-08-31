import type { ReactNode } from 'react';

export type PublicApiSurfaceState =
  | 'loading'
  | 'default'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

export function PublicApiSurface({
  state,
  locale = 'en',
  detail,
  children,
}: {
  state: PublicApiSurfaceState;
  locale?: 'en' | 'ru';
  detail?: string;
  children?: ReactNode;
}) {
  const ru = locale === 'ru';
  const messages: Record<PublicApiSurfaceState, string> = {
    loading: ru ? 'Загружаем доступ разработчика' : 'Loading developer access',
    default: ru ? 'Управляйте доступом API и локальной настройкой MCP.' : 'Manage API access and local MCP setup.',
    selected: ru ? 'Выбран способ подключения MCP.' : 'An MCP connection method is selected.',
    success: ru ? 'Локальное действие выполнено.' : 'The local action completed.',
    error: ru ? 'Не удалось обновить доступ. Повторите безопасно.' : 'Access could not be updated. Try again safely.',
    restricted: ru ? 'Доступ разрешён только администраторам организации.' : 'Only organization administrators can use this access.',
    disabled: ru ? 'Действия временно недоступны.' : 'Actions are temporarily unavailable.',
    'long-content': detail || '',
  };

  return (
    <section
      data-product-surface="public-api"
      data-surface-state={state}
      aria-busy={state === 'loading'}
      aria-disabled={state === 'disabled'}
      className="flex min-w-0 flex-col gap-[20px] text-cf-ink"
    >
      <header className="flex flex-col gap-[8px]">
        <p className="cf-label-sm text-cf-ink-muted">{ru ? 'Доступ разработчика' : 'Developer access'}</p>
        <h2 className="cf-heading-md text-balance">{ru ? 'Public API и MCP' : 'Public API and MCP'}</h2>
        <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">{messages[state]}</p>
      </header>
      {state === 'loading' ? (
        <div className="h-[96px] animate-pulse rounded-cf bg-cf-surface-subtle motion-reduce:animate-none" />
      ) : children}
    </section>
  );
}
