/**
 * The door that lets a signed-in person change their own password
 * (`content-factory-next-fn33.41`). Before it existed the only way through was
 * the emailed reset link, which a deployment without an email provider — the
 * default — never sends.
 *
 * What this suite holds: the current password is really checked, the new one is
 * measured by the same policy registration uses, the write goes through the
 * very call `/auth/forgot` finishes with (so hashing cannot drift), and an
 * account with no password sign-in is refused rather than given one.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    if (request.startsWith('@contentfactory/nestjs-libraries/')) {
      const candidate = path.join(
        repositoryRoot,
        'libraries/nestjs-libraries/src',
        `${request.slice('@contentfactory/nestjs-libraries/'.length)}.ts`
      );
      if (fs.existsSync(candidate)) {
        return loadTypeScriptModule(
          path.relative(repositoryRoot, candidate),
          mocks
        );
      }
    }
    if (request.startsWith('@contentfactory/helpers/')) {
      const candidate = path.join(
        repositoryRoot,
        'libraries/helpers/src',
        `${request.slice('@contentfactory/helpers/'.length)}.ts`
      );
      if (fs.existsSync(candidate)) {
        return loadTypeScriptModule(
          path.relative(repositoryRoot, candidate),
          mocks
        );
      }
    }
    return require(request);
  };
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const noOpParamDecorator = () => () => undefined;
const sameOriginGuard = jest.fn();

const { UsersController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/users.controller.ts',
  {
    '@prisma/client': { Provider: { LOCAL: 'LOCAL' } },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: noOpParamDecorator,
    },
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: noOpParamDecorator,
    },
    '@contentfactory/nestjs-libraries/user/organization.roles': {
      isOrganizationAdmin: () => false,
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
      { SubscriptionService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: { FREE: { channel: 5 } },
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
      { OrganizationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
      UsersService: class {},
    },
    '@contentfactory/nestjs-libraries/services/stripe.service': {
      StripeService: class {},
    },
    '@contentfactory/nestjs-libraries/services/exception.filter': {
      HttpForbiddenException: class extends Error {},
    },
    '@contentfactory/backend/services/auth/auth.service': {
      AuthService: class {},
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: () => () => undefined,
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      { AuthorizationActions: {}, Sections: {} },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: () => 'localhost',
    },
    '@contentfactory/nestjs-libraries/auth/same-origin-mutation': {
      assertSameOriginJsonMutation: (...args) => sameOriginGuard(...args),
      requestUserIdFromJwt: () => null,
    },
  }
);

const { AuthService: PasswordHashing } = loadTypeScriptModule(
  'libraries/helpers/src/auth/auth.service.ts'
);
const { isPasswordPolicyCompliant } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/password.policy.ts'
);

function buildController({
  hasLocalSignIn = async () => true,
  storedPassword = PasswordHashing.hashPassword('Current-1!'),
} = {}) {
  const updatePassword = jest.fn().mockResolvedValue({});
  // `auth.middleware.ts` strips `password` from the request user, so the hash
  // can only come from a fresh read (`content-factory-next-fn33.109`).
  const getUserById = jest.fn(async (id) => ({ id, password: storedPassword }));
  const userService = {
    hasLocalSignIn: jest.fn(hasLocalSignIn),
    updatePassword,
    getUserById,
  };
  const controller = new UsersController(
    {},
    {},
    {},
    {},
    userService
  );
  return { controller, userService, updatePassword };
}

const request = {
  headers: { 'content-type': 'application/json' },
  cookies: {},
};

beforeEach(() => {
  sameOriginGuard.mockReset();
});

async function refusal(promise) {
  try {
    await promise;
  } catch (error) {
    return {
      status: error.getStatus ? error.getStatus() : undefined,
      body: error.getResponse ? error.getResponse() : undefined,
    };
  }
  throw new Error('the door answered instead of refusing');
}

test('the change is written only when the current password matches', async () => {
  const { controller, updatePassword } = buildController();
  // Exactly what the middleware hands over: no hash on the request user.
  const user = { id: 'user-1' };

  const answer = await controller.changePassword(
    user,
    { currentPassword: 'Current-1!', newPassword: 'Brand-new-2!' },
    request
  );

  expect(answer).toEqual({ changed: true });
  // The same call `/auth/forgot` finishes with: it hashes and it refuses to
  // write a password onto an account that has no password sign-in.
  expect(updatePassword).toHaveBeenCalledWith('user-1', 'Brand-new-2!');
  // The plain new password never travels further than that one call.
  expect(updatePassword.mock.calls[0][1]).toBe('Brand-new-2!');
});

test('a wrong current password is refused by its own code, and nothing is written', async () => {
  const { controller, updatePassword } = buildController();
  const user = { id: 'user-1' };

  const refused = await refusal(
    controller.changePassword(
      user,
      { currentPassword: 'not-the-one', newPassword: 'Brand-new-2!' },
      request
    )
  );

  expect(refused.status).toBe(400);
  expect(refused.body.code).toBe('invalid_current_password');
  expect(updatePassword).not.toHaveBeenCalled();
});

test('an account with no password sign-in is refused, not given one', async () => {
  const withoutHash = buildController({ storedPassword: '' });
  const refusedEmptyHash = await refusal(
    withoutHash.controller.changePassword(
      { id: 'user-1' },
      { currentPassword: 'Current-1!', newPassword: 'Brand-new-2!' },
      request
    )
  );
  expect(refusedEmptyHash.status).toBe(404);
  expect(refusedEmptyHash.body.code).toBe('local_identity_not_found');
  expect(withoutHash.updatePassword).not.toHaveBeenCalled();

  const withoutIdentity = buildController({ hasLocalSignIn: async () => false });
  const refusedNoIdentity = await refusal(
    withoutIdentity.controller.changePassword(
      { id: 'user-1', password: PasswordHashing.hashPassword('Current-1!') },
      { currentPassword: 'Current-1!', newPassword: 'Brand-new-2!' },
      request
    )
  );
  expect(refusedNoIdentity.status).toBe(404);
  expect(refusedNoIdentity.body.code).toBe('local_identity_not_found');
  expect(withoutIdentity.updatePassword).not.toHaveBeenCalled();
});

test('the door goes through the shared same-origin check before anything else', async () => {
  const { controller, userService, updatePassword } = buildController();
  sameOriginGuard.mockImplementation(() => {
    throw new Error('refused by the shared boundary');
  });

  await expect(
    controller.changePassword(
      { id: 'user-1', password: PasswordHashing.hashPassword('Current-1!') },
      { currentPassword: 'Current-1!', newPassword: 'Brand-new-2!' },
      request
    )
  ).rejects.toThrow('refused by the shared boundary');

  expect(userService.hasLocalSignIn).not.toHaveBeenCalled();
  expect(updatePassword).not.toHaveBeenCalled();
  expect(sameOriginGuard).toHaveBeenCalledWith(
    'user-1',
    request,
    expect.objectContaining({ forbiddenCode: 'password_change_forbidden' }),
    expect.anything()
  );
});

test('the new password is measured by the same policy registration uses', () => {
  expect(isPasswordPolicyCompliant('Brand-new-2!')).toBe(true);
  expect(isPasswordPolicyCompliant('short1!')).toBe(true);
  expect(isPasswordPolicyCompliant('short')).toBe(false);
  expect(isPasswordPolicyCompliant('nodigits!')).toBe(false);

  const source = fs.readFileSync(
    path.join(
      repositoryRoot,
      'libraries/nestjs-libraries/src/dtos/users/change-password.dto.ts'
    ),
    'utf8'
  );
  expect(source).toContain('currentPassword');
  expect(source).toContain('newPassword');
  expect(source).toContain('isPasswordPolicyCompliant');
  // The stored password is not re-measured: it was chosen under whatever rule
  // held that day, and refusing it would lock out exactly the people who most
  // need to replace it. So the policy decorator sits above `newPassword` and
  // nowhere else.
  const declarations = source.split(/^export class ChangePasswordDto \{$/m)[1];
  const [beforeCurrent, afterCurrent] = declarations.split('currentPassword');
  expect(beforeCurrent).not.toContain('@newPasswordPolicy');
  expect(afterCurrent).toContain('@newPasswordPolicy');
  expect(afterCurrent.indexOf('@newPasswordPolicy')).toBeLessThan(
    afterCurrent.indexOf('newPassword:')
  );
});
