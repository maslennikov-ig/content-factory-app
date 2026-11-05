import type { PublicationKeyV106, PublicationResultV106 } from '../../../database/prisma/posts/publication-store.v106';
import type { PostDetails, PostResponse } from '../../../integrations/social/social.integrations.interface';

export const SOCIAL_FACTORY_PUBLICATION_GUARD = 'SOCIAL_FACTORY_PUBLICATION_GUARD';
/** Required at the activity boundary; an unavailable repository must stop sends. */
export interface SocialFactoryPublicationGuard {
  isCampaign(organizationId: string, postId: string): Promise<boolean>;
  claimSend(key: PublicationKeyV106, outbound: PostDetails): Promise<PublicationResultV106>;
  beforeSend(organizationId: string, postId: string, outbound?: PostDetails, authoritativePost?: any): Promise<{ campaign: boolean; execute: boolean }>;
  syncReceipt(organizationId: string, postId: string, receipts: PostResponse[]): Promise<void>;
  syncUncertain(organizationId: string, postId: string): Promise<void>;
}
