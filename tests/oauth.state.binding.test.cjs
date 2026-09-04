const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

/**
 * The login-CSRF fix lives half in the provider and half in the controller: the
 * provider refuses a callback whose browser never started the flow, and the
 * controller is what puts the proof in the browser and reads it back. Testing
 * only the provider would leave the wiring unproven, so this loads the real
 * controller and drives its two OAuth routes against a fake Express response.
 */
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
const nestCommon = {
  Body: noopDecorator,
  Controller: noopDecorator,
  Get: noopDecorator,
  Param: noopDecorator,
  Post: noopDecorator,
  Query: noopDecorator,
  Req: noopDecorator,
  Res: noopDecorator,
};

const { AuthController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/auth.controller.ts',
  {
    '@nestjs/common': nestCommon,
    '@nestjs/swagger': { ApiTags: noopDecorator },
    express: {},
    // The controller also carries the session-free invitation preview; this
    // suite drives the OAuth routes and only needs the import to resolve.
    '@contentfactory/nestjs-libraries/auth/team-invitation': {
      inspectTeamInvitation: async () => ({}),
      TeamInvitationError: class extends Error {},
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

const fakeResponse = () => {
  const cookies = new Map();
  return {
    cookies,
    cookie: jest.fn((name, value, options) =>
      cookies.set(name, { value, options })
    ),
    clearCookie: jest.fn((name) => cookies.delete(name)),
    json: jest.fn(function (body) {
      this.body = body;
      return this;
    }),
    header: jest.fn(),
    status: jest.fn(function () {
      return this;
    }),
  };
};

const stateful = 'https://oauth.telegram.org/auth?client_id=x&state=abc123';

beforeEach(() => {
  process.env.FRONTEND_URL = 'https://app.example';
  delete process.env.NOT_SECURED;
});

afterAll(() => {
  delete process.env.FRONTEND_URL;
});

describe('OAuth state is bound to the browser that asked for the link', () => {
  test('a link carrying state mirrors it into a short-lived hardened cookie', async () => {
    const authService = { oauthLink: jest.fn(async () => stateful) };
    const controller = new AuthController(authService, {});
    const response = fakeResponse();

    await expect(
      controller.oauthLink('TELEGRAM', {}, response)
    ).resolves.toBe(stateful);

    const cookie = response.cookies.get('oauth_state');
    expect(cookie.value).toBe('abc123');
    expect(cookie.options).toMatchObject({
      domain: '.app.example',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    // Five minutes matches the Redis lifetime of the PKCE verifier; a longer
    // cookie would keep authorizing a state the backend has already forgotten.
    expect(cookie.options.maxAge).toBe(1000 * 60 * 5);
  });

  test('a provider without state gets no cookie at all', async () => {
    const authService = {
      oauthLink: jest.fn(async () => 'https://github.com/login/oauth?client_id=x'),
    };
    const controller = new AuthController(authService, {});
    const response = fakeResponse();

    await controller.oauthLink('GITHUB', {}, response);
    expect(response.cookie).not.toHaveBeenCalled();
  });

  test('a link that is not a URL does not break the route', async () => {
    const authService = { oauthLink: jest.fn(async () => 'not-a-url') };
    const controller = new AuthController(authService, {});
    const response = fakeResponse();

    await expect(controller.oauthLink('WEIRD', {}, response)).resolves.toBe(
      'not-a-url'
    );
    expect(response.cookie).not.toHaveBeenCalled();
  });

  test('the callback hands the provider the cookie alongside the URL state', async () => {
    const checkExists = jest.fn(async () => ({ token: 'provider-token' }));
    const controller = new AuthController({ checkExists }, {});
    const response = fakeResponse();

    await controller.oauthExists(
      { cookies: { oauth_state: 'abc123' } },
      'the-code',
      'https://app.example/auth?provider=TELEGRAM',
      'abc123',
      'TELEGRAM',
      response
    );

    expect(checkExists).toHaveBeenCalledWith(
      'TELEGRAM',
      'the-code',
      'https://app.example/auth?provider=TELEGRAM',
      { state: 'abc123', browserState: 'abc123' }
    );
    expect(response.clearCookie).toHaveBeenCalledWith('oauth_state', {
      domain: '.app.example',
    });
  });

  test('a callback with no cookie reaches the provider as an unbound attempt', async () => {
    const checkExists = jest.fn(async () => ({ token: 'provider-token' }));
    const controller = new AuthController({ checkExists }, {});

    await controller.oauthExists(
      { cookies: {} },
      'the-code',
      undefined,
      'abc123',
      'TELEGRAM',
      fakeResponse()
    );

    expect(checkExists).toHaveBeenCalledWith('TELEGRAM', 'the-code', undefined, {
      state: 'abc123',
      browserState: undefined,
    });
  });
});
