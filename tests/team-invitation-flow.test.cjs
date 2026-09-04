'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const nest = {
  Controller: () => (target) => target,
  Get: () => () => undefined,
  Post: () => () => undefined,
  Delete: () => () => undefined,
  Body: () => () => undefined,
  Query: () => () => undefined,
  Req: () => () => undefined,
  Res: () => () => undefined,
  Logger: class {
    error() {}
  },
  HttpException: class HttpException extends Error {
    constructor(body, status) {
      super(typeof body === 'string' ? body : body?.message);
      this.body = body;
      this.status = status;
    }
    getStatus() {
      return this.status;
    }
    getResponse() {
      return this.body;
    }
  },
};

const invitationClaims = {
  id: 'invite-1',
  orgId: 'org-1',
  role: 'ADMIN',
  workspaceName: 'Studio',
  inviterName: 'Owner',
  inviterEmail: 'owner@example.com',
  boundEmail: 'guest@example.com',
  timeLimit: new Date(Date.now() + 60_000).toISOString(),
};
let currentInvitationClaims;

let invitationOutstanding;
let redisSet;
const fakeRedis = {
  async set(key, value, mode, ttlSeconds) {
    redisSet = { key, value, mode, ttlSeconds };
    invitationOutstanding = true;
    return 'OK';
  },
  async get() {
    return invitationOutstanding ? 'issued' : null;
  },
  async getdel() {
    if (!invitationOutstanding) return null;
    invitationOutstanding = false;
    return 'issued';
  },
};

const authChecker = {
  signJWT: (claims) => {
    currentInvitationClaims = claims;
    return 'signed-invitation';
  },
  verifyJWT: (token) => {
    if (token === 'signed-invitation') return currentInvitationClaims;
    if (token === 'session-right-user') return { id: 'right-user' };
    if (token === 'session-link-holder') return { id: 'link-holder' };
    if (token === 'session-wrong-user') return { id: 'wrong-user' };
    return { id: 'other-user' };
  },
};

const invitationSource =
  'libraries/nestjs-libraries/src/auth/team-invitation.ts';

const invitationModuleMocks = {
  '@contentfactory/helpers/auth/auth.service': { AuthService: authChecker },
  '@contentfactory/nestjs-libraries/redis/redis.service': {
    ioRedis: fakeRedis,
  },
  '@contentfactory/nestjs-libraries/user/organization.roles': {
    ASSIGNABLE_ORGANIZATION_ROLES: ['USER', 'EDITOR', 'ADMIN'],
  },
};

const { issueTeamInvitation } = loadTypeScriptModule(
  invitationSource,
  invitationModuleMocks
);

const { UsersController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/users.controller.ts',
  {
    '@nestjs/common': nest,
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/user/organization.roles': {
      isOrganizationAdmin: () => false,
      ASSIGNABLE_ORGANIZATION_ROLES: ['USER', 'EDITOR', 'ADMIN'],
    },
    jsonwebtoken: { sign: () => 'jwt' },
    '@prisma/client': {},
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
      {},
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/services/stripe.service': {},
    '@contentfactory/backend/services/auth/auth.service': {},
    '@contentfactory/helpers/auth/auth.service': { AuthService: authChecker },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
      {},
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: () => () => undefined,
    },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: () => 'example.com',
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: { FREE: { channel: 1 } },
    },
    '@nestjs/swagger': { ApiTags: () => (target) => target },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {},
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/link-user-identity.dto': {},
    '@contentfactory/nestjs-libraries/services/exception.filter': {
      HttpForbiddenException: class extends Error {},
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      { AuthorizationActions: {}, Sections: {} },
    '@contentfactory/nestjs-libraries/redis/redis.service': {
      ioRedis: fakeRedis,
    },
  },
  {
    sources: {
      '@contentfactory/nestjs-libraries/auth/team-invitation': invitationSource,
    },
  }
);

const responseRecorder = () => {
  const response = {
    statusCode: 200,
    body: undefined,
    cookieWrites: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
    cookie(...args) {
      this.cookieWrites.push(args);
      return this;
    },
  };
  return response;
};

const mutationRequest = (userId, headers = {}) => ({
  headers: {
    'content-type': 'application/json',
    origin: 'https://factory.example',
    ...headers,
  },
  cookies: { auth: `session-${userId}` },
});

let existingMemberships;

const controllerWithAdds = (adds, addImplementation) =>
  new UsersController(
    null,
    null,
    null,
    {
      addUserToOrg: async (...args) => {
        adds.push(args);
        if (addImplementation) return addImplementation(...args);
        return { organizationId: invitationClaims.orgId };
      },
      isUserInOrg: async (userId, orgId) =>
        existingMemberships.has(`${userId}:${orgId}`),
    },
    null
  );

beforeEach(() => {
  invitationOutstanding = true;
  redisSet = undefined;
  currentInvitationClaims = invitationClaims;
  existingMemberships = new Set();
  process.env.FRONTEND_URL = 'https://factory.example/app';
});

