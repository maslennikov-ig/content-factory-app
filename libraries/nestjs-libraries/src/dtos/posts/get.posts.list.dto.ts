import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EDITORIAL_STAGE_VALUES } from '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto';
import { MAX_SEARCH_QUERY_LENGTH } from '@contentfactory/nestjs-libraries/content-intelligence/search-terms';

export type PostListStateFilter = 'all' | 'scheduled' | 'draft' | 'published';

export class GetPostsListDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @IsOptional()
  @IsString()
  customer?: string;

  @IsOptional()
  @IsString()
  integrationId?: string;

  @IsOptional()
  @IsIn(['all', 'scheduled', 'draft', 'published'])
  state?: PostListStateFilter = 'all';

  // Editorial process stage, NOT delivery `state` above. Optional.
  @IsOptional()
  @IsIn(EDITORIAL_STAGE_VALUES)
  editorialStage?: (typeof EDITORIAL_STAGE_VALUES)[number];

  /**
   * Поиск по словам в тексте поста (`odb8.4.1`). Разбор — `searchWords`;
   * пустой запрос ничего не сужает.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_QUERY_LENGTH)
  q?: string;
}
