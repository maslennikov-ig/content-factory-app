/**
 * The key shapes and their redaction, with no Mastra import, so the request
 * reader and the error log can use them outside the agent (split from
 * `conductor.secrets.ts`, which re-exports them).
 *
 * This file imports nothing, and must keep importing nothing: the chat
 * screen's composer and key card import it into the browser bundle
 * (`tests/secret-shapes.test.cjs` holds that).
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
 * list is what `tests/agent-scenarios.test.cjs` greps every recorded
 * scenario's model input, stored memory, traces, stream and log for
 * (`kcxz.20`), and what the chat screen's composer refuses to send.
 *
 * Boundaries (review W3-20 F4, F11). A key glued to what comes before it —
 * `KEY_sk-…`, `ключ:sk-…`, `xsk-…` — is still a key, so the distinctive
 * prefixes need no word boundary in front; the two generic shapes (`sk-` with
 * anything after it, `re_`) keep one that lets `_` through but not a letter.
 * Nothing starts right after `/`: `https://site.ru/sk-rosatom-news-…` is a
 * link, not a key. A key broken by a space or a line break (a narrow terminal,
 * a messenger's wrap) is followed across it while the next run still looks
 * random — letters and digits, eight characters or more — never into words.
 */

/** Random-looking key characters; the minimum length is the shape's own. */
const BODY = '[A-Za-z0-9_-]';
/**
 * The rest of a key broken by whitespace: another run of eight or more that
 * holds both a letter and a digit, so a following word is never taken.
 */
const WRAPPED = `(?:(?:[ \\t]*\\r?\\n[ \\t]*|[ \\t])(?=${BODY}*\\d)(?=${BODY}*[A-Za-z])${BODY}{8,})*`;
/** Not right after `/` (a link's path) — the only thing a glued key may not follow. */
const NOT_IN_PATH = '(?<!/)';
/** The generic shapes: not glued to a letter or a digit, and not in a path. */
const WORD_START = '(?<![A-Za-z0-9/])';
/** An id (a UUID), which alone is not a key: the product's own ids look the same. */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
/**
 * The words that make a UUID beside them a key (Exa's keys are UUIDs; medium
 * confidence on the format — the product's tests and docs do not name it).
 * Whole words only, so `snapshotKey` or `tokenCount` are not one; close by —
 * within 40 characters on the same line, with no quote or brace between, so a
 * JSON field named `key` beside an id is not a key either.
 */
const KEY_WORDS =
  '(?<![\\p{L}\\p{N}_])(?:exa|api[ _-]?keys?|keys?|tokens?|secrets?|ключ\\p{L}*|токен\\p{L}*|секрет\\p{L}*)(?![\\p{L}\\p{N}_])';
const NEAR = '[^\\n"{}]{0,40}?';

const shape = (source: string) => new RegExp(source, 'g');

