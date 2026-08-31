import { Injectable, Optional } from '@nestjs/common';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { Agent, request as undiciRequest } from 'undici';
import { SourceRegistryError } from './errors';
import {
  PinnedAddress,
  canonicalizeSourceUrl,
  redactSourceUrl,
  resolvePublicSourceHop,
  SourceDnsResolver,
  systemSourceDnsResolver,
} from './network-policy';

export type SourceFetchKind = 'URL' | 'RSS' | 'ROBOTS';

export type SourceFetchBudgets = {
  dnsTimeoutMs: number;
  connectTimeoutMs: number;
  headersTimeoutMs: number;
  totalTimeoutMs: number;
  redirects: number;
  headerBytes: number;
  compressedBytes: number;
  decompressedBytes: number;
  decompressionRatio: number;
};

export const DEFAULT_SOURCE_FETCH_BUDGETS: Readonly<SourceFetchBudgets> = {
  dnsTimeoutMs: 2_000,
  connectTimeoutMs: 3_000,
  headersTimeoutMs: 8_000,
  totalTimeoutMs: 20_000,
  redirects: 5,
  headerBytes: 32 * 1024,
  compressedBytes: 2 * 1024 * 1024,
  decompressedBytes: 8 * 1024 * 1024,
  decompressionRatio: 20,
};

export type SourceTransportRequest = {
  url: string;
  hostname: string;
  pinnedAddresses: PinnedAddress[];
  redirect: 'manual';
  headers: Record<string, string>;
  connectTimeoutMs: number;
  headersTimeoutMs: number;
  bodyTimeoutMs: number;
  signal: AbortSignal;
};

export type SourceTransportResponse = {
  status: number;
  headers: Map<string, string> | Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  dispose?: () => Promise<void> | void;
};

export interface SourceTransport {
  request(input: SourceTransportRequest): Promise<SourceTransportResponse>;
}

export type SourceFetchResult = {
  status: 200 | 304;
  requestedUrl: string;
  finalUrl: string;
  redirectChain: string[];
  contentType: string | null;
  charset: string | null;
  contentEncoding: string | null;
  compressedBytes: number;
  decompressedBytes: number;
  body: Buffer;
  headers: {
    etag?: string;
    lastModified?: string;
    cacheControl?: string;
    expires?: string;
  };
};

function callbackResult(
  callback: (...args: any[]) => void,
  addresses: PinnedAddress[],
  all: boolean
) {
  if (all) return callback(null, addresses, 0);
  const first = addresses[0];
  return callback(null, first.address, first.family);
}

@Injectable()
export class UndiciSourceTransport implements SourceTransport {
  constructor(private readonly options: { ca?: string | Buffer } = {}) {}

  async request(
    input: SourceTransportRequest
  ): Promise<SourceTransportResponse> {
    const agent = new Agent({
      connect: {
        timeout: input.connectTimeoutMs,
        servername: input.hostname,
        ca: this.options.ca,
        lookup: (hostname, options, callback) => {
          if (hostname !== input.hostname) {
            callback(new Error('Pinned hostname mismatch'), '', 0);
            return;
          }
          callbackResult(
            callback,
            input.pinnedAddresses,
            Boolean((options as any)?.all)
          );
        },
      },
    });
    try {
      const result = await undiciRequest(input.url, {
        method: 'GET',
        dispatcher: agent,
        headers: input.headers,
        headersTimeout: input.headersTimeoutMs,
        bodyTimeout: input.bodyTimeoutMs,
        signal: input.signal,
      });
      return {
        status: result.statusCode,
        headers: result.headers,
        body: result.body,
        dispose: async () => {
          try {
            result.body.destroy();
          } finally {
            await agent.close();
          }
        },
      };
    } catch (error) {
      await agent.close();
      throw error;
    }
  }
}

function headerEntries(
  headers: SourceTransportResponse['headers']
): Array<[string, string]> {
  if (headers instanceof Map) return [...headers.entries()];
  return Object.entries(headers).flatMap(([name, raw]) => {
    if (raw === undefined) return [];
    return [[name.toLowerCase(), Array.isArray(raw) ? raw.join(', ') : raw]];
  });
}

function headersMap(
  headers: SourceTransportResponse['headers']
): Map<string, string> {
  return new Map(
    headerEntries(headers).map(([name, value]) => [name.toLowerCase(), value])
  );
}

