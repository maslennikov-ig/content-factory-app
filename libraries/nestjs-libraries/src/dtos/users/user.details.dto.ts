import { MediaDto } from '@contentfactory/nestjs-libraries/dtos/media/media.dto';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UserDetailDto {
  /**
   * `content-factory-next-fn33.96`: registration never asks for a name, so
   * requiring three characters here meant an account could not save its
   * picture until it invented one. An empty name is a valid profile — every
   * screen already falls back to the address through `displayName`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullname?: string;

  /**
   * `content-factory-next-97dq.51`: `User.lastName` has been on the table since
   * the fork and was never editable. Optional and emptiable like the first
   * name, with the same bound.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  /** «Коротко о себе» — two or three sentences, not a biography. */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  bio: string;

  /**
   * `User.timezone` is an `Int`: the zone's standard offset from UTC in
   * minutes (Moscow is `180`, Kolkata `330`). The bounds are the ones the
   * world uses, −12:00 to +14:00. Absent means «leave it as it is».
   */
  @IsOptional()
  @IsInt()
  @Min(-720)
  @Max(840)
  timezone?: number;

  @IsOptional()
  @ValidateNested()
  picture: MediaDto;
}