export const SECRET_SHAPES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  // Three ways an `sk-` key looks, one name:
  // - OpenRouter (`sk-or-v1-…`), Anthropic (`sk-ant-api03-…`), OpenAI's
  //   project, service-account and admin keys: distinctive, so glued ones
  //   count too; the OpenAI ones hold an upper-case letter and a digit, which
  //   a slug does not;
  // - any other `sk-` (a legacy OpenAI key, DeepSeek and the like): not glued
  //   to a letter or a digit and not in a link's path, so
  //   `https://site.ru/sk-rosatom-news-…` stays text;
  // - glued to a word and still unmistakable: `xsk-` and 32 letters and
  //   digits in one run, which no word is.
  {
    name: 'sk-key',
    pattern: shape(
      [
        `${NOT_IN_PATH}sk-(?:or-v1-${BODY}{16,}|ant-(?:api|admin)\\d{2}-${BODY}{16,}|(?:proj|svcacct|admin)-(?=${BODY}*[A-Z])(?=${BODY}*\\d)${BODY}{16,})${WRAPPED}`,
        `${WORD_START}sk-${BODY}{20,}${WRAPPED}`,
        `${NOT_IN_PATH}sk-(?=[A-Za-z0-9]*\\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{32,}`,
      ].join('|')
    ),
  },
  { name: 'tavily-key', pattern: shape(`${NOT_IN_PATH}tvly-${BODY}{16,}${WRAPPED}`) },
  { name: 'groq-key', pattern: shape(`${NOT_IN_PATH}gsk_[A-Za-z0-9]{20,}${WRAPPED}`) },
  { name: 'xai-key', pattern: shape(`${NOT_IN_PATH}xai-[A-Za-z0-9]{20,}${WRAPPED}`) },
  // Resend (`RESEND_API_KEY`): `re_` is also a code prefix (`re_match`), so a
  // key is one that mixes upper case and digits.
  {
    name: 'resend-key',
    pattern: shape(
      `(?<![A-Za-z0-9/])re_(?=[A-Za-z0-9_]*[A-Z])(?=[A-Za-z0-9_]*\\d)[A-Za-z0-9_]{20,}`
    ),
  },
  { name: 'google-key', pattern: shape(`${NOT_IN_PATH}AIza[0-9A-Za-z_-]{35}`) },
  // Google OAuth access token.
  { name: 'google-token', pattern: shape(`${NOT_IN_PATH}ya29\\.[A-Za-z0-9_-]{20,}`) },
  { name: 'github-token', pattern: shape(`${NOT_IN_PATH}(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})`) },
  // Telegram bot token: `<bot id>:AA<33 chars>`. The secret half always starts
  // with `AA`, which keeps `12345678:some-long-slug-of-words` text (F11).
  { name: 'telegram-bot-token', pattern: shape('\\b\\d{6,12}:AA[A-Za-z0-9_-]{30,}') },
  // This product's own OAuth tokens (`start.mcp.ts`).
  { name: 'oauth-token', pattern: shape(`${NOT_IN_PATH}pos_${BODY}{16,}`) },
  // Exa: a UUID with a key word next to it, before or after (F4).
  {
    name: 'exa-key',
    pattern: new RegExp(
      `(?<=${KEY_WORDS}${NEAR})(?<![0-9A-Za-z-])${UUID}(?![0-9A-Za-z-])|(?<![0-9A-Za-z-])${UUID}(?![0-9A-Za-z-])(?=${NEAR}${KEY_WORDS})`,
      'giu'
    ),
  },
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

/** Every string leaf with key shapes redacted; the shape is kept. */
export const redactSecretLeaves = (value: unknown): unknown => {
  if (typeof value === 'string') return redactSecretShapes(value);
  if (Array.isArray(value)) return value.map(redactSecretLeaves);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, leaf]) => [key, redactSecretLeaves(leaf)])
    );
  }
  return value;
};

/** `true` when the text holds anything shaped like a key. */
export const containsSecretShape = (text: string) =>
  SECRET_SHAPES.some(({ pattern }) =>
    new RegExp(pattern.source, pattern.flags.replace('g', '')).test(text)
  );

/**
 * The text with every key shape taken out, for the chat screen's composer
 * (`kcxz.20`): a key pasted into a message is removed from the field and the
 * message is not sent; the person enters the key on the key card instead.
 */
export const withoutSecretShapes = (text: string) =>
  SECRET_SHAPES.reduce(
    (current, { pattern }) =>
      current.replace(new RegExp(pattern.source, pattern.flags), ''),
    text
  )
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

/**
 * Whose key this is, by its prefix alone — `null` when the prefix names
 * nobody (review W3-20 F2).
 *
 * The AI key card files a key under the provider it will be sent to, and a
 * key must never reach another provider's endpoint: an `sk-or-…` saved as
 * OpenAI goes to `api.openai.com`. The settings door refuses a key whose
 * prefix names another provider than the one it is saved for; the card says
 * which provider it saves for and infers it from the key where it can.
 */
export type KeyOwner =
  | 'openai'
  | 'openrouter'
  | 'anthropic'
  | 'tavily'
  | 'groq'
  | 'xai'
  | 'google'
  | 'resend'
  | 'github'
  | 'telegram';

const OWNERS: ReadonlyArray<[KeyOwner, RegExp]> = [
  ['openrouter', /^sk-or-/],
  ['anthropic', /^sk-ant-/],
  ['openai', /^sk-/],
  ['tavily', /^tvly-/],
  ['groq', /^gsk_/],
  ['xai', /^xai-/],
  ['google', /^(?:AIza|ya29\.)/],
  ['resend', /^re_/],
  ['github', /^(?:gh[pousr]_|github_pat_)/],
  ['telegram', /^\d{6,12}:AA/],
];

export const keyOwnerOf = (key: string): KeyOwner | null =>
  OWNERS.find(([, prefix]) => prefix.test(key.trim()))?.[0] ?? null;

/** How each owner is named to a person. */
export const KEY_OWNER_NAMES: Record<KeyOwner, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  tavily: 'Tavily',
  groq: 'Groq',
  xai: 'xAI',
  google: 'Google',
  resend: 'Resend',
  github: 'GitHub',
  telegram: 'Telegram',
};
