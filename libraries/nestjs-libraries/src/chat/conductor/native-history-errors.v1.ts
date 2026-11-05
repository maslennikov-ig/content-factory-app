import type { MastraDBMessage } from '@mastra/core/memory';
import { redactSecretShapes } from './secret-shapes';

const FALLBACK = 'Tool execution failed';
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

/** An error is an observation, never a serialized private exception object. */
export const modelToolErrorTextV1 = (value: unknown): string => {
  if (typeof value === 'string') {
    const text = value.trim();
    // The SDK converts historical object errors into JSON error-text values.
    // Decode only a bounded structured value; never dump its message/details.
    if (/^[{["\d-]|^(?:null|true|false)$/.test(text)) {
      if (text.length > 4096) return FALLBACK;
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'string') return modelToolErrorTextV1(parsed);
        value = parsed;
      } catch { /* A normal non-JSON error remains readable below. */ }
    }
    return redactSecretShapes(typeof value === 'string' ? value : text)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .trim().slice(0, 1000) || FALLBACK;
  }
  const code = record(value)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(code)
    ? `${FALLBACK} (${code})` : FALLBACK;
};

/** TokenCounter may cache estimates on its input: give it no original objects. */
export const historyMessageForCountingV1 = (message: MastraDBMessage): MastraDBMessage => {
  const copy = structuredClone(message);
  const content = record(copy.content);
  if (!Array.isArray(content?.parts)) return copy;
  for (const value of content.parts) {
    const part = record(value);
    if (!part || typeof part.type !== 'string') continue;
    const invocation = part.type === 'tool-invocation' ? record(part.toolInvocation)
      : part.type === 'dynamic-tool' || part.type.startsWith('tool-') ? part : undefined;
    if (invocation?.state === 'output-error' || invocation?.state === 'result' && invocation.isError === true)
      invocation.errorText = modelToolErrorTextV1(invocation.errorText);
  }
  return copy;
};
