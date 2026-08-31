import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { SearchProvider } from '@contentfactory/nestjs-libraries/openai/ai.provider.config';

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
