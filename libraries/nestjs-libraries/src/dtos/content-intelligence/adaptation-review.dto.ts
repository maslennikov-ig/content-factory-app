import { PieceAnswerDoorDto } from './content-piece.dto';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsArray,
  ArrayMaxSize,
  IsOptional,
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
  @ValidateIf((object) => object.mode === 'web' || object.mode === 'research')
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

export class RewriteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  instruction: string;
}
export class ReviewAcceptV2Dto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000000)
  token: string;
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  selectedIds: string[];
  @IsOptional()
  @IsString()
  @MaxLength(240)
  variant?: string;
}

export class ReviewAuthorAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  questionId: string;
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}
export class ReviewAuthorAnswersDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000000)
  token: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  adaptationId?: string;
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ReviewAuthorAnswerDto)
  answers: ReviewAuthorAnswerDto[];
}
/** Additive successor; the original answer request and stream remain unchanged. */
export class PieceAnswerDoorV2Dto extends PieceAnswerDoorDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewAuthorAnswersDto)
  reviewAnswer?: ReviewAuthorAnswersDto;
}
