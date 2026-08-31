'use client';

import { useCallback } from 'react';
import { useFetch } from './custom.fetch';

export type ProductEventName =
  | 'register'
  | 'purchase'
  | 'channel_added'
  | 'lifetime_claimed';

export type ProductEventOptions = {
  deduplicationKey: string;
  properties?: Record<string, unknown>;
};

/**
 * `crypto.subtle` exists only in a secure context, so a plain-HTTP stand has no
 * SHA-256 in the browser and every `lifetime_claimed` was lost to a swallowed
 * exception. A deduplication key needs to be stable and opaque, not
 * cryptographic, so four FNV-1a lanes stand in when the real digest is absent.
 */
const fallbackDigest = (value: string) => {
  const offsets = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  return offsets
    .map((offset) => {
      let hash = offset >>> 0;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    })
    .join('');
};

export const productEventKeyFromIdentifier = async (
  namespace: string,
  identifier: string
) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return `${namespace}:${fallbackDigest(identifier)}`;
  }
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identifier)
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `${namespace}:${fingerprint}`;
};

/** Sends privacy-limited product events only to the first-party receiver. */
export const useFireEvents = () => {
  const fetch = useFetch();

  return useCallback(
    async (name: ProductEventName, options: ProductEventOptions) => {
      const response = await fetch('/product-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          ...(options.properties ? { properties: options.properties } : {}),
          deduplicationKey: options.deduplicationKey,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record product event');
      }
    },
    [fetch]
  );
};
