/**
 * The key shapes and their redaction, with no Mastra import, so the request
 * reader and the error log can use them outside the agent (split from
 * `conductor.secrets.ts`, which re-exports them).
 */

/**
 * Keys never pass through the model (spec §1.5, §4.10; premortem S1 and the
 * secrets guard of `kcxz.8`).
 *
 * A key is typed into the secret card, which posts straight to the settings
 * door. If one is pasted into the chat anyway, the input processor replaces it
 * before the model reads it and before memory stores it, so it cannot reach a
 * message, working memory, a suspended run's snapshot or a trace; the output
 * processor does the same for anything the model writes back.
 *
 * The shapes are the ones this product handles, beyond Mastra's `secrets`
 * preset (which only knows `api_key=…`, `Bearer …` and AWS keys). The same
 * list is what `tests/agent-secrets.guard.test.cjs` greps stored fixtures for.
 */
export const SECRET_SHAPES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  // OpenAI, OpenRouter (`sk-or-v1-…`), Anthropic (`sk-ant-…`), project keys.
  { name: 'sk-key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { name: 'tavily-key', pattern: /\btvly-[A-Za-z0-9_-]{16,}/g },
  { name: 'google-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  // Telegram bot token: `<bot id>:<35 chars>`.
  { name: 'telegram-bot-token', pattern: /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g },
  // This product's own OAuth tokens (`start.mcp.ts`).
  { name: 'oauth-token', pattern: /\bpos_[A-Za-z0-9_-]{16,}/g },
  {
    name: 'private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
];

export const SECRET_REPLACEMENT = '[KEY]';

/** The text with every key shape replaced; for what is stored outside a turn. */
export const redactSecretShapes = (text: string) =>
  SECRET_SHAPES.reduce(
    (current, { pattern }) =>
      current.replace(new RegExp(pattern.source, pattern.flags), SECRET_REPLACEMENT),
    text
  );

/** `true` when the text holds anything shaped like a key. */
export const containsSecretShape = (text: string) =>
  SECRET_SHAPES.some(({ pattern }) =>
    new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text)
  );
