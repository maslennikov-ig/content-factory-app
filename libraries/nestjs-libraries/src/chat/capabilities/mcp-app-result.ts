import { AsyncLocalStorage } from 'node:async_hooks';

/** Secrets for the host iframe only; never part of a capability result/log. */
const appResult = new AsyncLocalStorage<{ meta?: Record<string, unknown> }>();
export const withMcpAppResultScope = <T>(callback: () => T): T => appResult.run({}, callback);

export const setMcpAppPrivateResult = (meta: Record<string, unknown>) => {
  const scope = appResult.getStore();
  if (!scope) throw new Error('MCP_APP_TRANSPORT_REQUIRED');
  scope.meta = meta;
};

/**
 * Mastra MCP 1.18 supports App resources but drops result-level _meta. Its
 * transport factory registers the low-level SDK handler here. Wrap only that
 * registration; preserve the SDK's auth, input checks and normal response.
 * Fail closed on upgrade instead of putting an upload credential in content.
 */
export const installMcpAppResultEnvelope = (server: object) => {
  const target = server as { registerHandlersOnServer?: (sdk: any) => void };
  const register = target.registerHandlersOnServer;
  if (typeof register !== 'function') throw new Error('MCP_APP_TRANSPORT_UNSUPPORTED');
  target.registerHandlersOnServer = function (sdk) {
    const original = sdk.setRequestHandler;
    sdk.setRequestHandler = function (schema: any, handler: any) {
      const method = typeof schema === 'string' ? schema : schema?.shape?.method?.value;
      if (method !== 'tools/call') return original.call(this, schema, handler);
      return original.call(this, schema, (request: any, extra: any) =>
        withMcpAppResultScope(async () => {
          const response = await handler(request, extra);
          const meta = appResult.getStore()?.meta;
          return meta && !response.isError ? { ...response, _meta: meta } : response;
        })
      );
    };
    try { register.call(this, sdk); } finally { sdk.setRequestHandler = original; }
  };
};
