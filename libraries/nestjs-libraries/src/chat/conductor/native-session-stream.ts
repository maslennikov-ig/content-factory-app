import { toAISdkStream } from '@mastra/ai-sdk';
import type { Session } from '@mastra/core/agent-controller';
import type { AgentSignalContents } from '@mastra/core/agent';
import { AGENT_STREAM_TOPIC, type DurableAgent } from '@mastra/core/agent/durable';
import type { RequestContext } from '@mastra/core/request-context';
import { observeConductorRun } from './native-run-observer';

export const AGENT_NATIVE_RUN_METADATA_KEY = 'assistantNativeRun';
export const AGENT_NATIVE_CONTINUATION_PART = 'data-native-run-continuation';

/** Replay belongs to Mastra's shared PubSub; detaching never clears it. */
export async function observeNativeRun(input: {
  agent: DurableAgent<any, any, any>;
  runId: string;
  offset?: number;
  nextRunId?: () => Promise<string | undefined>;
  follow?: boolean;
  onRunId?: (runId: string) => Promise<void>;
  onMessageId?: (runId: string, messageId: string) => Promise<void>;
  isComplete?: () => Promise<boolean>;
  onError: (error: unknown) => string;
}): Promise<ReadableStream<any>> {
  let runId = input.runId;
  let observed = await observeConductorRun(input.agent, runId, { offset: input.offset, isComplete: input.isComplete });
  const uiFor = () => toAISdkStream(observed.output, {
    from: 'agent', version: 'v7', sendStart: true, sendFinish: true,
    sendReasoning: false, sendSources: false, onError: input.onError,
  });
  let reader = uiFor().getReader();
  let terminal: any[] = [];
  let ended = false;
  let cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (ended) {
            if (terminal.length) { controller.enqueue(terminal.shift()); return; }
            observed.detach(); controller.close(); return;
          }
          const part = await reader.read();
          if (cancelled) return;
          if (!part.done) {
            if (['abort', 'finish', 'error'].includes(part.value?.type)) {
              terminal.push(part.value); continue;
            }
            if (part.value?.type === 'start' && typeof part.value.messageId === 'string') {
              await input.onMessageId?.(runId, part.value.messageId);
            }
            controller.enqueue(part.value?.type === 'start'
              ? { ...part.value, messageMetadata: { ...(part.value.messageMetadata && typeof part.value.messageMetadata === 'object' ? part.value.messageMetadata : {}), nativeRunId: runId } }
              : part.value);
            return;
          }
          const next = await input.nextRunId?.();
          if (next && next !== runId) {
            observed.detach();
            terminal = [];
            controller.enqueue({ type: AGENT_NATIVE_CONTINUATION_PART, data: { runId: next, previousRunId: runId }, transient: true });
            if (input.follow === false) { ended = true; return; }
            runId = next;
            await input.onRunId?.(runId);
            observed = await observeConductorRun(input.agent, runId, { isComplete: input.isComplete });
            reader = uiFor().getReader();
            return;
          }
          ended = true;
        }
      } catch (error) { observed.detach(); if (!cancelled) controller.error(error); }
    },
    async cancel() { cancelled = true; observed.detach(); await reader.cancel(); },
  });
}

