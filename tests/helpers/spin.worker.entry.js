'use strict';

/**
 * A worker for `tests/brand-voice.parse-isolation.test.cjs` only — not a
 * `.docx`/`.pdf` parser, a minimal stand-in for the worst case
 * `parse-isolation.ts`'s timeout has to survive: a synchronous infinite
 * loop, which blocks the event loop, so the process can never receive or
 * act on a message, a `SIGTERM`, or anything else that depends on it running
 * JavaScript again. Only an unconditional `SIGKILL` from the parent ends
 * this process, which is the specific claim the test proves rather than
 * assumes.
 */
// eslint-disable-next-line no-constant-condition
while (true) {
  // spin
}
