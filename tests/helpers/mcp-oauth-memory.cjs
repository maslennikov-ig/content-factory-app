'use strict';

/**
 * `McpOAuthRepository` in memory (`content-factory-next-kcxz.26`), with the
 * same single-use semantics as the Prisma one: a code and a refresh token are
 * spent by a compare-and-set, unique hashes are looked up exactly, and a grant
 * comes back with its client, person and workspace the way `include` shapes
 * it. The people and memberships are plain rows a test can change between
 * requests (a demotion, a disabled membership, a blocked account).
 */

const createMemoryMcpOAuthRepository = ({
  users = {},
  organizations = {},
  memberships = {},
} = {}) => {
  const clients = [];
  const grants = [];
  let sequence = 0;
  const id = (prefix) => `${prefix}-${(sequence += 1)}`;

  const withPerson = (grant) =>
    grant && {
      ...grant,
      client: clients.find((client) => client.id === grant.clientId),
      user: users[grant.userId],
      organization: organizations[grant.organizationId],
    };
  const byField = (field, value) =>
    value ? grants.find((grant) => grant[field] === value) : undefined;

  /** The clock rows are stamped with; a test moves it with the service's. */
  let now = () => new Date();
  const repository = {
    useClock(clock) {
      now = clock;
    },
    async createClient(data) {
      const client = { id: id('client'), createdAt: now(), updatedAt: now(), ...data };
      clients.push(client);
      return client;
    },
    async findClient(clientId) {
      return clients.find((client) => client.clientId === clientId) ?? null;
    },
    async createGrant(data) {
      // A foreign key, as Postgres answers when the client row is gone.
      if (!clients.some((client) => client.id === data.clientId)) {
        throw Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' });
      }
      const grant = {
        id: id('grant'),
        codeUsedAt: null,
        accessTokenHash: null,
        accessExpiresAt: null,
        refreshTokenHash: null,
        refreshExpiresAt: null,
        rotatedRefreshHash: null,
        revokedAt: null,
        createdAt: now(),
        updatedAt: now(),
        ...data,
      };
      grants.push(grant);
      return grant;
    },
    async findByCode(codeHash) {
      return withPerson(byField('codeHash', codeHash)) ?? null;
    },
    async consumeCode(grantId, codeHash) {
      const grant = grants.find(
        (one) => one.id === grantId && one.codeHash === codeHash && !one.codeUsedAt && !one.revokedAt
      );
      if (!grant) return false;
      Object.assign(grant, { codeUsedAt: now() });
      return true;
    },
    async sweepUnused(unusedBefore, deadBefore) {
      // The Prisma repository's two `deleteMany`, in the same order.
      const older = (at, than) => !!at && new Date(at) < than;
      for (let index = grants.length - 1; index >= 0; index -= 1) {
        const grant = grants[index];
        if (
          (!grant.codeUsedAt && older(grant.createdAt, unusedBefore)) ||
          older(grant.revokedAt, deadBefore) ||
          older(grant.refreshExpiresAt, deadBefore)
        ) {
          grants.splice(index, 1);
        }
      }
      for (let index = clients.length - 1; index >= 0; index -= 1) {
        const client = clients[index];
        if (client.createdAt < unusedBefore && !grants.some((grant) => grant.clientId === client.id)) clients.splice(index, 1);
      }
    },
    async setTokens(grantId, tokens, replacing) {
      const grant = grants.find(
        (one) =>
          one.id === grantId &&
          !one.revokedAt &&
          (!replacing || one.refreshTokenHash === replacing)
      );
      if (!grant) return false;
      Object.assign(grant, tokens, replacing ? { rotatedRefreshHash: replacing } : {});
      return true;
    },
    async findByRefresh(hash) {
      return withPerson(byField('refreshTokenHash', hash)) ?? null;
    },
    async findByRotatedRefresh(hash) {
      const grant = byField('rotatedRefreshHash', hash);
      return grant ? { id: grant.id } : null;
    },
    async findByAccess(hash) {
      return withPerson(byField('accessTokenHash', hash)) ?? null;
    },
    async membership(userId, organizationId) {
      return memberships[`${userId}:${organizationId}`] ?? null;
    },
    async revoke(grantId) {
      const grant = grants.find((one) => one.id === grantId && !one.revokedAt);
      if (grant) {
        Object.assign(grant, {
          revokedAt: now(),
          accessTokenHash: null,
          refreshTokenHash: null,
          codeHash: null,
        });
      }
      return { count: grant ? 1 : 0 };
    },
    async revokeOwn(userId, grantId) {
      const grant = grants.find((one) => one.id === grantId && one.userId === userId);
      return grant ? repository.revoke(grantId) : { count: 0 };
    },
    async listLive(userId, now) {
      return grants
        .filter(
          (grant) =>
            grant.userId === userId &&
            !grant.revokedAt &&
            grant.refreshTokenHash &&
            grant.refreshExpiresAt > now
        )
        .map((grant) => ({
          ...grant,
          client: { name: clients.find((client) => client.id === grant.clientId).name },
          organization: { name: organizations[grant.organizationId].name },
        }));
    },
  };

  return { repository, clients, grants, users, organizations, memberships };
};

/** One workspace, one editor and one reader — the shapes the service selects. */
const standardPeople = () => ({
  users: {
    'user-1': { id: 'user-1', activated: true, blockedAt: null, language: 'ru', timezone: 180 },
    'user-2': { id: 'user-2', activated: true, blockedAt: null, language: 'en', timezone: 0 },
  },
  organizations: {
    'org-1': { id: 'org-1', name: 'Stand kcxz', createdAt: new Date('2026-01-01T00:00:00.000Z') },
  },
  memberships: {
    'user-1:org-1': { role: 'EDITOR', disabled: false },
    'user-2:org-1': { role: 'USER', disabled: false },
  },
});

module.exports = { createMemoryMcpOAuthRepository, standardPeople };
