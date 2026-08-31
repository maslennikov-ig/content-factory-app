const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const loadTelegramProvider = (mocks) => {
  const filename = path.resolve(
    __dirname,
    '../apps/frontend/src/components/launches/web3/providers/telegram.provider.tsx'
  );
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
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
  return loaded.exports.TelegramProvider;
};

const textContent = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  const children = node.props?.children;
  return (Array.isArray(children) ? children : [children])
    .map(textContent)
    .join('');
};

const findNode = (node, predicate) => {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findNode(child, predicate);
    if (found) {
      return found;
    }
  }
  return null;
};

test('an expired Telegram connection stops polling and starts again with a fresh word', async () => {
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props || {}), children },
    }),
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states)) {
        states[index] = initial;
      }
      return [
        states[index],
        (value) => {
          states[index] =
            typeof value === 'function' ? value(states[index]) : value;
        },
      ];
    },
    useRef: (initial) => {
      const index = refIndex++;
      refs[index] ||= { current: initial };
      return refs[index];
    },
    useCallback: (callback) => callback,
    useEffect: () => undefined,
  };
  const generateConnectWord = jest
    .fn()
    .mockReturnValueOnce('first-word')
    .mockReturnValueOnce('discarded-render-word')
    .mockReturnValueOnce('fresh-word');
  const fetch = jest
    .fn()
    .mockResolvedValueOnce({ json: async () => ({}) })
    .mockResolvedValueOnce({ json: async () => ({ chatId: '-10042' }) });
  const onComplete = jest.fn();
  const TelegramProvider = loadTelegramProvider({
    '@neynar/react/dist/style.css': {},
    react: { __esModule: true, default: React, ...React },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => fetch,
    },
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    '@contentfactory/frontend/components/launches/web3/providers/connect.word':
      {
        generateConnectWord,
      },
    '@contentfactory/react/form/input': { Input: 'input' },
    '@contentfactory/react/form/button': { Button: 'button' },
    'copy-to-clipboard': { __esModule: true, default: jest.fn() },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: jest.fn() }),
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ telegramBotName: 'content_factory_bot' }),
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_key, fallback) => fallback,
    },
  });
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    return TelegramProvider({ onComplete, nonce: 'nonce-1' });
  };
  const now = jest
    .spyOn(Date, 'now')
    .mockReturnValueOnce(0)
    .mockReturnValue(15 * 60 * 1_000);

  try {
    let tree = render();
    const connect = findNode(
      tree,
      (node) =>
        typeof node.props?.onClick === 'function' &&
        textContent(node).includes('Connect Telegram')
    );
    await connect.props.onClick();

    expect(fetch).toHaveBeenCalledTimes(1);
    tree = render();
    expect(textContent(tree)).toContain(
      'This connection request expired. Start again to get a new command.'
    );
    const startAgain = findNode(
      tree,
      (node) =>
        typeof node.props?.onClick === 'function' &&
        textContent(node) === 'Start again'
    );
    startAgain.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));

    expect(generateConnectWord).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(
      '/integrations/telegram/updates?word=fresh-word'
    );
    expect(onComplete).toHaveBeenCalledWith('-10042', 'nonce-1');
  } finally {
    now.mockRestore();
  }
});
