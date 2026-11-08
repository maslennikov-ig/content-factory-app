import { BadRequestException, CallHandler, Controller, ExecutionContext, Get, HttpException, Injectable, NestInterceptor, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import { defer, lastValueFrom } from 'rxjs';
import { pipeline } from 'node:stream/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import multer, { diskStorage } from 'multer';
import { McpMediaUploadServiceV1 } from '@contentfactory/nestjs-libraries/chat/media/mcp-media-upload.service.v1';

type Bound = Awaited<ReturnType<McpMediaUploadServiceV1['claim']>>;
type UploadRequest = Request & { mcpUpload?: Bound };

@Injectable()
export class McpMediaTicketInterceptorV1 implements NestInterceptor {
  constructor(private readonly uploads: McpMediaUploadServiceV1) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<UploadRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    // Accept is CORS-safelisted. No token in a URL, cookie, referrer or model
    // result; a sandbox can upload without preflight or ambient credentials.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'private, no-store');
    const ticket = /(?:^|;)\s*cf-upload-ticket=([A-Za-z0-9_-]{43})(?:\s*;|\s*$)/.exec(req.headers.accept || '')?.[1];
    const bound = await this.uploads.claim(ticket);
    req.mcpUpload = bound;
    let directory: string;
    try { directory = await mkdtemp(join(tmpdir(), 'cf-mcp-upload-')); }
    catch (error) { await this.uploads.failed(bound); throw error; }
    const cleanup = () => rm(directory, { recursive: true, force: true });
    const aborted = () => {
      void this.uploads.failed(bound).catch(() => undefined);
      void cleanup().catch(() => undefined);
    };
    req.once('aborted', aborted);
    // Private disk spool, with a parser ceiling bound to this selected file.
    // The browser never supplies this path; no complete video enters memory.
    const parse = multer({
      storage: diskStorage({ destination: directory, filename: (_req, _file, callback) => callback(null, 'incoming') }),
      limits: { fileSize: bound.file.size, files: 1, fields: 0, parts: 2 },
    }).single('file');
    return defer(async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          if (req.aborted) return reject(new BadRequestException('Upload interrupted'));
          const interrupted = () => reject(new BadRequestException('Upload interrupted'));
          req.once('aborted', interrupted);
          parse(req, res, error => {
            req.off('aborted', interrupted);
            error ? reject(error) : resolve();
          });
        });
        return await lastValueFrom(next.handle());
      } catch (error) {
        await this.uploads.failed(bound);
        if (error instanceof multer.MulterError) throw new BadRequestException('Invalid file upload');
        throw error;
      } finally {
        req.off('aborted', aborted);
        await cleanup();
      }
    });
  }
}

/** Ticket transport: shared capability admission plus live membership checks. */
@Controller('/mcp-media')
export class McpMediaControllerV1 {
  constructor(private readonly uploads: McpMediaUploadServiceV1) {}

  @Post('/upload')
  @UseInterceptors(McpMediaTicketInterceptorV1)
  upload(@Req() req: UploadRequest, @UploadedFile() file: Express.Multer.File) {
    return this.uploads.upload(req.mcpUpload!, file);
  }

  @Get('/preview/:token')
  async preview(@Param('token') token: string, @Res() res: Response, @Req() req: Request) {
    const abort = new AbortController();
    const onAbort = () => { if (!res.writableFinished) abort.abort(); };
    req.once('aborted', onAbort);
    res.once('close', onAbort);
    let source: Awaited<ReturnType<McpMediaUploadServiceV1['preview']>> | undefined;
    try {
      source = await this.uploads.preview(token, { signal: abort.signal, range: req.headers.range });
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', source.contentType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Accept-Ranges', 'bytes');
      if (source.status === 206) res.status(206);
      if (source.contentRange) res.setHeader('Content-Range', source.contentRange);
      if (source.size !== undefined) res.setHeader('Content-Length', source.size);
      await pipeline(source.stream, res, { signal: abort.signal });
    } catch (error) {
      if (error instanceof Error && error.message === 'MEDIA_RANGE_INVALID' && !res.headersSent) {
        res.setHeader('Cache-Control', 'private, no-store');
        throw new HttpException({ code: 'media_range_invalid', message: 'Requested range is not satisfiable' }, 416);
      }
      throw error;
    } finally {
      await source?.close();
      req.off('aborted', onAbort);
      res.off('close', onAbort);
    }
  }
}
