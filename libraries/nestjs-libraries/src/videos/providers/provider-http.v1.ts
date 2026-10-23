import { VideoCredentialV1, VideoProviderErrorV1 } from '../video-provider.v1';

export const PROVIDER_TIMEOUT_MS_V1 = 30_000;

export function credentialV1(value: VideoCredentialV1, provider: string): void {
  if (value?.provider !== provider || typeof value.apiKey !== 'string' || !value.apiKey.trim() || /[\r\n]/.test(value.apiKey)) {
    throw new VideoProviderErrorV1('video_credential_required');
  }
}

export function localeV1(value: string): string {
  try {
    if (typeof value !== 'string' || value.length > 80) throw new Error();
    return Intl.getCanonicalLocales(value)[0] || failV1('video_invalid_locale');
  } catch { throw new VideoProviderErrorV1('video_invalid_locale'); }
}

export function failV1(code: string): never { throw new VideoProviderErrorV1(code); }

export function httpsV1(value: unknown): string {
  try {
    const u = new URL(String(value));
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || (u.port && u.port !== '443')) throw new Error();
    return u.href;
  } catch { return failV1('video_invalid_url'); }
}

export function handleV1(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) return failV1('video_invalid_receipt');
  return value;
}

export function exactUrlV1(value: unknown, expected: string): string {
  if (httpsV1(value) !== expected) return failV1('video_invalid_receipt');
  return expected;
}

export function deepFreezeV1<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreezeV1(child);
    Object.freeze(value);
  }
  return value;
}

/** A single network operation. The durable job owns every retry and its budget. */
export async function requestV1(
  url: string,
  headers: Record<string, string>,
  method = 'GET',
  body?: Record<string, unknown>,
  submit: 'higgsfield' | 'heygen' | false = false,
  empty = false
): Promise<any> {
  try {
    const response = await fetch(url, {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS_V1),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const transient = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      const uncertain = Boolean(submit) && (response.status >= 500 || response.status === 408 || response.status === 409);
      throw new VideoProviderErrorV1(`video_provider_http_${response.status}`, uncertain,
        transient && (!submit || submit === 'higgsfield'));
    }
    if (empty) return undefined;
    const result = await response.json();
    if (!result || typeof result !== 'object') throw new Error();
    return result;
  } catch (error) {
    if (error instanceof VideoProviderErrorV1) throw error;
    throw new VideoProviderErrorV1('video_provider_transport', Boolean(submit), !submit || submit === 'higgsfield');
  }
}

export function onlyKeysV1(body: Record<string, unknown>, keys: string[]): void {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k))) failV1('video_invalid_payload');
}

export function finiteNumberV1(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