test('issuing an invitation stores only a short-lived one-time marker', async () => {
  const token = await issueTeamInvitation({
    id: 'invite-2',
    orgId: 'org-2',
    role: 'EDITOR',
    workspaceName: 'Desk',
    inviterName: 'Editor',
    inviterEmail: 'editor@example.com',
  });

  expect(token).toBe('signed-invitation');
  expect(currentInvitationClaims).toMatchObject({
    id: 'invite-2',
    orgId: 'org-2',
    role: 'EDITOR',
  });
  expect(Date.parse(currentInvitationClaims.timeLimit)).toBeGreaterThan(
    Date.now()
  );
  expect(redisSet).toMatchObject({
    value: 'issued',
    mode: 'EX',
    ttlSeconds: 2 * 24 * 60 * 60,
  });
});

test('preview names the inviter, workspace, addressee and signed role without spending the invitation', async () => {
  const controller = controllerWithAdds([]);

  expect(typeof controller.previewJoinOrg).toBe('function');
  const preview = await controller.previewJoinOrg(
    { id: 'right-user', email: 'guest@example.com' },
    'signed-invitation'
  );

  expect(preview).toEqual({
    workspaceName: 'Studio',
    inviterName: 'Owner',
    inviterEmail: 'owner@example.com',
    role: 'ADMIN',
    boundEmail: 'guest@example.com',
    emailMismatch: false,
    alreadyMember: false,
  });
  expect(invitationOutstanding).toBe(true);
});

/**
 * `content-factory-next-fn33.11`. The owner opened a link addressed to
 * somebody else while signed in as themselves, and the page offered «Accept».
 * The preview answers the two questions the page could not ask before: who is
 * this for, and is the signed-in account already inside.
 */
test('preview tells a differently addressed account that the invitation is not theirs', async () => {
  const controller = controllerWithAdds([]);

  const preview = await controller.previewJoinOrg(
    { id: 'wrong-user', email: 'Owner@Example.com' },
    'signed-invitation'
  );

  expect(preview).toMatchObject({
    boundEmail: 'guest@example.com',
    emailMismatch: true,
  });
  expect(invitationOutstanding).toBe(true);
});

test('preview tells an account that is already in the workspace', async () => {
  existingMemberships.add('right-user:org-1');
  const controller = controllerWithAdds([]);

  await expect(
    controller.previewJoinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation'
    )
  ).resolves.toMatchObject({ alreadyMember: true, emailMismatch: false });
});

test('a copied link has no addressee and never reads as a mismatch', async () => {
  currentInvitationClaims = { ...invitationClaims, boundEmail: undefined };
  const controller = controllerWithAdds([]);

  const preview = await controller.previewJoinOrg(
    { id: 'link-holder', email: 'anyone@example.com' },
    'signed-invitation'
  );

  expect(preview.boundEmail).toBeUndefined();
  expect(preview).toMatchObject({ emailMismatch: false, alreadyMember: false });
});

test('an email-bound invitation rejects another signed-in address without spending the invitation', async () => {
  const adds = [];
  const controller = controllerWithAdds(adds);

  await expect(
    controller.joinOrg(
      { id: 'wrong-user', email: 'WRONG@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('wrong-user')
    )
  ).rejects.toMatchObject({
    status: 403,
    body: { code: 'invite_email_mismatch' },
  });

  expect(adds).toEqual([]);
  expect(invitationOutstanding).toBe(true);
});

test('an accepted invitation is single-use', async () => {
  const adds = [];
  const controller = controllerWithAdds(adds);
  const response = responseRecorder();

  await controller.joinOrg(
    { id: 'right-user', email: 'Guest@Example.COM' },
    'signed-invitation',
    response,
    mutationRequest('right-user')
  );

  expect(response.body).toEqual({
    id: 'org-1',
    workspaceName: 'Studio',
    role: 'ADMIN',
  });
  expect(response.cookieWrites).toEqual([
    ['showorg', 'org-1', expect.objectContaining({ httpOnly: true })],
  ]);

  await expect(
    controller.joinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('right-user')
    )
  ).rejects.toMatchObject({
    status: 410,
    body: { code: 'invite_used' },
  });

  expect(adds).toHaveLength(1);
});

test('a refused membership write reports failure after burning the invitation', async () => {
  const controller = controllerWithAdds([], async () => false);

  await expect(
    controller.joinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('right-user')
    )
  ).rejects.toMatchObject({
    status: 409,
    body: { code: 'invite_membership_failed' },
  });
  expect(invitationOutstanding).toBe(false);
});

test('a copied invitation link is unbound but still requires explicit acceptance', async () => {
  currentInvitationClaims = { ...invitationClaims, boundEmail: undefined };
  const adds = [];
  const controller = controllerWithAdds(adds);

  await controller.joinOrg(
    { id: 'link-holder', email: 'anyone@example.com' },
    'signed-invitation',
    responseRecorder(),
    mutationRequest('link-holder')
  );

  expect(adds).toHaveLength(1);
});

