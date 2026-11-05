/** Root binds this port to the existing AgentThreadsService. No chat module cycle. */
export const VIDEO_SUBSCRIPTION_RETURN_CONTEXT = Symbol('VIDEO_SUBSCRIPTION_RETURN_CONTEXT');
export interface VideoSubscriptionReturnContextV1 {
  ownThread(identity: {organizationId: string; userId: string}, threadId: string): Promise<unknown | null>;
}
export const VIDEO_OAUTH_DEFAULT_RETURN = '/media?video=1';
export type VideoOAuthReturnErrorV1 = 'VIDEO_OAUTH_REFUSED' | 'VIDEO_CONNECTION_UNAVAILABLE';
