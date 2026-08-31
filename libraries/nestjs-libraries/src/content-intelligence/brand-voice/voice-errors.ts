import { VOICE_ERROR_CODES, type VoiceErrorCode } from './voice-wiring.contract';

/**
 * A refusal the screen can act on.
 *
 * The shape is dictated by `safeHttpError` in the controllers: a `code` and a
 * `status` on the thrown object are what turn an exception into the body
 * `VoiceErrorBodyV1` describes. Everything else — a blank profile, a generic
 * 500, an empty list — loses the reason on the way to the person reading it,
 * and the reason is the only part of a refusal worth transporting.
 *
 * The status is never passed in. It comes from the contract's own table, so a
 * code cannot arrive on two different statuses depending on which service
 * threw it.
 */
export class VoiceError extends Error {
  readonly code: VoiceErrorCode;
  readonly status: number;
  readonly screenState: 'error' | 'restricted';
  readonly subject?: string;

  constructor(code: VoiceErrorCode, message: string, subject?: string) {
    super(message);
    this.name = 'VoiceError';
    this.code = code;
    this.status = VOICE_ERROR_CODES[code].status;
    this.screenState = VOICE_ERROR_CODES[code].screenState;
    this.subject = subject;
  }
}

export const isVoiceError = (error: unknown): error is VoiceError =>
  error instanceof VoiceError ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'VoiceError');
