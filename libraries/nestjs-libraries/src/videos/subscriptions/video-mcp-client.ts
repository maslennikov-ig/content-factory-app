import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { VideoSubscriptionRuntime, SubscriptionEndpoint, subscriptionHash, VideoQualificationResponseError, type VideoQualificationPhase } from './video-provider-registry';
import { videoErrorV1 } from '../video-brief.v1';
import { HGG_READ_SCHEMA_V1, hggReadPlanV1, hggReadRequestV1, decodeHggReadV1, type HggReadHooksV1 } from './video-hgg-qualification-read.v1';
import { hggPilotQuoteRequestV1, decodeHggPilotQuoteV1, type HggPilotQuoteOwnerV1, type HggPilotEvidenceBytesV1, type HggPilotQuoteHooksV1 } from './video-hgg-pilot-quote.v1';
import { HGG_PILOT_EVIDENCE_V1 } from './video-hgg-pilot-evidence.v1';
import { hggPilotWireV1, hggPrivateWorkspaceV1, type HggPilotExchangeV1, type HggPilotExchangeHooksV1 } from './video-hgg-pilot-wire.v1';

const tools = {higgsfield: ['generate_clip', 'jobs_wait'], heygen: ['create_video', 'get_video', 'quote_video', 'list_avatars', 'list_voices']} as const;
export type VideoTokenGuard = () => Promise<void>;
type OperatorScope = {request?: {tool: string; arguments: object}; phase: 'qualification/read' | 'qualification/quote' | 'pilot/workspace' | 'pilot/submit' | 'pilot/poll'};

