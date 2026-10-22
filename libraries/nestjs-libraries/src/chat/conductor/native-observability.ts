import type { AnySpan, SpanOutputProcessor } from '@mastra/core/observability';
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { redactSecretShapes } from './secret-shapes';

const OMITTED = '[omitted]';
const CONTEXT_IDS = {
  [MASTRA_RESOURCE_ID_KEY]: 'resourceId',
  [MASTRA_THREAD_ID_KEY]: 'threadId',
  'cf.organizationId': 'organizationId',
  'cf.userId': 'userId',
  'cf.requestId': 'requestId',
} as const;
const METADATA_IDS = new Set([
  ...Object.values(CONTEXT_IDS),
  'runId', 'sessionId', 'operationId', 'usageRecordId',
]);
const PRIVATE_FIELDS = new Set([
  'apikey', 'authorization', 'auth', 'password', 'secret', 'token', 'cookie',
  'headers', 'credentials', 'request', 'response', 'requestcontext', 'context',
  'body', 'messages', 'prompt', 'input', 'output', 'image', 'images', 'audio',
  'file', 'files', 'pdf', 'data', 'base64', 'buffer', 'content', 'text', 'args',
  'arguments', 'instructions', 'instruction', 'system', 'tooldescription',
  'tools', 'warnings', 'provideroptions', 'providermetadata', 'abortsignal',
  'error', 'errors', 'cause', 'stack', 'details', 'config', 'configuration',
  'responsebody', 'requestbodyvalues', 'requestheaders', 'responseheaders',
]);

const safeText = (value: string, maximum = 1024): string => {
  const mediaRemoved = value
    .replace(/data:[^,\s]+,[A-Za-z0-9+/=_-]+/gi, OMITTED)
    .replace(/(?:postgres(?:ql)?|redis):\/\/[^\s"'<>]+/gi, OMITTED)
    .replace(/[A-Za-z0-9+/]{128,}={0,2}/g, OMITTED);
  return redactSecretShapes(mediaRemoved).slice(0, maximum);
};

/** Bound the native export payload; request content is never a trace payload. */
const safeAttributes = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (depth > 4) return OMITTED;
  if (typeof value === 'string') {
    if (/^\s*[\[{]/.test(value)) {
      try { return JSON.stringify(safeAttributes(JSON.parse(value), depth + 1, seen)); }
      catch { return OMITTED; }
    }
    return safeText(value);
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return OMITTED;
  if (seen.has(value)) return OMITTED;
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map(item => safeAttributes(item, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [
    safeText(key, 80),
    PRIVATE_FIELDS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''))
      ? OMITTED : safeAttributes(item, depth + 1, seen),
  ]));
};

export class NativeTracePrivacy implements SpanOutputProcessor {
  readonly name = 'content-factory-native-trace-privacy';

  process(span?: AnySpan): AnySpan | undefined {
    if (!span) return undefined;
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(span.metadata || {})) {
      if (METADATA_IDS.has(key) && typeof value === 'string') metadata[key] = safeText(value, 256);
    }
    // Read only server-written primitive IDs, never the identity/config objects.
    for (const [key, target] of Object.entries(CONTEXT_IDS)) {
      const value = span.requestContext?.[key] ?? span.metadata?.[key];
      if (typeof value === 'string' && value) metadata[target] = safeText(value, 256);
    }
    span.metadata = metadata;
    span.name = safeText(span.name, 256);
    if (span.entityName) span.entityName = safeText(span.entityName, 256);
    span.attributes = safeAttributes(span.attributes) as AnySpan['attributes'];
    span.tags = span.tags?.slice(0, 20).map(tag => safeText(tag, 80));
    span.input = undefined;
    span.output = undefined;
    span.inputPreview = null;
    span.outputPreview = null;
    span.requestContext = undefined;
    if (span.errorInfo) {
      const { id, name, domain, category } = span.errorInfo;
      span.errorInfo = { message: 'Operation failed',
        ...Object.fromEntries(Object.entries({ id, name, domain, category })
          .filter(([, value]) => typeof value === 'string')
          .map(([key, value]) => [key, safeText(value!, 160)])),
      };
      span.errorPreview = 'Operation failed';
    }
    return span;
  }

  async shutdown(): Promise<void> {}
}

/** One explicit storage exporter; never enables a hosted or external exporter. */
export const createNativeObservability = () => new Observability({
  configs: {
    default: {
      serviceName: 'content-factory',
      exporters: [new MastraStorageExporter()],
      spanOutputProcessors: [new NativeTracePrivacy()],
      requestContextKeys: [MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY],
      logging: { enabled: false },
    },
  },
});
