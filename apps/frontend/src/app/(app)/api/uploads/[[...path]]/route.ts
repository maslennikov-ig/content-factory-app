import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { resolve, sep } from 'path';
import { Readable } from 'node:stream';
// @ts-ignore
import mime from 'mime';
export const GET = async (
  request: NextRequest,
  context: {
    params: Promise<{
      path?: string[];
    }>;
  }
) => {
  const { path } = await context.params;
  const base = resolve(process.env.UPLOAD_DIRECTORY!);
  const filePath = resolve(base, (path ?? []).join('/'));
  // Confine reads to UPLOAD_DIRECTORY. resolve() collapses any `..` segments
  // (including URL-decoded ones), so this blocks every path-traversal variant.
  if (filePath !== base && !filePath.startsWith(base + sep)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const fileStats = statSync(filePath);
  const contentType = mime.getType(filePath) || 'application/octet-stream';
  const response = createReadStream(filePath);
  // Node's stream/web typings differ from the DOM body declaration.
  const webStream = Readable.toWeb(response) as ReadableStream<Uint8Array>;
  return new Response(webStream, {
    headers: {
      'Content-Type': contentType,
      // Set the appropriate content-type header
      'Content-Length': fileStats.size.toString(),
      // Set the content-length header
      'Last-Modified': fileStats.mtime.toUTCString(),
      // Set the last-modified header
      'Cache-Control': 'public, max-age=31536000, immutable', // Example cache-control header
    },
  });
};