test('two concurrent accepts permit exactly one membership write', async () => {
  const adds = [];
  const controller = controllerWithAdds(adds);

  const attempts = await Promise.allSettled([
    controller.joinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('right-user')
    ),
    controller.joinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('right-user')
    ),
  ]);

  expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(
    1
  );
  expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(
    1
  );
  expect(adds).toHaveLength(1);
});

test('a failed membership write burns the invitation and requires a new invite', async () => {
  const adds = [];
  const controller = controllerWithAdds(adds, async () => {
    throw new Error('database unavailable');
  });

  await expect(
    controller.joinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('right-user')
    )
  ).rejects.toThrow('database unavailable');

  await expect(
    controller.joinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('right-user')
    )
  ).rejects.toMatchObject({
    status: 410,
    body: { code: 'invite_used' },
  });
  expect(adds).toHaveLength(1);
});

test.each([
  ['missing Origin', { origin: undefined }],
  ['foreign Origin', { origin: 'https://attacker.example' }],
  ['non-JSON body', { 'content-type': 'text/plain' }],
  ['different session identity', { auth: 'session-other-user' }],
])(
  'the HTTP invitation acceptance door fails closed for %s',
  async (_label, headers) => {
    const adds = [];
    const controller = controllerWithAdds(adds);

    await expect(
      controller.joinOrg(
        { id: 'right-user', email: 'guest@example.com' },
        'signed-invitation',
        responseRecorder(),
        mutationRequest('right-user', headers)
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(adds).toEqual([]);
    expect(invitationOutstanding).toBe(true);
  }
);

/**
 * `content-factory-next-fn33.6`. Accepting into a workspace the account is
 * already in used to reach `userOrganization.create`, hit the unique index and
 * return a 500 — after `GETDEL` had already spent the invitation. The person
 * lost the link for a state that was never an error.
 */
test('accepting into a workspace the account is already in keeps the invitation', async () => {
  const adds = [];
  existingMemberships.add(`right-user:org-1`);
  const controller = controllerWithAdds(adds);

  await expect(
    controller.joinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('right-user')
    )
  ).rejects.toMatchObject({
    status: 409,
    body: { code: 'invite_already_member' },
  });

  expect(adds).toEqual([]);
  expect(invitationOutstanding).toBe(true);
});

/**
 * `content-factory-next-fn33.5`. «Decline» used to change nothing but the
 * browser's mind: the link stayed live for the rest of its two days, and a
 * copied one stayed live for anybody. Declining now spends the same one-time
 * marker that accepting does.
 */
test('declining spends the invitation, so accepting afterwards is refused', async () => {
  const adds = [];
  const controller = controllerWithAdds(adds);

  expect(typeof controller.declineJoinOrg).toBe('function');
  await expect(
    controller.declineJoinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      mutationRequest('right-user')
    )
  ).resolves.toEqual({ declined: true });
  expect(invitationOutstanding).toBe(false);

  await expect(
    controller.joinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      responseRecorder(),
      mutationRequest('right-user')
    )
  ).rejects.toMatchObject({ status: 410, body: { code: 'invite_used' } });
  expect(adds).toEqual([]);
});

test('declining twice reports the invitation as already spent', async () => {
  const controller = controllerWithAdds([]);

  await controller.declineJoinOrg(
    { id: 'right-user', email: 'guest@example.com' },
    'signed-invitation',
    mutationRequest('right-user')
  );

  await expect(
    controller.declineJoinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      mutationRequest('right-user')
    )
  ).rejects.toMatchObject({ status: 410, body: { code: 'invite_used' } });
});

/**
 * Declining is destructive, so it needs the same authority accepting needs.
 * Otherwise anyone signed in who saw a bound link could burn somebody else's
 * invitation without ever being able to use it.
 */
test('an email-bound invitation cannot be declined by another address', async () => {
  const controller = controllerWithAdds([]);

  await expect(
    controller.declineJoinOrg(
      { id: 'wrong-user', email: 'wrong@example.com' },
      'signed-invitation',
      mutationRequest('wrong-user')
    )
  ).rejects.toMatchObject({
    status: 403,
    body: { code: 'invite_email_mismatch' },
  });
  expect(invitationOutstanding).toBe(true);
});

test.each([
  ['missing Origin', { origin: undefined }],
  ['foreign Origin', { origin: 'https://attacker.example' }],
  ['non-JSON body', { 'content-type': 'text/plain' }],
  ['different session identity', { auth: 'session-other-user' }],
])('the HTTP decline door fails closed for %s', async (_label, headers) => {
  const controller = controllerWithAdds([]);

  await expect(
    controller.declineJoinOrg(
      { id: 'right-user', email: 'guest@example.com' },
      'signed-invitation',
      mutationRequest('right-user', headers)
    )
  ).rejects.toMatchObject({ status: 403 });
  expect(invitationOutstanding).toBe(true);
});
