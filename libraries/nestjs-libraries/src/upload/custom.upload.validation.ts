import {
  BadRequestException,
  Injectable,
  Optional,
  PipeTransform,
} from '@nestjs/common';
import {
  BACKEND_FALLBACK_LOCALE,
  BackendLocale,
  translateBackendText,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';
import {
  MAX_IMAGE_UPLOAD_SIZE,
  MAX_VIDEO_UPLOAD_SIZE,
  maxUploadSizeForMimeType,
} from '@contentfactory/nestjs-libraries/upload/upload.limits';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
]);

@Injectable()
export class CustomFileValidationPipe implements PipeTransform {
  /**
   * The upload request carries no language of its own: it is an XHR straight
   * to `/media/upload-server`, outside `useFetch`, and the interface language
   * lives in a cookie on the frontend host. So the sentence a refusal is
   * written in is chosen where the pipe is constructed, and English stays the
   * default. In the browser this text is a backstop — the same ceiling is
   * checked before the file leaves the page, in the person's own language.
   *
   * `@Optional()` because `UploadModule` also lists the pipe as a provider:
   * without it Nest tries to resolve a `String` token for this parameter and
   * the whole backend refuses to start (caught on the stand, 04.09.2026).
   */
  constructor(
    @Optional() private readonly locale: BackendLocale = BACKEND_FALLBACK_LOCALE
  ) {}

  async transform(value: any) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    // Skip non-file parameters (org, body, query, etc.)
    if (!('buffer' in value) && !('mimetype' in value) && !('fieldname' in value)) {
      return value;
    }

    if (!value.buffer || !Buffer.isBuffer(value.buffer)) {
      throw new BadRequestException('Invalid file upload.');
    }

    const detected = await fromBuffer(value.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new BadRequestException('Unsupported file type.');
    }

    const maxSize = getMaxSize(detected.mime);
    if (value.size > maxSize) {
      throw new BadRequestException(
        describeSizeRefusal(detected.mime, this.locale)
      );
    }

    value.mimetype = detected.mime;
    const safeBase = (value.originalname || 'upload')
      .replace(/\.[^./\\]*$/, '')
      .replace(/[\\/]/g, '_')
      .slice(0, 100) || 'upload';
    value.originalname = `${safeBase}.${detected.ext}`;

    return value;
  }

}

/**
 * The ceiling this deployment enforces, or a refusal for a type it does not
 * take. The numbers themselves live in `upload.limits`, which the browser
 * imports too — that is the whole point: they used to be typed on both sides
 * and had drifted to 30 MB against 10 MB (`content-factory-next-fn33.20`).
 */
export function getMaxSize(mimeType: string): number {
  const max = maxUploadSizeForMimeType(mimeType);
  if (max === undefined) {
    throw new BadRequestException('Unsupported file type.');
  }
  return max;
}

/** The refusal as a sentence, with the ceiling in the unit it is read in. */
function describeSizeRefusal(mimeType: string, locale: BackendLocale): string {
  return mimeType.startsWith('video/')
    ? translateBackendText('upload_video_too_large', locale, {
        max: MAX_VIDEO_UPLOAD_SIZE / (1024 * 1024 * 1024),
      })
    : translateBackendText('upload_image_too_large', locale, {
        max: MAX_IMAGE_UPLOAD_SIZE / (1024 * 1024),
      });
}