@Injectable()
export class VideoMcpClient {
  constructor(private readonly runtime: VideoSubscriptionRuntime) {}
  private async session<T>(def: SubscriptionEndpoint, token: string, run: (client: Client) => Promise<T>, assertUsable?: VideoTokenGuard, qualification = false, readScope?: OperatorScope): Promise<T> {
    let endpoint: URL;
    try {
      endpoint = new URL(def.transportEndpoint ?? def.resource);
      if (def.transportEndpoint !== undefined && (typeof def.transportEndpoint !== 'string' ||
        endpoint.origin !== new URL(def.resource).origin || !def.origins.includes(endpoint.origin) ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash)) throw new Error();
    } catch { return videoErrorV1('VIDEO_ENDPOINT_UNSAFE'); }
    const finite = qualification || !!readScope;
    const controller = finite ? new AbortController() : undefined;
    let phase: VideoQualificationPhase = 'initialize'; let timer: ReturnType<typeof setTimeout> | undefined;
    const smallResponse = () => phase === 'qualification/read' || phase === 'qualification/quote' || phase.startsWith('pilot/');
    const deadline = finite ? new Promise<never>((_, reject) => {timer = setTimeout(() => {
      reject(new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', phase, 0, smallResponse())); controller!.abort();
    }, readScope ? 180_000 : 45_000);}) : undefined;
    const client = new Client({name: 'Content Factory', version: '1.0.0'}, {capabilities: {}});
    const transport = new StreamableHTTPClientTransport(endpoint, {
      // No authProvider: SDK cannot refresh/replay a billable mutation after 401.
      requestInit: {headers: {Authorization: `Bearer ${token}`}},
      reconnectionOptions: {maxRetries: 0, initialReconnectionDelay: 0, maxReconnectionDelay: 0, reconnectionDelayGrowFactor: 1},
      // A session can send several requests. Fence each new send, including
      // initialization and tool discovery, after any previous request finishes.
      fetch: async (url, init) => {
        await assertUsable?.();
        if (!finite) return this.runtime.fetch(def, String(url), init);
        if (controller!.signal.aborted) throw new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', phase, 0, smallResponse());
        // The SDK optionally opens a background GET event stream after its
        // initialized notification. This finite operator session needs no stream.
        if (init?.method === 'GET') return new Response(null, {status: 405});
        if (init?.method === 'DELETE') phase = 'close';
        else {
          let rpc: any;
          try { rpc = JSON.parse(typeof init?.body === 'string' ? init.body : ''); } catch { /* Refuse unknown/batched protocol traffic. */ }
          if (init?.method !== 'POST') return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
          if (rpc?.method === 'tools/call' && readScope?.request && rpc.params?.name === readScope.request.tool &&
            subscriptionHash(rpc.params.arguments) === subscriptionHash(readScope.request.arguments)) {phase = readScope.phase; readScope.request = undefined;}
          else if (['initialize', 'notifications/initialized', 'tools/list'].includes(rpc?.method)) phase = rpc.method;
          else return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
        }
        return this.runtime.fetch(def, String(url), init, {phase, signal: controller!.signal, ...(smallResponse() ? {read: true as const} : {})});
      },
    });
    try {
      const operation = async () => {await client.connect(transport, {timeout: finite ? 45_000 : 20_000}); return run(client);};
      return await (deadline ? Promise.race([operation(), deadline]) : operation());
    }
    catch (error: any) {
      if (finite && error instanceof VideoQualificationResponseError) throw error;
      const code = error?.getResponse?.()?.code;
      // The SDK may include remote text in an exception. Do not pass it to HTTP, tracing or chat.
      return videoErrorV1(typeof code === 'string' && /^VIDEO_[A-Z0-9_]{1,70}$/.test(code) ? code : 'VIDEO_MCP_UNAVAILABLE', 409);
    }
    finally {
      phase = 'close';
      try {const closing = client.close().catch(() => {}); await (deadline ? Promise.race([closing, deadline]) : closing);}
      finally {if (timer) clearTimeout(timer); controller?.abort();}
    }
  }
  /** tools/list only. Unreviewed output never authorizes tools/call. */
  async discover(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard) {
    return this.discoverSchema(def, token, assertUsable);
  }
  /** Larger finite response budget only for the explicit private operator export. */
  async discoverQualification(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard) {
    return this.discoverSchema(def, token, assertUsable, true);
  }
  private async discoverSchema(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard, qualification = false) {
    return this.session(def, token, async client => {
      const result = await client.listTools({}, {timeout: qualification ? 45_000 : 20_000});
      return this.inventory(def, result, qualification);
    }, assertUsable, qualification);
  }
  private inventory(def: SubscriptionEndpoint, result: {tools: Array<{name: string; inputSchema: any; outputSchema?: any}>; nextCursor?: string}, qualification = false) {
      if (result.nextCursor || result.tools.length > 200) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
      if (qualification) {
        const pending: Array<{value: unknown; depth: number}> = [{value: result.tools, depth: 0}];
        while (pending.length) {
          const {value, depth} = pending.pop()!;
          if (depth > 64) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
          if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push({value: child, depth: depth + 1});
        }
      }
      // Inventory unfamiliar tools for review, but call() still has its own fixed
      // allowlist. Added/output-schema changes invalidate the reviewed profile too.
      const inventory = result.tools.map(t => ({name: t.name, inputSchema: t.inputSchema, ...(t.outputSchema ? {outputSchema: t.outputSchema} : {})}))
        .sort((a,b) => a.name.localeCompare(b.name));
      const digest = subscriptionHash(inventory);
      const safe = inventory.filter(t => (tools[def.provider] as readonly string[]).includes(t.name));
      return {digest, tools: safe, inventory, reviewed: def.schemaDigests.includes(digest)};
  }
  /** Fixed, non-generating operator reads; each session verifies the CURRENT complete inventory. */
  async readHiggsfieldQualification(def: SubscriptionEndpoint, token: string, input: unknown, assertUsable: VideoTokenGuard, hooks: HggReadHooksV1) {
    const commands = hggReadPlanV1(input);
    const configured = this.runtime.definition('higgsfield');
    if (def.provider !== 'higgsfield' || def.resource !== configured.resource || def.issuer !== configured.issuer || typeof assertUsable !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/read'};
    return this.session(def, token, async client => {
      const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      if (observed.digest !== HGG_READ_SCHEMA_V1 || new Set(observed.inventory.map(t => t.name)).size !== observed.inventory.length) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      const results = [];
      for (const command of commands) {
        const request = hggReadRequestV1(command);
        if (!observed.inventory.some(t => t.name === request.tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
        await assertUsable(); await hooks.beforeRead(request); await assertUsable();
        scope.request = request;
        const value = this.toolValue(await client.callTool({name: request.tool, arguments: request.arguments}, undefined, {timeout: 45_000}));
        scope.request = undefined;
        await assertUsable(); await hooks.afterRead(request, value);
        results.push({readId: request.id, value: decodeHggReadV1(command, value)});
      }
      return results;
    }, assertUsable, false, scope);
  }
  /** Separate cost-only pilot profile. Normal generation allowlists and readiness stay unchanged. */
  async quoteHiggsfieldPilot(def: SubscriptionEndpoint, token: string, input: unknown, evidence: HggPilotEvidenceBytesV1,
    owner: HggPilotQuoteOwnerV1, assertUsable: VideoTokenGuard, hooks: HggPilotQuoteHooksV1) {
    const request = hggPilotQuoteRequestV1(input, evidence, owner), configured = this.runtime.definition('higgsfield');
    if (def.provider !== 'higgsfield' || def.resource !== configured.resource || def.issuer !== configured.issuer || typeof assertUsable !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'qualification/quote'};
    return this.session(def, token, async client => {
      const observed = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      if (observed.digest !== request.schemaDigest || new Set(observed.inventory.map(t => t.name)).size !== observed.inventory.length) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      if (!observed.inventory.some(t => t.name === request.tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
      await assertUsable(); await hooks.beforeQuote(request); await assertUsable();
      scope.request = request;
      const value = this.toolValue(await client.callTool({name: request.tool, arguments: request.arguments}, undefined, {timeout: 45_000}));
      scope.request = undefined;
      await assertUsable(); await hooks.afterQuote(request, value); await assertUsable();
      return decodeHggPilotQuoteV1(request, value);
    }, assertUsable, false, scope);
  }
  /** Native preparation discovers actual context/model IDs; fixed finite reads only. */
  async discoverHiggsfieldPilot(def: SubscriptionEndpoint, token: string, assertUsable: VideoTokenGuard) {
    const configured=this.runtime.definition('higgsfield');
    if(def.provider!=='higgsfield'||def.resource!==configured.resource||def.issuer!==configured.issuer)return videoErrorV1('VIDEO_ACCESS_DENIED',403);
    const scope:OperatorScope={phase:'pilot/workspace'};
    return this.session(def,token,async client=>{
      const inventory=this.inventory(def,await client.listTools({},{timeout:45000}),true);
      if(!HGG_PILOT_EVIDENCE_V1.nativeWireSchemaDigests.includes(inventory.digest)||new Set(inventory.inventory.map(t=>t.name)).size!==inventory.inventory.length)return videoErrorV1('VIDEO_SCHEMA_CHANGED',409);
      const requests=[{tool:'list_workspaces',arguments:{}},{tool:'models_explore',arguments:{action:'list',type:'image',input:'image',limit:100}},{tool:'models_explore',arguments:{action:'list',type:'video',input:'image',limit:100}}];
      const values:Record<string,unknown>[]=[];
      for(const request of requests){
        if(!inventory.inventory.some(t=>t.name===request.tool))return videoErrorV1('VIDEO_TOOL_UNAVAILABLE',409);
        await assertUsable();scope.request=request;
        const value=this.toolValue(await client.callTool({name:request.tool,arguments:request.arguments},undefined,{timeout:45000}));scope.request=undefined;await assertUsable();values.push(value);
      }
      return {workspaces:values[0],imageCatalogue:values[1],videoCatalogue:values[2]};
    },assertUsable,false,scope);
  }
  /** Closed pilot exchange: fresh private-owner context and one exact action, no SDK retries. */
  async exchangeHiggsfieldPilot(def: SubscriptionEndpoint, token: string, action: HggPilotExchangeV1, assertUsable: VideoTokenGuard, hooks: HggPilotExchangeHooksV1 = {}) {
    const wire = hggPilotWireV1(action), workspaceId = action.workspaceId, kind = action.kind;
    const configured = this.runtime.definition('higgsfield');
    if (def.provider !== 'higgsfield' || def.resource !== configured.resource || def.issuer !== configured.issuer || typeof assertUsable !== 'function') return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const scope: OperatorScope = {phase: 'pilot/workspace'};
    return this.session(def, token, async client => {
      const inventory = this.inventory(def, await client.listTools({}, {timeout: 45_000}), true);
      if (!HGG_PILOT_EVIDENCE_V1.nativeWireSchemaDigests.includes(inventory.digest) || new Set(inventory.inventory.map(t => t.name)).size !== inventory.inventory.length) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
      const call = async (request: {tool: string; arguments: object}, persistBeforeGuard = false) => {
        if (!inventory.inventory.some(t => t.name === request.tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
        await assertUsable(); scope.request = request;
        const raw = this.toolValue(await client.callTool({name: request.tool, arguments: request.arguments as Record<string, unknown>}, undefined, {timeout: 45_000}));
        scope.request = undefined;
        if (persistBeforeGuard) await hooks.afterResult?.(raw);
        await assertUsable(); return raw;
      };
      const list = {tool: 'list_workspaces', arguments: {}};
      const initial = await call(list);
      let workspace = hggPrivateWorkspaceV1(initial, workspaceId, kind !== 'select');
      if (kind === 'observe' || kind === 'select' && workspace.is_selected) return {workspace, raw: initial};
      if (kind === 'submit' || kind === 'select') {
        if (!hooks.beforeMutation) return videoErrorV1('VIDEO_PILOT_ADMISSION_REQUIRED', 409);
        await hooks.beforeMutation(); await assertUsable();
      }
      scope.phase = kind === 'submit' ? 'pilot/submit' : kind === 'poll' ? 'pilot/poll' : kind === 'quote' ? 'qualification/quote' : 'pilot/workspace';
      const mutation = kind === 'submit' || kind === 'select';
      const raw = await call(wire!, mutation);
      if (!mutation) await hooks.afterResult?.(raw);
      await assertUsable();
      if (kind === 'select') {
        if (raw.error || raw.success === false) return videoErrorV1('VIDEO_PILOT_WORKSPACE_SELECTION_UNKNOWN', 409);
        if (raw.workspace) hggPrivateWorkspaceV1({workspaces: [raw.workspace]}, workspaceId);
        workspace = hggPrivateWorkspaceV1(await call(list), workspaceId);
      }
      return {workspace, raw};
    }, assertUsable, false, scope);
  }
  async capabilities(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard) {
    const result = await this.discover(def, token, assertUsable);
    if (!result.reviewed) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
    return result;
  }
  async call(def: SubscriptionEndpoint, token: string, tool: string, args: Record<string, unknown>, assertUsable?: VideoTokenGuard) {
    if (!(tools[def.provider] as readonly string[]).includes(tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
    return this.session(def, token, async client => {
      const result = await client.callTool({name: tool, arguments: args}, undefined, {timeout: 20_000});
      return this.toolValue(result);
    }, assertUsable);
  }
  private toolValue(result: any): Record<string, any> {
      if (result.isError) return videoErrorV1('VIDEO_PROVIDER_TOOL_ERROR', 409);
      let value: any = result.structuredContent;
      if (!value) {
        const content = result.content as any[];
        if (content?.length !== 1 || content[0].type !== 'text') return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID');
        try { value = JSON.parse(content[0].text); } catch { return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID'); }
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID');
      if (value.error === 'api_key_required' || value.code === 'api_key_required') return videoErrorV1('VIDEO_SUBSCRIPTION_API_KEY_REQUIRED', 409);
      return value;
  }
}
