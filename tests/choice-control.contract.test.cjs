/**
 * The shared choice controls, proven by driving them.
 *
 * These primitives exist for their keyboard and ARIA contract, so a test that
 * matched class names would prove nothing. Every assertion here renders the
 * component into a real document and presses real keys: the roles, the tab
 * stop, the arrows, the wrap, the disabled option and the focus return are all
 * read back off the DOM afterwards.
 *
 * The document comes from `jsdom` directly rather than from the jsdom Jest
 * environment: that one pulls in the optional native `canvas` binding, which
 * is not built in this workspace and has nothing to do with a keyboard
 * contract. The repository's Jest config stays untouched.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
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
const { render, fireEvent, act } = require('@testing-library/react');

const repositoryRoot = path.resolve(__dirname, '..');
const choiceRoot = path.join(
  repositoryRoot,
  'libraries/react-shared-libraries/src/choice'
);

const moduleCache = new Map();

const resolveLocal = (fromDir, request) => {
  const base = path.resolve(fromDir, request);
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve ${request} from ${fromDir}`);
};

const loadModule = (filename) => {
  if (moduleCache.has(filename)) return moduleCache.get(filename);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  moduleCache.set(filename, loaded.exports);
  const directory = path.dirname(filename);
  const localRequire = (request) =>
    request.startsWith('.')
      ? loadModule(resolveLocal(directory, request))
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, directory);
  moduleCache.set(filename, loaded.exports);
  return loaded.exports;
};

const choice = (file) => loadModule(path.join(choiceRoot, file));

const { ControlButton } = choice('control.button.tsx');
const { RadioGroup, RadioOption } = choice('radio.group.tsx');
const { Tabs, TabList, Tab, TabPanel } = choice('tabs.tsx');
const { Menu, MenuButton, MenuList, MenuOption } = choice('choice.menu.tsx');
const { Listbox, ListboxOption } = choice('listbox.tsx');

const h = React.createElement;

const options = (container, role) =>
  Array.from(container.querySelectorAll(`[role="${role}"]`));

const labels = (nodes) => nodes.map((node) => node.textContent);
const tabStops = (nodes) => nodes.map((node) => node.tabIndex);
const checked = (nodes, attribute) =>
  nodes.map((node) => node.getAttribute(attribute));

const press = (node, key) => fireEvent.keyDown(node, { key });

// ---------------------------------------------------------------- ControlButton

describe('ControlButton', () => {
  test('never submits a form by accident and always shows its focus', () => {
    const { container } = render(h(ControlButton, {}, 'Choose'));
    const button = container.querySelector('button');

    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('focus-visible:ring-cf-focus');
    expect(button.className).toContain('disabled:opacity-50');
  });

  test('keeps an explicit type the call site asked for', () => {
    const { container } = render(h(ControlButton, { type: 'submit' }, 'Save'));

    expect(container.querySelector('button').getAttribute('type')).toBe(
      'submit'
    );
  });
});

// ------------------------------------------------------------------- RadioGroup

const RadioHarness = ({ initial = 'monthly', disabled = [] }) => {
  const [value, setValue] = React.useState(initial);
  return h(
    RadioGroup,
    { value, onChange: setValue, 'aria-label': 'Billing period' },
    ['monthly', 'yearly', 'lifetime'].map((entry) =>
      h(
        RadioOption,
        { key: entry, value: entry, disabled: disabled.includes(entry) },
        entry
      )
    )
  );
};

describe('RadioGroup', () => {
  test('is a radio group whose checked state is readable', () => {
    const { container } = render(h(RadioHarness, {}));
    const radios = options(container, 'radio');

    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(labels(radios)).toEqual(['monthly', 'yearly', 'lifetime']);
    expect(checked(radios, 'aria-checked')).toEqual(['true', 'false', 'false']);
  });

  test('costs the keyboard one tab stop, and it is the checked option', () => {
    const { container } = render(h(RadioHarness, { initial: 'yearly' }));

    expect(tabStops(options(container, 'radio'))).toEqual([-1, 0, -1]);
  });

  test('falls back to the first option when nothing is checked yet', () => {
    const { container } = render(h(RadioHarness, { initial: 'none' }));
    const radios = options(container, 'radio');

    expect(checked(radios, 'aria-checked')).toEqual([
      'false',
      'false',
      'false',
    ]);
    expect(tabStops(radios)).toEqual([0, -1, -1]);
  });

  test('moves selection with the arrow keys, in both axes, and wraps', () => {
    const { container } = render(h(RadioHarness, {}));
    const radios = options(container, 'radio');

    act(() => radios[0].focus());
    press(radios[0], 'ArrowRight');
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');

    press(radios[1], 'ArrowDown');
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2].getAttribute('aria-checked')).toBe('true');

    press(radios[2], 'ArrowRight');
    expect(document.activeElement).toBe(radios[0]);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');

    press(radios[0], 'ArrowLeft');
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
  });

  test('Home and End reach the ends of the group', () => {
    const { container } = render(h(RadioHarness, { initial: 'yearly' }));
    const radios = options(container, 'radio');

    act(() => radios[1].focus());
    press(radios[1], 'End');
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2].getAttribute('aria-checked')).toBe('true');

    press(radios[2], 'Home');
    expect(document.activeElement).toBe(radios[0]);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
  });

  test('a disabled option is neither reachable nor selectable', () => {
    const { container } = render(h(RadioHarness, { disabled: ['yearly'] }));
    const radios = options(container, 'radio');

    expect(radios[1].disabled).toBe(true);
    act(() => radios[0].focus());
    press(radios[0], 'ArrowRight');

    expect(document.activeElement).toBe(radios[2]);
    expect(radios[1].getAttribute('aria-checked')).toBe('false');
  });

  test('a pointer picks the option it lands on', () => {
    const { container } = render(h(RadioHarness, {}));
    const radios = options(container, 'radio');

    fireEvent.click(radios[2]);

    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
  });
});

// ------------------------------------------------------------------------ Tabs

const TabsHarness = ({
  initial = 'overview',
  activation = 'automatic',
  orientation = 'horizontal',
}) => {
  const [value, setValue] = React.useState(initial);
  return h(Tabs, { value, onChange: setValue }, [
    h(
      TabList,
      { key: 'list', activation, orientation, 'aria-label': 'Sections' },
      ['overview', 'audience', 'errors'].map((entry) =>
        h(Tab, { key: entry, value: entry }, entry)
      )
    ),
    h(TabPanel, { key: 'panel', value }, `panel:${value}`),
  ]);
};

describe('Tabs', () => {
  test('names its panel and is named back by it', () => {
    const { container } = render(h(TabsHarness, {}));
    const tabs = options(container, 'tab');
    const panel = container.querySelector('[role="tabpanel"]');

    expect(checked(tabs, 'aria-selected')).toEqual(['true', 'false', 'false']);
    expect(tabs[0].getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
    // Only the visible panel exists, so an unselected tab points at nothing.
    expect(tabs[1].getAttribute('aria-controls')).toBeNull();
  });

  test('holds one tab stop, on the selected tab', () => {
    const { container } = render(h(TabsHarness, { initial: 'errors' }));

    expect(tabStops(options(container, 'tab'))).toEqual([-1, -1, 0]);
  });

  test('automatic activation shows each panel as the arrows pass it', () => {
    const { container } = render(h(TabsHarness, {}));
    const tabs = options(container, 'tab');

    act(() => tabs[0].focus());
    press(tabs[0], 'ArrowRight');

    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]').textContent).toBe(
      'panel:audience'
    );
  });

  test('manual activation moves focus and waits to be told', () => {
    const { container } = render(h(TabsHarness, { activation: 'manual' }));
    const tabs = options(container, 'tab');

    act(() => tabs[0].focus());
    press(tabs[0], 'ArrowRight');

    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(container.querySelector('[role="tabpanel"]').textContent).toBe(
      'panel:overview'
    );

    fireEvent.click(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  test('a vertical strip answers to the vertical arrows', () => {
    const { container } = render(h(TabsHarness, { orientation: 'vertical' }));
    const list = container.querySelector('[role="tablist"]');
    const tabs = options(container, 'tab');

    expect(list.getAttribute('aria-orientation')).toBe('vertical');

    act(() => tabs[0].focus());
    press(tabs[0], 'ArrowRight');
    expect(document.activeElement).toBe(tabs[0]);

    press(tabs[0], 'ArrowDown');
    expect(document.activeElement).toBe(tabs[1]);

    press(tabs[1], 'ArrowUp');
    expect(document.activeElement).toBe(tabs[0]);
  });

  test('wraps at both ends and answers Home and End', () => {
    const { container } = render(h(TabsHarness, {}));
    const tabs = options(container, 'tab');

    act(() => tabs[0].focus());
    press(tabs[0], 'ArrowLeft');
    expect(document.activeElement).toBe(tabs[2]);

    press(tabs[2], 'Home');
    expect(document.activeElement).toBe(tabs[0]);

    press(tabs[0], 'End');
    expect(document.activeElement).toBe(tabs[2]);
  });
});

// ------------------------------------------------------------------------ Menu

const MenuHarness = ({ initial = 'acme' }) => {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(initial);
  return h(Menu, { open, onOpenChange: setOpen }, [
    h(MenuButton, { key: 'button' }, 'Organization'),
    open
      ? h(
          MenuList,
          { key: 'list', 'aria-label': 'Organization' },
          ['acme', 'globex', 'initech'].map((entry) =>
            h(
              MenuOption,
              {
                key: entry,
                selected: value === entry,
                onClick: () => setValue(entry),
              },
              entry
            )
          )
        )
      : null,
  ]);
};

describe('Menu', () => {
  test('the trigger says what it opens and whether it is open', () => {
    const { container } = render(h(MenuHarness, {}));
    const trigger = container.querySelector('button');

    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(
      container.querySelector('[role="menu"]').id
    );
  });

  test('Down Arrow opens the menu and lands on the first item', () => {
    const { container } = render(h(MenuHarness, {}));
    const trigger = container.querySelector('button');

    press(trigger, 'ArrowDown');
    const items = options(container, 'menuitemradio');

    expect(items).toHaveLength(3);
    expect(document.activeElement).toBe(items[0]);
  });

  test('Up Arrow opens the menu at the last item', () => {
    const { container } = render(h(MenuHarness, {}));

    press(container.querySelector('button'), 'ArrowUp');
    const items = options(container, 'menuitemradio');

    expect(document.activeElement).toBe(items[2]);
  });

  test('arrows move without choosing — the choice reloads the app', () => {
    const { container } = render(h(MenuHarness, {}));
    press(container.querySelector('button'), 'ArrowDown');
    const items = options(container, 'menuitemradio');

    press(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    expect(checked(items, 'aria-checked')).toEqual(['true', 'false', 'false']);

    press(items[1], 'ArrowDown');
    expect(document.activeElement).toBe(items[2]);
    press(items[2], 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
  });

  test('activating an item chooses it and closes the menu', () => {
    const { container } = render(h(MenuHarness, {}));
    press(container.querySelector('button'), 'ArrowDown');

    fireEvent.click(options(container, 'menuitemradio')[1]);

    expect(container.querySelector('[role="menu"]')).toBeNull();
    fireEvent.click(container.querySelector('button'));
    expect(
      checked(options(container, 'menuitemradio'), 'aria-checked')
    ).toEqual(['false', 'true', 'false']);
  });

  test('Escape closes the menu and hands focus back to the trigger', () => {
    const { container } = render(h(MenuHarness, {}));
    const trigger = container.querySelector('button');
    press(trigger, 'ArrowDown');

    press(options(container, 'menuitemradio')[0], 'Escape');

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test('works as a permanently open list with no trigger at all', () => {
    const { container } = render(
      h(MenuList, { 'aria-label': 'Organization' }, [
        h(MenuOption, { key: 'a', selected: false }, 'acme'),
        h(MenuOption, { key: 'b', selected: true }, 'globex'),
      ])
    );
    const items = options(container, 'menuitemradio');

    expect(tabStops(items)).toEqual([-1, 0]);
    act(() => items[1].focus());
    press(items[1], 'ArrowUp');
    expect(document.activeElement).toBe(items[0]);
  });
});

// ------------------------------------------------------- role ownership guard

/**
 * A hand-written `role="tab"` is how the previous generation of these controls
 * started: the role was right and everything behind it — the tab stop, the
 * arrows, the panel link — was missing. The roles below now belong to the
 * shared primitives, so an application file that spells one out by hand is
 * rebuilding a pattern that already exists, and the guard says so by name.
 */
