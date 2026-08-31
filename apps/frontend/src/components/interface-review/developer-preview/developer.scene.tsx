import { defineInterfaceReviewScene, InterfaceReviewFrame, type InterfaceReviewContext, type InterfaceReviewState } from '../fixture-contract';
import { DeveloperSurface, type DeveloperSurfaceState } from '../../developer/developer.surface';

export const exclusions = [] as const;
export const scene = defineInterfaceReviewScene({
  id: 'developer-preview/developer',
  fixture: { application: 'Редактор кампаний', description: 'Синтетическое приложение для проверки длинного описания без подключения к рабочей организации и без сохранения изменений.' },
  states: ['loading', 'empty', 'default', 'selected', 'success', 'error', 'restricted', 'disabled', 'long-content'] as const satisfies readonly InterfaceReviewState[],
});
export function Scene({ context }: { context: InterfaceReviewContext }) {
  return <InterfaceReviewFrame scene={scene} context={context}><div data-interface-review-data="synthetic" className="p-[24px]"><DeveloperSurface state={context.state as DeveloperSurfaceState} locale={context.locale} name={scene.fixture.application} description={scene.fixture.description}><div className="rounded-cf border border-cf-border bg-cf-surface p-[16px]"><p className="cf-body-sm text-cf-ink-muted">{scene.fixture.description}</p></div></DeveloperSurface></div></InterfaceReviewFrame>;
}
