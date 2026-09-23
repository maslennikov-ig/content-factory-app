import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IsAiRoleModels,
  IsSearchApiKeys,
  IsSearchTaskProviders,
} from '@contentfactory/nestjs-libraries/dtos/settings/ai.provider.dto';
import type { AiProvider } from '@contentfactory/nestjs-libraries/openai/ai.provider.config';

/**
 * What the instance's superadmin may set, reusing the workspace validators
 * rather than restating them: the engines, the roles and the key shapes are the
 * same facts, and a second copy of that list is the copy that goes stale.
 */
export class InstanceAiDefaultsDto {
  @IsString()
  @IsOptional()
  @IsIn(['openai', 'openrouter'])
  provider?: AiProvider;

  /** Omitted or empty means «keep the stored key». Removal has its own door. */
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

  @IsOptional()
  @IsAiRoleModels()
  roleModels?: Record<string, string>;

  @IsOptional()
  @IsSearchApiKeys()
  searchApiKeys?: Record<string, string>;

  @IsOptional()
  @IsSearchTaskProviders()
  searchTaskProviders?: Record<string, string>;

  /**
   * Included operations a month for a workspace with no subscription row.
   *
   * Zero is a real answer — «included is closed here» — so it is allowed. The
   * ceiling is not a policy, only a guard against a typed digit becoming an
   * unbounded bill by accident.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  monthlyOperations?: number;

  /** Flex attempts in the text chain (`content-factory-next-97dq.55`). */
  @IsOptional()
  @IsBoolean()
  textFlexEnabled?: boolean;

  /** The chain's last model. Empty returns to `z-ai/glm-5.3`. */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  textFallbackModel?: string;
}
