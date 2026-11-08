import { readMediaSource } from '@contentfactory/helpers/utils/media.source';
import { integrationDisplayName } from '@contentfactory/helpers/utils/integration-name';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import { Request, Response } from 'express';
import { AgentGraphInsertService } from '@contentfactory/nestjs-libraries/agent/agent.graph.insert.service';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { OnlyURL } from '@contentfactory/nestjs-libraries/dtos/webhooks/webhooks.dto';
import {
  SignedParamsBodyDto,
} from '@contentfactory/nestjs-libraries/dtos/routes/single-field.dto';
import { PreviewReviewServiceV1 } from '@contentfactory/nestjs-libraries/preview-review/v1/preview-review.service';
import { PreviewReviewRateGuardV1 } from './preview-review.v1.guard';
import { Throttle } from '@nestjs/throttler';

const pump = promisify(pipeline);

@ApiTags('Public')
@Controller('/public')
export class PublicController {
  constructor(
    private _agentGraphInsertService: AgentGraphInsertService,
    private _postsService: PostsService,
    private _subscriptionService: SubscriptionService,
    private readonly _previewReview: PreviewReviewServiceV1
  ) {}
  @Post('/agent')
  async createAgent(
    @Body() body: { text: string; apiKey: string; organizationId: string }
  ) {
    if (
      !body.apiKey ||
      !process.env.AGENT_API_KEY ||
      body.apiKey !== process.env.AGENT_API_KEY
    ) {
      return;
    }
    // AI keys belong to an organization, so this operator-triggered job has to
    // name the one whose key pays for it. The caller already holds the
    // instance-wide AGENT_API_KEY, so it is the operator making that choice.
    if (!body.organizationId) {
      throw new HttpException('organizationId is required', 400);
    }
    return this._agentGraphInsertService.newPost(
      body.organizationId,
      body.text
    );
  }

  @Get(`/posts/:id`)
  @UseGuards(PreviewReviewRateGuardV1)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async getPreview(@Param('id') id: string, @Req() req: Request) {
    const actor = await this._previewReview.authorize(id, req);
    if (actor.kind === 'guest') return this._previewReview.preview(actor);
    // Keep the member API's established post shape; guests use its scoped,
    // sanitized representation and never receive underlying storage locations.
    return (await this._postsService.getPostsRecursively(id, true, actor.organizationId)).map(({ childrenPost, ...post }) => ({
      ...post,
      ...(post.integration ? { integration: {
        id: post.integration.id, name: integrationDisplayName(post.integration), picture: post.integration.picture,
        providerIdentifier: post.integration.providerIdentifier, profile: post.integration.profile,
      } } : {}),
    }));
  }

  @Get(`/posts/:id/comments`)
  @UseGuards(PreviewReviewRateGuardV1)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async getComments(@Param('id') postId: string, @Req() req: Request) {
    const actor = await this._previewReview.authorize(postId, req);
    if (actor.kind === 'team') return { comments: await this._postsService.getComments(postId) };
    const discussions = await this._previewReview.discussions(actor);
    return { comments: discussions.legacyComments };
  }

  @Post('/modify-subscription')
  async modifySubscription(@Body() { params }: SignedParamsBodyDto) {
    try {
      const load = AuthService.verifyJWT(params) as {
        orgId: string;
        billing: 'FREE' | 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE';
      };

      if (!load || !load.orgId || !load.billing || !pricing[load.billing]) {
        return { success: false };
      }

      const totalChannels = pricing[load.billing].channel || 0;

      await this._subscriptionService.modifySubscriptionByOrg(
        load.orgId,
        totalChannels,
        load.billing
      );

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }


  @Get('/stream')
  async streamFile(
    @Query() query: OnlyURL,
    @Res() res: Response,
    @Req() req: Request
  ) {
    const { url } = query;
    if (!url.endsWith('mp4')) {
      return res.status(400).send('Invalid video URL');
    }

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('aborted', onClose);
    res.on('close', onClose);

    let media: Awaited<ReturnType<typeof readMediaSource>> | undefined;
    try {
      media = await readMediaSource(url, { signal: ac.signal, range: typeof req.headers.range === 'string' ? req.headers.range : undefined });
      const mime = (media.contentType || 'application/octet-stream').trim().toLowerCase();
      if (!['video/mp4', 'application/octet-stream', 'binary/octet-stream'].includes(mime)) {
        return res.status(415).send('Unsupported video type');
      }
      // Never turn this public proxy into a same-origin HTML document, even
      // when a remote server labels a malicious response as an octet stream.
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Accept-Ranges', 'bytes');
      if (media.size !== undefined) res.setHeader('Content-Length', media.size);
      if (media.contentRange) res.setHeader('Content-Range', media.contentRange);
      res.status(media.status || 200);
      if (req.method === 'HEAD') return res.end();
      await pump(media.stream, res);
    } catch (error) {
      if (!res.headersSent && !ac.signal.aborted) {
        const code = String((error as Error)?.message || '');
        res.status(code === 'MEDIA_RANGE_INVALID' ? 416 : code === 'MEDIA_URL_UNSAFE' ? 400 : 502).send('Media is unavailable');
      }
    } finally {
      media?.close();
      req.off('aborted', onClose);
      res.off('close', onClose);
    }
  }
}
