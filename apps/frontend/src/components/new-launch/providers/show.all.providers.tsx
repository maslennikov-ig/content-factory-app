'use client';

import DevtoProvider from '@contentfactory/frontend/components/new-launch/providers/devto/devto.provider';
import XProvider from '@contentfactory/frontend/components/new-launch/providers/x/x.provider';
import LinkedinProvider from '@contentfactory/frontend/components/new-launch/providers/linkedin/linkedin.provider';
import RedditProvider from '@contentfactory/frontend/components/new-launch/providers/reddit/reddit.provider';
import MediumProvider from '@contentfactory/frontend/components/new-launch/providers/medium/medium.provider';
import HashnodeProvider from '@contentfactory/frontend/components/new-launch/providers/hashnode/hashnode.provider';
import FacebookProvider from '@contentfactory/frontend/components/new-launch/providers/facebook/facebook.provider';
import InstagramProvider from '@contentfactory/frontend/components/new-launch/providers/instagram/instagram.collaborators';
import YoutubeProvider from '@contentfactory/frontend/components/new-launch/providers/youtube/youtube.provider';
import TiktokProvider from '@contentfactory/frontend/components/new-launch/providers/tiktok/tiktok.provider';
import PinterestProvider from '@contentfactory/frontend/components/new-launch/providers/pinterest/pinterest.provider';
import DribbbleProvider from '@contentfactory/frontend/components/new-launch/providers/dribbble/dribbble.provider';
import ThreadsProvider from '@contentfactory/frontend/components/new-launch/providers/threads/threads.provider';
import DiscordProvider from '@contentfactory/frontend/components/new-launch/providers/discord/discord.provider';
import SlackProvider from '@contentfactory/frontend/components/new-launch/providers/slack/slack.provider';
import KickProvider from '@contentfactory/frontend/components/new-launch/providers/kick/kick.provider';
import TwitchProvider from '@contentfactory/frontend/components/new-launch/providers/twitch/twitch.provider';
import MastodonProvider from '@contentfactory/frontend/components/new-launch/providers/mastodon/mastodon.provider';
import BlueskyProvider from '@contentfactory/frontend/components/new-launch/providers/bluesky/bluesky.provider';
import LemmyProvider from '@contentfactory/frontend/components/new-launch/providers/lemmy/lemmy.provider';
import WarpcastProvider from '@contentfactory/frontend/components/new-launch/providers/warpcast/warpcast.provider';
import TelegramProvider from '@contentfactory/frontend/components/new-launch/providers/telegram/telegram.provider';
import NostrProvider from '@contentfactory/frontend/components/new-launch/providers/nostr/nostr.provider';
import VkProvider from '@contentfactory/frontend/components/new-launch/providers/vk/vk.provider';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import React, { FC, forwardRef, useEffect, useImperativeHandle } from 'react';
import { GeneralPreviewComponent } from '@contentfactory/frontend/components/launches/general.preview.component';
import { IntegrationContext } from '@contentfactory/frontend/components/launches/helpers/use.integration';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { PostComment } from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import WordpressProvider from '@contentfactory/frontend/components/new-launch/providers/wordpress/wordpress.provider';
import ListmonkProvider from '@contentfactory/frontend/components/new-launch/providers/listmonk/listmonk.provider';
import GmbProvider from '@contentfactory/frontend/components/new-launch/providers/gmb/gmb.provider';
import MoltbookProvider from '@contentfactory/frontend/components/new-launch/providers/moltbook/moltbook.provider';
import SkoolProvider from '@contentfactory/frontend/components/new-launch/providers/skool/skool.provider';
import WhopProvider from '@contentfactory/frontend/components/new-launch/providers/whop/whop.provider';
import MeweProvider from '@contentfactory/frontend/components/new-launch/providers/mewe/mewe.provider';
import TumblrProvider from '@contentfactory/frontend/components/new-launch/providers/tumblr/tumblr.provider';

