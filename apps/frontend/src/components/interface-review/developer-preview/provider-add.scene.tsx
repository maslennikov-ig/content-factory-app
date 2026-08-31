import { defineInterfaceReviewScene, InterfaceReviewFrame, type InterfaceReviewContext, type InterfaceReviewState } from '../fixture-contract';
import { ProviderAddSurface, type ProviderAddSurfaceState } from '../../../app/(provider)/provider/add/provider-add.surface';

export const exclusions = [
  { state: 'success', contract: 'Connection success belongs to the external provider redirect or native deep-link flow.' },
  { state: 'restricted', contract: 'The provider list payload defines availability but no shared permission or billing surface outcome.' },
  { state: 'disabled', contract: 'The provider list contract has no general disabled field for the product-owned picker shell.' },
] as const;
export const scene = defineInterfaceReviewScene({
  id: 'developer-preview/provider-add',
  fixture: { groups: ['Социальные сети', 'Публикационные площадки'], detail: 'Доступные направления показаны как локальная оболочка; выбор не начинает подключение.' },
  states: ['loading', 'empty', 'default', 'selected', 'error', 'long-content'] as const satisfies readonly InterfaceReviewState[],
});
export function Scene({ context }: { context: InterfaceReviewContext }) {
  return <InterfaceReviewFrame scene={scene} context={context}><div data-interface-review-data="synthetic"><ProviderAddSurface state={context.state as ProviderAddSurfaceState} locale={context.locale} detail={scene.fixture.detail}><div className="grid gap-[8px] sm:grid-cols-2">{scene.fixture.groups.map((group) => <div key={group} className="rounded-cf border border-cf-border bg-cf-surface p-[12px]"><p className="cf-label-md">{group}</p></div>)}</div></ProviderAddSurface></div></InterfaceReviewFrame>;
}
