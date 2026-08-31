import { defineInterfaceReviewScene, InterfaceReviewFrame, type InterfaceReviewContext, type InterfaceReviewState } from '../fixture-contract';
import { PublicApiSurface, type PublicApiSurfaceState } from '../../public-api/public-api.surface';

export const exclusions = [{ state: 'empty', contract: 'Organization developer access is either provisioned for an administrator or represented as a restricted state.' }] as const;
export const scene = defineInterfaceReviewScene({
  id: 'developer-preview/public-api',
  fixture: { method: 'Заголовок запроса', client: 'Локальный инструмент', detail: 'Конфигурация скрыта; проверяется только принадлежащая продукту оболочка и выбор способа подключения.' },
  states: ['loading', 'default', 'selected', 'success', 'error', 'restricted', 'disabled', 'long-content'] as const satisfies readonly InterfaceReviewState[],
});
export function Scene({ context }: { context: InterfaceReviewContext }) {
  return <InterfaceReviewFrame scene={scene} context={context}><div data-interface-review-data="synthetic" className="p-[24px]"><PublicApiSurface state={context.state as PublicApiSurfaceState} locale={context.locale} detail={scene.fixture.detail}><div className="rounded-cf border border-cf-border bg-cf-surface p-[16px]"><p className="cf-label-md">{scene.fixture.method}</p><p className="cf-body-sm text-cf-ink-muted">{scene.fixture.client}</p></div></PublicApiSurface></div></InterfaceReviewFrame>;
}
