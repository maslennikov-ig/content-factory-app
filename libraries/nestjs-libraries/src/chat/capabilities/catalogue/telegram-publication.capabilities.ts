import { createHash } from 'node:crypto';
import mime from 'mime';
import { z } from 'zod';
import { PostsController } from '@contentfactory/backend/api/routes/posts.controller';
import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { MediaService } from '@contentfactory/nestjs-libraries/database/prisma/media/media.service';
import { PostsRepository } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import {
  TELEGRAM_CAPTION_LIMIT,
  telegramHtml,
} from '@contentfactory/nestjs-libraries/integrations/social/telegram-formatting';
import {
  compileTelegramRichLayout,
  TELEGRAM_RICH_HTML_LIMIT,
  TELEGRAM_RICH_MEDIA_LIMIT,
  TelegramRichLayoutError,
  telegramRichTextHash,
} from '@contentfactory/nestjs-libraries/integrations/social/telegram-rich-layout';
import {
  defineCapability,
  door,
  type ApprovalDescribeContext,
} from '../capability.types';
import { codedFailure } from './selection';

const requestId = z.string().uuid().describe('Stable UUID for this one publication. Keep it after confirmation, errors and timeouts.');
const publicationInput = z.object({
  requestId,
  channelId: z.string().min(1).max(128).describe('Connected Telegram channel ID from channels_list.'),
  html: z.string().min(1).max(TELEGRAM_RICH_HTML_LIMIT)
    .describe('Exact final HTML. Rich supports native headings, emphasis, lists, quotes, tables, details, code, math, maps, and media blocks. For inline media use tg://photo?id=media_1 (or tg://video, tg://audio, tg://document) in the corresponding tag. Slot numbers are 1-based indexes into mediaIds.'),
  coverMediaId: z.string().uuid().optional().describe('Legacy single owned image ID. Use mediaIds for new calls.'),
  mediaIds: z.array(z.string().uuid()).min(1).max(TELEGRAM_RICH_MEDIA_LIMIT).optional()
    .describe('Up to ten distinct workspace media IDs. For explicit rich layout reference each ID once by its 1-based slot. Without slots, photos are appended at the end. Omit for text-only rich posts.'),
  format: z.enum(['caption', 'rich']).optional()
    .describe('caption uses a photo or album and a 1024-character caption. rich preserves native formatting and inline media layout. Default: caption.'),
});
type PublicationInput = z.infer<typeof publicationInput>;

const postIdFor = (ctx: ApprovalDescribeContext, request: string) =>
  'mcp-tg-' + createHash('sha256')
    .update(JSON.stringify([ctx.organizationId, ctx.userId, request.toLowerCase()]))
    .digest('hex');

const findPost = (ctx: ApprovalDescribeContext, id: string) =>
  ctx.service(PostsRepository).getPost(id, false, ctx.organizationId);

const telegramUrl = (url: string | null) =>
  url && /^https:\/\/t\.me\/(?:c\/\d+|[a-z0-9_]+)\/\d+$/i.test(url)
    ? url
    : null;

const receipt = (post: { id: string; integrationId: string; state: string; releaseURL: string | null }) => ({
  postId: post.id,
  channelId: post.integrationId,
  state: post.state,
  telegramUrl: post.state === 'PUBLISHED' ? telegramUrl(post.releaseURL) : null,
});

async function prepare(ctx: ApprovalDescribeContext, input: PublicationInput) {
  const mediaIds = input.mediaIds ?? (input.coverMediaId ? [input.coverMediaId] : []);
  const rich = input.format === 'rich';
  if ((input.coverMediaId && input.mediaIds) || (!rich && !mediaIds.length) ||
      new Set(mediaIds.map(id => id.toLowerCase())).size !== mediaIds.length) {
    throw codedFailure('TELEGRAM_MEDIA_INVALID', 'Choose distinct photos using mediaIds or a single coverMediaId. Photos are required for caption format.');
  }
  const [channel, photos] = await Promise.all([
    ctx.service(IntegrationService).getIntegrationById(ctx.organizationId, input.channelId),
    Promise.all(mediaIds.map(async (id) => {
      const photo = await ctx.service(MediaService).getMediaById(ctx.organizationId, id);
      if (!photo || photo.organizationId !== ctx.organizationId || photo.deletedAt ||
          (!rich && !mime.getType(photo.path)?.startsWith('image/'))) {
        throw codedFailure('TELEGRAM_COVER_UNAVAILABLE', 'Choose the required media from this workspace library.');
      }
      return photo;
    })),
  ]);
  if (!channel || channel.organizationId !== ctx.organizationId || channel.deletedAt ||
      channel.disabled || channel.refreshNeeded || channel.providerIdentifier !== 'telegram') {
    throw codedFailure('TELEGRAM_CHANNEL_UNAVAILABLE', 'Choose an active Telegram channel in this workspace.');
  }
  let richLayout: ReturnType<typeof compileTelegramRichLayout> | undefined;
  if (rich) {
    try {
      richLayout = compileTelegramRichLayout(input.html, photos.map(({ path }) => path));
    } catch (error) {
      if (!(error instanceof TelegramRichLayoutError)) throw error;
      throw codedFailure('TELEGRAM_RICH_LAYOUT_INVALID', error.message);
    }
  }
  const posts = ctx.service(PostsService);
  const body = await posts.mapTypeToPost({
    type: 'now',
    date: new Date().toISOString(),
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: channel.id },
      settings: { __type: 'telegram', ...(rich ? { telegramFormat: 'rich' } : {}) },
      value: [{
        id: postIdFor(ctx, input.requestId),
        content: input.html,
        delay: 0,
        image: photos.map(({ id, path }) => ({ id, path })),
      }],
    }],
  }, ctx.organizationId);
  const content = body.posts[0].value[0].content;
  const caption = stripHtmlValidation('none', richLayout?.html ?? telegramHtml(content));
  const maximum = rich ? 4096 : TELEGRAM_CAPTION_LIMIT;
  if (!caption.trim() || caption.length > maximum) {
    throw codedFailure('TELEGRAM_CAPTION_INVALID', rich
      ? 'A rich post must contain 1–4096 visible characters.'
      : `The photo caption must contain 1–${TELEGRAM_CAPTION_LIMIT} visible characters.`);
  }
  if (richLayout) {
    // Persist native HTML beside the standard browser-safe preview. Bind the
    // layout to what the publication activity will hand to the provider.
    const preview = stripHtmlValidation('html', content, true, false, !/<\/?[a-z][\s\S]*>/i.test(content));
    Object.assign(body.posts[0].settings, {
      telegramRichLayout: {
        html: richLayout.html,
        mediaIds: photos.map(photo => photo.id),
        previewHash: telegramRichTextHash(preview),
      },
    });
  }
  return { channel, photos, content, caption, body, richLayout };
}

