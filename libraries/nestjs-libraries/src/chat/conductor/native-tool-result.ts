import { createHash } from 'node:crypto';
import type { Processor, ProcessLLMRequestArgs, ProcessLLMRequestResult } from '@mastra/core/processors';
import type { CapabilityToolOutput } from '../capabilities/capability.types';
import {
  readCommittedToolReceipt,
  recordCommittedToolReceipt,
  type AgentOperationScope,
} from './agent-operation-receipts';

/** Native workflow contexts repeat results; full results belong in native storage. */
export const NATIVE_TOOL_RESULT_MAX_BYTES = 32_768;

export type NativeToolResultRef = {
  version: 1;
  runId: string;
  toolName: string;
  toolCallId: string;
  resumed: boolean;
  resumeKey?: string;
  sha256: string;
};

type ProjectedToolResult = CapabilityToolOutput & { nativeResult?: Record<string, unknown> };

/** JSONB reorders object keys, so receipt digests use the same canonical JSON. */
export const nativeToolResultJson = (value: unknown) => JSON.stringify(value, (_key, entry) =>
  entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]]))
    : entry
);

const digest = (json: string) => createHash('sha256').update(json).digest('hex');
const machineField = /(?:^id$|Id$|Ids$|Key$|Keys$|Url$|^url$|^revision$|^sha256$|^rule$|^readWith$|^capability$|^outcome$|^status$|^code$|^level$|^part$|^kind$|^type$|At$|^from$|^to$)/;

const preview = (value: unknown, textLimit: number, field = ''): unknown => {
  if (typeof value === 'string') {
    const limit = machineField.test(field) ? 2_048 : textLimit;
    // Keep an exact source prefix: omission markers are projection metadata,
    // never invented characters inside a retained source range.
    return value.length <= limit ? value : value.slice(0, limit);
  }
  if (Array.isArray(value)) return value.map((entry) => preview(entry, textLimit, field));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, preview(entry, textLimit, key)])
  );
  return value;
};

/**
 * A projection never replaces a receipt. Reads with oversized results retain
 * the same native committed-receipt shape before returning their projection;
 * they do not acquire a write claim or mark a domain outcome uncertain.
 */
export const projectNativeToolResult = async (args: {
  result: CapabilityToolOutput;
  scope?: AgentOperationScope | null;
  retained?: boolean;
}): Promise<ProjectedToolResult> => {
  if (args.result.ok !== true || !args.scope?.runId || !args.scope.threadId ||
      !args.scope.storage || !args.scope.toolCallId) return args.result;
  const json = nativeToolResultJson(args.result);
  if (Buffer.byteLength(json) <= NATIVE_TOOL_RESULT_MAX_BYTES) return args.result;
  const ref: NativeToolResultRef = {
    version: 1, runId: args.scope.runId, toolName: args.scope.toolName,
    toolCallId: args.scope.toolCallId, resumed: args.scope.resumed === true,
    ...(args.scope.resumeKey ? { resumeKey: args.scope.resumeKey } : {}), sha256: digest(json),
  };
  if (!args.retained) {
    try {
      await recordCommittedToolReceipt({ ...args.scope, receipt: { result: args.result } });
    } catch {
      return { ok: false, code: 'CAPABILITY_RESULT_UNAVAILABLE',
        reason: 'The read result could not be retained. Read it again after storage is available; no domain write was started.' };
    }
  }
  const nativeResult = {
    truncated: true, totalCharacters: json.length, totalBytes: Buffer.byteLength(json),
    readWith: 'readConversationHistory', outputRef: ref,
    note: 'This is a bounded preview, not the exact full result. Read the saved result with outputRef and offset/length when exact text or omitted detail is needed. Original source routes remain available.',
  };
  for (const textLimit of [256, 128, 64, 0]) {
    const result = { ...args.result, summary: preview(args.result.summary, textLimit), nativeResult };
    if (Buffer.byteLength(JSON.stringify(result)) <= NATIVE_TOOL_RESULT_MAX_BYTES) return result;
  }
  // Many machine identifiers can exceed the limit without any text. Keep the
  // full ordered rows in the receipt; make this omission explicit and readable.
  return { ...args.result, summary: { savedResultAvailable: true }, nativeResult };
};

/** The caller supplies only its server-verified organization/thread scope. */
export const readNativeToolResult = async (args: {
  scope: Pick<AgentOperationScope, 'organizationId' | 'threadId' | 'memory' | 'storage'>;
  ref: NativeToolResultRef;
}): Promise<string | null> => {
  try {
    const receipt = await readCommittedToolReceipt({ ...args.scope, ...args.ref });
    if (!receipt) return null;
    const json = nativeToolResultJson(receipt.result);
    return digest(json) === args.ref.sha256 ? json : null;
  } catch {
    // History/read availability never changes the safety state of a write.
    return null;
  }
};

/**
 * The SDK keeps model/display/transcript copies in mastra provider metadata.
 * That metadata is needed by native history, but forwarding it to a model
 * repeats the exact tool body beside the real tool-result output. The native
 * provider-boundary hook changes only the outgoing prompt, never Memory,
 * snapshots, resumable gates, or actual provider signatures/options.
 */
export class NativeToolResultPromptProcessor implements Processor<'native-tool-result-prompt'> {
  readonly id = 'native-tool-result-prompt' as const;

  processLLMRequest({ prompt }: ProcessLLMRequestArgs): ProcessLLMRequestResult {
    let changed = false;
    const strip = <T extends { providerOptions?: any }>(part: T): T => {
      const mastra = part.providerOptions?.mastra;
      if (!mastra || typeof mastra !== 'object' || ![
        'modelOutput', 'toolPayloadTransform', 'toolPayloadProjection',
      ].some((key) => Object.prototype.hasOwnProperty.call(mastra, key))) return part;
      const { modelOutput, toolPayloadTransform, toolPayloadProjection, ...kept } = mastra;
      const { mastra: _mastra, ...options } = part.providerOptions;
      if (Object.keys(kept).length) options.mastra = kept;
      changed = true;
      return { ...part, providerOptions: Object.keys(options).length ? options : undefined };
    };
    const next: typeof prompt = prompt.map((message): typeof message => {
      const base = strip(message);
      if (!Array.isArray(message.content)) return base;
      const content = message.content.map(strip);
      return content.some((part, index) => part !== message.content[index]) ? { ...base, content } as typeof message : base;
    });
    return changed ? { prompt: next } : undefined;
  }
}
