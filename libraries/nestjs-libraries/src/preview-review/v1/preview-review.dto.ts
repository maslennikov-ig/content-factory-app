import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class PreviewReviewAnchorDtoV1 {
  @IsString() @MinLength(1) @MaxLength(100) postId: string;
  @IsString() @MinLength(1) @MaxLength(2000) quote: string;
  @IsInt() @Min(0) @Max(1000000) start: number;
  @IsInt() @Min(1) @Max(1000000) end: number;
  @IsString() @Matches(/^[a-f0-9]{64}$/) revision: string;
}

export class PreviewReviewCommentDtoV1 {
  @IsString() @MinLength(1) @MaxLength(4000) content: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) guestName?: string;
}

export class PreviewReviewThreadDtoV1 extends PreviewReviewCommentDtoV1 {
  @IsOptional() @ValidateNested() @Type(() => PreviewReviewAnchorDtoV1)
  anchor?: PreviewReviewAnchorDtoV1;
}

export class PreviewReviewResolutionDtoV1 {
  @IsBoolean() resolved: boolean;
}

export class PreviewReviewGrantDtoV1 {
  @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
}

export class LegacyPreviewCommentDtoV1 {
  @IsString() @MinLength(1) @MaxLength(4000) comment: string;
}
