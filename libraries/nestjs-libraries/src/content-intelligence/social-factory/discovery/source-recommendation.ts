import type { SocialFactoryStoreV1 } from '../contracts/social-factory.v1';

export interface SourceRecommendation {
  claim(organizationId: string, channelId: string, acknowledged: boolean): Promise<boolean>;
}

/** One optional invitation per channel; held by the existing Prisma-backed shared repository. */
export class PersistentSourceRecommendation implements SourceRecommendation {
  constructor(private readonly store: SocialFactoryStoreV1,
    private readonly now: () => Date = () => new Date()) {}

  async claim(organizationId: string, channelId: string, acknowledged: boolean): Promise<boolean> {
    if (!organizationId?.trim() || !channelId?.trim()) throw new Error('DISCOVERY_INVALID_RECOMMENDATION_SCOPE');
    try {
      return await this.store.transact(async store => {
        if (await store.read(organizationId, 'source_recommendation', channelId)) return false;
        await store.put({ organizationId, kind: 'source_recommendation', id: channelId,
          expectedRevision: 0, parentId: channelId,
          payload: { version: 1, state: acknowledged ? 'acknowledged' : 'presented', at: this.now().toISOString() } });
        return !acknowledged;
      });
    } catch (error: any) {
      // Two concurrent chats may both ask; only the winning create displays an invitation.
      if (error?.code === 'SOCIAL_FACTORY_CONFLICT') return false;
      throw error;
    }
  }
}
