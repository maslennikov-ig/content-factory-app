import { Body, Controller, Delete, Get, Header, HttpException, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { MediaService } from '@contentfactory/nestjs-libraries/database/prisma/media/media.service';
import { PreviewReviewServiceV1, assertReviewMutationV1, reviewCookieNameV1 } from '@contentfactory/nestjs-libraries/preview-review/v1/preview-review.service';
import { PreviewReviewCommentDtoV1, PreviewReviewGrantDtoV1, PreviewReviewResolutionDtoV1, PreviewReviewThreadDtoV1 } from '@contentfactory/nestjs-libraries/preview-review/v1/preview-review.dto';
import { PreviewReviewRateGuardV1 } from './preview-review.v1.guard';

@Controller('/preview-review/v1/posts/:postId')
@UseGuards(PreviewReviewRateGuardV1)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PreviewReviewControllerV1 {
  constructor(private readonly review: PreviewReviewServiceV1, private readonly media: MediaService) {}

  @Get('/')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Referrer-Policy', 'no-referrer')
  async preview(@Param('postId') postId: string, @Req() req: Request) {
    const actor = await this.review.authorize(postId, req);
    return { posts: await this.review.preview(actor), canManage: actor.kind === 'team' };
  }

  @Get('/discussions')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async discussions(@Param('postId') postId: string, @Req() req: Request) {
    return this.review.discussions(await this.review.authorize(postId, req));
  }

  @Post('/discussions')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async createThread(@Param('postId') postId: string, @Req() req: Request, @Body() body: PreviewReviewThreadDtoV1) {
    assertReviewMutationV1(req);
    return this.review.createThread(await this.review.authorize(postId, req), body);
  }

  @Post('/discussions/:threadId/replies')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async reply(@Param('postId') postId: string, @Param('threadId') threadId: string, @Req() req: Request, @Body() body: PreviewReviewCommentDtoV1) {
    assertReviewMutationV1(req);
    return this.review.reply(await this.review.authorize(postId, req), threadId, body);
  }

  @Put('/discussions/:threadId/resolution')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async resolve(@Param('postId') postId: string, @Param('threadId') threadId: string, @Req() req: Request, @Body() body: PreviewReviewResolutionDtoV1) {
    assertReviewMutationV1(req);
    return this.review.resolve(await this.review.authorize(postId, req), threadId, body.resolved);
  }

  @Get('/grants')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async grants(@Param('postId') postId: string, @Req() req: Request) {
    return { grants: await this.review.grants(await this.review.authorize(postId, req)) };
  }

  @Post('/grants')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async createGrant(@Param('postId') postId: string, @Req() req: Request, @Body() body: PreviewReviewGrantDtoV1) {
    assertReviewMutationV1(req);
    return this.review.createGrant(await this.review.authorize(postId, req), body.expiresInDays);
  }

  @Post('/grants/:grantId/reissue')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async reissue(@Param('postId') postId: string, @Param('grantId') grantId: string, @Req() req: Request, @Body() body: PreviewReviewGrantDtoV1) {
    assertReviewMutationV1(req);
    return this.review.createGrant(await this.review.authorize(postId, req), body.expiresInDays, grantId);
  }

  @Delete('/grants/:grantId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async revoke(@Param('postId') postId: string, @Param('grantId') grantId: string, @Req() req: Request) {
    assertReviewMutationV1(req);
    return this.review.revoke(await this.review.authorize(postId, req), grantId);
  }

  @Post('/session')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async mediaSession(@Param('postId') postId: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertReviewMutationV1(req);
    const actor = await this.review.authorize(postId, req);
    if (actor.kind === 'guest') {
      const backend = new URL(process.env.NEXT_PUBLIC_BACKEND_URL || process.env.FRONTEND_URL!);
      const prefix = backend.pathname.replace(/\/$/, '');
      res.cookie(reviewCookieNameV1(postId), req.headers['x-preview-grant'], {
        httpOnly: true, secure: process.env.NODE_ENV === 'production' || backend.protocol === 'https:', sameSite: 'lax',
        path: `${prefix}/preview-review/v1/posts/${encodeURIComponent(postId)}/media`,
        maxAge: Math.max(0, Math.min(30 * 60_000, actor.expiresAt.getTime() - Date.now())),
      });
    }
    return { ready: true };
  }

  @Get('/media/:mediaId')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Referrer-Policy', 'no-referrer')
  async attachment(@Param('postId') postId: string, @Param('mediaId') mediaId: string, @Query('variant') variant: string | undefined, @Req() req: Request, @Res() res: Response, @Query('reference') reference?: string) {
    const actor = await this.review.authorize(postId, req, true);
    const attachment = await this.review.assertMedia(actor, mediaId, variant === 'thumbnail', reference);
    const abort = new AbortController();
    const onAbort = () => { if (!res.writableFinished) abort.abort(); };
    req.once('aborted', onAbort);
    res.once('close', onAbort);
    let opened: Awaited<ReturnType<MediaService['openPreviewMediaV1']>> | undefined;
    try {
      opened = await this.media.openPreviewMediaV1(attachment.path, attachment.filename, { signal: abort.signal, range: req.headers.range });
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Accept-Ranges', 'bytes');
      if (opened.status === 206) res.status(206);
      if (opened.contentRange) res.setHeader('Content-Range', opened.contentRange);
      res.setHeader('Content-Type', opened.contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(opened.filename)}`);
      if (opened.size !== undefined) res.setHeader('Content-Length', opened.size);
      await pipeline(opened.stream, res, { signal: abort.signal });
    } catch (error) {
      if (error instanceof Error && error.message === 'MEDIA_RANGE_INVALID' && !res.headersSent) {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        throw new HttpException({ code: 'media_range_invalid', message: 'Requested range is not satisfiable' }, 416);
      }
      throw error;
    } finally {
      opened?.close();
      req.off('aborted', onAbort);
      res.off('close', onAbort);
    }
  }
}
