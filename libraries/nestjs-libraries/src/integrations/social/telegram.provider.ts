import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import { redactSensitive } from '@contentfactory/nestjs-libraries/services/redact.sensitive';
import dayjs from 'dayjs';
import { SocialAbstract } from '@contentfactory/nestjs-libraries/integrations/social.abstract';
//@ts-ignore
import mime from 'mime';
import TelegramBot from 'node-telegram-bot-api';
import { Integration } from '@prisma/client';
import striptags from 'striptags';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN!);
// Added to support local storage posting
const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5000';
const mediaStorage = process.env.STORAGE_PROVIDER || 'local';
const uploadDirectory = process.env.UPLOAD_DIRECTORY || '';
// LocalStorage always publishes under this prefix, see local.storage.ts.
const publicUploadPrefix = '/uploads/';

export const telegramReleaseUrl = (
  internalId: string,
  accessToken: string,
  messageId: number
) => {
  const channelPath =
    internalId === 'undefined' || /^-100\d+$/.test(internalId)
      ? `c/${accessToken.replace(/^-100/, '')}`
      : internalId;
  return `https://t.me/${channelPath}/${messageId}`;
};

export class TelegramProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Telegram has moderate bot API limits
  identifier = 'telegram';
  name = 'Telegram';
  isBetweenSteps = false;
  isWeb3 = true;
  scopes = [] as string[];
  editor = 'html' as const;
  maxLength() {
    return 4096;
  }
  /**
   * A single attachment carries the text as a caption, and Telegram caps a
   * caption at a quarter of a message. Callers that know a picture is coming
   * ask for this instead of guessing from `maxLength`.
   */
  maxCaptionLength() {
    return 1024;
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeId(17);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const chat = await telegramBot.getChat(params.code);

    console.log(JSON.stringify(chat));
    if (!chat?.id) {
      return 'No chat found';
    }

    const photo = !chat?.photo?.big_file_id
      ? ''
      : await telegramBot.getFileLink(chat.photo.big_file_id);

    // Modified id to work with chat.username (public groups/channels) or chat.id (private groups/channels) when chat.username is not available
    return {
      id: String(chat.username ? chat.username : chat.id),
      name: chat.title!,
      accessToken: String(chat.id),
      refreshToken: '',
      expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
      picture: photo || '',
      username: chat.username!,
    };
  }

  /**
   * Subscriber count for the connected channel.
   *
   * This is everything the Bot API offers about an audience, and it offers
   * only the current value — there is no history endpoint, so the series is a
   * single point until we start storing our own snapshots. Per-post numbers
   * (views, forwards) are not in the Bot API at all; they live in MTProto,
   * which needs a real user session rather than a bot, so they are out of
   * scope by design. Reaction counts are officially available, but only as
   * `message_reaction_count` updates, which requires a persistent update
   * consumer this instance does not run yet.
   */
  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    try {
      const [{ value: total }] = await this.analyticsSnapshot(id, accessToken);

      return [
        {
          label: 'Subscribers',
          percentageChange: 0,
          data: [{ total: String(total), date: dayjs().format('YYYY-MM-DD') }],
        },
      ];
    } catch (err) {
      // A channel the bot was removed from should read as "no data", not as a
      // broken analytics page for every other channel in the list.
      // The thrown error holds the request URL, and the request URL holds the
      // bot token.
      console.error('Telegram analytics failed:', redactSensitive(err));
      return [];
    }
  }

  async analyticsSnapshot(_id: string, accessToken: string) {
    const total = await telegramBot.getChatMemberCount(accessToken);
    return [{ metric: 'Subscribers', value: total }];
  }

  /**
   * Telegram can only fetch media from a URL it can reach itself, which is
   * never true for a locally served instance and is not something we want to
   * depend on once the product moves to its own domain either: the upload path
   * may then sit behind a CDN, a private network or basic auth.
   *
   * Upstream worked around this by stripping FRONTEND_URL and handing the bot
   * API `/uploads/<file>`, which node-telegram-bot-api reads as an on-disk
   * path. That only resolves when UPLOAD_DIRECTORY happens to be exactly
   * `/uploads`, as in the upstream Docker image. Resolve the real path from
   * UPLOAD_DIRECTORY instead and let the bot API upload the bytes; when the
   * file is not ours to read, keep the original absolute URL so a publicly
   * reachable deployment can still let Telegram fetch it.
   */
  private resolveLocalUpload(url: string): string | null {
    if (mediaStorage !== 'local' || !uploadDirectory) {
      return null;
    }

    if (!url.startsWith(frontendURL)) {
      return null;
    }

    const publicPath = url.slice(frontendURL.length);
    if (!publicPath.startsWith(publicUploadPrefix)) {
      return null;
    }

    // resolve() collapses any `..` segments, so a crafted media path cannot
    // reach outside the upload directory.
    const base = resolve(uploadDirectory);
    const filePath = resolve(base, publicPath.slice(publicUploadPrefix.length));
    if (filePath !== base && !filePath.startsWith(base + sep)) {
      return null;
    }

    return existsSync(filePath) ? filePath : null;
  }

  private processMedia(mediaFiles: PostDetails['media']) {
    return (mediaFiles || []).map((media) => {
      const mediaUrl = this.resolveLocalUpload(media.path) || media.path;
      //get mime type to pass contentType to telegram api.
      //some photos and videos might not pass telegram api restrictions, so they are sent as documents instead of returning errors
      const mimeType = mime.getType(mediaUrl); // Detect MIME type
      let mediaType: 'photo' | 'video' | 'document';

      if (mimeType?.startsWith('image/')) {
        mediaType = 'photo';
      } else if (mimeType?.startsWith('video/')) {
        mediaType = 'video';
      } else {
        mediaType = 'document';
      }

      return {
        type: mediaType,
        media: mediaUrl,
        fileOptions: {
          filename: media.path.split('/').pop(),
          contentType: mimeType || 'application/octet-stream',
        },
      };
    });
  }

  private async sendMessage(
    accessToken: string,
    message: PostDetails,
    replyToMessageId?: number
  ): Promise<number | null> {
    let messageId: number | null = null;
    const mediaFiles = message.media || [];
    const text = striptags(message.message || '', ['u', 'strong', 'p'])
      .replace(/<strong>/g, '<b>')
      .replace(/<\/strong>/g, '</b>')
      .replace(/<p>(.*?)<\/p>/g, '$1\n');

    console.log(text);
    const processedMedia = this.processMedia(mediaFiles);

    // if there's no media, bot sends a text message only
    if (processedMedia.length === 0) {
      const response = await telegramBot.sendMessage(accessToken, text, {
        parse_mode: 'HTML',
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      });
      messageId = response.message_id;
    }
    // if there's only one media, bot sends the media with the text message as caption
    else if (processedMedia.length === 1) {
      const media = processedMedia[0];
      const options = {
        caption: text,
        parse_mode: 'HTML' as const,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      };
      const response =
        media.type === 'video'
          ? await telegramBot.sendVideo(
              accessToken,
              media.media,
              options,
              media.fileOptions
            )
          : media.type === 'photo'
          ? await telegramBot.sendPhoto(
              accessToken,
              media.media,
              options,
              media.fileOptions
            )
          : await telegramBot.sendDocument(
              accessToken,
              media.media,
              options,
              media.fileOptions
            );
      messageId = response.message_id;
    }
    // if there are multiple media, bot sends them as a media group - max 10 media per group - with the text as a caption (if there are more than 1 group, the caption will only be sent with the first group)
    else {
      const mediaGroups = this.chunkMedia(processedMedia, 10);
      for (let i = 0; i < mediaGroups.length; i++) {
        const mediaGroup = mediaGroups[i].map((m, index) => ({
          type: m.type === 'document' ? 'document' : m.type, // Documents are not allowed in media groups
          media: m.media,
          caption: i === 0 && index === 0 ? text : undefined,
          parse_mode: 'HTML',
        }));

        const response = await telegramBot.sendMediaGroup(
          accessToken,
          mediaGroup as any[],
          {
            ...(replyToMessageId && i === 0
              ? { reply_to_message_id: replyToMessageId }
              : {}),
          }
        );
        if (i === 0) {
          messageId = response[0].message_id;
        }
      }
    }

    return messageId;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;

    const messageId = await this.sendMessage(accessToken, firstPost);

    // for private groups/channels message.id is undefined so the link generated by Postiz will be unusable "https://t.me/c/undefined/16"
    // to avoid that, we use accessToken instead of message.id and we generate the link manually removing the -100 from the start.
    if (messageId) {
      return [
        {
          id: firstPost.id,
          postId: String(messageId),
          releaseURL: telegramReleaseUrl(id, accessToken, messageId),
          status: 'completed',
        },
      ];
    }

    return [];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const replyToId = Number(lastCommentId || postId);

    const messageId = await this.sendMessage(
      accessToken,
      commentPost,
      replyToId
    );

    if (messageId) {
      return [
        {
          id: commentPost.id,
          postId: String(messageId),
          releaseURL: telegramReleaseUrl(id, accessToken, messageId),
          status: 'completed',
        },
      ];
    }

    return [];
  }
  // chunkMedia is used to split media into groups of "size". 10 is used here because telegram api allows a maximum of 10 media per group
  private chunkMedia(media: { type: string; media: string }[], size: number) {
    const result = [];
    for (let i = 0; i < media.length; i += size) {
      result.push(media.slice(i, i + size));
    }
    return result;
  }
}
