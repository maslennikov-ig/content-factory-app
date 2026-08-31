import { createHmac, randomBytes } from 'node:crypto';

const TRANSIENT_TRACKER_BUCKET_MS = 60_000;
const processTrackerKey = randomBytes(32);

export interface TransientClientRequest {
  headers?: Record<string, unknown>;
  ip?: unknown;
  socket?: { remoteAddress?: unknown };
}

function firstHeader(value: unknown): string | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== 'string') return undefined;
  return header.split(',', 1)[0]?.trim() || undefined;
}

function normalizeConnectionAddress(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';

  let address = value.trim().toLowerCase();
  if (address.startsWith('[')) {
    const bracket = address.indexOf(']');
    address = address.slice(1, bracket > -1 ? bracket : undefined);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(address)) {
    address = address.slice(0, address.lastIndexOf(':'));
  }

  address = address.split('%', 1)[0];
  if (
    address.startsWith('::ffff:') &&
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address.slice(7))
  ) {
    address = address.slice(7);
  }

  return address || 'unknown';
}

/**
 * Produces a short-lived caller identifier without returning or retaining any
 * raw request metadata.
 *
 * The forwarded chain is read before `X-Real-IP` because Caddy is not the last
 * hop. Caddy replaces both headers with the peer it sees, then proxies to the
 * in-container nginx, whose `location /api/` used to overwrite `X-Real-IP` with
 * its own peer — Caddy — leaving every caller with the same value and one
 * shared budget for the whole instance. nginx only *appends* to
 * `X-Forwarded-For`, so the real client survives as the first element.
 *
 * nginx now forwards the ingress-supplied `X-Real-IP` as well, and the order
 * here keeps the result correct either way: whichever of the two headers the
 * ingress actually filled, the first forwarded element and `X-Real-IP` carry
 * the same address. Neither header is trustworthy on its own — both are
 * unconditionally rewritten at the ingress, so a client-supplied value never
 * reaches this code.
 */
export function createTransientClientTracker(
  request: TransientClientRequest,
  at = Date.now()
): string {
  const connectionAddress =
    firstHeader(request.headers?.['x-forwarded-for']) ||
    firstHeader(request.headers?.['x-real-ip']) ||
    firstHeader(request.ip) ||
    firstHeader(request.socket?.remoteAddress);
  const normalizedAddress = normalizeConnectionAddress(connectionAddress);
  const bucket = Math.floor(at / TRANSIENT_TRACKER_BUCKET_MS);

  return createHmac('sha256', processTrackerKey)
    .update(`${bucket}\0${normalizedAddress}`)
    .digest('hex');
}
