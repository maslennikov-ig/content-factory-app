import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';

/**
 * Storage of the MCP OAuth server (`content-factory-next-kcxz.26`). Codes and
 * tokens arrive here already hashed; the single-use steps (a code, a refresh
 * token) are compare-and-set updates, so two parallel requests cannot both
 * spend one.
 */

const grantWithPerson = {
  client: { select: { id: true, clientId: true, name: true } },
  user: {
    select: {
      id: true,
      activated: true,
      blockedAt: true,
      language: true,
      timezone: true,
    },
  },
  organization: { select: { id: true, name: true, createdAt: true } },
} as const;

@Injectable()
export class McpOAuthRepository {
  constructor(
    private _store: PrismaRepository<'mcpOAuthClient' | 'mcpOAuthGrant' | 'userOrganization'>
  ) {}

  createClient(data: { clientId: string; name: string; redirectUris: string[] }) {
    return this._store.model.mcpOAuthClient.create({ data });
  }

  findClient(clientId: string) {
    return this._store.model.mcpOAuthClient.findUnique({ where: { clientId } });
  }

  createGrant(data: {
    clientId: string;
    userId: string;
    organizationId: string;
    resource: string;
    scope: string;
    redirectUri: string;
    codeHash: string;
    codeChallenge: string;
    codeExpiresAt: Date;
  }) {
    return this._store.model.mcpOAuthGrant.create({ data });
  }

  findByCode(codeHash: string) {
    return this._store.model.mcpOAuthGrant.findUnique({
      where: { codeHash },
      include: grantWithPerson,
    });
  }

  /**
   * Spends a code: only the request that marks it used may exchange it. The
   * hash stays, so a second exchange finds the grant and revokes it.
   */
  async consumeCode(id: string, codeHash: string) {
    const { count } = await this._store.model.mcpOAuthGrant.updateMany({
      where: { id, codeHash, codeUsedAt: null, revokedAt: null },
      // The challenge stays: a replay is recognised only with the verifier (R3).
      data: { codeUsedAt: new Date() },
    });
    return count === 1;
  }

  /**
   * Housekeeping on each registration (review W5-26 F3, R1; walk review F3).
   * First the dead grants: one whose code was never exchanged, created before
   * `unusedBefore`, and one revoked or whose refresh token expired before
   * `deadBefore`. Then the clients: a client older than `unusedBefore` with
   * no grant row left goes. A client with any grant stays — an assistant
   * that kept its `client_id` reconnects after a disconnect — until its last
   * grant is swept.
   */
  async sweepUnused(unusedBefore: Date, deadBefore: Date) {
    await this._store.model.mcpOAuthGrant.deleteMany({
      where: {
        OR: [
          { codeUsedAt: null, createdAt: { lt: unusedBefore } },
          { revokedAt: { lt: deadBefore } },
          { refreshExpiresAt: { lt: deadBefore } },
        ],
      },
    });
    await this._store.model.mcpOAuthClient.deleteMany({
      where: { createdAt: { lt: unusedBefore }, grants: { none: {} } },
    });
  }

  /**
   * Writes a new token pair. With `replacing`, only while that refresh token
   * is still the current one (rotation as compare-and-set).
   */
  async setTokens(
    id: string,
    tokens: {
      accessTokenHash: string;
      accessExpiresAt: Date;
      refreshTokenHash: string;
      refreshExpiresAt: Date;
    },
    replacing?: string
  ) {
    const { count } = await this._store.model.mcpOAuthGrant.updateMany({
      where: {
        id,
        revokedAt: null,
        ...(replacing ? { refreshTokenHash: replacing } : {}),
      },
      data: {
        ...tokens,
        ...(replacing ? { rotatedRefreshHash: replacing } : {}),
      },
    });
    return count === 1;
  }

  findByRefresh(refreshTokenHash: string) {
    return this._store.model.mcpOAuthGrant.findUnique({
      where: { refreshTokenHash },
      include: grantWithPerson,
    });
  }

  findByRotatedRefresh(rotatedRefreshHash: string) {
    return this._store.model.mcpOAuthGrant.findUnique({
      where: { rotatedRefreshHash },
      select: { id: true },
    });
  }

  findByAccess(accessTokenHash: string) {
    return this._store.model.mcpOAuthGrant.findUnique({
      where: { accessTokenHash },
      include: grantWithPerson,
    });
  }

  /** The member row the role is read from, on every request. */
  membership(userId: string, organizationId: string) {
    return this._store.model.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true, disabled: true },
    });
  }

  revoke(id: string) {
    return this._store.model.mcpOAuthGrant.updateMany({
      where: { id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        accessTokenHash: null,
        refreshTokenHash: null,
        codeHash: null,
      },
    });
  }

  /** The person's own connection only. */
  revokeOwn(userId: string, id: string) {
    return this._store.model.mcpOAuthGrant.updateMany({
      where: { id, userId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        accessTokenHash: null,
        refreshTokenHash: null,
        codeHash: null,
      },
    });
  }

  /** Live connections: a token pair was issued and the refresh has not run out. */
  listLive(userId: string, now: Date) {
    return this._store.model.mcpOAuthGrant.findMany({
      where: {
        userId,
        revokedAt: null,
        refreshTokenHash: { not: null },
        refreshExpiresAt: { gt: now },
      },
      include: {
        client: { select: { name: true } },
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
