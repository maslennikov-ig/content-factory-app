import { normalizeAnalytics, completeAnalyticsSum } from './analytics.data';
import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';
import dayjs from 'dayjs';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
  ValidityMedia,
} from '@contentfactory/nestjs-libraries/integrations/social.abstract';
import { TikTokDto, validTikTokDisclosure, TIKTOK_DISCLOSURE_MESSAGE, type TikTokCreatorInfo } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { timer } from '@contentfactory/helpers/utils/timer';
import { hasExtension } from '@contentfactory/helpers/utils/has.extension';
import { createReadStream, statSync } from 'fs';
import { Integration } from '@prisma/client';
import { Rules } from '@contentfactory/nestjs-libraries/chat/rules.description.decorator';
import { inspectTikTokOwnedVideo } from './tiktok-video-inspection';

@Rules(
  [
    'TikTok can have one video or one picture or multiple pictures, it cannot be without an attachment.',
    'content_posting_method=DIRECT_POST publishes the post to the account. content_posting_method=UPLOAD does NOT publish: it only sends the media to the user inbox of the TikTok app, where the user must manually complete and publish it within 24 hours or it is discarded. Use DIRECT_POST unless the user explicitly asks to review or edit the post inside the TikTok app first.',
    'With content_posting_method=UPLOAD, TikTok ignores every setting except the title / post content. Never tell the user that video_made_with_ai, privacy_level, duet, stitch, comment, autoAddMusic, brand_content_toggle or brand_organic_toggle will be applied in UPLOAD mode - they are silently discarded. If the user asks for any of those settings, tell them it requires DIRECT_POST.',
    'video_made_with_ai, duet and stitch apply to video posts only. TikTok has no equivalent field for photo posts, so those settings are discarded when the attachment is a picture.',
    'DIRECT_POST requires an explicit privacy_level selected by the user from the current creator account options. Never assume public visibility or choose a default; ask for the missing selection. UPLOAD remains a manual inbox draft and ignores privacy_level.',
    'For DIRECT_POST show Music Usage Confirmation before the per-item publish approval; branded content also requires the Branded Content Policy declaration. Branded content cannot be SELF_ONLY. Never change a selected privacy to public to make a post pass.',
  ].join(' ')
)
export class TiktokProvider extends SocialAbstract implements SocialProvider {
  identifier = 'tiktok';
  name = 'Tiktok';
  isBetweenSteps = false;
  convertToJPEG = true;
  scopes = [
    'video.list',
    'user.info.basic',
    'video.publish',
    'video.upload',
    'user.info.profile',
    'user.info.stats',
  ];
  override maxConcurrentJob = 10000;
  dto = TikTokDto;
  editor = 'normal' as const;
  maxLength() {
    return 2000;
  }

