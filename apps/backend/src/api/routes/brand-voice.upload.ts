import {
  ArgumentsHost,
  Catch,
  CanActivate,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { MulterError } from 'multer';
import { VOICE_SAMPLE_FILE_LIMITS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * The two places a batch of files is refused before anybody reads it, and the
 * one shape both refusals arrive in.
 *
 * The screens branch on `VoiceErrorBodyV1.code`. A refusal that leaves as a
 * bare 500 or as Nest's own `{statusCode, message}` is a refusal the wizard
 * can only report as «неизвестная ошибка», which is exactly what a person
 * gets today for picking eleven files instead of ten.
 */

const REFUSAL = {
  code: 'VOICE_UPLOAD_REJECTED',
} as const;

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

export const UPLOAD_MESSAGES = {
  batchBytes: `Партия больше ${megabytes(
    VOICE_SAMPLE_FILE_LIMITS.maxBatchBytes
  )} МБ. Отправьте файлы в несколько заходов.`,
  fileBytes: `Один из файлов больше ${megabytes(
    VOICE_SAMPLE_FILE_LIMITS.maxFileBytes
  )} МБ. Уберите его из выбора и повторите.`,
  fileCount: `За один раз принимается файлов: ${VOICE_SAMPLE_FILE_LIMITS.maxFilesPerBatch}. Отправьте остальные следующей партией.`,
  malformed: 'Загрузка не разобралась. Выберите файлы заново и повторите.',
} as const;

/**
 * The batch ceiling, read off the request before a byte is buffered.
 *
 * `multer`'s `limits.fileSize` caps one file and cannot cap their sum: by the
 * time ten files of twenty megabytes each have been counted, two hundred
 * megabytes are already in this process's memory. A guard runs before the
 * interceptor, so `Content-Length` — which the browser states and the person
 * cannot make smaller than the body — is the last cheap moment to say no.
 *
 * It is an upper bound rather than an exact size: multipart adds boundaries
 * and headers. That direction is the safe one — it never refuses a batch that
 * would have fitted.
 */
@Injectable()
export class VoiceUploadBatchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const declared = Number(request?.headers?.['content-length'] ?? 0);
    if (
      Number.isFinite(declared) &&
      declared > VOICE_SAMPLE_FILE_LIMITS.maxBatchBytes
    ) {
      throw new HttpException(
        { ...REFUSAL, message: UPLOAD_MESSAGES.batchBytes },
        413
      );
    }
    return true;
  }
}

/**
 * What multer says when it refuses, and what a person should read instead.
 *
 * Keyed by message rather than by `MulterError.code` because the code does not
 * survive the journey: `FilesInterceptor` catches the `MulterError` itself and
 * `transformException` in `@nestjs/platform-express` turns it into an ordinary
 * `BadRequestException` or `PayloadTooLargeException`, carrying the library's
 * English sentence and nothing else. A filter catching `MulterError` therefore
 * never fires — a batch of eleven files answered
 * `{"message":"Too many files","statusCode":400}` on the live pass, which is
 * exactly the shapeless refusal the screens cannot branch on.
 *
 * The list is multer's own and short. Anything not in it is somebody else's
 * `HttpException` — a failed DTO validation, most plausibly — and is passed
 * through untouched rather than dressed up as an upload refusal.
 */
const MULTER_MESSAGES: Record<string, string> = {
  'File too large': UPLOAD_MESSAGES.fileBytes,
  'Too many files': UPLOAD_MESSAGES.fileCount,
  'Unexpected field': UPLOAD_MESSAGES.fileCount,
  'Too many parts': UPLOAD_MESSAGES.malformed,
  'Field name too long': UPLOAD_MESSAGES.malformed,
  'Field value too long': UPLOAD_MESSAGES.malformed,
  'Too many fields': UPLOAD_MESSAGES.malformed,
};

const multerMessage = (exception: HttpException): string | null => {
  if (exception instanceof MulterError) {
    return MULTER_MESSAGES[exception.message] ?? UPLOAD_MESSAGES.malformed;
  }
  const body = exception.getResponse?.();
  const message =
    typeof body === 'string'
      ? body
      : body && typeof body === 'object'
      ? (body as { message?: unknown }).message
      : undefined;
  return typeof message === 'string' ? MULTER_MESSAGES[message] ?? null : null;
};

/**
 * The interceptor throws before the handler body runs, so the `try/catch`
 * around every route in `brand-voice.controller.ts` never sees this. Without
 * the filter a refusal about the batch reaches the wizard with no code on it
 * and is shown as «неизвестная ошибка».
 */
@Catch(HttpException)
export class VoiceUploadExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const message = multerMessage(exception);
    if (message) {
      response.status(413).json({ ...REFUSAL, message });
      return;
    }
    // Not multer's: whatever it was, it keeps its own status and body.
    const body = exception.getResponse();
    response.status(exception.getStatus()).json(body);
  }
}

/**
 * The file's name as the person typed it, not as the wire spelled it.
 *
 * `busboy` decodes a multipart filename as latin1, so «заметка.txt» arrives as
 * «Ð·Ð°Ð¼ÐµÑÐºÐ°.txt» and that is what the corpus table would print beside the
 * sample forever. Re-reading those bytes as UTF-8 restores the name; where the
 * result is not valid UTF-8 — a filename that really was latin1 — the original
 * is kept, because a mangled name is better than a replacement character.
 */
export function originalFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
