import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mediaPresentationKind } from '@contentfactory/helpers/utils/media-kind';
import { openDiskUploadV1 } from '@contentfactory/nestjs-libraries/upload/disk.upload.v1';
import { MediaService } from '@contentfactory/nestjs-libraries/database/prisma/media/media.service';
import { OrganizationService } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { PermissionsService } from '@contentfactory/backend/services/auth/permissions/permissions.service';
import { AuthorizationActions, Sections } from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { UploadFactory } from '@contentfactory/nestjs-libraries/upload/upload.factory';
import { MAX_IMAGE_UPLOAD_SIZE, MAX_VIDEO_UPLOAD_SIZE } from '@contentfactory/nestjs-libraries/upload/upload.limits';
import { mcpUrls } from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-urls';
import type { CapabilityIdentity } from '../capabilities/capability.types';

const SESSION_SECONDS = 15 * 60;
const TICKET_SECONDS = 2 * 60;
const PREVIEW_SECONDS = 5 * 60;
const key = (kind: string, value: string) => `cf:mcp-media:v1:${kind}:${createHash('sha256').update(value).digest('hex')}`;
type Identity = Pick<CapabilityIdentity, 'organizationId' | 'userId'>;
export type McpUploadFileV1 = { name: string; size: number; nonce: string };
type Session = Identity & { sessionId: string; expiresAt: string; state: 'waiting' | 'uploading' | 'ready' | 'failed'; mediaId?: string; sha256?: string; error?: string };
type Ticket = { session: Session; file: McpUploadFileV1 };

@Injectable()
export class McpMediaUploadServiceV1 {
  constructor(private readonly media: MediaService, private readonly organizations: OrganizationService,
    private readonly users: UsersService, private readonly permissions: PermissionsService) {}

