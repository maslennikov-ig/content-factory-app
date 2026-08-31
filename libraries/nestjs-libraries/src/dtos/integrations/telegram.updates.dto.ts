import { IsDefined, IsString, Matches } from 'class-validator';

/**
 * A class rather than an inline query type: the global ValidationPipe only
 * validates what it can resolve to a class, so an inline `{ word: string }`
 * let an absent `word` through as `undefined`, which Prisma reads as "no
 * condition" and turns into someone else's pending connection.
 *
 * The pattern is the one the bot command parser accepts, and the length stays
 * open from 4 to 64 so the generated word can grow without a contract change.
 */
export class TelegramUpdatesDto {
  @IsDefined()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{4,64}$/)
  word: string;
}
