import type { ReactNode } from 'react';

export type ProviderPreviewSurfaceState = 'loading' | 'default' | 'error' | 'long-content';

export function ProviderPreviewSurface({ state, locale = 'en', provider, detail, children }: {
  state: ProviderPreviewSurfaceState;
  locale?: 'en' | 'ru';
  provider?: string;
  detail?: string;
  children?: ReactNode;
}) {
  const ru = locale === 'ru';
  return (
    <section data-product-surface="provider-preview" data-surface-state={state} aria-busy={state === 'loading'} className="flex min-w-0 flex-col gap-[12px] p-[12px] text-cf-ink">
      <header className="flex flex-col gap-[4px]">
        <p className="cf-label-sm text-cf-ink-muted">{ru ? 'Настройки канала' : 'Channel settings'}</p>
        <h2 className="cf-heading-md text-balance">{provider || (ru ? 'Провайдер' : 'Provider')}</h2>
        {(state !== 'default' || detail) && <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">{detail || (ru ? 'Подготавливаем локальную форму.' : 'Preparing the local form.')}</p>}
      </header>
      {children}
    </section>
  );
}
