import {
  VOICE_ERROR_CODES,
  type VoiceErrorCode,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * The two refusals this surface can hand a screen, with the status the
 * contract already assigned them.
 *
 * The status is read from `VOICE_ERROR_CODES` rather than retyped here. A
 * refusal that is 404 in the contract and 400 in the service is a screen that
 * branches on one and receives the other, and nobody finds that by reading
 * either file alone.
 */
export type MaterialErrorCode = Extract<
  VoiceErrorCode,
  'MATERIAL_NOT_FOUND' | 'MATERIAL_PLATFORM_UNSUPPORTED'
>;

export class MaterialError extends Error {
  readonly status: number;

  constructor(
    readonly code: MaterialErrorCode,
    message: string,
    status?: number,
    /** The thing the refusal names: a platform, a material. Never a value. */
    readonly subject?: string
  ) {
    super(message);
    this.name = 'MaterialError';
    this.status = status ?? VOICE_ERROR_CODES[code].status;
  }
}

export const materialNotFound = (subject?: string) =>
  new MaterialError(
    'MATERIAL_NOT_FOUND',
    'Материал не найден',
    undefined,
    subject
  );

export const platformUnsupported = (platform: string, message: string) =>
  new MaterialError(
    'MATERIAL_PLATFORM_UNSUPPORTED',
    message,
    undefined,
    platform
  );
