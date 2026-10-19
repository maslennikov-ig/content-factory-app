'use client';

import { useCallback, useEffect, useMemo, useState, type ContextType } from 'react';
import { SWRConfig } from 'swr';
import { FetchProvider } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { UserContext } from '@contentfactory/frontend/components/layout/user.context';
import { InterfaceReviewFrame, defineInterfaceReviewScene, type InterfaceReviewContext } from '../interface-review/fixture-contract';
import { ReviewLocaleProvider } from '../interface-review/review-i18n';
import { AgentScreen } from './agent.screen';
import { AGENT_NOT_STARTED_HEADER, AGENT_THREAD_HEADER, type AgentMessage, type AgentWorkspaceV1 } from './agent.contract';

/** Development-only product components, synthetic responses and zero network. */
export const scene = defineInterfaceReviewScene({
  id: 'agents/chats', fixture: { threads: 105, messagesInFirstThread: 405 },
  states: ['default', 'empty', 'error', 'loading', 'long-content'] as const,
});
const workspace = (): AgentWorkspaceV1 => ({ version: 'assistant-workspace/v1', workContext: null, artifacts: [], activeArtifact: null });
const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });
const transcript = (thread: string, count: number): AgentMessage[] => Array.from({ length: count }, (_, i) => ({ id: `${thread}-m-${i}`, role: i % 2 ? 'assistant' : 'user', parts: [{ type: 'text', text: `${thread} · ${i + 1}: Synthetic saved message / Сохранённое сообщение.` }] }));

