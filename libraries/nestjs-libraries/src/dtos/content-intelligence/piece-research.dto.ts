import { ArrayMaxSize, Equals, IsArray, IsString, IsUUID, MaxLength } from 'class-validator';

export class PieceResearchDto {
  @Equals(true)
  confirmWebSpend: boolean;
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
