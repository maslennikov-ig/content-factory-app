import { createHash } from 'node:crypto';
import { HttpException, Injectable } from '@nestjs/common';
import { isSafePublicHttpsUrl } from '../../dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { videoErrorV1 } from '../video-brief.v1';

export type SubscriptionProvider = 'higgsfield' | 'heygen';
export type PersonalVideoOperation = 'presenter' | 'generated_clip' | 'narration' | 'captions' | 'final_composition';
export const personalVideoOperations: PersonalVideoOperation[] = ['presenter', 'generated_clip', 'narration', 'captions', 'final_composition'];
export type VideoQualificationPhase = 'initialize' | 'notifications/initialized' | 'tools/list' | 'close' | 'qualification/read' | 'qualification/quote' | 'pilot/workspace' | 'pilot/submit' | 'pilot/poll' | 'consent/issue';
/** Internal operator-only policy. Neither a request field nor provider configuration. */
export interface VideoQualificationResponsePolicy {phase: VideoQualificationPhase; signal: AbortSignal; read?: true}
const QUALIFICATION_BYTES = 8 * 1024 * 1024;
export class VideoQualificationResponseError extends HttpException {
  constructor(code: 'VIDEO_RESPONSE_TOO_LARGE' | 'VIDEO_RESPONSE_TIMEOUT', phase: VideoQualificationPhase, observedBytes: number, read = false) {
    super({code, qualification: {phase, maximumBytes: read ? 1024 * 1024 : QUALIFICATION_BYTES, observedBytes}}, 409);
  }
}
export interface SubscriptionEndpoint {
  provider: SubscriptionProvider; resource: string; issuer: string;
  /** Explicit MCP HTTP URL when routing differs from the canonical OAuth resource. No redirect following. */
  transportEndpoint?: string;
  resourceMetadata: string; origins: string[]; enabled: boolean;
  /** First-party OAuth discovery is independent of reviewed paid tool schemas. */
  connectEnabled?: boolean;
  ownedAssetProfile?: 'scoped_owned_v1';
  /** Fixed authenticated private catalog reads, independent of wallet/priced rendering. */
  ownedAssetReadProfile?: 'heygen_private_catalog_v1';
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
      origins: ['https://mcp.higgsfield.ai', 'https://clerk.higgsfield.ai'], connectEnabled: true, enabled: false, schemaDigests: []};
    // The advertised protected resource is canonical without a trailing slash.
    if (provider === 'heygen') return {provider, resource: 'https://mcp.heygen.com/mcp/v1', transportEndpoint: 'https://mcp.heygen.com/mcp/v1/', issuer: 'https://api2.heygen.com',
      resourceMetadata: 'https://mcp.heygen.com/.well-known/oauth-protected-resource/mcp/v1',
      origins: ['https://mcp.heygen.com', 'https://api2.heygen.com'], connectEnabled: true, enabled: false,
      ownedAssetReadProfile: 'heygen_private_catalog_v1', schemaDigests: []};
    return videoErrorV1('VIDEO_PROVIDER_INVALID');
  }
  now() { return new Date(); }
  async validateUrl(def: SubscriptionEndpoint, value: string) {
    let url: URL;
    try { url = new URL(value); } catch { return videoErrorV1('VIDEO_ENDPOINT_UNSAFE'); }
    if (url.username || url.password || url.hash || !def.origins.includes(url.origin) || !(await isSafePublicHttpsUrl(url.href))) return videoErrorV1('VIDEO_ENDPOINT_UNSAFE');
  }
  async fetch(def: SubscriptionEndpoint, value: string | URL, init: RequestInit = {}, qualification?: VideoQualificationResponsePolicy): Promise<Response> {
    await this.validateUrl(def, String(value));
    const deadline = AbortSignal.timeout(20_000);
    const signal = qualification ? AbortSignal.any([deadline, qualification.signal]) : deadline;
    try {
      const response = await fetch(value, {...init, redirect: 'manual', signal, dispatcher: ssrfSafeDispatcher} as RequestInit);
      return await boundedSubscriptionResponse(response, qualification ? {...qualification, signal} : undefined);
    } catch (error) {
      if (qualification && signal.aborted && !(error instanceof VideoQualificationResponseError)) throw new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', qualification.phase, 0, qualification.read);
      throw error;
    }
  }
}

/** Buffer under a hard deadline/size cap before the SDK parses JSON or SSE. */
export async function boundedSubscriptionResponse(response: Response, qualification?: VideoQualificationResponsePolicy): Promise<Response> {
  if (response.status >= 300 && response.status < 400) {
    if (qualification) void response.body?.cancel().catch(() => {}); else await response.body?.cancel();
    return videoErrorV1('VIDEO_ENDPOINT_REDIRECT_REFUSED');
  }
  if (!response.body) return response;
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const maximumBytes = qualification && !qualification.read ? QUALIFICATION_BYTES : 1024 * 1024;
  let onAbort: (() => void) | undefined;
  const deadline = qualification && new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', qualification.phase, size, qualification.read));
      void reader.cancel().catch(() => {});
    };
    qualification.signal.addEventListener('abort', onAbort, {once: true});
    if (qualification.signal.aborted) onAbort();
  });
  try {
    while (true) {
      const next = await (deadline ? Promise.race([reader.read(), deadline]) : reader.read());
      if (qualification?.signal.aborted) throw new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', qualification.phase, size, qualification.read);
      if (next.done) break;
      size += next.value.length;
      if (size > maximumBytes) {
        if (qualification) {void reader.cancel().catch(() => {}); throw new VideoQualificationResponseError('VIDEO_RESPONSE_TOO_LARGE', qualification.phase, size, qualification.read);}
        await reader.cancel(); return videoErrorV1('VIDEO_RESPONSE_TOO_LARGE');
      }
      chunks.push(next.value);
    }
  } finally { if (onAbort) qualification!.signal.removeEventListener('abort', onAbort); reader.releaseLock(); }
  if (qualification?.signal.aborted) throw new VideoQualificationResponseError('VIDEO_RESPONSE_TIMEOUT', qualification.phase, size, qualification.read);
  return new Response(Buffer.concat(chunks), {status: response.status, headers: response.headers});
}
