import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * A feed address, nothing more. `URL` (a single page with no "new items" of
 * its own) is deliberately not offered here the way it is for `ContentSource`
 * — a subscription exists to notice change over time, and a static page has
 * no items to diff between checks. `Ideas.dc.html`'s empty state offers
 * exactly one address kind today: «Лента сайта».
 */
export class CreateContentLeadSubscriptionDto {
  @IsIn(['RSS'])
  kind: 'RSS';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @IsString()
  @MaxLength(4_096)
  canonicalUrl: string;

  /** Minutes between checks. The three choices `Ideas.dc.html` shows a person. */
  @IsOptional()
  @IsIn([60, 360, 1440])
  checkIntervalMinutes?: number;

  /**
   * The AutoPost втягивание (`content-lead.service.ts`): names an existing,
   * active `AutoPost` row whose address this subscription shares, so the list
   * can say the address is already drafting on its own instead of the two
   * mechanisms sitting side by side unaware of each other.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  linkedAutoPostId?: string;
}

export class ListContentLeadsDto {
  @IsOptional()
  @IsIn(['NEW', 'DISMISSED', 'ACCEPTED'])
  status?: 'NEW' | 'DISMISSED' | 'ACCEPTED';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  subscriptionId?: string;
}
