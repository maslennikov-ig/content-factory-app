import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import type { SearchProvider } from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import {
  AI_ROLES,
  MAX_ROLE_MODEL_LENGTH,
  isAiRole,
} from '@contentfactory/nestjs-libraries/openai/ai.roles';

/**
 * The role map, checked as a whole rather than key by key.
 *
 * `class-validator` has no decorator for «an object whose keys come from this
 * list and whose values are model ids», and the alternatives are worse: a
 * nested DTO would need one declared field per role, which is the table of
 * roles written a second time, and it would silently accept a role this build
 * does not know. The list lives in `ai.roles.ts` and this reads it.
 *
 * A padded id is refused rather than trimmed. The reader drops what it cannot
 * use, so a trimmed-on-save value would be stored while the person who typed
 * it never learns their paste carried whitespace — and the same string typed
 * into the field again would look identical and behave the same. Refusing says
 * it once, at the only moment anybody can fix it.
 */
export const IsAiRoleModels = (options?: ValidationOptions) =>
  function decorate(object: object, propertyName: string) {
    registerDecorator({
      name: 'isAiRoleModels',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;
          return Object.entries(value as Record<string, unknown>).every(
            ([role, model]) =>
              isAiRole(role) &&
              typeof model === 'string' &&
              model.length > 0 &&
              model.length <= MAX_ROLE_MODEL_LENGTH &&
              model.trim() === model
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must map one of ${AI_ROLES.join(
            ', '
          )} to a model id of at most ${MAX_ROLE_MODEL_LENGTH} characters with no surrounding spaces`;
        },
      },
    });
  };

export class AiProviderDto {
  @IsString()
  @IsOptional()
  @IsIn(['included', 'workspace_key'])
  usageMode?: 'included' | 'workspace_key';

  @IsString()
  @IsIn(['openai', 'openrouter'])
  provider: 'openai' | 'openrouter';

  /**
   * Omitted or empty means "keep the stored key". The settings screen never
   * receives the current key, so it cannot echo it back on an unrelated save.
   */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  apiKey?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  textModel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  imageModel?: string;

  /**
   * Which model each call role gets. An absent key, and an empty map, both
   * mean «this role uses the text model» — the behaviour before roles existed.
   */
  @IsOptional()
  @IsAiRoleModels()
  roleModels?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  searchEnabled?: boolean;

  @IsString()
  @IsOptional()
  @IsIn(['tavily'])
  searchProvider?: Extract<SearchProvider, 'tavily'>;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  searchApiKey?: string;

  @IsString()
  @IsOptional()
  @IsIn(['general', 'news'])
  searchTopic?: 'general' | 'news';

  @IsString()
  @IsOptional()
  @IsIn(['basic', 'advanced'])
  searchDepth?: 'basic' | 'advanced';
}
