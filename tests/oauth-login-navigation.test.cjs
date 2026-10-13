const React = require('react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const previousWindow = global.window;
let savedReturn;

function afterRequest() {
  const { default: LayoutContext } = loadWithMocks(
    'apps/frontend/src/components/layout/layout.context.tsx',
    {
      react: { ...React, useCallback: (callback) => callback },
      '@contentfactory/helpers/utils/custom.fetch': { FetchWrapperComponent: () => null },
      '@contentfactory/react/helpers/delete.dialog': { deleteDialog: jest.fn() },
      '@contentfactory/frontend/components/layout/new-modal': { areYouSure: jest.fn() },
      '@contentfactory/frontend/app/(app)/auth/return.url.component': {
        useReturnUrl: () => ({ getAndClear: () => savedReturn }),
      },
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({ isSecured: true, billingEnabled: false }),
      },
      '@contentfactory/react/translation/i18next': { default: { t: (key) => key } },
    }
  );
  const inner = LayoutContext({ children: 'fixture' });
  return inner.type(inner.props).props.afterRequest;
}

beforeEach(() => {
  savedReturn = null;
  global.window = {
    location: {
      href: 'https://factory.example/auth?provider=TELEGRAM&code=single-use&state=fixture',
      pathname: '/auth',
      replace: jest.fn(),
      reload: jest.fn(),
    },
  };
});

afterAll(() => {
  if (previousWindow === undefined) delete global.window;
  else global.window = previousWindow;
});

test.each(['TELEGRAM', 'GOOGLE', 'GITHUB', 'GENERIC'])(
  'completed %s sign-in leaves the spent callback address', async (provider) => {
    await afterRequest()(`/auth/oauth/${provider}/exists`, {}, new Response(
      JSON.stringify({ login: true }), { headers: { reload: 'true' } }
    ));
    expect(window.location.replace).toHaveBeenCalledWith('/');
    expect(window.location.reload).not.toHaveBeenCalled();
  }
);

test('a saved return destination retains priority after provider sign-in', async () => {
  savedReturn = 'https://factory.example/launches';
  await afterRequest()('/auth/oauth/TELEGRAM/exists', {}, new Response('{}', {
    headers: { reload: 'true' },
  }));
  expect(window.location.href).toBe(savedReturn);
  expect(window.location.reload).not.toHaveBeenCalled();
  expect(window.location.replace).not.toHaveBeenCalled();
});

test('ordinary session reloads keep their current page', async () => {
  await afterRequest()('/user/personal', {}, new Response('{}', {
    headers: { reload: 'true' },
  }));
  expect(window.location.reload).toHaveBeenCalledTimes(1);
  expect(window.location.replace).not.toHaveBeenCalled();
});

test('an unsuccessful exchange cannot navigate into the application', async () => {
  await afterRequest()('/auth/oauth/TELEGRAM/exists', {}, new Response('{}', { status: 500 }));
  expect(window.location.reload).not.toHaveBeenCalled();
  expect(window.location.replace).not.toHaveBeenCalled();
});
