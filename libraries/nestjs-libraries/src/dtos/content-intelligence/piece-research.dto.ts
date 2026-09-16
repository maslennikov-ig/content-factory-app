import { ArrayMaxSize, Equals, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PieceResearchDto {
  @Equals(true)
  confirmWebSpend: boolean;

  @IsOptional()
  @IsIn(['quick', 'standard', 'deep'])
  level?: 'quick' | 'standard' | 'deep';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direction?: string;
}

export class PieceResearchAcceptDto {
  @IsUUID('4')
  snapshotKey: string;
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(240, { each: true })
  selectedKeys: string[];
}
