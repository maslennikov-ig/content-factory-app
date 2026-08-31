import { defineInterfaceReviewScene, InterfaceReviewFrame, type InterfaceReviewContext, type InterfaceReviewState } from '../fixture-contract';
import { PreviewSurface, type PreviewSurfaceState } from '../../preview/preview.surface';

export const exclusions = [{ state: 'selected', contract: 'The public post preview is read-only and exposes actions, not a selectable surface state.' }] as const;
export const scene = defineInterfaceReviewScene({
  id: 'developer-preview/preview',
  fixture: { author: 'Команда редакции', channel: 'Синтетический канал', content: 'Длинная публикация проверяет перенос строк, читаемую меру текста и отсутствие горизонтального переполнения на узком экране.' },
  states: ['loading', 'empty', 'default', 'success', 'error', 'restricted', 'disabled', 'long-content'] as const satisfies readonly InterfaceReviewState[],
});
export function Scene({ context }: { context: InterfaceReviewContext }) {
  return <InterfaceReviewFrame scene={scene} context={context}><div data-interface-review-data="synthetic" className="p-[24px]"><PreviewSurface state={context.state as PreviewSurfaceState} locale={context.locale} detail={scene.fixture.content}><article className="mx-auto max-w-[720px] rounded-cf border border-cf-border bg-cf-surface p-[16px]"><p className="cf-label-md">{scene.fixture.author}</p><p className="cf-caption text-cf-ink-muted">{scene.fixture.channel}</p><p className="cf-body-md mt-[12px] whitespace-pre-wrap">{scene.fixture.content}</p></article></PreviewSurface></div></InterfaceReviewFrame>;
}
