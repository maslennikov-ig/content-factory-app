import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';

/** The provider returns a one-use bearer link. Never include its value in errors or model summaries. */
export function decodeHeygenConsentLinkV1(raw: unknown, expectedGroupId: string): {groupId: string; url: string} {
  const record = z.object({}).passthrough().safeParse(raw);
  if (!record.success || record.data.error != null || record.data.data !== undefined && (record.data.url !== undefined || record.data.avatar_group !== undefined))
    return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  const payload = z.object({url: z.string().min(1).max(2048), avatar_group: z.object({id: z.string(), consent_status: z.literal('pending')}).passthrough()}).passthrough()
    .safeParse(record.data.data === undefined ? record.data : record.data.data);
  if (!payload.success || payload.data.avatar_group.id !== expectedGroupId || payload.data.error != null)
    return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  return {groupId: expectedGroupId, url: validateHeygenConsentUrlV1(payload.data.url)};
}

/** Reinterpret an encrypted, actor-owned MCP reply without sending another request. */
export function recoverHeygenConsentResponseV1(raw: unknown, expectedGroupId: string): {groupId: string; url: string} {
  const capture = z.object({kind: z.literal('mcp'), result: z.object({
    isError: z.boolean().optional(), structuredContent: z.unknown().optional(),
    content: z.array(z.object({type: z.string(), text: z.string().optional()}).passthrough()).optional(),
  }).passthrough()}).strict().safeParse(raw);
  if (!capture.success || capture.data.result.isError) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  let value = capture.data.result.structuredContent;
  if (value === undefined) {
    const content = capture.data.result.content;
    if (content?.length !== 1 || content[0].type !== 'text' || typeof content[0].text !== 'string')
      return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
    try { value = JSON.parse(content[0].text); } catch { return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409); }
  }
  return decodeHeygenConsentLinkV1(value, expectedGroupId);
}

/** Revalidate the encrypted link at the browser-only read boundary. */
export function validateHeygenConsentUrlV1(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048)
    return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  let url: URL;
  try { url = new URL(value); } catch { return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409); }
  const recording = url.hostname === 'app.heygen.com' && url.pathname === '/avatars/api-video/record' &&
    [...url.searchParams.keys()].length === 1 && url.searchParams.getAll('token').length === 1 &&
    /^[A-Za-z0-9._~-]{1,1000}$/.test(url.searchParams.get('token') ?? '');
  if (url.protocol !== 'https:' || !['heygen.com', 'www.heygen.com', 'app.heygen.com'].includes(url.hostname) ||
      url.port || url.username || url.password || url.hash || !(recording || /^\/consent\/[A-Za-z0-9._~-]{1,1000}\/?$/.test(url.pathname)))
    return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  return url.href;
}
