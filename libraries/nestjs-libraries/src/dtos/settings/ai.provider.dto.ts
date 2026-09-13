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
import {
  SEARCH_PROVIDERS,
  SEARCH_TASKS,
  isSearchProvider,
  isSearchTask,
} from '@contentfactory/nestjs-libraries/openai/ai.search-tasks';

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

/**
 * Plain keys by engine, on the way in only.
 *
 * A single `searchApiKey` field could not express «save this key for Exa while
 * Tavily stays the workspace's engine»: the only thing naming the engine was
 * `searchProvider`, and sending that changes which engine every unrouted task
 * uses. The map says which engine each typed key belongs to and nothing else.
 *
 * Length is checked here because these are the keys a person pastes; the
 * stored form is encrypted and longer, and `ai.search-tasks.ts` bounds that.
 */
export const IsSearchApiKeys = (options?: ValidationOptions) =>
  function decorate(object: object, propertyName: string) {
    registerDecorator({
      name: 'isSearchApiKeys',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;
          return Object.entries(value as Record<string, unknown>).every(
            ([provider, key]) =>
              isSearchProvider(provider) &&
              typeof key === 'string' &&
              key.length > 0 &&
              key.length <= 500 &&
              key.trim() === key
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must map one of ${SEARCH_PROVIDERS.join(
            ', '
          )} to a key of at most 500 characters with no surrounding spaces`;
        },
      },
    });
  };

/**
 * The task map, on the same terms as the role map above and for the same
 * reasons: the list of tasks and the list of engines each live in exactly one
 * file, and a nested DTO would be both of them written a second time.
 */
export const IsSearchTaskProviders = (options?: ValidationOptions) =>
  function decorate(object: object, propertyName: string) {
    registerDecorator({
      name: 'isSearchTaskProviders',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;
          return Object.entries(value as Record<string, unknown>).every(
            ([task, provider]) => isSearchTask(task) && isSearchProvider(provider)
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must map one of ${SEARCH_TASKS.join(
            ', '
          )} to one of ${SEARCH_PROVIDERS.join(', ')}`;
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
  @IsIn(['tavily', 'openrouter', 'exa'])
  searchProvider?: SearchProvider;

  /**
   * The key for the engine named by `searchProvider`, or by the stored one.
   * Kept for callers written before `searchApiKeys`; the screen sends the map.
   */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  searchApiKey?: string;

  /** One typed key per engine. Engines left out keep whatever is stored. */
  @IsOptional()
  @IsSearchApiKeys()
  searchApiKeys?: Record<string, string>;

  /**
   * Which engine each search task gets. An absent key, and an empty map, both
   * mean «every task uses the workspace's engine» — the behaviour before the
   * tasks existed.
   */
  @IsOptional()
  @IsSearchTaskProviders()
  searchTaskProviders?: Record<string, string>;

  @IsString()
  @IsOptional()
  @IsIn(['general', 'news'])
  searchTopic?: 'general' | 'news';

  @IsString()
  @IsOptional()
  @IsIn(['basic', 'advanced'])
  searchDepth?: 'basic' | 'advanced';
}