export function Scene({ context }: { context: InterfaceReviewContext }) {
  const [contextual, setContextual] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [refuseFirstSend, setRefuseFirstSend] = useState(false);
  const [stats, setStats] = useState({ reads: 0, sends: 0 });
  const database = useMemo(() => ({
    threads: Array.from({ length: context.state === 'empty' ? 0 : 105 }, (_, i) => ({ id: `review-chat-${i}`, title: context.locale === 'ru' ? `Синтетический чат ${i + 1}${context.state === 'long-content' ? ' · длинное название для проверки узкой колонки' : ''}` : `Synthetic chat ${i + 1}${context.state === 'long-content' ? ' · long title for the narrow column' : ''}`, createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z' })),
    histories: new Map<string, AgentMessage[]>(), workspaces: new Map<string, ReturnType<typeof workspace>>(), calls: [] as Array<{ url: string; method: string }>, rejected: false,
  }), [context.state, context.locale]);
  const request = useCallback(async (url: string, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? 'GET';
    database.calls.push({ url, method });
    setStats((current) => ({ ...current, [method === 'POST' ? 'sends' : 'reads']: current[method === 'POST' ? 'sends' : 'reads'] + 1 }));
    const parsed = new URL(url, 'http://synthetic.invalid');
    const path = parsed.pathname;
    const page = Number(parsed.searchParams.get('page') ?? 0);
    const perPage = Number(parsed.searchParams.get('perPage') ?? (path === '/agent/threads' ? 100 : 200));
    if (path === '/settings/ai/allowance') return json({ mode: 'unlimited' });
    if (path === '/onboarding/progress') return json({ channels: 1, avatars: 1, facts: 1, pieces: 1, drafts: 1, scheduled: 1, adaptations: 1, planModes: 1, voiceSamples: 1 });
    if (path === '/agent/threads') {
      if (!recovered && context.state === 'loading') await new Promise<void>((resolve) => window.setTimeout(resolve, 2000));
      if (!recovered && context.state === 'error') return json({ code: 'SYNTHETIC_LIST_FAILURE' }, 503);
      return json({ threads: database.threads.slice(page * perPage, (page + 1) * perPage), pagination: { page, perPage, total: database.threads.length, hasMore: (page + 1) * perPage < database.threads.length } });
    }
    const owned = /^\/agent\/threads\/([^/]+)(\/workspace)?$/.exec(path);
    if (owned) {
      const id = decodeURIComponent(owned[1]);
      const thread = database.threads.find((item) => item.id === id);
      if (!thread) return json({ code: 'AGENT_THREAD_NOT_FOUND' }, 404);
      if (method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        if (owned[2]) { database.workspaces.set(id, { ...workspace(), ...body }); return json({ workspace: database.workspaces.get(id) }); }
        thread.title = body.title; return json(thread);
      }
      if (method === 'DELETE') { database.threads.splice(database.threads.indexOf(thread), 1); return json({ deleted: true }); }
      let messages = database.histories.get(id);
      if (!messages) {
        messages = transcript(id, id === 'review-chat-0' ? 405 : 2);
        if (id === 'review-chat-1') messages[1].parts.push({ type: 'dynamic-tool', toolName: 'piece_delete', toolCallId: 'review-pending-call', state: 'input-available', input: { pieceId: 'synthetic-piece' } });
        database.histories.set(id, messages);
      }
      const end = Math.max(0, messages.length - page * perPage);
      return json({ thread, messages: messages.slice(Math.max(0, end - perPage), end), pending: id === 'review-chat-1' ? [{ runId: 'review-pending-run', toolCallId: 'review-pending-call', toolName: 'piece_delete', kind: 'approval', args: { pieceId: 'synthetic-piece' }, summary: 'Synthetic pending action / Ожидает подтверждения' }] : [], workspace: database.workspaces.get(id) ?? workspace(), pagination: { page, perPage, total: messages.length, hasMore: end > perPage }, execution: { requestId: `synthetic-${id}`, state: 'settled', outcome: 'completed' } });
    }
    if (path === '/agent/chat' && method === 'POST') {
      if (refuseFirstSend && !database.rejected) { database.rejected = true; return json({ code: 'AI_PROVIDER_BUSY' }, 503, { [AGENT_NOT_STARTED_HEADER]: '1' }); }
      const body = JSON.parse(String(init.body));
      const id = body.threadId ?? `review-new-${database.threads.length}`;
      if (!database.threads.some((item) => item.id === id)) database.threads.unshift({ id, title: 'Synthetic new chat / Новый чат', createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z' });
      const user = body.messages?.[0] as AgentMessage | undefined;
      const answer: AgentMessage = { id: `${id}-answer-${database.calls.length}`, role: 'assistant', parts: [{ type: 'text', text: `Synthetic delayed response for ${id}. / Отложенный ответ этого чата.` }] };
      const encoder = new TextEncoder();
      const stream = new ReadableStream({ start(controller) {
        const push = (part: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`));
        push({ type: 'start', messageId: answer.id }); push({ type: 'text-start', id: answer.id });
        window.setTimeout(() => {
          push({ type: 'text-delta', id: answer.id, delta: (answer.parts[0] as { text: string }).text });
          push({ type: 'text-end', id: answer.id }); push({ type: 'finish' });
          controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close();
          database.histories.set(id, [...(database.histories.get(id) ?? []), ...(user ? [user] : []), answer]);
        }, 2000);
      } });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1', [AGENT_THREAD_HEADER]: id } });
    }
    return json({ items: [], channels: [], avatars: [] });
  }, [context.state, database, recovered, refuseFirstSend]);
  useEffect(() => { (window as unknown as { __chatReview: unknown }).__chatReview = { calls: database.calls, modelCalls: 0, get nativeThreadCount() { return database.threads.length; } }; }, [database]);
  const user = { id: 'synthetic-user', orgId: 'synthetic-org', role: 'ADMIN' } as NonNullable<ContextType<typeof UserContext>>;
  return <InterfaceReviewFrame scene={scene} context={context}>
    <ReviewLocaleProvider locale={context.locale}><UserContext.Provider value={user}><FetchProvider.Provider value={request}><SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false, revalidateOnFocus: false }}>
      <div data-chat-review="synthetic" className="flex h-[100dvh] min-h-0 flex-col bg-cf-surface text-cf-ink">
        <div className="flex shrink-0 flex-wrap items-center gap-[8px] border-b border-cf-border p-[8px]">
          <p className="cf-caption">Synthetic only · HTTP blocked · {stats.reads} reads · {stats.sends} synthetic sends</p>
          <Button type="button" density="dense" variant="quiet" onClick={() => setContextual((value) => !value)}>{contextual ? 'Full host' : 'Contextual host'}</Button>
          <Button type="button" density="dense" variant="quiet" onClick={() => setRefuseFirstSend((value) => !value)} aria-pressed={refuseFirstSend}>First send fails</Button>
          {context.state === 'error' || context.state === 'loading' ? <Button type="button" density="dense" variant="quiet" onClick={() => setRecovered(true)}>Recover synthetic API, then retry</Button> : null}
        </div>
        <div className="relative flex min-h-0 flex-1 [&_[data-agent-screen]]:h-auto [&_[data-agent-screen]]:flex-1"><AgentScreen contextual={contextual} /></div>
      </div>
    </SWRConfig></FetchProvider.Provider></UserContext.Provider></ReviewLocaleProvider>
  </InterfaceReviewFrame>;
}