  override async checkValidity(
    items: Array<ValidityMedia[]>
  ): Promise<string | true> {
    const [firstItems] = items ?? [];
    if ((firstItems?.length ?? 0) === 0) {
      return 'No video / images selected';
    }
    if (
      (firstItems?.length ?? 0) > 1 &&
      firstItems?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) > -1)
    ) {
      return 'Only pictures are supported when selecting multiple items';
    } else if (
      firstItems?.length !== 1 &&
      (firstItems?.[0]?.path?.indexOf?.('mp4') ?? -1) > -1
    ) {
      return 'You need one media';
    }
    return true;
  }

  override handleErrors(body: string):
    | {
        type: 'refresh-token' | 'bad-body';
        value: string;
      }
    | undefined {
    // Authentication/Authorization errors - require re-authentication
    if (body.indexOf('access_token_invalid') > -1) {
      return {
        type: 'refresh-token' as const,
        value:
          'Access token invalid, please re-authenticate your TikTok account',
      };
    }

    if (body.indexOf('scope_not_authorized') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Missing required permissions, please re-authenticate with all scopes',
      };
    }

    if (body.indexOf('scope_permission_missed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Additional permissions required, please re-authenticate',
      };
    }

    // Rate limiting errors
    if (body.indexOf('rate_limit_exceeded') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok API rate limit exceeded, please try again later',
      };
    }

    if (body.indexOf('file_format_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'File format is invalid, please check video specifications',
      };
    }

    if (body.indexOf('app_version_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'In order to use the TikTok upload feature, you have to update your app to the latest version',
      };
    }

    if (body.indexOf('duration_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Video duration is invalid, please check video specifications',
      };
    }

    if (body.indexOf('frame_rate_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Video frame rate is invalid, please check video specifications',
      };
    }

    if (body.indexOf('video_pull_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Failed to pull video from URL, please check the URL',
      };
    }

    if (body.indexOf('photo_pull_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Failed to pull photo from URL, please check the URL',
      };
    }

    if (body.indexOf('spam_risk_user_banned_from_posting') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Account banned from posting, please check TikTok account status',
      };
    }

    if (body.indexOf('spam_risk_text') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok detected potential spam in the post text',
      };
    }

    if (body.indexOf('spam_risk_too_many_posts') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'TikTok says your daily post limit reached, please try again tomorrow',
      };
    }

    if (body.indexOf('spam_risk_too_many_pending_share') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'TikTok limits pending posts to 5 within any 24-hour period. Please check your TikTok inbox in the TikTok mobile app and try again after 24 hours.',
      };
    }

    if (body.indexOf('spam_risk_user_banned_from_posting') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Account banned from posting, please check TikTok account status',
      };
    }

    if (body.indexOf('spam_risk') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok detected potential spam',
      };
    }

    if (body.indexOf('reached_active_user_cap') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Daily active user quota reached, please try again later',
      };
    }

    if (
      body.indexOf('unaudited_client_can_only_post_to_private_accounts') > -1
    ) {
      return {
        type: 'bad-body' as const,
        value: 'App not approved for public posting, contact support',
      };
    }

    if (body.indexOf('url_ownership_unverified') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'You have to upload the picture/video to Content Factory when sending a URL',
      };
    }

    if (body.indexOf('privacy_level_option_mismatch') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Privacy level mismatch, please check privacy settings',
      };
    }

    // Content/Format validation errors
    if (body.indexOf('invalid_file_upload') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid file format or specifications not met',
      };
    }

    if (body.indexOf('invalid_params') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid request parameters, please check content format',
      };
    }

    // Server errors
    if (body.indexOf('internal') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'There is a problem with TikTok servers, please try again later',
      };
    }

    // Generic TikTok API errors
    if (body.indexOf('picture_size_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Video must be at least 720p, Picture must no exceed 1080p',
      };
    }

    if (body.indexOf('TikTok API error') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok API error, please try again',
      };
    }

    // Fall back to parent class error handling
    return undefined;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const value = {
      client_key: process.env.TIKTOK_CLIENT_ID!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };

    const { access_token, refresh_token, ...all } = await (
      await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: new URLSearchParams(value).toString(),
      })
    ).json();

    const {
      data: {
        user: { avatar_url, display_name, open_id, username },
      },
    } = await (
      await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,union_id,username',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      )
    ).json();

    return {
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      accessToken: access_token,
      id: open_id.replace(/-/g, ''),
      name: display_name,
      picture: avatar_url || '',
      username: username,
    };
  }

  async generateAuthUrl() {
    const state = Math.random().toString(36).substring(2);

    return {
      url:
        'https://www.tiktok.com/v2/auth/authorize/' +
        `?client_key=${process.env.TIKTOK_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(
          `${process?.env?.FRONTEND_URL}/integrations/social/tiktok`
        )}` +
        `&state=${state}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(this.scopes.join(','))}`,
      codeVerifier: state,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const value = {
      client_key: process.env.TIKTOK_CLIENT_ID!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code: params.code,
      grant_type: 'authorization_code',
      code_verifier: params.codeVerifier,
      redirect_uri: `${process?.env?.FRONTEND_URL}/integrations/social/tiktok`,
    };

    const { access_token, refresh_token, scope } = await (
      await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: new URLSearchParams(value).toString(),
      })
    ).json();

    this.checkScopes(this.scopes, scope);

    const {
      data: {
        user: { avatar_url, display_name, open_id, username },
      },
    } = await (
      await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,union_id,username',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      )
    ).json();

    return {
      id: open_id.replace(/-/g, ''),
      name: display_name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      picture: avatar_url,
      username: username,
    };
  }

  async maxVideoLength(accessToken: string) {
    const {
      data: { max_video_post_duration_sec },
    } = await (
      await fetch(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    return {
      maxDurationSeconds: max_video_post_duration_sec,
    };
  }

  /** Read-only, account-scoped source for the existing editor and pre-upload checks. */
  async creatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    try {
      const response = await this.fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: {'Content-Type': 'application/json; charset=UTF-8', Authorization: `Bearer ${accessToken}`},
      });
      const value = await response.json();
      const data = value?.data;
      const options = data?.privacy_level_options;
      if (value?.error?.code !== 'ok' || !Array.isArray(options) || !options.length || options.length > 4 ||
        new Set(options).size !== options.length || options.some(option => !['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].includes(option)) ||
        typeof data.creator_nickname !== 'string' || !data.creator_nickname || data.creator_nickname.length > 512 ||
        !['comment_disabled', 'duet_disabled', 'stitch_disabled'].every(key => typeof data[key] === 'boolean') ||
        !Number.isSafeInteger(data.max_video_post_duration_sec) || data.max_video_post_duration_sec <= 0) throw new Error();
      return {creatorNickname: data.creator_nickname, privacyLevelOptions: options, commentDisabled: data.comment_disabled,
        duetDisabled: data.duet_disabled, stitchDisabled: data.stitch_disabled, maxVideoDurationSeconds: data.max_video_post_duration_sec};
    } catch (error) {
      if (error instanceof RefreshToken) throw error;
      throw new BadBody('tiktok-creator-info-unavailable', '{}', '{}',
        'TikTok account settings are unavailable. Try again or reconnect the channel.');
    }
  }

  private async uploadedVideoSuccess(
    id: string,
    publishId: string,
    accessToken: string
  ): Promise<{ url: string; id: string }> {
    // eslint-disable-next-line no-constant-condition
    for (const i of Array(27).keys()) {
      // ~9 minutes at 20s interval
      const post = await (
        await this.fetch(
          'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              publish_id: publishId,
            }),
          },
          '',
          0,
          true
        )
      ).json();

      const { status, publicaly_available_post_id } = post.data;

      if (status === 'SEND_TO_USER_INBOX') {
        return {
          url: 'https://www.tiktok.com/messages?lang=en',
          id: 'missing',
        };
      }

      if (status === 'PUBLISH_COMPLETE') {
        return {
          url: !publicaly_available_post_id
            ? `https://www.tiktok.com/@${id}`
            : `https://www.tiktok.com/@${id}/video/` +
              publicaly_available_post_id,
          id: !publicaly_available_post_id
            ? publishId
            : publicaly_available_post_id?.[0],
        };
      }

      if (status === 'FAILED') {
        const handleError = this.handleErrors(JSON.stringify(post));
        throw new BadBody(
          'titok-error-upload',
          JSON.stringify(post),
          Buffer.from(JSON.stringify(post)),
          handleError?.value || ''
        );
      }

      await timer(20000);
    }

    throw new BadBody(
      'titok-error-upload',
      JSON.stringify({}),
      Buffer.from(JSON.stringify({})),
      'TikTok refused to publish your post'
    );
  }

  // UPLOAD does not publish - it only drops the media into the user's TikTok
  // inbox - so only an explicit UPLOAD selects it. A missing value (drafts, or
  // any caller that skipped the setting) publishes instead of silently landing
  // in the inbox.
  private contentPostingMethod(
    firstPost: PostDetails<TikTokDto>
  ): TikTokDto['content_posting_method'] {
    return firstPost?.settings?.content_posting_method === 'UPLOAD'
      ? 'UPLOAD'
      : 'DIRECT_POST';
  }

  private postingMethod(
    method: TikTokDto['content_posting_method'],
    isPhoto: boolean
  ): string {
    switch (method) {
      case 'UPLOAD':
        return isPhoto ? '/content/init/' : '/inbox/video/init/';
      case 'DIRECT_POST':
      default:
        return isPhoto ? '/content/init/' : '/video/init/';
    }
  }

  private buildTikokPostInfoBody(firstPost: PostDetails<TikTokDto>) {
    const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');
    const method = this.contentPostingMethod(firstPost);

    if (method === 'DIRECT_POST') {
      if (!validTikTokDisclosure({...firstPost.settings,
        brand_content_toggle: this.assetBoolean(firstPost.settings?.brand_content_toggle),
        brand_organic_toggle: this.assetBoolean(firstPost.settings?.brand_organic_toggle)})) {
        throw new BadBody('tiktok-disclosure-invalid', '{}', '{}', TIKTOK_DISCLOSURE_MESSAGE);
      }
      const privacy = firstPost.settings?.privacy_level;
      if (!['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].includes(privacy)) {
        throw new BadBody('tiktok-privacy-required', '{}', '{}',
          'TikTok privacy must be selected from the current account options before publishing.');
      }
      return {
        method,
        post_info: {
          ...(isPhoto && firstPost.settings.title
            ? { title: firstPost.settings.title.slice(0, 90) }
            : {}),
          ...(!isPhoto && firstPost.message
            ? { title: firstPost.message }
            : {}),
          ...(isPhoto ? { description: firstPost.message } : {}),
          privacy_level: privacy,
          ...(isPhoto
            ? {}
            : { disable_duet: !this.assetBoolean(firstPost.settings.duet) }),
          disable_comment: !this.assetBoolean(firstPost.settings.comment),
          ...(isPhoto
            ? {}
            : {
                disable_stitch: !this.assetBoolean(firstPost.settings.stitch),
              }),
          ...(isPhoto
            ? {}
            : {
                is_aigc: this.assetBoolean(
                  firstPost.settings.video_made_with_ai
                ),
              }),
          brand_content_toggle: this.assetBoolean(
            firstPost.settings.brand_content_toggle
          ),
          brand_organic_toggle: this.assetBoolean(
            firstPost.settings.brand_organic_toggle
          ),
          ...(isPhoto
            ? {
                auto_add_music: firstPost.settings.autoAddMusic === 'yes',
              }
            : {}),
        },
      };
    }

    return {
      method,
      post_info: {
        ...(isPhoto && firstPost.settings.title
          ? { title: firstPost.settings.title }
          : {}),
        ...(!isPhoto && firstPost.message ? { title: firstPost.message } : {}),
        ...(isPhoto ? { description: firstPost.message } : {}),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // OLD PULL_FROM_URL IMPLEMENTATION (kept for when the TikTok PULL bug is fixed)
  // ---------------------------------------------------------------------------
  // private buildTikokSourceInfoBody(firstPost: PostDetails<TikTokDto>) {
  //   const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');
  //
  //   if (isPhoto) {
  //     return {
  //       post_mode:
  //         firstPost?.settings?.content_posting_method === 'DIRECT_POST'
  //           ? 'DIRECT_POST'
  //           : 'MEDIA_UPLOAD',
  //       media_type: 'PHOTO',
  //       source_info: {
  //         source: 'PULL_FROM_URL',
  //         photo_cover_index: 0,
  //         photo_images: firstPost.media?.map((p) => p.path),
  //       },
  //     };
  //   }
  //
  //   return {
  //     source_info: {
  //       source: 'PULL_FROM_URL',
  //       video_url: firstPost?.media?.[0]?.path!,
  //       ...(firstPost?.media?.[0]?.thumbnailTimestamp!
  //         ? {
  //             video_cover_timestamp_ms:
  //               firstPost?.media?.[0]?.thumbnailTimestamp!,
  //           }
  //         : {}),
  //     },
  //   };
  // }
  //
  // async post(
  //   id: string,
  //   accessToken: string,
  //   postDetails: PostDetails<TikTokDto>[],
  //   integration: Integration
  // ): Promise<PostResponse[]> {
  //   const [firstPost] = postDetails;
  //   const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');
  //
  //   console.log({
  //     ...this.buildTikokPostInfoBody(firstPost),
  //     ...this.buildTikokSourceInfoBody(firstPost),
  //   });
  //   const {
  //     data: { publish_id },
  //   } = await (
  //     await this.fetch(
  //       `https://open.tiktokapis.com/v2/post/publish${this.postingMethod(
  //         firstPost.settings.content_posting_method,
  //         !hasExtension(firstPost?.media?.[0]?.path, 'mp4')
  //       )}`,
  //       {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json; charset=UTF-8',
  //           Authorization: `Bearer ${accessToken}`,
  //         },
  //         body: JSON.stringify({
  //           ...this.buildTikokPostInfoBody(firstPost),
  //           ...this.buildTikokSourceInfoBody(firstPost),
  //         }),
  //       }
  //     )
  //   ).json();
  //
  //   const { url, id: videoId } = await this.uploadedVideoSuccess(
  //     integration.profile!,
  //     publish_id,
  //     accessToken
  //   );
  //
  //   return [
  //     {
  //       id: firstPost.id,
  //       releaseURL: url,
  //       postId: String(videoId),
  //       status: 'success',
  //     },
  //   ];
  // }

  // ---------------------------------------------------------------------------
  // NEW FILE_UPLOAD IMPLEMENTATION (no PULL_FROM_URL for videos)
  // ---------------------------------------------------------------------------
  // TikTok video chunk constraints: a chunk must be between 5MB and 64MB.
  // When the whole file fits in a single chunk (<= 64MB) we upload it in one
  // request; otherwise we split it into 10MB chunks (the final chunk carries
  // the remainder, which TikTok allows to exceed chunk_size).
  private static readonly TIKTOK_MAX_SINGLE_CHUNK = 64 * 1024 * 1024;
  private static readonly TIKTOK_CHUNK_SIZE = 10 * 1024 * 1024;

  private tiktokChunkPlan(videoSize: number) {
    if (videoSize <= TiktokProvider.TIKTOK_MAX_SINGLE_CHUNK) {
      return { chunkSize: videoSize, totalChunkCount: 1 };
    }

    const chunkSize = TiktokProvider.TIKTOK_CHUNK_SIZE;
    return {
      chunkSize,
      totalChunkCount: Math.floor(videoSize / chunkSize),
    };
  }

  // Resolves the total byte size of the media without loading it into memory:
  // a HEAD request for remote URLs, statSync for local files.
  private async tiktokMediaSize(path: string): Promise<number> {
    if (path.indexOf('http') === 0) {
      const head = await fetch(path, { method: 'HEAD' });
      const length = head.headers.get('content-length');
      if (!length) {
        throw new BadBody(
          'tiktok-error-upload',
          '{}',
          Buffer.from('{}'),
          'Could not determine the video size for TikTok upload'
        );
      }
      return Number(length);
    }

    return statSync(path).size;
  }

  private inspectVideoForTikTok(path: string) { return inspectTikTokOwnedVideo(path); }

  // Returns a streaming body for the [start, end] byte range of the media so we
  // never hold the whole file in memory: a ranged GET for remote URLs, a ranged
  // read stream for local files.
  private async tiktokChunkStream(path: string, start: number, end: number) {
    if (path.indexOf('http') === 0) {
      const response = await fetch(path, {
        headers: { Range: `bytes=${start}-${end}` },
      });
      return response.body;
    }

    return createReadStream(path, { start, end });
  }

  // Streams the video bytes to the upload_url returned by the init call.
  // We use the global fetch (not this.fetch) because chunked uploads answer
  // with 206 (Partial Content), which this.fetch would treat as an error.
  private async uploadTikTokVideoBytes(
    uploadUrl: string,
    path: string,
    videoSize: number,
    contentType: string
  ) {
    const { chunkSize, totalChunkCount } = this.tiktokChunkPlan(videoSize);

    for (let i = 0; i < totalChunkCount; i++) {
      const start = i * chunkSize;
      const end =
        i === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1;
      const contentLength = end - start + 1;

      const body = await this.tiktokChunkStream(path, start, end);

      const upload = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(contentLength),
          'Content-Range': `bytes ${start}-${end}/${videoSize}`,
        },
        body,
        // Required by undici when streaming a request body.
        duplex: 'half',
      } as any);

      if (
        upload.status !== 200 &&
        upload.status !== 201 &&
        upload.status !== 206
      ) {
        const text = await upload.text().catch(() => '{}');
        const handleError = this.handleErrors(text);
        throw new BadBody(
          'tiktok-error-upload',
          text,
          Buffer.from(text),
          handleError?.value || 'Failed to upload the video to TikTok'
        );
      }
    }
  }

  private buildTikokSourceInfoBody(
    firstPost: PostDetails<TikTokDto>,
    videoSize?: number
  ) {
    const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');

    // TikTok photo posts only support PULL_FROM_URL, there is no FILE_UPLOAD
    // path for photos, so this branch keeps pulling from the URL.
    if (isPhoto) {
      return {
        post_mode:
          this.contentPostingMethod(firstPost) === 'DIRECT_POST'
            ? 'DIRECT_POST'
            : 'MEDIA_UPLOAD',
        media_type: 'PHOTO',
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: 0,
          photo_images: firstPost.media?.map((p) => p.path),
        },
      };
    }

    const { chunkSize, totalChunkCount } = this.tiktokChunkPlan(videoSize || 0);

    return {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<TikTokDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const original = postDetails[0];
    const firstPost = {...original, settings: {...original.settings}, media: original.media?.map(media => ({...media}))};
    // Bind validation and upload to the same media and publication choices.
    const postInfo = this.buildTikokPostInfoBody(firstPost);
    const method = postInfo.method;
    const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');
    let creator: TikTokCreatorInfo | undefined;
    if (postInfo.method === 'DIRECT_POST') {
      creator = await this.creatorInfo(accessToken);
      const approvedInfo = postInfo.post_info;
      if (!creator.privacyLevelOptions.includes(approvedInfo.privacy_level)) {
        throw new BadBody('tiktok-privacy-required', '{}', '{}',
          'TikTok privacy must be selected from the current account options before publishing.');
      }
      if ((approvedInfo.disable_comment === false && creator.commentDisabled) ||
        (!isPhoto && ((approvedInfo.disable_duet === false && creator.duetDisabled) ||
          (approvedInfo.disable_stitch === false && creator.stitchDisabled)))) {
        throw new BadBody('tiktok-interactions-changed', '{}', '{}',
          'TikTok interaction settings changed. Review comments, Duet and Stitch before publishing.');
      }
    }
    const videoPath = firstPost?.media?.[0]?.path!;

    let videoSize: number | undefined;
    if (!isPhoto) {
      if (creator) {
        let inspected;
        try {inspected = await this.inspectVideoForTikTok(videoPath);}
        catch {throw new BadBody('tiktok-video-inspection-unavailable', '{}', '{}',
          'TikTok video duration is unavailable or exceeds the current account limit. Check the video before publishing.');}
        if (inspected.durationSeconds > creator.maxVideoDurationSeconds) throw new BadBody('tiktok-video-too-long', '{}', '{}',
          'TikTok video duration is unavailable or exceeds the current account limit. Check the video before publishing.');
        videoSize = inspected.size;
      } else videoSize = await this.tiktokMediaSize(videoPath);
    }

    const {
      data: { publish_id, upload_url },
    } = await (
      await this.fetch(
        `https://open.tiktokapis.com/v2/post/publish${this.postingMethod(
          method,
          isPhoto
        )}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            post_info: postInfo.post_info,
            ...this.buildTikokSourceInfoBody(firstPost, videoSize),
          }),
        }
      )
    ).json();

    // Videos: stream the bytes to the upload_url returned by the init call.
    if (!isPhoto && upload_url && videoSize) {
      await this.uploadTikTokVideoBytes(
        upload_url,
        videoPath,
        videoSize,
        'video/mp4'
      );
    }

    const { url, id: videoId } = await this.uploadedVideoSuccess(
      integration.profile!,
      publish_id,
      accessToken
    );

    return [
      {
        id: firstPost.id,
        releaseURL: url,
        postId: String(videoId),
        status: 'success',
      },
    ];
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');

    try {
      // Get user stats (follower_count, following_count, likes_count, video_count)
      const userStatsResponse = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count,likes_count,video_count',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const userStatsData = await userStatsResponse.json();
      const userStats = userStatsData?.data?.user;

      const result: AnalyticsData[] = [];

      if (userStats) {
        if (userStats.follower_count !== undefined) {
          result.push({
            label: 'Followers',
            percentageChange: null,
            data: [{ total: String(userStats.follower_count), date: today }],
          });
        }

        if (userStats.following_count !== undefined) {
          result.push({
            label: 'Following',
            percentageChange: null,
            data: [{ total: String(userStats.following_count), date: today }],
          });
        }

        if (userStats.likes_count !== undefined) {
          result.push({
            label: 'Total Likes',
            percentageChange: null,
            data: [{ total: String(userStats.likes_count), date: today }],
          });
        }

        if (userStats.video_count !== undefined) {
          result.push({
            label: 'Videos',
            percentageChange: null,
            data: [{ total: String(userStats.video_count), date: today }],
          });
        }
      }

      // Get recent videos and aggregate their stats
      const videoListResponse = await fetch(
        'https://open.tiktokapis.com/v2/video/list/?fields=id',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ max_count: 20 }),
        }
      );

      const videoListData = await videoListResponse.json();
      const videos = videoListData?.data?.videos;

      if (videos && videos.length > 0) {
        const videoIds = videos.map((v: { id: string }) => v.id);

        // Query video details to get engagement metrics
        const videoQueryResponse = await fetch(
          'https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              filters: { video_ids: videoIds },
            }),
          }
        );

        const videoQueryData = await videoQueryResponse.json();
        const videoDetails = videoQueryData?.data?.videos;

        if (videoDetails && videoDetails.length > 0) {
          // These are lifetime counters of the latest returned videos, not
          // a time series or engagement earned within the selected window.
          const metrics = [
            ['Recent Views', 'view_count'],
            ['Recent Likes', 'like_count'],
            ['Recent Comments', 'comment_count'],
            ['Recent Shares', 'share_count'],
          ];
          for (const [label, field] of metrics) {
            const total = videoDetails.length === videoIds.length
              ? completeAnalyticsSum(videoDetails.map((video: any) => video[field]))
              : null;
            if (total === null) continue;
            result.push({
              label,
              percentageChange: null,
              data: [{ total: String(total), date: today }],
            });
          }
        }
      }

      return normalizeAnalytics(result);
    } catch (err) {
      console.error('Error fetching TikTok analytics:', err);
      return [];
    }
  }

  async missing(
    id: string,
    accessToken: string
  ): Promise<{ id: string; url: string }[]> {
    try {
      const videoListResponse = await this.fetch(
        'https://open.tiktokapis.com/v2/video/list/?fields=id,cover_image_url,title',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ max_count: 20 }),
        }
      );

      const videoListData = await videoListResponse.json();
      const videos = videoListData?.data?.videos;

      if (!videos || videos.length === 0) {
        return [];
      }

      return videos.map((v: { id: string; cover_image_url: string }) => ({
        id: String(v.id),
        url: v.cover_image_url,
      }));
    } catch (err) {
      console.error('Error fetching TikTok missing content:', err);
      return [];
    }
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    fromDate: number
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');

    if (postId.indexOf('v_pub_url') > -1) {
      const post = await (
        await fetch(
          'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              publish_id: postId,
            }),
          }
        )
      ).json();

      if (!post?.data?.publicaly_available_post_id?.[0]) {
        return [];
      }

      postId = post.data.publicaly_available_post_id[0];
    }

    try {
      // Query video details using the video ID
      const response = await fetch(
        'https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            filters: {
              video_ids: [postId],
            },
          }),
        }
      );

      const data = await response.json();
      const video = data?.data?.videos?.[0];

      if (!video) {
        return [];
      }

      const result: AnalyticsData[] = [];

      if (video.view_count !== undefined) {
        result.push({
          label: 'Views',
          percentageChange: null,
          data: [{ total: String(video.view_count), date: today }],
        });
      }

      if (video.like_count !== undefined) {
        result.push({
          label: 'Likes',
          percentageChange: null,
          data: [{ total: String(video.like_count), date: today }],
        });
      }

      if (video.comment_count !== undefined) {
        result.push({
          label: 'Comments',
          percentageChange: null,
          data: [{ total: String(video.comment_count), date: today }],
        });
      }

      if (video.share_count !== undefined) {
        result.push({
          label: 'Shares',
          percentageChange: null,
          data: [{ total: String(video.share_count), date: today }],
        });
      }

      return normalizeAnalytics(result);
    } catch (err) {
      console.error('Error fetching TikTok post analytics:', err);
      return [];
    }
  }
}
