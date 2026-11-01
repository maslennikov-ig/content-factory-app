import type { Processor, ProcessOutputStepArgs, ProcessOutputStreamArgs } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { getNativeTextMaxRetries, NATIVE_TERMINAL_MODEL_ERROR_KEY } from '../../openai/ai.native-retries';
import { redactSecretShapes } from './secret-shapes';

/** Native streaming input may end without a complete call or an SDK tool error. */
export class NativeToolCallLifecycleProcessor implements Processor<'native-tool-call-lifecycle'> {
  readonly id = 'native-tool-call-lifecycle' as const;

  async processOutputStream({ part, state }: ProcessOutputStreamArgs) {
    if (part.type === 'step-start') state.pendingCalls = {};
    const payload = 'payload' in part ? part.payload as any : undefined;
    if (part.type === 'tool-call-input-streaming-start') {
      const pending = (state.pendingCalls ??= {}) as Record<string, { toolName: string; argumentBytes: number }>;
      pending[payload.toolCallId] = {
        toolName: redactSecretShapes(String(payload.toolName ?? '')).slice(0, 128), argumentBytes: 0,
      };
    }
    const pending = state.pendingCalls as Record<string, { toolName: string; argumentBytes: number }> | undefined;
    if (part.type === 'tool-call-delta' && pending?.[payload.toolCallId]) {
      pending[payload.toolCallId].argumentBytes += Buffer.byteLength(payload.argsTextDelta ?? '');
    }
    if (['tool-call', 'tool-error', 'tool-result'].includes(part.type) && pending) delete pending[payload.toolCallId];
    return part;
  }

  processOutputStep(args: ProcessOutputStepArgs) {
    const pending = args.state.pendingCalls as Record<string, { toolName: string; argumentBytes: number }> | undefined;
    if (!pending || !Object.keys(pending).length) return args.messages;
    // Completed calls in the same step must never be replayed with an incomplete peer.
    const retry = !args.toolCalls?.length && args.retryCount < getNativeTextMaxRetries(args.requestContext);
    const diagnostics = Object.entries(pending).slice(0, 20).map(([id, value]) => ({
      toolCallId: redactSecretShapes(id).slice(0, 128), ...value, outcome: 'incomplete' as const,
    }));
    (args.tracingContext?.currentSpan as any)?.update?.({ attributes: { incompleteToolCalls: diagnostics } });
    args.state.pendingCalls = {};
    if (!retry) (args.requestContext as RequestContext<any> | undefined)?.set(NATIVE_TERMINAL_MODEL_ERROR_KEY, { code: 'AGENT_TASK_OPERATION_FAILED' });
    args.abort('The model did not finish its tool call. No incomplete call was executed. Return a complete tool call or explain what remains.', {
      retry,
      metadata: { incompleteToolCalls: diagnostics,
        ...(!retry ? { cfNativeTerminalModelError: { code: 'AGENT_TASK_OPERATION_FAILED' } } : {}) },
    });
  }
}
