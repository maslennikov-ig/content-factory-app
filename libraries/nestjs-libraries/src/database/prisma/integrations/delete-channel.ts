/**
 * Removing a channel with every post on it (`DELETE /integrations`), as one
 * step the door and the chat's `channel.delete` share (`content-factory-next-kcxz.19`).
 *
 * The order is the fence of `content-factory-next-fn33.90.3`: the channel must
 * exist in this workspace before a single post is touched. With `id` missing,
 * Prisma reads `integrationId: undefined` as no condition at all, and the old
 * loop erased every post of the workspace. `null` — no such channel, nothing
 * touched; the caller says so in its own words.
 *
 * Only this channel's posts go (review W3-19 P2-1). They used to be deleted
 * by post group, and a group spans every channel the composer wrote it for,
 * so a post's copies on other channels were deleted with it while their
 * workflows kept running. `PostsService.deleteChannelPosts` marks the rows of
 * this channel only and stops the workflows of the root posts it deleted.
 */
export type ChannelDeleteServices = {
  integrations: {
    getIntegrationById: (org: string, id: string) => Promise<unknown>;
    deleteChannel: (org: string, id: string) => Promise<unknown>;
  };
  posts: {
    deleteChannelPosts: (org: string, id: string) => Promise<string[]>;
  };
};

export const deleteChannelWithPosts = async (
  { integrations, posts }: ChannelDeleteServices,
  org: string,
  id: string
): Promise<{ channel: unknown; posts: number } | null> => {
  if (!id) return null;
  const channel = await integrations.getIntegrationById(org, id);
  if (!channel) return null;
  const deleted = await posts.deleteChannelPosts(org, id);
  return {
    channel: await integrations.deleteChannel(org, id),
    posts: deleted.length,
  };
};
