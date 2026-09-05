'use strict';

/**
 * `content-factory-next-fn33.102`: the last administrator survives two people
 * demoting each other at the same moment.
 *
 * The rule itself is old — `content-factory-next-fn33.19` — and it was read
 * correctly: a workspace whose administrators have all become members is a
 * workspace nobody can invite into, connect a channel to or hand over, and
 * getting back out of it needs database access. What was wrong was where the
 * reading happened. `countAdmins` was one call and the write was another, so
 * two administrators demoting each other both counted two, both passed, and
 * both wrote. The count was true when it was taken and false by the time it
 * was used.
 *
 * The fix is not a bigger count. It is that the count and the write are the
 * same transaction, opened `Serializable`, so Postgres refuses to let the two
 * of them pretend they happened one after another when they did not.
 *
 * What a stub database can honestly prove, and what it cannot. It cannot prove
 * that Postgres detects the conflict — that is Postgres's promise, and asking
 * a stub to keep it would be circular. It can prove the three things this
 * repository is answerable for: that the count is taken inside the
 * transaction that writes and not before it, that the transaction is opened at
 * the isolation level which makes the count binding, and that a refused
 * transaction is retried and re-reads rather than surfacing as a failure. The
 * race tests run transactions one at a time — which is exactly what
 * `Serializable` buys — and show the second demotion reading the first one's
 * result instead of a stale two.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const noopDecorator = () => () => undefined;

class HttpException extends Error {
  constructor(response, status) {
    super(typeof response === 'string' ? response : response?.message);
    this.status = status;
  }
}

const prismaClient = {
  Role: {
    SUPERADMIN: 'SUPERADMIN',
    ADMIN: 'ADMIN',
    EDITOR: 'EDITOR',
    USER: 'USER',
  },
  ShortLinkPreference: {},
  SubscriptionTier: { STANDARD: 'STANDARD' },
};

const { OrganizationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
    '@prisma/client': prismaClient,
    '@nestjs/common': {
      HttpException,
      Injectable: noopDecorator,
      Logger: class Logger {},
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { fixedEncryption: () => '', hashPassword: () => '' },
    },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CONTENT_WORKFLOW_TAGS: [],
      CreateOrgUserDto: class CreateOrgUserDto {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/starter-template': {
      CONTENT_WORKFLOW_TAG_KEYS: [],
    },
    '@contentfactory/helpers/auth/registration.approval': {},
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
      normalizeIdentityIdentifier: (_provider, value) => value,
    },
    '@contentfactory/helpers/auth/newsletter.consent': {
      NEWSLETTER_CONSENT_SOURCE_REGISTRATION: 'registration',
    },
    '@contentfactory/nestjs-libraries/locale/backend-strings': {
      resolveBackendLocale: () => 'en',
      translateBackendString: (key) => key,
    },
  }
);

const { OrganizationService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts',
  {
    '@nestjs/common': { HttpException, Injectable: noopDecorator },
    '@prisma/client': prismaClient,
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository':
      { OrganizationRepository: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service':
      { AutopostService: class {} },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto': {
      AddTeamMemberDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto': {
      AdminAddTeamMemberDto: class {},
    },
    '@contentfactory/nestjs-libraries/auth/team-invitation': {
      TEAM_INVITATION_TTL_SECONDS: 604800,
      issueTeamInvitation: async () => 'token',
    },
  }
);

const ADMINISTRATOR = ['ADMIN', 'SUPERADMIN'];

/**
 * A membership table, a `$transaction` that runs one body at a time, and a
 * record of which calls reached the table through the transaction and which
 * went round it.
 *
 * Running the bodies one at a time is the point: `Serializable` promises the
 * outcome is *as if* they ran one after another, so a stub that actually does
 * is the most favourable database this code will ever meet. Anything that
 * still loses an administrator here loses one everywhere.
 *
 * `conflictOnce` fails the first body the way Postgres fails a serialization
 * conflict — `P2034` — so the retry can be watched.
 */
const workspace = (memberships, { conflictOnce = false } = {}) => {
  const rows = memberships.map((one) => ({ ...one }));
  const opened = [];
  const inside = [];
  const around = [];
  let pendingConflict = conflictOnce;

  const table = (log) => ({
    findFirst: async ({ where, select }) => {
      log.push(['findFirst', where]);
      const row = rows.find(
        (one) =>
          one.userId === where.userId &&
          one.organizationId === where.organizationId
      );
      if (!row) return null;
      return select ? { id: row.userId, role: row.role } : { ...row };
    },
    count: async ({ where }) => {
      log.push(['count', where]);
      return rows.filter(
        (one) =>
          one.organizationId === where.organizationId &&
          where.role.in.includes(one.role)
      ).length;
    },
    update: async ({ where, data }) => {
      log.push(['update', where]);
      const key = where.userId_organizationId;
      const row = rows.find(
        (one) =>
          one.userId === key.userId && one.organizationId === key.organizationId
      );
      Object.assign(row, data);
      return { ...row };
    },
    delete: async ({ where }) => {
      log.push(['delete', where]);
      const key = where.userId_organizationId;
      const at = rows.findIndex(
        (one) =>
          one.userId === key.userId && one.organizationId === key.organizationId
      );
      const [row] = rows.splice(at, 1);
      return row;
    },
  });

  const client = { userOrganization: table(inside) };

  let queue = Promise.resolve();
  const transaction = {
    model: {
      $transaction: (run, options) => {
        opened.push(options);
        const attempt = queue.then(async () => {
          if (pendingConflict) {
            pendingConflict = false;
            const conflict = new Error('write conflict');
            conflict.code = 'P2034';
            throw conflict;
          }
          return run(client);
        });
        queue = attempt.then(
          () => undefined,
          () => undefined
        );
        return attempt;
      },
    },
  };

  const organizations = {
    model: {
      organization: {
        findMany: async ({ where }) => {
          const userId = where.users.some.userId;
          return rows
            .filter((one) => one.userId === userId)
            .map((one) => ({
              id: one.organizationId,
              users: [{ role: one.role, disabled: false }],
            }));
        },
      },
    },
  };

  const repository = new OrganizationRepository(
    organizations,
    { model: { userOrganization: table(around) } },
    { model: {} },
    transaction
  );

  return {
    rows,
    opened,
    inside,
    around,
    repository,
    administrators: () =>
      rows.filter((one) => ADMINISTRATOR.includes(one.role)).length,
    service: new OrganizationService(repository, {
      hasEmailProvider: () => true,
      sendEmail: async () => undefined,
    }),
  };
};