function parseContentType(value: string | undefined): {
  mime: string;
  charset: string | null;
} {
  const parts = (value || '').split(';').map((part) => part.trim());
  const charsetPart = parts
    .slice(1)
    .find((part) => part.toLowerCase().startsWith('charset='));
  return {
    mime: parts[0].toLowerCase(),
    charset: charsetPart
      ? charsetPart.slice('charset='.length).replace(/^['"]|['"]$/gu, '')
      : null,
  };
}

function allowedMime(kind: SourceFetchKind, mime: string): boolean {
  if (kind === 'URL')
    return ['text/html', 'application/xhtml+xml'].includes(mime);
  if (kind === 'ROBOTS') return mime === 'text/plain';
  return [
    'application/rss+xml',
    'application/atom+xml',
    'application/xml',
    'text/xml',
  ].includes(mime);
}

function decodeBody(
  raw: Buffer,
  encoding: string | undefined,
  budgets: SourceFetchBudgets
): Buffer {
  const normalized = (encoding || '').trim().toLowerCase();
  if (normalized.includes(',')) {
    throw new SourceRegistryError(
      'DECOMPRESSION_LIMIT',
      'Chained content encoding is not supported',
      415
    );
  }
  if (normalized && !['gzip', 'br', 'deflate'].includes(normalized)) {
    throw new SourceRegistryError(
      'DECOMPRESSION_LIMIT',
      'Content encoding is not supported',
      415
    );
  }
  try {
    const options = { maxOutputLength: budgets.decompressedBytes + 1 };
    const decoded =
      normalized === 'gzip'
        ? gunzipSync(raw, options)
        : normalized === 'br'
        ? brotliDecompressSync(raw, options)
        : normalized === 'deflate'
        ? inflateSync(raw, options)
        : raw;
    if (
      decoded.length > budgets.decompressedBytes ||
      (raw.length > 0 &&
        decoded.length / raw.length > budgets.decompressionRatio)
    ) {
      throw new SourceRegistryError(
        'DECOMPRESSION_LIMIT',
        'Decoded source exceeds limits',
        413
      );
    }
    return decoded;
  } catch (error) {
    if (error instanceof SourceRegistryError) throw error;
    throw new SourceRegistryError(
      'DECOMPRESSION_LIMIT',
      'Source decompression failed or exceeded limits',
      413
    );
  }
}

async function withDeadline<T>(
  promise: Promise<T>,
  milliseconds: number,
  controller: AbortController
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(
        new SourceRegistryError('TIMEOUT', 'Source request timed out', 504)
      );
    }, milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

@Injectable()
export class SourceFetchGateway {
  private readonly resolver: SourceDnsResolver;
  private readonly transport: SourceTransport;
  private readonly budgets: SourceFetchBudgets;

  constructor(
    @Optional()
    options: {
      resolver?: SourceDnsResolver;
      transport?: SourceTransport;
      budgets?: Partial<SourceFetchBudgets>;
    } = {}
  ) {
    this.resolver = options.resolver || systemSourceDnsResolver;
    this.transport = options.transport || new UndiciSourceTransport();
    this.budgets = { ...DEFAULT_SOURCE_FETCH_BUDGETS, ...options.budgets };
  }

  async fetch(
    inputUrl: string,
    kind: SourceFetchKind,
    validators: { etag?: string; lastModified?: string } = {},
    beforeHop: (url: string) => void = () => undefined
  ): Promise<SourceFetchResult> {
    const requestedUrl = canonicalizeSourceUrl(inputUrl);
    let currentUrl = requestedUrl;
    const visited = new Set<string>();
    const redirectChain: string[] = [];
    const originalOrigin = new URL(requestedUrl).origin;

    for (let hop = 0; hop <= this.budgets.redirects; hop += 1) {
      beforeHop(currentUrl);
      const resolved = await resolvePublicSourceHop(
        currentUrl,
        this.resolver,
        this.budgets.dnsTimeoutMs
      );
      if (visited.has(resolved.url)) {
        throw new SourceRegistryError(
          'REDIRECT_UNSAFE',
          'Redirect cycle blocked',
          422
        );
      }
      visited.add(resolved.url);
      redirectChain.push(redactSourceUrl(resolved.url));
      const controller = new AbortController();
      const sameOrigin = new URL(resolved.url).origin === originalOrigin;
      const sentValidator =
        sameOrigin && Boolean(validators.etag || validators.lastModified);
      const headers: Record<string, string> = {
        accept:
          kind === 'URL'
            ? 'text/html, application/xhtml+xml'
            : kind === 'ROBOTS'
            ? 'text/plain'
            : 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'accept-encoding': 'gzip, br, deflate',
        'user-agent': 'ContentFactorySourceRegistry/1.0',
      };
      if (sameOrigin && validators.etag)
        headers['if-none-match'] = validators.etag;
      if (sameOrigin && validators.lastModified) {
        headers['if-modified-since'] = validators.lastModified;
      }

      let response: SourceTransportResponse;
      try {
        response = await withDeadline(
          this.transport.request({
            url: resolved.url,
            hostname: resolved.hostname,
            pinnedAddresses: resolved.addresses,
            redirect: 'manual',
            headers,
            connectTimeoutMs: this.budgets.connectTimeoutMs,
            headersTimeoutMs: this.budgets.headersTimeoutMs,
            bodyTimeoutMs: this.budgets.totalTimeoutMs,
            signal: controller.signal,
          }),
          this.budgets.totalTimeoutMs,
          controller
        );
      } catch (error) {
        if (error instanceof SourceRegistryError) throw error;
        throw new SourceRegistryError('TIMEOUT', 'Source request failed', 502);
      }

      const normalizedHeaders = headersMap(response.headers);
      const headerBytes = headerEntries(response.headers).reduce(
        (sum, [name, value]) =>
          sum + Buffer.byteLength(name) + Buffer.byteLength(value) + 4,
        0
      );
      if (headerBytes > this.budgets.headerBytes) {
        await response.dispose?.();
        throw new SourceRegistryError(
          'RESPONSE_TOO_LARGE',
          'Source response headers exceed limits',
          413
        );
      }

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.status !== 304
      ) {
        await response.dispose?.();
        if (hop === this.budgets.redirects) {
          throw new SourceRegistryError(
            'REDIRECT_UNSAFE',
            'Redirect limit reached',
            422
          );
        }
        const location = normalizedHeaders.get('location');
        if (!location) {
          throw new SourceRegistryError(
            'REDIRECT_UNSAFE',
            'Redirect has no location',
            422
          );
        }
        try {
          currentUrl = new URL(location, resolved.url).toString();
        } catch {
          throw new SourceRegistryError(
            'REDIRECT_UNSAFE',
            'Redirect URL is invalid',
            422
          );
        }
        continue;
      }

      if (response.status === 429) {
        await response.dispose?.();
        throw new SourceRegistryError(
          'RATE_LIMITED',
          'Source rate limited the request',
          429
        );
      }
      if (response.status >= 400 && response.status < 500) {
        await response.dispose?.();
        throw new SourceRegistryError(
          'REMOTE_4XX',
          'Source rejected the request',
          502
        );
      }
      if (response.status >= 500) {
        await response.dispose?.();
        throw new SourceRegistryError(
          'REMOTE_5XX',
          'Source failed the request',
          502
        );
      }

      if (response.status === 304) {
        await response.dispose?.();
        if (!sentValidator) {
          throw new SourceRegistryError(
            'REDIRECT_UNSAFE',
            'Unsolicited not-modified response was rejected',
            422
          );
        }
        return {
          status: 304,
          requestedUrl,
          finalUrl: resolved.url,
          redirectChain,
          contentType: null,
          charset: null,
          contentEncoding: null,
          compressedBytes: 0,
          decompressedBytes: 0,
          body: Buffer.alloc(0),
          headers: {
            etag: normalizedHeaders.get('etag'),
            lastModified: normalizedHeaders.get('last-modified'),
            cacheControl: normalizedHeaders.get('cache-control'),
            expires: normalizedHeaders.get('expires'),
          },
        };
      }

      if (response.status !== 200) {
        await response.dispose?.();
        throw new SourceRegistryError(
          'REMOTE_4XX',
          'Unexpected source status',
          502
        );
      }
      const { mime, charset } = parseContentType(
        normalizedHeaders.get('content-type')
      );
      if (!allowedMime(kind, mime)) {
        await response.dispose?.();
        throw new SourceRegistryError(
          'UNSUPPORTED_CONTENT_TYPE',
          'Source content type is not supported',
          415
        );
      }
      const declaredLength = Number(normalizedHeaders.get('content-length'));
      const compressedBudget =
        kind === 'ROBOTS'
          ? Math.min(this.budgets.compressedBytes, 512 * 1024)
          : this.budgets.compressedBytes;
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > compressedBudget
      ) {
        await response.dispose?.();
        throw new SourceRegistryError(
          'RESPONSE_TOO_LARGE',
          'Source response exceeds limits',
          413
        );
      }

      const chunks: Buffer[] = [];
      let compressedBytes = 0;
      try {
        await withDeadline(
          (async () => {
            for await (const rawChunk of response.body) {
              const chunk = Buffer.from(rawChunk);
              compressedBytes += chunk.length;
              if (compressedBytes > compressedBudget) {
                throw new SourceRegistryError(
                  'RESPONSE_TOO_LARGE',
                  'Source response exceeds limits',
                  413
                );
              }
              chunks.push(chunk);
            }
          })(),
          this.budgets.totalTimeoutMs,
          controller
        );
      } finally {
        await response.dispose?.();
      }
      const contentEncoding = normalizedHeaders.get('content-encoding');
      const body = decodeBody(
        Buffer.concat(chunks),
        contentEncoding,
        this.budgets
      );
      return {
        status: 200,
        requestedUrl,
        finalUrl: resolved.url,
        redirectChain,
        contentType: mime,
        charset,
        contentEncoding: contentEncoding || null,
        compressedBytes,
        decompressedBytes: body.length,
        body,
        headers: {
          etag: normalizedHeaders.get('etag'),
          lastModified: normalizedHeaders.get('last-modified'),
          cacheControl: normalizedHeaders.get('cache-control'),
          expires: normalizedHeaders.get('expires'),
        },
      };
    }
    throw new SourceRegistryError(
      'REDIRECT_UNSAFE',
      'Redirect limit reached',
      422
    );
  }
}
