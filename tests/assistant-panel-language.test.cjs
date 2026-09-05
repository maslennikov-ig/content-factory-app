/**
 * Панель помощника, услышанная программой чтения с экрана.
 *
 * `content-factory-next-fn33.118`. Видимый текст панели переводился и раньше:
 * заголовок и приветствие приходили через `labels`. Всё, чем панель
 * представляется незрячему человеку, оставалось английским — «Open Chat»,
 * «Close», «Regenerate response», «Copy to clipboard», «Thumbs up», «Thumbs
 * down», — а внизу стояла строка «Powered by CopilotKit».
 *
 * Проверяется договор с библиотекой, а не её внутренности: `labels` — штатная
 * дверь для ярлыков сообщений и поля ввода, а кнопка вызова и крестик в шапке
 * приходят своими узлами через пропы `Button` и `Header`, потому что в
 * `@copilotkit/react-ui@1.10.6` их `aria-label` вшит в разметку.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ts = require('typescript');
const { cleanup, render, screen } = require('@testing-library/react');

const h = React.createElement;
const repositoryRoot = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

const russian = JSON.parse(
  read(
    'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
  )
);

const componentFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/copilot/assistant.popup.tsx'
);

let open = false;
let captured = null;

/**
 * Заглушка библиотеки рисует ровно то, что ей передали: сама панель здесь не
 * проверяется — проверяется, что ей отдали и что рисуют наши узлы.
 */
const CopilotPopup = (props) => {
  captured = props;
  return h(
    'div',
    {},
    h(props.Button, {}),
    h(props.Header, {})
  );
};

const mocks = {
  '@copilotkit/react-ui': {
    CopilotPopup,
    CopilotDevConsole: () => null,
    useChatContext: () => ({
      open,
      setOpen: (next) => {
        open = next;
      },
      icons: {
        openIcon: null,
        closeIcon: null,
        headerCloseIcon: null,
      },
      labels: { title: russian['your_assistant'] },
    }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (key, fallback) => russian[key] || fallback,
  },
};

const compiled = ts.transpileModule(fs.readFileSync(componentFile, 'utf8'), {
  fileName: componentFile,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
  loaded.exports,
  (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request),
  loaded,
  componentFile,
  path.dirname(componentFile)
);
const { AssistantPopup } = loaded.exports;

beforeEach(() => {
  open = false;
  captured = null;
});

afterEach(() => cleanup());

test('the buttons introduce themselves in the language of the page', () => {
  render(h(AssistantPopup, { instructions: 'anything' }));

  expect(screen.getByLabelText(russian['assistant_open'])).toBeTruthy();
  expect(screen.getByLabelText(russian['close'])).toBeTruthy();
  expect(screen.queryByLabelText('Open Chat')).toBeNull();
  expect(screen.queryByLabelText('Close')).toBeNull();
});

test('an open panel says so, and says it in the same language', () => {
  open = true;
  render(h(AssistantPopup, { instructions: 'anything' }));

  const button = screen.getByLabelText(russian['assistant_close']);
  expect(button.getAttribute('aria-expanded')).toBe('true');
});

test('every label the library offers is translated, none left at its default', () => {
  render(h(AssistantPopup, { instructions: 'anything' }));

  expect(captured.labels).toEqual({
    title: russian['your_assistant'],
    initial: russian['assistant_initial_message'],
    placeholder: russian['assistant_placeholder'],
    stopGenerating: russian['assistant_stop'],
    regenerateResponse: russian['assistant_regenerate'],
    copyToClipboard: russian['assistant_copy'],
    copied: russian['assistant_copied'],
    thumbsUp: russian['assistant_thumbs_up'],
    thumbsDown: russian['assistant_thumbs_down'],
    error: russian['error_occurred'],
  });

  for (const value of Object.values(captured.labels)) {
    expect(value).toMatch(/[А-Яа-я]/);
  }
});

test('the post window opens this panel and not the library one', () => {
  const modal = read('apps/frontend/src/components/new-launch/manage.modal.tsx');

  expect(modal).toContain(
    "import { AssistantPopup } from '@contentfactory/frontend/components/copilot/assistant.popup';"
  );
  expect(modal).not.toContain("from '@copilotkit/react-ui'");
  expect(modal).toContain('<AssistantPopup');
});

test('the «Powered by CopilotKit» line is hidden, and the reason is written down', () => {
  const styles = read('apps/frontend/src/app/global.scss');

  // Правило библиотеки `.poweredBy{display:block!important}` идёт в сборке
  // позже; побеждает только более сильный селектор (прогон 05.09).
  expect(styles).toMatch(
    /\.copilotKitWindow \.poweredBy,\n\.copilotKitPopup \.poweredBy,\n\.poweredBy\.poweredBy \{\n\s+display: none !important;\n\}/
  );
  expect(styles).toContain('publicApiKey');
});
