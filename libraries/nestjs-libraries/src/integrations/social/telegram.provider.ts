import { openMediaUploadStreams } from './media-upload-sources';
import { providerErrorDiagnostic } from './provider-error-diagnostic';
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
import { BadBody, RefreshToken, SocialAbstract } from '@contentfactory/nestjs-libraries/integrations/social.abstract';
//@ts-ignore
import mime from 'mime';
import TelegramBot from 'node-telegram-bot-api';
import { Integration } from '@prisma/client';
import striptags from 'striptags';

const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN!);

/**
 * A post's HTML as Telegram's `parse_mode: 'HTML'` accepts it.
 *
 * Telegram knows a handful of tags and refuses a message with any other, so
 * everything else is stripped to its text. Bold arrives as `<strong>`,
 * italic as `<em>` (`97dq.52`) — both renamed to Telegram's own `<b>` and
 * `<i>`; underline is `<u>` already. A link keeps only its `href`, and only
 * an http(s) one: the editors add `target` and `rel`, which Telegram does not
 * take, and any other scheme becomes plain words.
 */
export const telegramHtml = (html: string, rich = false): string => {
  let number = 0;
  const prepared = rich ? (html || '') : (html || '')
    .replace(/(<li\b[^>]*>)([\s\S]*?)(<\/li\s*>)/giu, (_all, start: string, inner: string, end: string) =>
      start + inner.replace(/<\/p\s*>\s*<p\b[^>]*>/giu, '<br>').replace(/<\/?p\b[^>]*>/giu, '') + end)
    .replace(/<(\/?)\s*(ol|ul|li)\b[^>]*>/giu, (_tag, closing: string, raw: string) => {
      const name = raw.toLowerCase();
      if (closing) return '\n';
      if (name === 'ol') { number = 0; return ''; }
      if (name === 'ul') { number = -1; return ''; }
      return number < 0 ? '• ' : `${++number}. `;
    })
    .replace(/<h[1-6]\b[^>]*>/giu, '<b>')
    .replace(/<\/h[1-6]\s*>/giu, '</b>\n\n');
  const kept = striptags(prepared, ['u', 'strong', 'b', 'em', 'i', 'a', 'p', 'br', ...(rich ? ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ol', 'ul', 'li'] : [])]);
  /*
    Every kept tag is rebuilt, never passed through (`97dq.75` review P2-6):
    attributes on <b>/<i>/<u> go, a closing tag with nothing open goes, a link
    inside a link loses its inner tags, and whatever is still open at the end
    is closed — Telegram refuses a message that breaks any of these.
  */
  const NAME: Record<string, string> = {
    strong: 'b',
    b: 'b',
    em: 'i',
    i: 'i',
    u: 'u',
    a: 'a',
    p: 'p',
    br: 'br', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6', ol: 'ol', ul: 'ul', li: 'li',
  };
  const open: string[] = [];
  const out = kept.replace(
    /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi,
    (_tag, closing: string, raw: string, attrs: string) => {
      const name = NAME[raw.toLowerCase()];
      if (!name) return '';
      if (name === 'br') return closing ? '' : rich ? '<br>' : '\n';
      if (name === 'p' && !rich) return closing ? '\n\n' : '';
      if (!closing) {
        if (name === 'a') {
          const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
          const inLink = open.includes('a') || open.includes('drop-a');
          if (inLink || !/^https?:\/\/[^\s"<>]+$/i.test(href)) {
            open.push('drop-a');
            return '';
          }
          open.push('a');
          return `<a href="${href}">`;
        }
        open.push(name);
        return `<${name}>`;
      }
      const wanted = name === 'a' ? ['a', 'drop-a'] : [name];
      const at = open.map((one) => wanted.includes(one)).lastIndexOf(true);
      if (at < 0) return '';
      // Close what was opened inside it first, so the tags stay nested.
      const inner = open.splice(at);
      return inner
        .reverse()
        .map((one) => (one === 'drop-a' ? '' : `</${one}>`))
        .join('');
    }
  );
  const result = (
    out +
    open
      .reverse()
      .map((one) => (one === 'drop-a' ? '' : `</${one}>`))
      .join('')
  );
  return rich ? result : result.replace(/\n{3,}/gu, '\n\n').replace(/\n\n$/u, '\n');
};

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
          percentageChange: null,
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

  private processMedia(mediaFiles: PostDetails['media'], sources: Awaited<ReturnType<typeof openMediaUploadStreams>>['sources']) {
    return (mediaFiles || []).map((media, index) => {
      const mediaUrl = media.path;
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
        media: sources[index].stream,
        fileOptions: {
          filename: media.path.split('/').pop(),
          contentType: mimeType || 'application/octet-stream',
        },
      };
    });
  }

  override handleErrors(body: string, status = 0) {
    return providerErrorDiagnostic('telegram', body, status);
  }

  private async sendMessage(accessToken: string, message: PostDetails, replyToMessageId?: number): Promise<number> {
    try {
      const id = await this.sendMessageRequest(accessToken, message, replyToMessageId);
      if (!Number.isInteger(id) || Number(id) <= 0) throw new Error('Missing receipt');
      return id!;
    } catch (error) {
      const diagnostic = providerErrorDiagnostic('telegram', error);
      // SDK error objects include the bot URL and message text. Never serialize them.
      if (diagnostic.type === 'refresh-token') throw new RefreshToken(this.identifier, '{}', '{}', diagnostic.value);
      // A media group may have partially succeeded. Do not replay the whole post.
      throw new BadBody(this.identifier, '{}', '{}', diagnostic.value);
    }
  }

  private async sendMessageRequest(
    accessToken: string,
    message: PostDetails,
    replyToMessageId?: number
  ): Promise<number | null> {
    let messageId: number | null = null;
    const mediaFiles = message.media || [];
    const text = telegramHtml(message.message || '');

    const opened = await openMediaUploadStreams(mediaFiles.map(media => media.path));
    try {
    const processedMedia = this.processMedia(mediaFiles, opened.sources);

    // if there's no media, bot sends a text message only
    if (processedMedia.length === 0) {
      const structured = /<(?:h[1-6]|ol|ul)\b/iu.test(message.message || '');
      const response = structured
        ? await (telegramBot as unknown as { _request: (method: string, options: object) => Promise<{ message_id: number }> })._request('sendRichMessage', {
            form: {
              chat_id: accessToken,
              rich_message: JSON.stringify({ html: telegramHtml(message.message || '', true) }),
              ...(replyToMessageId ? { reply_parameters: JSON.stringify({ message_id: replyToMessageId }) } : {}),
            },
          })
        : await telegramBot.sendMessage(accessToken, text, {
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
          fileOptions: m.fileOptions,
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
    } finally { opened.close(); }
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
  private chunkMedia(media: ReturnType<TelegramProvider['processMedia']>, size: number) {
    const result = [];
    for (let i = 0; i < media.length; i += size) {
      result.push(media.slice(i, i + size));
    }
    return result;
  }
}
