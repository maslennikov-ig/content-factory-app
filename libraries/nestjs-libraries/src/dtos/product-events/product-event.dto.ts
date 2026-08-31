/**
 * There is deliberately no `ProductEventDto` class here.
 *
 * The global pipe in `apps/backend/src/main.ts` runs `ValidationPipe` with
 * `whitelist: true` before any route-level pipe, so an unknown key in the
 * request body is stripped in silence and a later `forbidNonWhitelisted` never
 * sees it. A product event body must be refused outright when it carries an
 * extra key — a client trying to set `userId` or `organizationId` has to get a
 * 400, not a quietly trimmed record. `ProductEventsService.recordAuthenticated`
 * therefore reads the raw body and checks the envelope by hand, and this module
 * exports only the pieces that check applies: the event names and the property
 * validator.
 */

export const PRODUCT_EVENT_NAMES = [
  'register',
  'purchase',
  'channel_added',
  'lifetime_claimed',
  'cancel_subscription',
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

const MAX_PROPERTIES_BYTES = 16 * 1024;
const MAX_PROPERTIES_DEPTH = 4;
const MAX_PROPERTIES_KEYS = 100;
const MAX_PROPERTIES_ARRAY_ITEMS = 100;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
/**
 * Unicode classes, not `\w` and `[a-z0-9]`. The product ships in Russian first,
 * so `иван@почта.рф` and `test@example.рф` are the ordinary case rather than an
 * exotic one, and an ASCII-only pattern let both of them through into stored
 * properties.
 */
const EMAIL_VALUE =
  /(^|[^\p{L}\p{N}.+_-])[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+($|[^\p{L}\p{N}.-])/iu;

export type ProductEventPropertiesValidation =
  | { valid: true }
  | { valid: false; reason: string };

export function validateProductEventProperties(
  properties: unknown
): ProductEventPropertiesValidation {
  if (
    properties === null ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  ) {
    return { valid: false, reason: 'properties must be a JSON object' };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(properties);
  } catch {
    return { valid: false, reason: 'properties must be serializable JSON' };
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROPERTIES_BYTES) {
    return { valid: false, reason: 'properties exceed the byte limit' };
  }

  let keys = 0;
  let arrayItems = 0;
  const visit = (
    value: unknown,
    depth: number
  ): ProductEventPropertiesValidation => {
    if (typeof value === 'string') {
      return EMAIL_VALUE.test(value)
        ? { valid: false, reason: 'properties contain an email-like value' }
        : { valid: true };
    }
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      return { valid: true };
    }
    if (typeof value !== 'object') {
      return { valid: false, reason: 'properties contain a non-JSON value' };
    }
    if (depth > MAX_PROPERTIES_DEPTH) {
      return { valid: false, reason: 'properties exceed the depth limit' };
    }

    if (Array.isArray(value)) {
      arrayItems += value.length;
      if (arrayItems > MAX_PROPERTIES_ARRAY_ITEMS) {
        return { valid: false, reason: 'properties exceed the array limit' };
      }
      for (const item of value) {
        const result = visit(item, depth + 1);
        if (!result.valid) return result;
      }
      return { valid: true };
    }

    for (const key of Object.getOwnPropertyNames(value)) {
      keys += 1;
      if (keys > MAX_PROPERTIES_KEYS) {
        return { valid: false, reason: 'properties exceed the key limit' };
      }
      const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
      if (DANGEROUS_KEYS.has(key.toLowerCase())) {
        return { valid: false, reason: 'properties contain a dangerous key' };
      }
      if (normalized.includes('email') || normalized.includes('name')) {
        return { valid: false, reason: 'properties contain a personal key' };
      }
      const result = visit((value as Record<string, unknown>)[key], depth + 1);
      if (!result.valid) return result;
    }
    return { valid: true };
  };

  return visit(properties, 0);
}