const asOrganization = (role) => ({ id: 'org', users: [{ role }] });

describe('two administrators demoting each other at the same moment', () => {
  test('one of them is refused, and the workspace keeps an administrator', async () => {
    const { service, administrators, rows } = workspace([
      { userId: 'ada', organizationId: 'org', role: 'ADMIN' },
      { userId: 'grace', organizationId: 'org', role: 'ADMIN' },
    ]);

    // Both calls start before either is awaited: this is the shape of the
    // defect, two requests arriving at the same moment on two workers.
    const results = await Promise.allSettled([
      service.updateTeamMemberRole(
        asOrganization('ADMIN'),
        { id: 'ada' },
        'grace',
        'USER'
      ),
      service.updateTeamMemberRole(
        asOrganization('ADMIN'),
        { id: 'grace' },
        'ada',
        'USER'
      ),
    ]);

    expect(administrators()).toBe(1);
    expect(results.filter((one) => one.status === 'rejected')).toHaveLength(1);
    expect(
      results.find((one) => one.status === 'rejected').reason.message
    ).toBe('The workspace must keep at least one administrator');
    expect(rows).toHaveLength(2);
  });

  test('the same race through removal leaves the workspace an administrator', async () => {
    const { service, administrators } = workspace([
      { userId: 'ada', organizationId: 'org', role: 'ADMIN' },
      { userId: 'grace', organizationId: 'org', role: 'ADMIN' },
    ]);

    const results = await Promise.allSettled([
      service.deleteTeamMember(asOrganization('ADMIN'), 'grace'),
      service.deleteTeamMember(asOrganization('ADMIN'), 'ada'),
    ]);

    expect(administrators()).toBe(1);
    expect(results.filter((one) => one.status === 'rejected')).toHaveLength(1);
  });
});

describe('the count that decides is taken where it binds', () => {
  test('demotion counts administrators inside the transaction it writes in', async () => {
    const { repository, opened, inside, around } = workspace([
      { userId: 'ada', organizationId: 'org', role: 'ADMIN' },
      { userId: 'grace', organizationId: 'org', role: 'ADMIN' },
    ]);

    await repository.updateTeamMemberRole('org', 'grace', 'USER');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ isolationLevel: 'Serializable' });
    expect(inside.map(([operation]) => operation)).toContain('count');
    expect(inside.map(([operation]) => operation)).toContain('update');
    // Nothing about this decision reached the table around the transaction.
    expect(around).toEqual([]);
  });

  test('removal does the same', async () => {
    const { repository, opened, inside, around } = workspace([
      { userId: 'ada', organizationId: 'org', role: 'ADMIN' },
      { userId: 'grace', organizationId: 'org', role: 'ADMIN' },
    ]);

    await repository.deleteTeamMember('org', 'grace');

    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ isolationLevel: 'Serializable' });
    expect(inside.map(([operation]) => operation)).toContain('count');
    expect(inside.map(([operation]) => operation)).toContain('delete');
    expect(around).toEqual([]);
  });

  test('a serialization conflict is retried rather than reported', async () => {
    const { repository, opened, administrators } = workspace(
      [
        { userId: 'ada', organizationId: 'org', role: 'ADMIN' },
        { userId: 'grace', organizationId: 'org', role: 'ADMIN' },
      ],
      { conflictOnce: true }
    );

    await repository.updateTeamMemberRole('org', 'grace', 'USER');

    expect(opened.length).toBeGreaterThan(1);
    expect(administrators()).toBe(1);
  });

  test('the last administrator is refused with nobody racing at all', async () => {
    const { repository, administrators } = workspace([
      { userId: 'ada', organizationId: 'org', role: 'ADMIN' },
      { userId: 'writer', organizationId: 'org', role: 'EDITOR' },
    ]);

    await expect(
      repository.updateTeamMemberRole('org', 'ada', 'USER')
    ).rejects.toThrow('The workspace must keep at least one administrator');
    expect(administrators()).toBe(1);
  });

  test('a role change that is not a demotion never has to count', async () => {
    const { repository, inside } = workspace([
      { userId: 'ada', organizationId: 'org', role: 'ADMIN' },
      { userId: 'writer', organizationId: 'org', role: 'USER' },
    ]);

    await repository.updateTeamMemberRole('org', 'writer', 'EDITOR');

    expect(inside.map(([operation]) => operation)).not.toContain('count');
  });
});
