import { providerErrorDiagnostic } from './provider-error-diagnostic';
import type { ProductionAssetV1, JsonValueV1 } from '../../content-intelligence/social-factory/contracts/social-factory.v1';
import { normalizeAnalytics } from './analytics.data';
import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import type { youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library/build/src/auth/oauth2client';
import { readMediaSource } from '@contentfactory/helpers/utils/media.source';
import { YoutubeSettingsDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import {
  BadBody,
  SocialAbstract,
  ValidityMedia,
} from '@contentfactory/nestjs-libraries/integrations/social.abstract';
import * as process from 'node:process';
import dayjs from 'dayjs';
import type { GaxiosResponse } from 'gaxios/build/src/common';
import { Rules } from '@contentfactory/nestjs-libraries/chat/rules.description.decorator';
import { loadGoogleApis } from '@contentfactory/nestjs-libraries/integrations/social/google.sdk';
import { YOUTUBE_THUMBNAIL_FAILED_STATUS } from '../publication-warnings';

type Schema$Video = youtube_v3.Schema$Video;

const clientAndYoutube = async () => {
  const { google } = await loadGoogleApis();
  const client = new google.auth.OAuth2({
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    redirectUri: `${process.env.FRONTEND_URL}/integrations/social/youtube`,
  });

  const youtube = (newClient: OAuth2Client) =>
    google.youtube({
      version: 'v3',
      auth: newClient,
    });

  const youtubeAnalytics = (newClient: OAuth2Client) =>
    google.youtubeAnalytics({
      version: 'v2',
      auth: newClient,
    });

  const oauth2 = (newClient: OAuth2Client) =>
    google.oauth2({
      version: 'v2',
      auth: newClient,
    });

  return { client, youtube, oauth2, youtubeAnalytics };
};

@Rules('YouTube must have on video attachment, it cannot be empty')
export class YoutubeProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 200; // YouTube has strict upload quotas
  identifier = 'youtube';
  nativeEditorialSettings(assets: Pick<ProductionAssetV1, 'mediaId'|'kind'|'role'|'url'>[]): Record<string, JsonValueV1> {
    const cover=assets.find(asset=>asset.kind==='image'&&asset.role==='cover');
    return cover?.url ? {thumbnail:{id:cover.mediaId,path:cover.url}} : {};
  }
  name = 'YouTube';
  isBetweenSteps = true;
  dto = YoutubeSettingsDto;
  scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtubepartner',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ];

  editor = 'normal' as const;
  maxLength() {
    return 5000;
  }

  override async checkValidity(
    items: Array<ValidityMedia[]>
  ): Promise<string | true> {
    const [firstItems] = items ?? [];
    if (items?.[0]?.length !== 1) {
      return 'You need one media';
    }
    if ((firstItems?.[0]?.path?.indexOf?.('mp4') ?? -1) === -1) {
      return 'Item must be a video';
    }
    return true;
  }

  override handleErrors(body: string, status = 0) {
    return providerErrorDiagnostic('youtube', body, status, this.legacyErrors(body));
  }

  private legacyErrors(body: string):
    | {
        type: 'refresh-token' | 'bad-body';
        value: string;
      }
    | undefined {
    if (body.includes('invalidTags')) {
      return {
        type: 'bad-body',
        value: 'The maximum allowed is 500 characters in total.',
      };
    }

    if (body.includes('invalidTitle')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but we could not set the title. Title is too long.',
      };
    }

    if (body.includes('invalidDescription')) {
      return {
        type: 'bad-body',
        value:
          'Your video description is invalid, it may contain disallowed characters such as < or >.',
      };
    }

    if (body.includes('invalidCategoryId')) {
      return {
        type: 'bad-body',
        value: 'The selected video category is invalid.',
      };
    }

    if (body.includes('invalidPublishAt')) {
      return {
        type: 'bad-body',
        value: 'The scheduled publishing time is invalid.',
      };
    }

    if (body.includes('invalidRecordingDetails')) {
      return {
        type: 'bad-body',
        value: 'The recording details for the video are invalid.',
      };
    }

    if (body.includes('invalidVideoGameRating')) {
      return {
        type: 'bad-body',
        value: 'The video game rating is invalid.',
      };
    }

    if (body.includes('invalidFilename')) {
      return {
        type: 'bad-body',
        value: 'The video file name is invalid.',
      };
    }

    if (body.includes('defaultLanguageNotSet')) {
      return {
        type: 'bad-body',
        value:
          'We could not set the localized video details because no default language is set.',
      };
    }

    if (body.includes('invalidVideoMetadata')) {
      return {
        type: 'bad-body',
        value:
          'Some of the video details are invalid, please review the title, description and tags.',
      };
    }

    if (body.includes('mediaBodyRequired')) {
      return {
        type: 'bad-body',
        value:
          'The video file is missing or could not be read, please re-upload the video.',
      };
    }

    if (body.includes('imageFormatUnsupported')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but the thumbnail format is not supported, please use JPEG or PNG.',
      };
    }

    if (body.includes('imageTooTall')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but the thumbnail image is too tall.',
      };
    }

    if (body.includes('imageTooWide')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but the thumbnail image is too wide.',
      };
    }

    if (body.includes('rateLimitExceeded')) {
      return {
        type: 'bad-body',
        value:
          'You are sending requests too quickly, please wait a little while and try again.',
      };
    }

    if (body.includes('failedPrecondition')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but we could not set the thumbnail. Thumbnail size is too large.',
      };
    }

    if (body.includes('uploadLimitExceeded')) {
      return {
        type: 'bad-body',
        value:
          'You have reached your daily upload limit, please try again tomorrow.',
      };
    }

    if (body.includes('youtubeSignupRequired')) {
      return {
        type: 'bad-body',
        value:
          'You have to link your youtube account to your google account first.',
      };
    }

    if (body.includes('youtube.thumbnail')) {
      return {
        type: 'bad-body',
        value:
          'Your account is not verified, we have uploaded your video but we could not set the thumbnail. Please verify your account and try again.',
      };
    }

    if (body.includes('Unauthorized')) {
      return {
        type: 'refresh-token',
        value:
          'Token expired or invalid, please reconnect your YouTube account.',
      };
    }

    if (body.includes('UNAUTHENTICATED') || body.includes('invalid_grant')) {
      return {
        type: 'refresh-token',
        value: 'Please re-authenticate your YouTube account',
      };
    }

    return undefined;
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    const { client, oauth2 } = await clientAndYoutube();
    client.setCredentials({ refresh_token });
    const { credentials } = await client.refreshAccessToken();
    const user = oauth2(client);
    const expiryDate = new Date(credentials.expiry_date!);
    const unixTimestamp =
      Math.floor(expiryDate.getTime() / 1000) -
      Math.floor(new Date().getTime() / 1000);

    const { data } = await user.userinfo.get();

    return {
      accessToken: credentials.access_token!,
      expiresIn: unixTimestamp!,
      refreshToken: credentials.refresh_token ?? refresh_token,
      id: data.id!,
      name: data.name!,
      picture: data?.picture || '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeId(7);
    const { client } = await clientAndYoutube();
    return {
      url: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        state,
        redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/youtube`,
        scope: this.scopes.slice(0),
      }),
      codeVerifier: makeId(11),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const { client, oauth2 } = await clientAndYoutube();
    const { tokens } = await client.getToken(params.code);
    client.setCredentials(tokens);
    const { scopes } = await client.getTokenInfo(tokens.access_token!);
    this.checkScopes(this.scopes, scopes);

    const user = oauth2(client);
    const { data } = await user.userinfo.get();

    const expiryDate = new Date(tokens.expiry_date!);
    const unixTimestamp =
      Math.floor(expiryDate.getTime() / 1000) -
      Math.floor(new Date().getTime() / 1000);

    return {
      accessToken: tokens.access_token!,
      expiresIn: unixTimestamp,
      refreshToken: tokens.refresh_token!,
      id: data.id!,
      name: data.name!,
      picture: data?.picture || '',
      username: '',
    };
  }

  async pages(accessToken: string) {
    const { client, youtube } = await clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);

    try {
      // Get all channels the user has access to
      const response = await youtubeClient.channels.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        mine: true,
      });

      const channels = response.data.items || [];

      return channels.map((channel) => ({
        id: channel.id!,
        name: channel.snippet?.title || 'Unnamed Channel',
        picture: {
          data: {
            url: channel.snippet?.thumbnails?.default?.url || '',
          },
        },
        username: channel.snippet?.customUrl || '',
        subscriberCount: channel.statistics?.subscriberCount || '0',
      }));
    } catch (error) {
      console.error('Failed to fetch YouTube channels:', error);
      return [];
    }
  }

  async fetchPageInformation(accessToken: string, data: { id: string }) {
    const { client, youtube } = await clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);

    try {
      const response = await youtubeClient.channels.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: [data.id],
      });

      const channel = response.data.items?.[0];

      if (!channel) {
        throw new Error('Channel not found');
      }

      return {
        id: channel.id!,
        name: channel.snippet?.title || 'Unnamed Channel',
        access_token: accessToken,
        picture: channel.snippet?.thumbnails?.default?.url || '',
        username: channel.snippet?.customUrl || '',
      };
    } catch (error) {
      console.error('Failed to fetch YouTube channel information:', error);
      throw error;
    }
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const pages = await this.pages(accessToken);
    const findPage = pages.find((p) => p.id === requiredId);

    if (!findPage) {
      throw new Error('Channel not found');
    }

    const information = await this.fetchPageInformation(accessToken, {
      id: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost, ...comments] = postDetails;

    const { client, youtube } = await clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);

    const settings = { ...firstPost.settings,
      thumbnail: firstPost.settings?.thumbnail?.path ? firstPost.settings.thumbnail
        : firstPost.media?.[0]?.thumbnail ? { path: firstPost.media[0].thumbnail } : undefined };

    const source = await readMediaSource(firstPost.media[0].path);

    let all: GaxiosResponse<Schema$Video>;
    try {
      all = await this.runInConcurrent(
      async () =>
        youtubeClient.videos.insert({
          part: ['id', 'snippet', 'status'],
          notifySubscribers: true,
          requestBody: {
            snippet: {
              title: settings.title,
              description: firstPost?.message,
              ...(settings?.tags?.length
                ? { tags: settings.tags.map((p: {label: string}) => p.label) }
                : {}),
            },
            status: {
              privacyStatus: settings.type,
              selfDeclaredMadeForKids:
                settings.selfDeclaredMadeForKids === 'yes',
            },
          },
          media: {
            body: source.stream,
          },
        }),
      true
    );
    } finally { source.close(); }

    const videoId = all?.data?.id;
    if (typeof videoId !== 'string' || !videoId.trim() || videoId === 'missing') {
      throw new Error('YouTube did not return a video id; publication outcome is unknown.');
    }
    let status = 'success';
    if (settings?.thumbnail?.path) {
      try {
        const coverSource = await readMediaSource(settings.thumbnail.path, {maxBytes: 10 * 1024 * 1024});
        try {
          await this.runInConcurrent(async () => youtubeClient.thumbnails.set({
            videoId, media: {body: coverSource.stream},
          }));
        } finally { coverSource.close(); }

      } catch {
        // The upload already has an accepted id. Record the optional failure without retrying the upload.
        status = YOUTUBE_THUMBNAIL_FAILED_STATUS;
      }
    }

    return [
      {
        id: firstPost.id,
        releaseURL: `https://www.youtube.com/watch?v=${videoId}`,
        postId: videoId,
        status,
      },
    ];
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    try {
      const endDate = dayjs().format('YYYY-MM-DD');
      const startDate = dayjs().subtract(date, 'day').format('YYYY-MM-DD');

      const { client, youtubeAnalytics } = await clientAndYoutube();
      client.setCredentials({ access_token: accessToken });

      const youtubeClient = youtubeAnalytics(client);
      const { data } = await youtubeClient.reports.query({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics:
          'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,subscribersLost',
        dimensions: 'day',
        sort: 'day',
      });

      const columns = data?.columnHeaders?.map((p) => p.name)!;
      const mappedData = data?.rows?.map((p) => {
        return columns.reduce((acc, curr, index) => {
          acc[curr!] = p[index];
          return acc;
        }, {} as any);
      });

      const acc = [] as any[];
      acc.push({
        label: 'Estimated Minutes Watched',
        data: mappedData?.map((p: any) => ({
          total: p.estimatedMinutesWatched,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Average View Duration',
        average: true,
        data: mappedData?.map((p: any) => ({
          total: p.averageViewDuration,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Average View Percentage',
        average: true,
        data: mappedData?.map((p: any) => ({
          total: p.averageViewPercentage,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Subscribers Gained',
        data: mappedData?.map((p: any) => ({
          total: p.subscribersGained,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Subscribers Lost',
        data: mappedData?.map((p: any) => ({
          total: p.subscribersLost,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Likes',
        data: mappedData?.map((p: any) => ({
          total: p.likes,
          date: p.day,
        })),
      });

      return normalizeAnalytics(acc);
    } catch (err) {
      return [];
    }
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');

    try {
      const { client, youtube } = await clientAndYoutube();
      client.setCredentials({ access_token: accessToken });
      const youtubeClient = youtube(client);

      // Fetch video statistics
      const response = await youtubeClient.videos.list({
        part: ['statistics', 'snippet'],
        id: [postId],
      });

      const video = response.data.items?.[0];

      if (!video || !video.statistics) {
        return [];
      }

      const stats = video.statistics;
      const result: AnalyticsData[] = [];

      if (stats.viewCount !== undefined) {
        result.push({
          label: 'Views',
          percentageChange: null,
          data: [{ total: String(stats.viewCount), date: today }],
        });
      }

      if (stats.likeCount !== undefined) {
        result.push({
          label: 'Likes',
          percentageChange: null,
          data: [{ total: String(stats.likeCount), date: today }],
        });
      }

      if (stats.commentCount !== undefined) {
        result.push({
          label: 'Comments',
          percentageChange: null,
          data: [{ total: String(stats.commentCount), date: today }],
        });
      }

      // favoriteCount is deprecated and always 0, not an observed metric.
      // https://developers.google.com/youtube/v3/docs/videos#statistics.favoriteCount

      return normalizeAnalytics(result);
    } catch (err) {
      console.error('Error fetching YouTube post analytics:', err);
      return [];
    }
  }
}
