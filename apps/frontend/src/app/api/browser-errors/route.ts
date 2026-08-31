import * as Sentry from '@sentry/nextjs';
import { normalizeErrorCollectionDsn } from '@contentfactory/helpers/errors/create.error.collection.options';
import {
  BROWSER_ERROR_RELAY_FORWARD_TIMEOUT_MS,
  BrowserErrorRelayLimiter,
  handleBrowserErrorRelayRequest,
} from '@contentfactory/helpers/errors/browser.error.relay';
import {
  BROWSER_ERROR_RELAY_CLIENT_WINDOW_MS,
  BROWSER_ERROR_RELAY_MAX_CLIENTS,
  BrowserErrorRelayClientKeyring,
} from '@contentfactory/helpers/errors/browser.error.relay.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per-document keys are HMAC-derived with a rotating process-local salt. Only
// opaque digests live for one bounded window; Nginx separately rate-limits the
// same strict document nonce in its bounded shared-memory zone.
const limiter = new BrowserErrorRelayLimiter({
  limit: 300,
  windowMs: BROWSER_ERROR_RELAY_CLIENT_WINDOW_MS,
  maxClients: BROWSER_ERROR_RELAY_MAX_CLIENTS,
});
const clientKeys = new BrowserErrorRelayClientKeyring({
  windowMs: BROWSER_ERROR_RELAY_CLIENT_WINDOW_MS,
});

export const POST = async (request: Request) => {
  const dsn = normalizeErrorCollectionDsn(
    process.env.CONTENT_FACTORY_ERROR_DSN,
    process.env.CONTENT_FACTORY_ERROR_ORIGIN
  );
  if (!dsn) return new Response(null, { status: 204 });

  return handleBrowserErrorRelayRequest(request, {
    expectedOrigin: process.env.FRONTEND_URL || '',
    context: {
      service: 'frontend',
      environment: process.env.NODE_ENV,
      release: process.env.CONTENT_FACTORY_RELEASE,
    },
    limiter,
    clientKey: (incoming, now) =>
      clientKeys.derive(incoming.headers.get('content-type'), now),
    forwardTimeoutMs: BROWSER_ERROR_RELAY_FORWARD_TIMEOUT_MS,
    forward: async (event) => {
      Sentry.captureEvent(event);
      return Sentry.flush(BROWSER_ERROR_RELAY_FORWARD_TIMEOUT_MS);
    },
  });
};
