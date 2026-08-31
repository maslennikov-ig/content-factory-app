import { defineInterfaceReviewScene, InterfaceReviewFrame, type InterfaceReviewContext, type InterfaceReviewState } from '../fixture-contract';
import { ExtensionSurface, type ExtensionSurfaceState } from '../../../app/(extension)/modal/extension.surface';

export const exclusions = [{ state: 'success', contract: 'Composer completion belongs to the parent runtime and may publish; the offline product chrome cannot claim it.' }] as const;
export const scene = defineInterfaceReviewScene({
  id: 'developer-preview/extension',
  fixture: { destination: 'Синтетический канал', detail: 'Оболочка редактора показана без загрузки интеграций, поиска времени и отправки публикации.' },
  states: ['loading', 'empty', 'default', 'selected', 'error', 'restricted', 'disabled', 'long-content'] as const satisfies readonly InterfaceReviewState[],
});
export function Scene({ context }: { context: InterfaceReviewContext }) {
  return <InterfaceReviewFrame scene={scene} context={context}><div data-interface-review-data="synthetic"><ExtensionSurface state={context.state as ExtensionSurfaceState} locale={context.locale} detail={scene.fixture.detail}><div className="m-[16px] rounded-cf border border-cf-border bg-cf-surface p-[16px]"><p className="cf-label-md">{scene.fixture.destination}</p><p className="cf-body-sm text-cf-ink-muted">{scene.fixture.detail}</p></div></ExtensionSurface></div></InterfaceReviewFrame>;
}
