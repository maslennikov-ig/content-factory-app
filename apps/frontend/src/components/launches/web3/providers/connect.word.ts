/**
 * The word a channel owner pastes into their Telegram chat as
 * `/connect <word>`.
 *
 * It is the only secret binding a pending connection request to the chat that
 * answers it, so guessing one attaches someone else's channel to your account.
 * The inherited `makeId(4)` gave 62^4 ≈ 14.8 million candidates from
 * `Math.random`, which is neither long enough nor unpredictable.
 *
 * The alphabet is exactly the one the backend validator and the bot command
 * parser accept — `[A-Za-z0-9_-]` — and it is 64 characters, so six random
 * bits map onto one character with no modulo bias.
 */
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const CONNECT_WORD_LENGTH = 24;

export const generateConnectWord = (length = CONNECT_WORD_LENGTH) => {
  const random = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (!random) {
    // Failing the connection is the safe outcome: a predictable word is worse
    // than no word at all.
    throw new Error('A secure random source is required to connect a channel');
  }

  const bytes = random(new Uint8Array(length));
  let word = '';
  for (const byte of bytes) {
    word += ALPHABET[byte % ALPHABET.length];
  }
  return word;
};
