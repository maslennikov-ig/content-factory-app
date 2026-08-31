import type { ReactNode } from 'react';

export type OAuthAuthorizeSurfaceState = 'loading' | 'default' | 'error' | 'disabled' | 'long-content';

export function OAuthAuthorizeSurface({ state, locale = 'en', appName, description, children }: { state: OAuthAuthorizeSurfaceState; locale?: 'en' | 'ru'; appName?: string; description?: string; children?: ReactNode }) {
  const ru = locale === 'ru';
  return (
    <section data-product-surface="oauth-authorize" data-surface-state={state} aria-busy={state === 'loading'} aria-disabled={state === 'disabled'} className="flex min-h-screen flex-1 items-center justify-center bg-cf-canvas px-[20px] text-cf-ink">
      <div className="flex w-full max-w-[500px] flex-col gap-[16px] rounded-cf-lg bg-cf-surface p-[24px]">
        <p className="cf-label-sm text-cf-ink-muted">{ru ? 'Разрешение доступа' : 'Access request'}</p>
        <h1 className="cf-heading-md text-balance">{appName || (ru ? 'OAuth-приложение' : 'OAuth application')}</h1>
        {description && <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">{description}</p>}
        {children}
      </div>
    </section>
  );
}
