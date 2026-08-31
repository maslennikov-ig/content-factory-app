import type { ReactNode } from 'react';

export type ExtensionSurfaceState = 'loading' | 'empty' | 'default' | 'selected' | 'error' | 'restricted' | 'disabled' | 'long-content';

export function ExtensionSurface({ state, locale = 'en', detail, children }: { state: ExtensionSurfaceState; locale?: 'en' | 'ru'; detail?: string; children?: ReactNode }) {
  const ru = locale === 'ru';
  return (
    <section data-product-surface="extension" data-surface-state={state} aria-busy={state === 'loading'} aria-disabled={state === 'disabled'} className="flex min-h-screen min-w-0 flex-col bg-cf-canvas text-cf-ink">
      {state !== 'default' && <div className="m-[16px] rounded-cf border border-cf-border bg-cf-surface p-[16px]"><p className="cf-label-sm text-cf-ink-muted">{ru ? 'Расширение Content Factory' : 'Content Factory extension'}</p><p className="cf-body-sm max-w-prose text-pretty">{detail || (ru ? 'Локальное состояние редактора.' : 'Local editor state.')}</p></div>}
      {children}
    </section>
  );
}
