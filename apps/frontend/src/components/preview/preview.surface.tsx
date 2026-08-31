import type { ReactNode } from 'react';

export type PreviewSurfaceState =
  | 'loading'
  | 'empty'
  | 'default'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

export function PreviewSurface({ state, locale = 'en', detail, children }: {
  state: PreviewSurfaceState;
  locale?: 'en' | 'ru';
  detail?: string;
  children?: ReactNode;
}) {
  const ru = locale === 'ru';
  const messages: Record<PreviewSurfaceState, string> = {
    loading: ru ? 'Загружаем предпросмотр' : 'Loading preview',
    empty: ru ? 'Публикация не найдена.' : 'The post was not found.',
    default: ru ? 'Предпросмотр публикации' : 'Post preview',
    success: ru ? 'Ссылка на предпросмотр скопирована.' : 'The preview link was copied.',
    error: ru ? 'Не удалось загрузить предпросмотр. Повторите позже.' : 'The preview could not be loaded. Try again later.',
    restricted: ru ? 'Войдите, чтобы добавить комментарий.' : 'Sign in to add a comment.',
    disabled: ru ? 'Комментарии временно недоступны.' : 'Comments are temporarily unavailable.',
    'long-content': detail || '',
  };
  return (
    <section data-product-surface="preview" data-surface-state={state} aria-busy={state === 'loading'} className="min-w-0 text-cf-ink">
      {state !== 'default' && (
        <div className="mx-auto mb-[16px] max-w-full rounded-cf border border-cf-border bg-cf-surface p-[16px]">
          <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">{messages[state]}</p>
        </div>
      )}
      {children}
    </section>
  );
}
