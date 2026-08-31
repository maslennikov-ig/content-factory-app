import * as Sentry from '@sentry/nextjs';
import { createErrorCollectionOptions } from '@contentfactory/helpers/errors/create.error.collection.options';
import {
  BROWSER_ERROR_RELAY_PATH,
  browserErrorPayloadFromEnvelope,
} from '@contentfactory/helpers/errors/browser.error.relay';

try {
  // The SDK requires a syntactically valid DSN, but this DSN names the current
  // first-party origin and its transport below never uses the DSN endpoint.
  // The collector origin and key therefore never enter the browser bundle.
  const localDsn = new URL('/1', window.location.origin);
  localDsn.username = 'browser';
  const relaySeedBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(relaySeedBytes);
  const relayClientSeed = btoa(
    Array.from(relaySeedBytes, (byte) => String.fromCharCode(byte)).join('')
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const options = createErrorCollectionOptions({
    dsn: localDsn.toString(),
    allowedOrigin: window.location.origin,
    service: 'frontend',
    environment: process.env.NODE_ENV,
    integrations: [Sentry.globalHandlersIntegration()],
  });

  if (options) {
    Sentry.init({
      ...options,
      transport: () => ({
        send: async (envelope: unknown) => {
          const payload = browserErrorPayloadFromEnvelope(envelope);
          if (!payload) return { statusCode: 400 };

          // Delivery is best-effort. Credentials are omitted and the fixed
          // payload carries no cookie, page URL, request header or collector
          // address.
          void fetch(BROWSER_ERROR_RELAY_PATH, {
            method: 'POST',
            // The nonce lives only for this document. Nginx already forwards
            // Content-Type while dropping arbitrary headers, and the relay
            // immediately turns this value into a rotating opaque digest.
            headers: {
              'content-type': `application/json; cf-client=${relayClientSeed}`,
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
            credentials: 'omit',
            keepalive: true,
            mode: 'same-origin',
            redirect: 'error',
            // Trims `Referer` to the bare origin. The browser default,
            // strict-origin-when-cross-origin, sends the full page URL on a
            // same-origin request. `no-referrer` would hide it too, but it is
            // one of the policies that makes a non-GET, non-cors request send
            // `Origin: null`, which the relay's strict origin check rejects;
            // `origin` is not (Fetch Standard, append a request Origin header).
            referrerPolicy: 'origin',
          }).catch(() => undefined);
          return { statusCode: 202 };
        },
        flush: async () => true,
      }),
    });
  }
} catch {
  // Browser error collection must never prevent the product from loading.
}
