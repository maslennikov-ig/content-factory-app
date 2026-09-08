import type { Request, Response } from 'express';
import compression from 'compression';

export function streamCompressionFilter(request: Request, response: Response): boolean {
  const type = String(response.getHeader('Content-Type') ?? '').split(';')[0].trim();
  if (type === 'application/x-ndjson' || type === 'text/event-stream') return false;
  return compression.filter(request, response);
}

/** Version 2 transport event; existing domain event contracts remain unchanged. */
export type StreamHeartbeatV2 = { name: 'heartbeat' };
export const STREAM_HEARTBEAT_MS = 10_000;

/** Small progress records must cross both compression and proxy buffers immediately. */
export function startNdjsonStream(response: Response): () => void {
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
  const timer = setInterval(() => {
    if (!response.destroyed && !response.writableEnded) {
      const heartbeat: StreamHeartbeatV2 = { name: 'heartbeat' };
      response.write(JSON.stringify(heartbeat) + '\n');
    }
  }, STREAM_HEARTBEAT_MS);
  const stop = () => {
    clearInterval(timer);
    response.off('close', stop);
  };
  response.once('close', stop);
  return stop;
}
