import { defineInterfaceReviewScene, InterfaceReviewFrame, type InterfaceReviewContext, type InterfaceReviewState } from '../fixture-contract';
import { OAuthAuthorizeSurface, type OAuthAuthorizeSurfaceState } from '../../../app/(app)/oauth/authorize/oauth-authorize.surface';

export const exclusions = [
  { state: 'empty', contract: 'A request without the required authorization parameters is an error, not an empty first-use state.' },
  { state: 'selected', contract: 'Approve and deny are immediate actions and do not establish a persistent selected surface state.' },
  { state: 'success', contract: 'A successful authorization decision returns a redirect and has no local success surface.' },
  { state: 'restricted', contract: 'The authorization controller exposes validation errors but no separate billing or permission response.' },
] as const;
export const scene = defineInterfaceReviewScene({
  id: 'developer-preview/oauth-authorize',
  fixture: { application: 'Планировщик редакции', description: 'Синтетический запрос доступа показывает длинное описание приложения и перечень разрешений без выполнения решения.' },
  states: ['loading', 'default', 'error', 'disabled', 'long-content'] as const satisfies readonly InterfaceReviewState[],
});
export function Scene({ context }: { context: InterfaceReviewContext }) {
  return <InterfaceReviewFrame scene={scene} context={context}><div data-interface-review-data="synthetic"><OAuthAuthorizeSurface state={context.state as OAuthAuthorizeSurfaceState} locale={context.locale} appName={scene.fixture.application} description={scene.fixture.description}><ul className="cf-body-sm list-disc space-y-[4px] ps-[20px]"><li>Просмотр подключённых каналов</li><li>Подготовка публикаций от имени пользователя</li></ul></OAuthAuthorizeSurface></div></InterfaceReviewFrame>;
}
