import { createHash } from 'crypto';

/**
 * What the person approved, as one string (`content-factory-next-kcxz.6`,
 * ADR-0012 amendment §4).
 *
 * An approval card says what, where and with what consequence. The call that
 * runs after «Да» must be that call and no other: same tool, same arguments.
 * The controller records the fingerprint of the card the person answered, and
 * `beforeToolCall` refuses a `confirm` call whose own fingerprint differs —
 * whatever changed the arguments in between.
 *
 * Keys are sorted at every depth, so the same arguments give the same print
 * whichever order the model wrote them in.
 */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  return value;
};

export const approvalFingerprint = (toolName: string, args: unknown): string =>
  createHash('sha256')
    .update(`${toolName}\n${JSON.stringify(canonical(args ?? {}))}`)
    .digest('hex');
