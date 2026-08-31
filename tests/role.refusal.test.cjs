const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}, jsx = false) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
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

class HttpException extends Error {
  constructor(response, status) {
    super('subscription exception');
    this._response = response;
    this._status = status;
  }
  getResponse() {
    return this._response;
  }
  getStatus() {
    return this._status;
  }
}

const permissionExceptions = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permission.exception.class.ts',
  {
    '@nestjs/common': {
      HttpException,
      HttpStatus: { PAYMENT_REQUIRED: 402, FORBIDDEN: 403 },
    },
  }
);
const { AuthorizationActions, Sections, SubscriptionException } =
  permissionExceptions;

const { SubscriptionExceptionFilter } = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/subscription.exception.ts',
  {
    '@nestjs/common': {
      Catch: () => (target) => target,
      HttpStatus: { PAYMENT_REQUIRED: 402, FORBIDDEN: 403 },
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      permissionExceptions,
  }
);

function refuse(section, action = AuthorizationActions.Create) {
  const sent = [];
  const response = {
    status(code) {
      return {
        json(payload) {
          sent.push({ code, payload });
        },
      };
    },
  };
  new SubscriptionExceptionFilter().catch(
    new SubscriptionException({ section, action }),
    { switchToHttp: () => ({ getResponse: () => response }) }
  );
  return sent[0];
}

describe('role refusal carries a message', () => {
  test('an ADMIN refusal explains that an administrator is needed', () => {
    const { code, payload } = refuse(Sections.ADMIN);

    // A role is not sold, so the refusal is not a payment problem. 402 means
    // "pay and you get it" and the frontend answers it with a billing button;
    // on an instance without billing that button leads nowhere.
    expect(code).toBe(403);
    expect(payload.statusCode).toBe(403);
    expect(typeof payload.message).toBe('string');
    expect(payload.message.length).toBeGreaterThan(0);
    expect(payload.message).toMatch(/administrator/i);
    expect(payload.message).not.toMatch(/upgrade/i);
    // Nothing to upgrade to, so nothing to link to either.
    expect(payload.url).toBeUndefined();
  });

  test('a plan limit keeps 402 and its billing link', () => {
    const { code, payload } = refuse(Sections.CHANNEL);

    expect(code).toBe(402);
    expect(payload.statusCode).toBe(402);
    expect(payload.url).toContain('/billing');
  });

  test.each(
    Object.values(Sections).map((section) => [section])
  )('section %s never answers with an empty dialog', (section) => {
    const { payload } = refuse(section);

    expect(typeof payload.message).toBe('string');
    expect(payload.message.trim()).not.toBe('');
  });

  test('a plan limit still reads as a plan limit', () => {
    expect(refuse(Sections.CHANNEL).payload.message).toMatch(
      /upgrade your subscription/i
    );
  });
});

/**
 * Mounts `LayoutContext` far enough to get hold of the `afterRequest` hook it
 * installs on every backend call, so a refusal can be driven through the real
 * handler rather than asserted from its source.
 */
function mountAfterRequest() {
  const deleteDialog = jest.fn().mockResolvedValue(true);
  const areYouSure = jest.fn().mockResolvedValue(true);
  let afterRequest;

  const { default: LayoutContext } = loadTypeScriptModule(
    'apps/frontend/src/components/layout/layout.context.tsx',
    {
      '@contentfactory/helpers/utils/custom.fetch': {
        FetchWrapperComponent: (props) => {
          afterRequest = props.afterRequest;
          return null;
        },
      },
      '@contentfactory/react/helpers/delete.dialog': { deleteDialog },
      '@contentfactory/frontend/components/layout/new-modal': { areYouSure },
      '@contentfactory/frontend/app/(app)/auth/return.url.component': {
        useReturnUrl: () => ({ getAndClear: () => undefined }),
      },
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({
          backendUrl: 'https://backend.example',
          isGeneral: true,
          isSecured: true,
        }),
      },
    },
    true
  );

  renderToStaticMarkup(
    React.createElement(LayoutContext, {
      children: React.createElement('div'),
    })
  );

  return { afterRequest, deleteDialog, areYouSure };
}

function backendResponse(status, payload) {
  return {
    status,
    headers: { get: () => null },
    json: async () => {
      if (payload === undefined) throw new SyntaxError('not JSON');
      return payload;
    },
  };
}

