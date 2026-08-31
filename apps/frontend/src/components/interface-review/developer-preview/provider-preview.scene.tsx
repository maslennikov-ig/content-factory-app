import { defineInterfaceReviewScene, InterfaceReviewFrame, type InterfaceReviewContext, type InterfaceReviewState } from '../fixture-contract';
import { ProviderPreviewSurface, type ProviderPreviewSurfaceState } from '../../provider-preview/provider-preview.surface';

export const exclusions = [
  { state: 'empty', contract: 'An absent seed preserves provider form defaults and is not an empty collection state.' },
  { state: 'selected', contract: 'Provider fields own their selection semantics; the native pull bridge has no selected surface state.' },
  { state: 'success', contract: 'The bridge validates and returns values while the native host owns save success.' },
  { state: 'restricted', contract: 'The bridge contract has no billing or permission result exposed through its pull globals.' },
  { state: 'disabled', contract: 'The bridge exposes read, validate, and character-limit pulls but no disabled-mode command.' },
] as const;
export const scene = defineInterfaceReviewScene({
  id: 'developer-preview/provider-preview',
  fixture: { provider: 'Синтетический провайдер', detail: 'Предыдущее локальное сохранение не прошло проверку обязательного поля; исправьте значение и повторите в родительском приложении.' },
  states: ['loading', 'default', 'error', 'long-content'] as const satisfies readonly InterfaceReviewState[],
});
export function Scene({ context }: { context: InterfaceReviewContext }) {
  return <InterfaceReviewFrame scene={scene} context={context}><div data-interface-review-data="synthetic"><ProviderPreviewSurface state={context.state as ProviderPreviewSurfaceState} locale={context.locale} provider={scene.fixture.provider} detail={scene.fixture.detail}><div className="rounded-cf border border-cf-border-control bg-cf-surface p-[12px]"><p className="cf-body-sm">{scene.fixture.detail}</p></div></ProviderPreviewSurface></div></InterfaceReviewFrame>;
}
