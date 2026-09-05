import { MediaDto } from '@contentfactory/nestjs-libraries/dtos/media/media.dto';
import {
  IsOptional,
  IsString,
  MaxLength,
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

  @IsString()
  @IsOptional()
  bio: string;

  @IsOptional()
  @ValidateNested()
  picture: MediaDto;
}