describe('the frontend tells a role refusal from a plan limit', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = {
      open: jest.fn(),
      location: { href: 'https://app.example/launches', pathname: '/launches' },
      reload: jest.fn(),
    };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete global.window;
    } else {
      global.window = originalWindow;
    }
  });

  test('a 403 opens an ordinary refusal dialog with no way to billing', async () => {
    const { afterRequest, deleteDialog, areYouSure } = mountAfterRequest();
    const message =
      'This action is available to organization administrators only.';

    const proceed = await afterRequest(
      '/settings/ai',
      {},
      backendResponse(403, { statusCode: 403, message })
    );

    expect(areYouSure).toHaveBeenCalledTimes(1);
    const [dialog] = areYouSure.mock.calls[0];
    expect(dialog.description).toBe(message);
    // One button, and it is not a billing button.
    expect(dialog.onlyApprove).toBe(true);
    expect(JSON.stringify(dialog)).not.toMatch(/billing/i);
    expect(deleteDialog).not.toHaveBeenCalled();
    expect(global.window.open).not.toHaveBeenCalled();
    // The refusal has been reported; the caller must not also parse the body.
    expect(proceed).toBe(false);
  });

  test('a refusal the screen can draw is handed to the screen', async () => {
    const { afterRequest, areYouSure } = mountAfterRequest();

    const proceed = await afterRequest(
      '/content-intelligence/voice/proposal/activate',
      {},
      backendResponse(403, {
        code: 'VOICE_FORBIDDEN',
        message: 'Менять голос бренда может администратор пространства.',
      })
    );

    // The Content section draws `restricted` as a state of the surface: the
    // passport stays readable and the buttons go. A modal over a blank panel
    // replaces that with an English "Not allowed" and nothing behind it, so a
    // refusal carrying one of the section's own codes travels on to the
    // caller instead of being reported here.
    expect(areYouSure).not.toHaveBeenCalled();
    expect(proceed).toBe(true);
  });

  test('a 402 keeps the billing button it always had', async () => {
    const { afterRequest, deleteDialog, areYouSure } = mountAfterRequest();

    await afterRequest(
      '/media',
      {},
      backendResponse(402, {
        statusCode: 402,
        message: 'You have reached the maximum number of channels',
        url: 'https://app.example/billing',
      })
    );

    expect(deleteDialog).toHaveBeenCalledTimes(1);
    expect(deleteDialog.mock.calls[0][1]).toBe('Move to billing');
    expect(global.window.open).toHaveBeenCalledWith('/billing', '_blank');
    expect(areYouSure).not.toHaveBeenCalled();
  });

  test('a 403 that is not our refusal is left to the caller', async () => {
    const { afterRequest, areYouSure } = mountAfterRequest();

    const proceed = await afterRequest('/anything', {}, backendResponse(403));

    expect(areYouSure).not.toHaveBeenCalled();
    expect(proceed).toBe(true);
  });
});

function renderShortlinkPreference(role) {
  const ShortlinkPreferenceComponent = loadTypeScriptModule(
    'apps/frontend/src/components/settings/shortlink-preference.component.tsx',
    {
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
      '@contentfactory/helpers/utils/custom.fetch': {
        useFetch: () => async () => ({ json: async () => ({}) }),
      },
      swr: {
        __esModule: true,
        default: () => ({
          data: { shortlink: 'ASK' },
          isLoading: false,
          mutate: () => {},
        }),
      },
      '@contentfactory/react/form/select': {
        Select: (props) =>
          React.createElement(
            'select',
            { disabled: props.disabled, name: props.name },
            props.children
          ),
      },
      '@contentfactory/react/toaster/toaster': {
        useToaster: () => ({ show: () => {} }),
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => (role ? { role } : undefined),
      },
    },
    true
  ).default;

  return renderToStaticMarkup(
    React.createElement(ShortlinkPreferenceComponent)
  );
}

describe('shortlink preference is read by everyone and changed by an administrator', () => {
  test.each([['ADMIN'], ['SUPERADMIN']])(
    'a %s can change it',
    (role) => {
      expect(renderShortlinkPreference(role)).not.toContain('disabled');
    }
  );

  test('an ordinary member sees the setting but cannot change it', () => {
    const markup = renderShortlinkPreference('USER');

    // Disabled, not hidden: unlike `/settings/ai`, the GET behind this row is
    // not admin-only, and the preference governs how the member's own posts
    // are handled, so hiding it would take away something they can already
    // see. A disabled control states the rule instead of failing on save.
    expect(markup).toContain('disabled');
    expect(markup).toContain('Shortlink Preference');
    expect(markup).toMatch(/administrator/i);
  });

  test('an unresolved user is treated as not an administrator', () => {
    expect(renderShortlinkPreference(null)).toContain('disabled');
  });
});

const AI_PROVIDER_MARKER = 'ai-provider-section';

function renderGlobalSettings(role) {
  const { GlobalSettings } = loadTypeScriptModule(
    'apps/frontend/src/components/settings/global.settings.tsx',
    {
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
      'next/dynamic': {
        __esModule: true,
        default: () => () => React.createElement('div', null, 'metrics'),
      },
      '@contentfactory/frontend/components/settings/email-notifications.component':
        {
          __esModule: true,
          default: () => React.createElement('div', null, 'email'),
        },
      '@contentfactory/frontend/components/settings/shortlink-preference.component':
        {
          __esModule: true,
          default: () => React.createElement('div', null, 'shortlink'),
        },
      '@contentfactory/frontend/components/settings/ai-provider.component': {
        __esModule: true,
        default: () => React.createElement('div', null, AI_PROVIDER_MARKER),
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => (role ? { role } : undefined),
      },
    },
    true
  );

  return renderToStaticMarkup(React.createElement(GlobalSettings));
}

describe('AI provider settings visibility', () => {
  test.each([['ADMIN'], ['SUPERADMIN']])(
    'a %s sees the AI provider section',
    (role) => {
      expect(renderGlobalSettings(role)).toContain(AI_PROVIDER_MARKER);
    }
  );

  test('an ordinary member never mounts the section, so opening Settings makes no admin-only request', () => {
    const markup = renderGlobalSettings('USER');

    expect(markup).not.toContain(AI_PROVIDER_MARKER);
    // The rest of the tab is unchanged for a member.
    expect(markup).toContain('email');
    expect(markup).toContain('shortlink');
  });

  test('an unresolved user is treated as not an administrator', () => {
    expect(renderGlobalSettings(null)).not.toContain(AI_PROVIDER_MARKER);
  });
});
