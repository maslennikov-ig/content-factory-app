import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isSafePublicHttpsUrl } from '../../dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { videoErrorV1 } from '../video-brief.v1';

export type SubscriptionProvider = 'higgsfield' | 'heygen';
export interface SubscriptionEndpoint {
  provider: SubscriptionProvider; resource: string; issuer: string;
  resourceMetadata: string; origins: string[]; enabled: boolean;
  /** Only a reviewed, authenticated account endpoint can establish wallet identity. */
  identityEndpoint?: string;
  schemaDigests: string[];
}
export const subscriptionHash = (value: unknown): string => {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
};

/** No environment flag can enable loopback transport or invent an approved live schema. */
@Injectable()
export class VideoSubscriptionRuntime {
  definition(provider: SubscriptionProvider): SubscriptionEndpoint {
    if (provider === 'higgsfield') return {provider, resource: 'https://mcp.higgsfield.ai/mcp', issuer: 'https://clerk.higgsfield.ai',
      resourceMetadata: 'https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp',
      origins: ['https://mcp.higgsfield.ai', 'https://clerk.higgsfield.ai'], enabled: false, schemaDigests: []};
    if (provider === 'heygen') return {provider, resource: 'https://mcp.heygen.com/mcp/v1/', issuer: 'https://api2.heygen.com',
      resourceMetadata: 'https://mcp.heygen.com/.well-known/oauth-protected-resource/mcp/v1/',
      origins: ['https://mcp.heygen.com', 'https://api2.heygen.com'], enabled: false, schemaDigests: []};
    return videoErrorV1('VIDEO_PROVIDER_INVALID');
  }
  now() { return new Date(); }
  async validateUrl(def: SubscriptionEndpoint, value: string) {
    let url: URL;
    try { url = new URL(value); } catch { return videoErrorV1('VIDEO_ENDPOINT_UNSAFE'); }
    if (url.username || url.password || url.hash || !def.origins.includes(url.origin) || !(await isSafePublicHttpsUrl(url.href))) return videoErrorV1('VIDEO_ENDPOINT_UNSAFE');
  }
  async fetch(def: SubscriptionEndpoint, value: string | URL, init: RequestInit = {}): Promise<Response> {
    await this.validateUrl(def, String(value));
    return boundedSubscriptionResponse(await fetch(value, {...init, redirect: 'manual', signal: AbortSignal.timeout(20_000), dispatcher: ssrfSafeDispatcher} as RequestInit));
  }
}

/** Buffer under a hard deadline/size cap before the SDK parses JSON or SSE. */
export async function boundedSubscriptionResponse(response: Response): Promise<Response> {
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return videoErrorV1('VIDEO_ENDPOINT_REDIRECT_REFUSED'); }
  if (!response.body) return response;
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > 1024 * 1024) { await reader.cancel(); return videoErrorV1('VIDEO_RESPONSE_TOO_LARGE'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), {status: response.status, headers: response.headers});
}
