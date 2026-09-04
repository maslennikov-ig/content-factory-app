/**
 * The invitation preview a browser without a session may ask for.
 *
 * `GET /user/join-org` answers the same question, but `UsersController` sits
 * behind `AuthMiddleware` (`api.module.ts`, `authenticatedController`), which
 * refuses anything without an `auth` cookie. A registration form has no session
 * by definition, so reading the invited address from that door was never going
 * to work — the request came back Forbidden and the field stayed empty.
 *
 * This door lives on `AuthController`, which is outside that middleware, and it
 * answers with exactly what the form needs. What it must not answer with is who
 * invited whom: the token in a URL is not proof of anything, and a stranger
 * pasting one should not learn an administrator's address.
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
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);

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

const noopDecorator = () => () => undefined;

class HttpException extends Error {
  constructor(response, status) {
    super(typeof response === 'string' ? response : response?.message);
    this.response = response;
    this.status = status;
  }
  getStatus() {
    return this.status;
  }
  getResponse() {
    return this.response;
  }
}

class TeamInvitationError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// The real preview, as `inspectTeamInvitation` returns it. `boundEmail` is
// optional — an invitation copied out of the interface is open to any address.
let preview = {
  workspaceName: 'Studio',
  inviterName: 'Ada',
  inviterEmail: 'ada@example.com',
  role: 'EDITOR',
  boundEmail: 'invited@example.com',
};
let inspectFails = null;
const inspectCalls = [];

const inspectTeamInvitation = jest.fn(async (token) => {
  inspectCalls.push(token);
  if (inspectFails) throw inspectFails;
  return preview;
});

const { AuthController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/auth.controller.ts',
  {
    '@nestjs/common': {
      Body: noopDecorator,
      Controller: noopDecorator,
      Get: noopDecorator,
      Param: noopDecorator,
      Post: noopDecorator,
      Query: noopDecorator,
      Req: noopDecorator,
      Res: noopDecorator,
      HttpException,
    },
    '@nestjs/swagger': { ApiTags: noopDecorator },
    express: {},
    '@contentfactory/nestjs-libraries/auth/team-invitation': {
      inspectTeamInvitation,
      TeamInvitationError,
    },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/login.user.dto': {
      LoginUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/forgot-return.password.dto': {
      ForgotReturnPasswordDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/forgot.password.dto': {
      ForgotPasswordDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/resend-activation.dto': {
      ResendActivationDto: class {},
    },
    '@contentfactory/backend/services/auth/auth.service': {
      AuthService: class {},
    },
    '@contentfactory/nestjs-libraries/services/email.service': {
      EmailService: class {},
    },
    '@contentfactory/helpers/subdomain/subdomain.management': {
      getCookieUrlFromDomain: (domain) => `.${new URL(domain).hostname}`,
    },
    'nestjs-real-ip': { RealIP: noopDecorator },
    '@contentfactory/nestjs-libraries/user/user.agent': {
      UserAgent: noopDecorator,
    },
    '@prisma/client': { Provider: { LOCAL: 'LOCAL' } },
    '@sentry/nestjs': { captureException: () => undefined },
  }
);

const inviteToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImludjEyIiwib3JnSWQiOiJvcmcifQ.c2lnbmF0dXJlLXZhbHVl';

const controller = () => new AuthController({}, {});

// The method the registration form calls, whatever it ends up being named.
const previewOf = (instance) =>
  instance.previewInvitation ?? instance.joinOrgPreview ?? instance.previewJoinOrg;

beforeEach(() => {
  inspectFails = null;
  inspectCalls.length = 0;
  inspectTeamInvitation.mockClear();
  preview = {
    workspaceName: 'Studio',
    inviterName: 'Ada',
    inviterEmail: 'ada@example.com',
    role: 'EDITOR',
    boundEmail: 'invited@example.com',
  };
});

describe('the invitation preview open without a session', () => {
  test('answers a valid token with the invited address and the workspace', async () => {
    const instance = controller();
    const answer = await previewOf(instance).call(instance, inviteToken);

    expect(inspectCalls).toEqual([inviteToken]);
    expect(answer).toEqual({
      workspaceName: 'Studio',
      boundEmail: 'invited@example.com',
    });
  });

  test('never tells a stranger who sent the invitation', async () => {
    const instance = controller();
    const answer = await previewOf(instance).call(instance, inviteToken);
    const printed = JSON.stringify(answer);

    expect(answer.inviterEmail).toBeUndefined();
    expect(answer.inviterName).toBeUndefined();
    expect(printed).not.toContain('ada@example.com');
    expect(printed).not.toContain('Ada');
  });

  test('omits the address for an invitation open to anyone', async () => {
    preview = {
      workspaceName: 'Studio',
      inviterName: 'Ada',
      inviterEmail: 'ada@example.com',
      role: 'EDITOR',
    };
    const instance = controller();

    expect(await previewOf(instance).call(instance, inviteToken)).toEqual({
      workspaceName: 'Studio',
    });
  });

  test('answers an invalid or spent invitation with the same 410 and code', async () => {
    for (const [code, status] of [
      ['invite_invalid', 410],
      ['invite_used', 410],
    ]) {
      inspectFails = new TeamInvitationError(code, status, 'no');
      const instance = controller();

      await expect(
        previewOf(instance).call(instance, 'not-a-token')
      ).rejects.toMatchObject({
        status,
        response: expect.objectContaining({ code }),
      });
    }
  });

  test('lets an unexpected failure through rather than answering 410', async () => {
    inspectFails = new Error('redis is down');
    const instance = controller();

    await expect(
      previewOf(instance).call(instance, inviteToken)
    ).rejects.toThrow('redis is down');
  });
});

describe('the door is reachable without a session', () => {
  const read = (relative) =>
    fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

  test('lives on a controller that is not behind AuthMiddleware', () => {
    const module = read('apps/backend/src/api/api.module.ts');
    const authenticated = module.slice(
      module.indexOf('const authenticatedController = ['),
      module.indexOf('];', module.indexOf('const authenticatedController = ['))
    );

    // The whole reason this door exists rather than a second route on
    // `UsersController`.
    expect(authenticated).toContain('UsersController');
    expect(authenticated).not.toContain('AuthController');

    const controllerSource = read(
      'apps/backend/src/api/routes/auth.controller.ts'
    );
    expect(controllerSource).toContain("@Get('/join-org')");
    // No policy decorator: there is no organization chosen yet to have a role
    // in, which is the same reasoning the matrix prints for `/user/join-org`.
    const door = controllerSource.slice(
      controllerSource.indexOf("@Get('/join-org')") - 200,
      controllerSource.indexOf("@Get('/join-org')")
    );
    expect(door).not.toContain('CheckPolicies');
  });

  test('the roles matrix names it beside the door that needs a session', () => {
    const matrix = read('docs/product/roles-matrix.md');
    const section = matrix.slice(matrix.indexOf('## Дверь приглашения'));

    expect(section).toContain('`/user/join-org`');
    expect(section).toMatch(/\|\s*`\/auth\/join-org`\s*\|/);
    // And it has to say the thing that makes it safe to open: no session, so
    // no inviter.
    expect(section).toMatch(/GET `\/auth\/join-org`/);
  });
});
