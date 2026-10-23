import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { VideoSubscriptionRuntime, SubscriptionEndpoint, subscriptionHash } from './video-provider-registry';
import { videoErrorV1 } from '../video-brief.v1';

const tools = {higgsfield: ['generate_clip', 'jobs_wait'], heygen: ['create_video', 'get_video', 'quote_video', 'list_avatars', 'list_voices']} as const;
export type VideoTokenGuard = () => Promise<void>;

@Injectable()
export class VideoMcpClient {
  constructor(private readonly runtime: VideoSubscriptionRuntime) {}
  private async session<T>(def: SubscriptionEndpoint, token: string, run: (client: Client) => Promise<T>, assertUsable?: VideoTokenGuard): Promise<T> {
    const client = new Client({name: 'Content Factory', version: '1.0.0'}, {capabilities: {}});
    const transport = new StreamableHTTPClientTransport(new URL(def.resource), {
      // No authProvider: SDK cannot refresh/replay a billable mutation after 401.
      requestInit: {headers: {Authorization: `Bearer ${token}`}},
      reconnectionOptions: {maxRetries: 0, initialReconnectionDelay: 0, maxReconnectionDelay: 0, reconnectionDelayGrowFactor: 1},
      // A session can send several requests. Fence each new send, including
      // initialization and tool discovery, after any previous request finishes.
      fetch: async (url, init) => { await assertUsable?.(); return this.runtime.fetch(def, String(url), init); },
    });
    try { await client.connect(transport, {timeout: 20_000}); return await run(client); }
    catch (error: any) {
      const code = error?.getResponse?.()?.code;
      // The SDK may include remote text in an exception. Do not pass it to HTTP, tracing or chat.
      return videoErrorV1(typeof code === 'string' && /^VIDEO_[A-Z0-9_]{1,70}$/.test(code) ? code : 'VIDEO_MCP_UNAVAILABLE', 409);
    }
    finally { await client.close().catch(() => {}); }
  }
  async capabilities(def: SubscriptionEndpoint, token: string, assertUsable?: VideoTokenGuard) {
    return this.session(def, token, async client => {
      const result = await client.listTools({}, {timeout: 20_000});
      if (result.nextCursor) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
      const safe = result.tools.filter(t => (tools[def.provider] as readonly string[]).includes(t.name))
        .map(t => ({name: t.name, inputSchema: t.inputSchema})).sort((a,b) => a.name.localeCompare(b.name));
      const digest = subscriptionHash(safe);
      if (!def.schemaDigests.includes(digest)) return videoErrorV1('VIDEO_SCHEMA_UNSUPPORTED', 409);
      return {digest, tools: safe};
    }, assertUsable);
  }
  async call(def: SubscriptionEndpoint, token: string, tool: string, args: Record<string, unknown>, assertUsable?: VideoTokenGuard) {
    if (!(tools[def.provider] as readonly string[]).includes(tool)) return videoErrorV1('VIDEO_TOOL_UNAVAILABLE', 409);
    return this.session(def, token, async client => {
      const result = await client.callTool({name: tool, arguments: args}, undefined, {timeout: 20_000});
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
    }, assertUsable);
  }
}