const OWNED_ROLES = new Set([
  'radiogroup',
  'radio',
  'tablist',
  'tab',
  'tabpanel',
  'menu',
  'menuitemradio',
  'listbox',
  'option',
]);

const parser = require('@typescript-eslint/parser');

const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else walk(value, visit);
  }
};

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(tsx|jsx)$/.test(entry.name) ? [entryPath] : [];
  });

describe('choice roles belong to the shared primitives', () => {
  test('no application file spells a choice role out by hand', () => {
    const offenders = [];
    for (const filePath of sourceFiles(
      path.join(repositoryRoot, 'apps/frontend/src')
    )) {
      const file = path.relative(repositoryRoot, filePath);
      const ast = parser.parse(fs.readFileSync(filePath, 'utf8'), {
        ecmaFeatures: { jsx: true },
        loc: true,
        range: true,
        sourceType: 'module',
      });
      walk(ast, (node) => {
        if (node.type !== 'JSXAttribute' || node.name?.name !== 'role') return;
        const value =
          node.value?.type === 'Literal' ? node.value.value : undefined;
        if (typeof value === 'string' && OWNED_ROLES.has(value)) {
          offenders.push(`${file}:${node.loc.start.line} role="${value}"`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

// --------------------------------------------------------------------- Listbox

describe('Listbox', () => {
  test('reports the active option without taking the focus', () => {
    const { container } = render(
      h(Listbox, { activeIndex: 1, 'aria-label': 'Mentions' }, [
        h(ListboxOption, { key: 0, index: 0, selected: false }, 'ada'),
        h(ListboxOption, { key: 1, index: 1, selected: true }, 'grace'),
      ])
    );
    const list = container.querySelector('[role="listbox"]');
    const items = options(container, 'option');

    expect(checked(items, 'aria-selected')).toEqual(['false', 'true']);
    expect(list.getAttribute('aria-activedescendant')).toBe(items[1].id);
    // The editor keeps the focus, so the popup must cost no tab stops.
    expect(tabStops(items)).toEqual([-1, -1]);
  });
});