  private async active(identity: Identity, write = false) {
    const [user, organizations] = await Promise.all([
      this.users.getUserById(identity.userId), this.organizations.getOrgsByUserId(identity.userId),
    ]);
    const org = organizations.find(one => one.id === identity.organizationId);
    const membership = org?.users?.[0];
    if (!user?.activated || user.blockedAt || !org || !membership || membership.disabled) throw new ForbiddenException();
    if (write) {
      const ability = await this.permissions.check(org.id, org.createdAt, membership.role, [[AuthorizationActions.Create, Sections.EDITOR]]);
      if (!ability.can(AuthorizationActions.Create, Sections.EDITOR)) throw new ForbiddenException();
    }
  }
  private async save(session: Session) {
    const seconds = Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000);
    if (seconds <= 0) throw new NotFoundException();
    await ioRedis.set(key('session', session.sessionId), JSON.stringify(session), 'EX', seconds);
  }
  private async session(identity: Identity, sessionId: string): Promise<Session> {
    const raw = await ioRedis.get(key('session', sessionId));
    const session: Session | undefined = raw ? JSON.parse(raw) : undefined;
    if (!session || session.organizationId !== identity.organizationId || session.userId !== identity.userId || Date.parse(session.expiresAt) <= Date.now()) throw new NotFoundException();
    return session;
  }
  async create(identity: Identity) {
    await this.active(identity, true);
    const session: Session = { organizationId: identity.organizationId, userId: identity.userId,
      sessionId: randomUUID(), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(), state: 'waiting' };
    await this.save(session);
    return { sessionId: session.sessionId, state: session.state, expiresAt: session.expiresAt,
      manualUploadUrl: `${process.env.FRONTEND_URL?.replace(/\/$/, '') || ''}/media`,
      limits: { imageBytes: MAX_IMAGE_UPLOAD_SIZE, videoBytes: MAX_VIDEO_UPLOAD_SIZE } };
  }
  async ticket(identity: Identity, sessionId: string, file: McpUploadFileV1) {
    await this.active(identity, true);
    const session = await this.session(identity, sessionId);
    if (session.state !== 'waiting') throw new BadRequestException('This upload session already has a file. Open another upload.');
    if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_VIDEO_UPLOAD_SIZE ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(file.nonce) || !file.name || file.name.length > 255 || /[\u0000-\u001f/\\]/.test(file.name)) throw new BadRequestException('Invalid file description');
    const binding = JSON.stringify({ name: file.name, size: file.size, nonce: file.nonce });
    const remaining = Math.max(1, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000));
    if (await ioRedis.set(key('file', sessionId), binding, 'EX', remaining, 'NX') !== 'OK' &&
      await ioRedis.get(key('file', sessionId)) !== binding) throw new BadRequestException('This session is bound to another file. Open another upload.');
    const ticket = randomBytes(32).toString('base64url');
    await ioRedis.set(key('ticket', ticket), JSON.stringify({ session, file } satisfies Ticket), 'EX', TICKET_SECONDS);
    return { ticket, uploadUrl: `${this.base()}/mcp-media/upload`, expiresIn: TICKET_SECONDS };
  }
  /** Consume before parsing any binary; one session can accept exactly one file. */
  async claim(ticket: string | undefined): Promise<Ticket> {
    if (!ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new ForbiddenException();
    const raw = await ioRedis.getdel(key('ticket', ticket));
    if (!raw) throw new ForbiddenException();
    const bound: Ticket = JSON.parse(raw);
    await this.active(bound.session, true);
    const session = await this.session(bound.session, bound.session.sessionId);
    if (session.state !== 'waiting') throw new ForbiddenException();
    const remaining = Math.max(1, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000));
    if (await ioRedis.set(key('claimed', session.sessionId), '1', 'EX', remaining, 'NX') !== 'OK') throw new ForbiddenException();
    bound.session = { ...session, state: 'uploading' };
    await this.save(bound.session);
    return bound;
  }
  async failed(bound: Ticket) {
    await this.save({ ...bound.session, state: 'failed', error: 'MEDIA_UPLOAD_FAILED' });
  }
  async upload(bound: Ticket, file: Express.Multer.File | undefined) {
    try {
      if (!file || (file.originalname !== bound.file.name && Buffer.from(file.originalname, 'latin1').toString('utf8') !== bound.file.name) || file.size !== bound.file.size || !file.path || file.buffer) throw new BadRequestException('The selected file does not match its upload ticket.');
      const originalName = bound.file.name;
      const source = await openDiskUploadV1({ path: file.path, size: file.size, originalname: originalName, mimetype: file.mimetype });
      const hash = createHash('sha256');
      try {
        for await (const chunk of source.stream) hash.update(chunk);
      } finally { await source.close(); }
      const sha256 = hash.digest('hex');
      const storage = UploadFactory.createStorage();
      if (!storage.uploadFileFromDiskV1) throw new BadRequestException('Disk upload is not supported by this storage provider');
      const stored = await storage.uploadFileFromDiskV1({ path: file.path, size: file.size, originalname: originalName, mimetype: file.mimetype });
      const row = await this.media.saveFile(bound.session.organizationId, stored.originalname, stored.path, originalName);
      await this.save({ ...bound.session, state: 'ready', mediaId: row.id, sha256 });
      return this.status(bound.session, bound.session.sessionId);
    } catch (error) {
      await this.failed(bound);
      if (/^(DISK_UPLOAD_|Unsupported file type\.$)/.test((error as Error)?.message || '')) throw new BadRequestException('Invalid file upload');
      throw error;
    }
  }
  async status(identity: Identity, sessionId: string) {
    await this.active(identity);
    const session = await this.session(identity, sessionId);
    const output = { sessionId, state: session.state, expiresAt: session.expiresAt, ...(session.error ? { error: session.error } : {}), ...(session.sha256 ? { sha256: session.sha256 } : {}) };
    if (!session.mediaId) return output;
    try { return { ...output, media: await this.metadata(identity, session.mediaId) }; }
    catch { return { ...output, state: 'failed' as const, error: 'MEDIA_NOT_AVAILABLE' }; }
  }
  async metadata(identity: Identity, mediaId: string) {
    await this.active(identity);
    const row = await this.media.getMediaById(identity.organizationId, mediaId);
    if (!row || row.deletedAt || row.organizationId !== identity.organizationId) throw new NotFoundException();
    const token = randomBytes(32).toString('base64url');
    await ioRedis.set(key('preview', token), JSON.stringify({ organizationId: identity.organizationId, userId: identity.userId, mediaId }), 'EX', PREVIEW_SECONDS);
    return { mediaId: row.id, name: (row.originalName || row.name).slice(0, 255),
      kind: mediaPresentationKind(row),
      previewUrl: `${this.base()}/mcp-media/preview/${token}`, previewExpiresAt: new Date(Date.now() + PREVIEW_SECONDS * 1000).toISOString(),
      // Library defaults are not per-post attachment settings and fileSize/type are unreliable in inherited rows.
    };
  }
  async preview(token: string, options: { signal?: AbortSignal; range?: string } = {}) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException();
    const raw = await ioRedis.get(key('preview', token));
    if (!raw) throw new NotFoundException();
    const scope: Identity & { mediaId: string } = JSON.parse(raw);
    await this.active(scope);
    return this.media.openOwnedMediaV1(scope.organizationId, scope.mediaId, options);
  }
  private base() {
    const urls = mcpUrls();
    if (!urls) throw new BadRequestException('MCP is not configured');
    return urls.issuer;
  }
}
