import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
// Относительно, как в `dtos/users/*`: этот файл грузят несколько наборов
// собственными загрузчиками модулей, которые не знают путей tsconfig.
import { ContentLanguage, contentLanguages } from '../content.language';

export class CreateContentSourceDto {
  @IsIn(['MANUAL', 'URL', 'RSS'])
  kind: 'MANUAL' | 'URL' | 'RSS';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @ValidateIf((value) => value.kind === 'URL' || value.kind === 'RSS')
  @IsString()
  @MaxLength(4_096)
  canonicalUrl?: string;

  @ValidateIf((value) => value.kind === 'MANUAL')
  @IsString()
  @MaxLength(2_000_000)
  manualText?: string;
}

export class ConfirmContentSourceRightsDto {
  @IsBoolean()
  confirmed: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}

export class SyncContentSourceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  runKey?: string;
}

/**
 * `content-factory-next-lh5s`: the question a person asks before they can
 * accept anything. The search itself had no door — `WebResearchService` was
 * reachable only from the copilot's own tools and from autopost, so the
 * accepting door below could be opened by a client but never by a person,
 * which is how "найдено поиском" stayed unreachable from the product.
 *
 * Bounded at the same 5000 characters the service already truncates a subject
 * to, so an over-long subject is refused at the edge rather than silently cut
 * halfway in.
 */
export class SearchForEvidenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(5_000)
  subject: string;

  /**
   * `content-factory-next-fn33.133`: the language the answer is read in. The
   * summary comes back from a search provider, which answers in the language it
   * was asked in — always English, because the English query is the one every
   * run makes. Optional, so a client that does not say keeps what the provider
   * wrote rather than being told a language it never picked.
   */
  @IsOptional()
  @IsIn([...contentLanguages])
  language?: ContentLanguage;
}

/**
 * `content-factory-next-lh5s`: what a person accepts is one `fact`/`source`
 * pair out of `WebResearchService.research(...)` — the excerpt they read and
 * the URL it came from. Nothing here names a `ContentSource`; that is the
 * point, per the owner's decision on this task.
 */
export class AcceptSearchResultEvidenceDto {
  @IsString()
  @MaxLength(4_096)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8_000)
  excerpt: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  publishedAt?: string;

  @IsIn(['tavily', 'openrouter', 'mixed'])
  provider: 'tavily' | 'openrouter' | 'mixed';
}
