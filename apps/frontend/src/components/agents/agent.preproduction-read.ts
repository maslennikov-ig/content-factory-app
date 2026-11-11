import { unstable_serialize } from 'swr';
import { readClipPreproduction, type AgentClipPreproductionRef, type AgentClipPreproductionView } from './agent.contract';

export const clipPreproductionKey = (organizationId: string, userId: string, ref: AgentClipPreproductionRef) =>
  ['clip-preproduction', organizationId, userId, ref.threadId, ref.id] as const;

export function clipPreproductionTitle(view: Pick<AgentClipPreproductionView, 'sourceTitle' | 'scenario' | 'outputLocale'>): string {
  const sourceTitle = view.sourceTitle?.trim();
  const topic = sourceTitle && !/^(title|untitled|заголовок|без\s*названия)$/iu.test(sourceTitle) ? sourceTitle
    : [view.scenario?.screenText, view.scenario?.spokenText].flatMap(text => (text ?? '').split(/\r?\n/)).map(line => line.trim()).find(Boolean);
  return ['Higgsfield', view.outputLocale.toUpperCase(), topic?.slice(0, 80) || 'Clip scenario'].join(' · ');
}

type ClipRequest = (url: string, options: {method: string; body: string}) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;
// Share only an in-flight owned read. Action/focus readers still request fresh
// state; presentation may reuse the already validated canonical SWR value.
const reads = new Map<string, Promise<AgentClipPreproductionView>>();
export function readOwnedClipPreproduction(key: ReturnType<typeof clipPreproductionKey>, ref: AgentClipPreproductionRef, request: ClipRequest) {
  const id = `${unstable_serialize(key)}:${ref.pieceId}`;
  const pending = reads.get(id);
  if (pending) return pending;
  const read = (async () => {
    const response = await request('/social-factory/clip-preproduction/open', {method: 'POST', body: JSON.stringify({pilotId: ref.id, threadId: ref.threadId})});
    if (!response.ok) throw Object.assign(new Error('CLIP_READ_UNAVAILABLE'), {status: response.status});
    const value = readClipPreproduction(await response.json(), ref);
    if (!value) throw new Error('CLIP_READ_UNAVAILABLE');
    return value;
  })().finally(() => { if (reads.get(id) === read) reads.delete(id); });
  reads.set(id, read);
  return read;
}
