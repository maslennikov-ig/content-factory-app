import { IsIn, IsString } from 'class-validator';
import { BACKEND_LOCALES } from '@contentfactory/nestjs-libraries/locale/backend-strings';

/**
 * The language an account reads in — the one the server writes letters in.
 *
 * `content-factory-next-fn33.53`. The list is the backend's own locale list,
 * not the frontend's, because this value is read back by the mail path
 * (`resolveBackendLocale`) and by nothing else on the server. The two lists
 * hold the same sixteen ids and `tests/backend-locale-strings.test.cjs` keeps
 * them together; taking the one the reader uses means an id that cannot be
 * translated cannot be stored either.
 */
export class UserLanguageDto {
  @IsString()
  @IsIn(BACKEND_LOCALES as unknown as string[])
  language: string;
}
