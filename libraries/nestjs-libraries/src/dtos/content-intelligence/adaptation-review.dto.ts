import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
  IsDefined,
  Equals,
} from 'class-validator';
import {
  ADAPTATION_REVIEW_ACTIONS,
  type AdaptationReviewAction,
} from '../../content-intelligence/pieces/adaptation-review.contract';

export class AdaptationReviewDto {
  @IsIn(ADAPTATION_REVIEW_ACTIONS)
  mode: AdaptationReviewAction;
  @ValidateIf((object) => object.mode === 'web')
  @Equals(true)
  confirmWebSpend?: boolean;
}
export class AdaptationReviewSnapshotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  postId: string;
  @IsISO8601()
  postUpdatedAt: string;
  @IsString()
  @MaxLength(200_000)
  postContent: string;
  @IsISO8601()
  adaptationUpdatedAt: string;
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(200_000)
  adaptationBody: string | null;
}
export class AdaptationReviewAcceptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60_000)
  text: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => AdaptationReviewSnapshotDto)
  snapshot: AdaptationReviewSnapshotDto;
}
