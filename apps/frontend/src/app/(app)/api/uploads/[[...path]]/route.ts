import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { readMediaSource, safeMediaObjectKey, UnsatisfiableLocalMediaRange } from '@contentfactory/helpers/utils/media.source';
// @ts-ignore
import mime from 'mime';
const serveUpload = async (
  request: NextRequest,
  context: {
    params: Promise<{
      path?: string[];
    }>;
  }
) => {
  const { path } = await context.params;
  const head = request.method === 'HEAD';
  const requestedRange = head ? null : request.headers.get('range');
  const range = requestedRange && requestedRange.length <= 80 && requestedRange !== 'bytes=-' &&
    /^bytes=\d*-\d*$/.test(requestedRange) ? requestedRange : undefined;
  let media: Awaited<ReturnType<typeof readMediaSource>> | undefined;
  try {
    // The shared reader pins every directory descriptor and refuses file or
    // directory symlinks. A lexical path-prefix check cannot provide that.
    const source = (path ?? []).join('/');
    safeMediaObjectKey(source);
    // This route serves local object keys only. Keep URL-looking keys out of
    // the reader's remote-fetch branch and preserve literal nested directories.
    media = await readMediaSource(`./${source}`, {
      signal: request.signal,
      range,
      localIfRange: request.headers.get('if-range') || undefined,
      localMetadataOnly: head,
    });
    const headers: Record<string, string> = {
      'Content-Type': mime.getType(source) || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      // Stable public upload URLs remain cacheable for provider downloads.
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    if (media.size !== undefined) headers['Content-Length'] = String(media.size);
    if (media.modifiedAt) headers['Last-Modified'] = media.modifiedAt.toUTCString();
    if (media.contentRange) headers['Content-Range'] = media.contentRange;
    const status = media.status || 200;
    if (head) {
      media.close();
      return new Response(null, { status, headers });
    }
    // Web-body cancellation destroys this stream; normal completion/error
    // closes it too. Each path releases the pinned source and deadline.
    media.stream.once('close', media.close);
    const webStream = Readable.toWeb(media.stream) as ReadableStream<Uint8Array>;
    return new Response(webStream, { status, headers });
  } catch (error) {
    media?.close();
    if (error instanceof UnsatisfiableLocalMediaRange) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${error.size}` },
      });
    }
    return new NextResponse(head ? null : 'Not found', { status: 404 });
  }
};

export const GET = serveUpload;
export const HEAD = serveUpload;