export const telegramPublishReady = defineCapability({
  id: 'telegram.publish_ready',
  label: { ru: 'Опубликовать готовый пост в Telegram', en: 'Publish a ready Telegram post' },
  group: 'plan',
  entrances: ['mcp'],
  input: publicationInput,
  description: 'Publish one already-written Telegram post. Use format rich for native Rich Message formatting and positioned workspace media (tg://photo?id=media_1). Use caption for a classic photo or album. Preserve the exact approved text, links and media placement. The first call checks the post and asks for confirmation. On a timeout use telegram.publication_status with the same requestId. Never create a replacement request to retry an uncertain publication.',
  risk: 'confirm',
  mcpConfirm: 'ask',
  door: door(PostsController, 'createPost'),
  untrusted: [],
  describeApproval: async (ctx, input) => {
    const { channel, photos, caption, richLayout } = await prepare(ctx, input);
    const name = channel.displayName || channel.name;
    const handle = /^[a-z][a-z0-9_]*$/i.test(channel.internalId) && channel.internalId !== 'undefined'
      ? ` (@${channel.internalId})`
      : '';
    const filenames = photos.map(photo => `«${(photo.originalName || photo.name).slice(0, 80)}»`).join(', ');
    const excerpt = caption.trim().slice(0, 80);
    const rich = input.format === 'rich';
    return ctx.language === 'ru'
      ? `Опубликовать сейчас в Telegram-канале «${name}»${handle} ${rich ? 'форматированный пост' : 'пост'} «${excerpt}»${filenames ? ` ${richLayout?.inline ? 'с вложениями внутри текста' : 'с фото'} ${filenames}` : ''}?`
      : `Publish ${rich ? 'the rich post ' : ''}“${excerpt}”${filenames ? ` with ${richLayout?.inline ? 'media placed in the text' : 'photos'} ${filenames}` : ''} in Telegram channel “${name}”${handle} now?`;
  },
  approvalContent: async (ctx, input) => {
    const { channel, photos, content, richLayout } = await prepare(ctx, input);
    return {
      channel: channel.internalId,
      format: input.format ?? 'caption',
      photos: photos.map(({ id, path }) => ({ id, path })),
      content: richLayout?.html ?? content,
    };
  },
  run: async (ctx, input) => {
    const id = postIdFor(ctx, input.requestId);
    const existing = await findPost(ctx, id);
    if (existing) return receipt(existing);

    const { body } = await prepare(ctx, input);
    const posts = ctx.service(PostsService);
    const [validation] = await posts.validatePosts(ctx.organizationId, body.posts);
    if (!validation || !validation.valid || validation.errors !== true ||
        validation.emptyContent || validation.tooLong) {
      throw codedFailure('TELEGRAM_POST_INVALID', 'The post does not pass the Telegram channel validation.');
    }
    try {
      await posts.createPost(ctx.organizationId, body, 'API', { createOnly: true });
    } catch (error) {
      // A concurrent confirmation or a lost response may already have created
      // this post. Read its receipt before reporting a failure to the caller.
      const saved = await findPost(ctx, id);
      if (saved) return receipt(saved);
      throw error;
    }
    const saved = await findPost(ctx, id);
    if (!saved) throw codedFailure('TELEGRAM_PUBLICATION_UNKNOWN', 'Read publication status before taking any further action.');
    return receipt(saved);
  },
  summarize: output => output,
});

export const telegramPublicationStatus = defineCapability({
  id: 'telegram.publication_status',
  label: { ru: 'Статус публикации в Telegram', en: 'Telegram publication status' },
  group: 'plan',
  entrances: ['mcp'],
  input: z.object({ requestId }),
  description: 'Read delivery status for your ready-post request. PUBLISHED and telegramUrl are read from the recorded provider result. Missing or queued is not a published post. Never retry an uncertain publication with a different requestId.',
  risk: 'read',
  door: door(PostsController, 'getPost'),
  untrusted: [],
  run: async (ctx, input) => {
    const post = await findPost(ctx, postIdFor(ctx, input.requestId));
    return post ? receipt(post) : { state: 'NOT_FOUND' as const };
  },
  summarize: output => output,
});
