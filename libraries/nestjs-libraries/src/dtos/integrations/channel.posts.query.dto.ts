import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Small bounded window for the channel's recent-delivery panel. */
export class ChannelPostsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 3;
}