export const Providers = [
  {
    identifier: 'devto',
    component: DevtoProvider,
  },
  {
    identifier: 'x',
    component: XProvider,
  },
  {
    identifier: 'linkedin',
    component: LinkedinProvider,
  },
  {
    identifier: 'linkedin-page',
    component: LinkedinProvider,
  },
  {
    identifier: 'reddit',
    component: RedditProvider,
  },
  {
    identifier: 'medium',
    component: MediumProvider,
  },
  {
    identifier: 'hashnode',
    component: HashnodeProvider,
  },
  {
    identifier: 'facebook',
    component: FacebookProvider,
  },
  {
    identifier: 'instagram',
    component: InstagramProvider,
  },
  {
    identifier: 'instagram-standalone',
    component: InstagramProvider,
  },
  {
    identifier: 'youtube',
    component: YoutubeProvider,
  },
  {
    identifier: 'tiktok',
    component: TiktokProvider,
  },
  {
    identifier: 'pinterest',
    component: PinterestProvider,
  },
  {
    identifier: 'dribbble',
    component: DribbbleProvider,
  },
  {
    identifier: 'threads',
    component: ThreadsProvider,
  },
  {
    identifier: 'discord',
    component: DiscordProvider,
  },
  {
    identifier: 'slack',
    component: SlackProvider,
  },
  {
    identifier: 'kick',
    component: KickProvider,
  },
  {
    identifier: 'twitch',
    component: TwitchProvider,
  },
  {
    identifier: 'mastodon',
    component: MastodonProvider,
  },
  {
    identifier: 'bluesky',
    component: BlueskyProvider,
  },
  {
    identifier: 'lemmy',
    component: LemmyProvider,
  },
  {
    identifier: 'wrapcast',
    component: WarpcastProvider,
  },
  {
    identifier: 'telegram',
    component: TelegramProvider,
  },
  {
    identifier: 'nostr',
    component: NostrProvider,
  },
  {
    identifier: 'vk',
    component: VkProvider,
  },
  {
    identifier: 'wordpress',
    component: WordpressProvider,
  },
  {
    identifier: 'listmonk',
    component: ListmonkProvider,
  },
  {
    identifier: 'gmb',
    component: GmbProvider,
  },
  {
    identifier: 'moltbook',
    component: MoltbookProvider,
  },
  {
    identifier: 'skool',
    component: SkoolProvider,
  },
  {
    identifier: 'whop',
    component: WhopProvider,
  },
  {
    identifier: 'mewe',
    component: MeweProvider,
  },
  {
    identifier: 'tumblr',
    component: TumblrProvider,
  },
];
export const ShowAllProviders = forwardRef((props, ref) => {
  const { date, current, global, selectedIntegrations, allIntegrations } =
    useLaunchStore(
      useShallow((state) => ({
        date: state.date,
        selectedIntegrations: state.selectedIntegrations,
        allIntegrations: state.integrations,
        current: state.current,
        global: state.global,
      }))
    );

  const t = useT();

  useImperativeHandle(ref, () => ({
    checkAllValid: async () => {
      return Promise.all(
        selectedIntegrations.map(async (p) => await p.ref?.current.isValid())
      );
    },
    getAllValues: async () => {
      return Promise.all(
        selectedIntegrations.map(async (p) => await p.ref?.current.getValues())
      );
    },
    triggerAll: () => {
      return selectedIntegrations.map(
        async (p) => await p.ref?.current.trigger()
      );
    },
  }));

  return (
    <div className="w-full flex flex-col flex-1">
      {current === 'global' && (
        <IntegrationContext.Provider
          value={{
            date,
            integration:
              selectedIntegrations?.[0]?.integration || allIntegrations?.[0],
            allIntegrations: selectedIntegrations.map((p) => p.integration),
            value: global.map((p) => ({
              id: p.id,
              content: p.content,
              image: p.media,
            })),
          }}
        >
          {global?.[0]?.content?.length === 0 ? (
            <div>
              {t(
                'start_writing_your_post',
                'Start writing your post for a preview'
              )}
            </div>
          ) : (
            <div className="border border-borderPreview rounded-[12px] shadow-previewShadow">
              <GeneralPreviewComponent maximumCharacters={100000000} />
            </div>
          )}
        </IntegrationContext.Provider>
      )}
      {selectedIntegrations.map((integration) => {
        const { component: ProviderComponent } = Providers.find(
          (provider) =>
            provider.identifier === integration.integration.identifier
        ) || {
          component: Empty,
        };

        return (
          <ProviderComponent
            ref={integration.ref}
            key={integration.integration.id}
            id={integration.integration.id}
          />
        );
      })}
    </div>
  );
});

export const Empty: FC = () => {
  return null;
};
