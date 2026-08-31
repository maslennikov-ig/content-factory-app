import { createHmac, randomBytes } from 'node:crypto';

export const BROWSER_ERROR_RELAY_CLIENT_WINDOW_MS = 60_000;
export const BROWSER_ERROR_RELAY_MAX_CLIENTS = 1_024;

const CLIENT_CONTENT_TYPE =
  /^application\/json; cf-client=([A-Za-z0-9_-]{22})$/;

/**
 * Converts a page-lifetime random nonce into an opaque, process-local key.
 * The nonce itself is never retained, and rotating the salt prevents the
 * digest from linking the same nonce across limiter windows or restarts.
 */
export class BrowserErrorRelayClientKeyring {
  #salt = randomBytes(32);
  #windowId: number | undefined;
  readonly #windowMs: number;

  constructor(options: { windowMs: number }) {
    this.#windowMs = options.windowMs;
  }

  derive(contentType: string | null, now = Date.now()) {
    const seed = contentType?.match(CLIENT_CONTENT_TYPE)?.[1];
    if (!seed) return null;

    const windowId = Math.floor(now / this.#windowMs);
    if (this.#windowId !== windowId) {
      this.#salt.fill(0);
      this.#salt = randomBytes(32);
      this.#windowId = windowId;
    }

    return createHmac('sha256', this.#salt)
      .update(seed, 'ascii')
      .digest('base64url');
  }
}
