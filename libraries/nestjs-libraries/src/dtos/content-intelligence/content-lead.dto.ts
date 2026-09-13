import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Two kinds of subscription, and what each one needs.
 *
 * `RSS` is an address; `TOPIC` (`content-factory-next-75xn.7`) is a subject,
 * checked by a thirty-day web search instead of by reading a feed. `URL` (a
 * single page with no "new items" of its own) is still not offered — a
 * subscription exists to notice change over time, and a static page has no
 * items to diff between checks.
 *
 * Both payload fields are optional here because neither is required by *both*
 * kinds, and a validator cannot say «this one if that one» without a custom
 * rule. Which field a kind requires is decided once, in
 * `ContentLeadService.createSubscription`, and refused there with a code the
 * screen can read (`INVALID_URL`, `INVALID_TOPIC`) — not silently accepted.
 */
export class CreateContentLeadSubscriptionDto {
  @IsIn(['RSS', 'TOPIC'])
  kind: 'RSS' | 'TOPIC';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  /** The feed address. Required for `RSS`; a `TOPIC` row has none. */
  @IsOptional()
  @IsString()
  @MaxLength(4_096)
  canonicalUrl?: string;

  /**
   * The subject to watch, as the person wrote it. Required for `TOPIC`.
   * The length matches `MAX_TOPIC_QUERY_LENGTH`, which is also what the
   * service refuses on — the number lives there, and this is its door-side
   * restatement.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

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
