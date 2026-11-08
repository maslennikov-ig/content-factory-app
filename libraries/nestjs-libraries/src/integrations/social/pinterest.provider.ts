import { mediaUploadFetch, openMediaUploadBlobs } from './media-upload-sources';
import { normalizeAnalytics } from './analytics.data';
import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import { PinterestSettingsDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/pinterest.dto';
import { timer } from '@contentfactory/helpers/utils/timer';
import {
  BadBody,
  SocialAbstract,
  ValidityMedia,
} from '@contentfactory/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Tool } from '@contentfactory/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@contentfactory/nestjs-libraries/chat/rules.description.decorator';
import { hasExtension } from '@contentfactory/helpers/utils/has.extension';

@Rules(
  'Pinterest requires at least one media, if posting a video, you must have two attachment, one for video, one for the cover picture, When posting a video, there can be only one, if posting images, there can be maximum 5'
)
export class PinterestProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'pinterest';
  name = 'Pinterest';
  isBetweenSteps = false;
  scopes = [
    'boards:read',
    'boards:write',
    'pins:read',
    'pins:write',
    'user_accounts:read',
  ];
  override maxConcurrentJob = 3; // Pinterest has more lenient rate limits
  maxLength() {
    return 500;
  }

  dto = PinterestSettingsDto;

  override async checkValidity(
    [firstItem]: Array<ValidityMedia[]>
  ): Promise<string | true> {
    const isMp4 = firstItem?.find(
      (item) => (item?.path?.indexOf?.('mp4') ?? -1) > -1
    );
    const isPicture = firstItem?.find(
      (item) => (item?.path?.indexOf?.('mp4') ?? -1) === -1
    );
    if ((firstItem?.length ?? 0) === 0) {
      return 'Requires at least one media';
    }
    if ((firstItem?.length ?? 0) > 5) {
      return 'You can only have up to 5 media items';
    }
    if (isMp4 && firstItem?.length !== 2 && !isPicture) {
      return 'If posting a video you have to also include a cover image as second media';
    }
    if (isMp4 && (firstItem?.length ?? 0) > 2) {
      return 'If posting a video you can only have two media items';
    }

    if (
      (firstItem?.length ?? 0) > 1 &&
      firstItem?.every((p) => (p?.path?.indexOf?.('mp4') ?? -1) === -1)
    ) {
      const loadAll = await Promise.all(
        firstItem?.map((p) => this.getImageDimensions(p?.path)) ?? []
      );
      const checkAllTheSameWidthHeight = loadAll?.every((p, i, arr) => {
        return p?.width === arr?.[0]?.width && p?.height === arr?.[0]?.height;
      });
      if (!checkAllTheSameWidthHeight) {
        return 'Requires all images to have the same width and height';
      }
    }
    return true;
  }

  editor = 'normal' as const;

  public override handleErrors(body: string):
    | {
        type: 'refresh-token' | 'bad-body' | 'retry';
        value: string;
      }
    | undefined {
    if (body.indexOf('constraint: maxItems=5') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'You can upload a maximum of 5 images per post on Pinterest.',
      };
    }
    if (body.indexOf('Unable to reach the URL') > -1) {
      return {
        type: 'retry' as const,
        value: 'Pinterest was unable to reach the URL provided. Please check the link and try again.',
      }
    }
    if (body.indexOf(`does not match '^\\\\\\\\\\\\\\\\d+$'`) > -1) {
      return {
        type: 'bad-body' as const,
        value: 'The board ID must be a numeric string. Please check the board ID format.',
      }
    }
    if (body.indexOf('Board not found') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'The specified board was not found. Please check the board ID.',
      }
    }
    if (body.indexOf('cover_image_url or cover_image_content_type') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'When uploading a video, you must add also an image to be used as a cover image.',
      };
    }

    return undefined;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const { access_token, expires_in } = await (
      await fetch('https://api.pinterest.com/v5/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: this.scopes.join(','),
          redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/pinterest`,
        }),
      })
    ).json();

    const { id, profile_image, username } = await (
      await fetch('https://api.pinterest.com/v5/user_account', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: id,
      name: username,
      accessToken: access_token,
      refreshToken: refreshToken,
      expiresIn: expires_in,
      picture: profile_image || '',
      username,
    };
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: `https://www.pinterest.com/oauth/?client_id=${
        process.env.PINTEREST_CLIENT_ID
      }&redirect_uri=${encodeURIComponent(
        `${process.env.FRONTEND_URL}/integrations/social/pinterest`
      )}&response_type=code&scope=${encodeURIComponent(
        'boards:read,boards:write,pins:read,pins:write,user_accounts:read'
      )}&state=${state}`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh: string;
  }) {
    const { access_token, refresh_token, expires_in, scope } = await (
      await fetch('https://api.pinterest.com/v5/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: params.code,
          redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/pinterest`,
        }),
      })
    ).json();

    this.checkScopes(this.scopes, scope);

    const { id, profile_image, username } = await (
      await fetch('https://api.pinterest.com/v5/user_account', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: id,
      name: username,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      picture: profile_image,
      username,
    };
  }

  @Tool({ description: 'List of boards', dataSchema: [] })
  async boards(accessToken: string) {
    const { items } = await (
      await fetch('https://api.pinterest.com/v5/boards?page_size=250', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return (
      items?.map((item: any) => ({
        name: item.name,
        id: item.id,
      })) || []
    );
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<PinterestSettingsDto>[]
  ): Promise<PostResponse[]> {
    let mediaId = '';
    const findMp4 = postDetails?.[0]?.media?.find((p) =>
      hasExtension(p.path, 'mp4')
    );
    const picture = postDetails?.[0]?.media?.find(
      (p) => !hasExtension(p.path, 'mp4')
    );

    if (findMp4) {
      const { upload_url, media_id, upload_parameters } = await (
        await this.fetch('https://api.pinterest.com/v5/media', {
          method: 'POST',
          body: JSON.stringify({
            media_type: 'video',
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        })
      ).json();

      const opened = await openMediaUploadBlobs([{path: findMp4.path, type: 'video/mp4'}]);
      try {
      const formData = Object.keys(upload_parameters)
        .filter((f) => f)
        .reduce((acc, key) => {
          acc.append(key, upload_parameters[key]);
          return acc;
        }, new FormData());

      formData.append('file', opened.files[0].blob, findMp4.path.split('/').pop());
      const uploaded = await mediaUploadFetch(upload_url, {method:'POST',body:formData});
      await uploaded.body?.cancel();
      } finally { await opened.close(); }

      let statusCode = '';
      let attempts = 0;
      const maxAttempts = 18; // ~9 minutes at 30s interval
      while (statusCode !== 'succeeded') {
        if (attempts++ >= maxAttempts) {
          throw new BadBody(
            'pinterest',
            JSON.stringify({}),
            {} as any,
            'The file took too long to process, please try again'
          );
        }

        const mediafile = await (
          await this.fetch(
            'https://api.pinterest.com/v5/media/' + media_id,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
            '',
            0,
            true
          )
        ).json();

        if (mediafile.status === 'failed') {
          throw new BadBody(
            'pinterest',
            JSON.stringify({}),
            {} as any,
            'The file is corrupted and cannot be uploaded'
          );
        }

        await timer(30000);
        statusCode = mediafile.status;
      }

      mediaId = media_id;
    }

    const mapImages = postDetails?.[0]?.media?.map((m) => ({
      path: m.path,
    }));

    const { id: pId } = await (
      await this.fetch('https://api.pinterest.com/v5/pins', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(postDetails?.[0]?.settings.link
            ? { link: postDetails?.[0]?.settings.link }
            : {}),
          ...(postDetails?.[0]?.settings.title
            ? { title: postDetails?.[0]?.settings.title }
            : {}),
          description: postDetails?.[0]?.message,
          ...(postDetails?.[0]?.settings.dominant_color
            ? { dominant_color: postDetails?.[0]?.settings.dominant_color }
            : {}),
          board_id: postDetails?.[0]?.settings.board,
          media_source: mediaId
            ? {
                source_type: 'video_id',
                media_id: mediaId,
                cover_image_url: picture?.path,
              }
            : mapImages?.length === 1
            ? {
                source_type: 'image_url',
                url: mapImages?.[0]?.path,
              }
            : {
                source_type: 'multiple_image_urls',
                items: mapImages.map((m) => ({
                  url: m.path,
                })),
              },
        }),
      })
    ).json();

    return [
      {
        id: postDetails?.[0]?.id,
        postId: pId,
        releaseURL: `https://www.pinterest.com/pin/${pId}`,
        status: 'success',
      },
    ];
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const until = dayjs().format('YYYY-MM-DD');
    // Pinterest analytics only cover the last 90 days (89 for a UTC safety margin)
    const since = dayjs()
      .subtract(Math.min(date, 89), 'day')
      .format('YYYY-MM-DD');

    const {
      all: { daily_metrics },
    } = await (
      await fetch(
        `https://api.pinterest.com/v5/user_account/analytics?start_date=${since}&end_date=${until}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
    ).json();

    const metrics = [
      ['Pin click rate', 'PIN_CLICK_RATE'],
      ['Impressions', 'IMPRESSION'],
      ['Pin Clicks', 'PIN_CLICK'],
      ['Engagement', 'ENGAGEMENT'],
      ['Saves', 'SAVE'],
    ];
    return normalizeAnalytics(metrics.map(([label, field]) => ({
      label,
      percentageChange: null,
      data: (daily_metrics || []).map((item: any) => ({
        date: item.date,
        total: item.metrics?.[field],
      })),
    })));
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');
    // Pinterest only serves pin analytics for the last 90 days (89 for a UTC safety margin)
    const since = dayjs().subtract(89, 'day').format('YYYY-MM-DD');

    try {
      // Fetch pin analytics from Pinterest API
      const response = await fetch(
        `https://api.pinterest.com/v5/pins/${postId}/analytics?start_date=${since}&end_date=${today}&metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!data || !data.all) {
        return [];
      }

      const result: AnalyticsData[] = [];
      const metrics = data.all;

      if (metrics.summary_metrics) {
        const summaryMetrics = metrics.summary_metrics;

        if (summaryMetrics.IMPRESSION !== undefined) {
          result.push({
            label: 'Impressions',
            percentageChange: null,
            data: [{ total: String(summaryMetrics.IMPRESSION), date: today }],
          });
        }

        if (summaryMetrics.PIN_CLICK !== undefined) {
          result.push({
            label: 'Pin Clicks',
            percentageChange: null,
            data: [{ total: String(summaryMetrics.PIN_CLICK), date: today }],
          });
        }

        if (summaryMetrics.OUTBOUND_CLICK !== undefined) {
          result.push({
            label: 'Outbound Clicks',
            percentageChange: null,
            data: [
              { total: String(summaryMetrics.OUTBOUND_CLICK), date: today },
            ],
          });
        }

        if (summaryMetrics.SAVE !== undefined) {
          result.push({
            label: 'Saves',
            percentageChange: null,
            data: [{ total: String(summaryMetrics.SAVE), date: today }],
          });
        }
      }

      return normalizeAnalytics(result);
    } catch (err) {
      console.error('Error fetching Pinterest post analytics:', err);
      return [];
    }
  }
}
