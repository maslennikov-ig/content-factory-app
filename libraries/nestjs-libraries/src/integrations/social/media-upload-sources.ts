import { lookup } from 'mime-types';
import * as nodeFs from 'node:fs';
// Node22 runtime API, missing from the repository's older @types/node.
const openAsBlob = (
  nodeFs as unknown as {
    openAsBlob(path: string, options: { type: string }): Promise<Blob>;
  }
).openAsBlob;
import {
  readMediaSource,
  spoolMediaSource,
} from '@contentfactory/helpers/utils/media.source';
import { getSsrfSafeDispatcher } from '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

/** Signed upload endpoints may return 204/206. Never retry an uncertain write. */
export async function mediaUploadFetch(
  url: string | URL,
  options: RequestInit
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
    dispatcher: getSsrfSafeDispatcher(),
  } as RequestInit);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error('MEDIA_UPLOAD_NOT_CONFIRMED');
  }
  return response;
}

/** Native FormData needs Blob. Keep large files disk-backed instead of arrayBuffer. */
export async function openMediaUploadBlobs(
  files: Array<{ path: string; type?: string; maxBytes?: number }>
) {
  const sources: Awaited<ReturnType<typeof spoolMediaSource>>[] = [];
  try {
    const blobs: Array<{ blob: Blob; size: number; path: string }> = [];
    for (const file of files) {
      const source = await spoolMediaSource(file.path, {maxBytes: file.maxBytes});
      sources.push(source);
      blobs.push({
        blob: await openAsBlob(source.path, {
          type:
            file.type ||
            lookup(file.path.split(/[?#]/)[0]) ||
            'application/octet-stream',
        }),
        size: source.size,
        path: file.path,
      });
    }
    return {
      files: blobs,
      close: async () => {
        await Promise.all(sources.map((source) => source.dispose()));
      },
    };
  } catch (error) {
    await Promise.all(sources.map((source) => source.dispose()));
    throw error;
  }
}

/** Open SDK-compatible streams, closing prior sources if a later source fails. */
export async function openMediaUploadStreams(paths: string[]) {
  const sources: Awaited<ReturnType<typeof readMediaSource>>[] = [];
  try {
    for (const path of paths) sources.push(await readMediaSource(path));
    return {
      sources,
      close: () => sources.forEach((source) => source.close()),
    };
  } catch (error) {
    sources.forEach((source) => source.close());
    throw error;
  }
}