/** The HTTP/UI adapter only: Session drives execution; DurableAgent owns replay. */
export async function streamNativeSession(input: {
  session: Session<any>;
  agent: DurableAgent<any, any, any>;
  threadId: string;
  resourceId: string;
  requestContext: RequestContext<any>;
  message?: { id: string; parts: Array<Record<string, any>> };
  resume?: { runId: string; toolCallId: string; resumeData: unknown };
  approvals?: { runId: string; answers: Array<{ toolCallId: string; approved: boolean; reason?: string }> };
  onRunId: (runId: string) => Promise<void>;
  onMessageId?: (runId: string, messageId: string) => Promise<void>;
  nextRunId?: () => Promise<string | undefined>;
  onAbort?: () => void;
  onError: (error: unknown) => string;
}): Promise<ReadableStream<any>> {
  const { session, agent, requestContext } = input;
  let runId: string;
  let offset: number | undefined;
  let drive: (() => Promise<void>) | undefined;
  if (input.message) {
    const contents = input.message.parts.flatMap<Exclude<AgentSignalContents, string>[number]>((part) => {
      if (part.type === 'text') return [{ type: 'text' as const, text: part.text }];
      if (part.type === 'file') return [{
        type: 'file' as const,
        data: part.url ?? part.data,
        mediaType: part.mediaType,
        ...(part.filename ? { filename: part.filename } : {}),
      }];
      return [];
    });
    const accepted = await session.sendSignal({
      id: input.message.id,
      type: 'user',
      contents,
      author: requestContext.get('mastra__messageAuthor'),
    }, { requestContext, requireDelivery: true }).accepted;
    if (!accepted.runId || accepted.action === 'blocked' || accepted.action === 'discard') {
      throw new Error('The native session did not accept this turn.');
    }
    runId = accepted.runId;
  } else {
    runId = input.resume?.runId ?? input.approvals!.runId;
    // Native event indices include lifecycle events. Subscribe before resuming
    // and start after the old segment so a stored approval is not replayed.
    const history = await agent.pubsub.getHistory(AGENT_STREAM_TOPIC(runId));
    offset = history.length;
    drive = async () => {
      if (input.resume) {
        await session.resumeToolCall({
          address: { runId, toolCallId: input.resume.toolCallId, threadId: input.threadId, resourceId: input.resourceId },
          resumeData: input.resume.resumeData,
          requestContext,
        });
      } else {
        for (const answer of input.approvals!.answers) {
          if (session.approval.isArmed({ runId, toolCallId: answer.toolCallId })) {
            await session.respondToToolApproval({
              toolCallId: answer.toolCallId,
              decision: answer.approved ? 'approve' : 'decline',
              requestContext,
              ...(answer.reason ? { declineContext: { reason: answer.reason } } : {}),
            });
          } else {
            await session.respondToPersistedToolApproval({
              toolCallId: answer.toolCallId,
              approved: answer.approved,
              requestContext,
            });
          }
        }
      }
    };
  }
  await input.onRunId(runId);
  const ui = await observeNativeRun({ agent, runId, offset, nextRunId: input.nextRunId, onRunId: input.onRunId, onMessageId: input.onMessageId, onError: input.onError });
  const reader = ui.getReader();
  const shownGates = new Map<string, { runId: string; kind: 'approval' | 'suspension' }>();
  const announced = new Set<string>();
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let notifyGate: (toolCallId: string) => void = () => undefined;
  return new ReadableStream({
    start(controller) {
      notifyGate = (toolCallId: string) => {
        const gate = shownGates.get(toolCallId);
        if (!gate || closed || announced.has(toolCallId)) return;
        const address = { runId: gate.runId, toolCallId, threadId: input.threadId, resourceId: input.resourceId };
        const parked = gate.kind === 'approval' ? session.approval.isArmed(address) : session.suspensions.has(address);
        if (parked) {
          announced.add(toolCallId);
          controller.enqueue({ type: 'data-native-input-wait', data: { runId: gate.runId, toolCallId }, transient: true });
        }
      };
      unsubscribe = session.subscribe(event => {
        if ((event.type === 'tool_approval_required' || event.type === 'tool_suspended') && event.threadId === input.threadId) notifyGate(event.toolCallId);
      });
      // Register only after the card chunk has been delivered. The native
      // event may arrive before or after replay catches up to that chunk.
      if (drive) void drive().catch((error) => {
        closed = true; unsubscribe?.();
        void reader.cancel();
        controller.error(error);
      });
    },
    async pull(controller) {
      try {
        const part = await reader.read();
        if (closed) return;
        if (part.done) { closed = true; unsubscribe?.(); controller.close(); }
        else {
          const value = part.value;
          if (value?.data?.resumed !== true && ['data-tool-call-approval', 'data-tool-call-suspended'].includes(value?.type) && value.data?.toolCallId) {
            shownGates.set(value.data.toolCallId, { runId: value.data.runId, kind: value.type === 'data-tool-call-approval' ? 'approval' : 'suspension' });
          }
          controller.enqueue(value);
          if (value?.data?.toolCallId) notifyGate(value.data.toolCallId);
        }
      } catch (error) {
        if (closed) return;
        closed = true; unsubscribe?.();
        void reader.cancel();
        controller.error(error);
      }
    },
    async cancel() {
      closed = true; unsubscribe?.();
      // An observer leaving is not Stop and must never destroy shared replay.
      await reader.cancel();
    },
  });
}
