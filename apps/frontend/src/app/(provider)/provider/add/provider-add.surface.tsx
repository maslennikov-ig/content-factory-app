import type { ReactNode } from 'react';

export type ProviderAddSurfaceState = 'loading' | 'empty' | 'default' | 'selected' | 'error' | 'long-content';

export function ProviderAddSurface({ state, locale = 'en', detail, children }: { state: ProviderAddSurfaceState; locale?: 'en' | 'ru'; detail?: string; children?: ReactNode }) {
  const ru = locale === 'ru';
  return (
    <section data-product-surface="provider-add" data-surface-state={state} aria-busy={state === 'loading'} className="flex min-h-screen min-w-0 flex-col gap-[16px] bg-cf-canvas p-[16px] text-cf-ink">
      <header className="flex flex-col gap-[4px]"><p className="cf-label-sm text-cf-ink-muted">{ru ? 'Каналы' : 'Channels'}</p><h1 className="cf-heading-md text-balance">{ru ? 'Добавить канал' : 'Add a channel'}</h1>{detail && <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">{detail}</p>}</header>
      {children}
    </section>
  );
}
