/**
 * A box just unticked reads as unticked under the pointer
 * (`content-factory-next-tbuj`, W2 live walk 27.09.2026, D13,
 * `shots/s2b-facts-selection-dark-1440-crop.png`).
 *
 * The green fill and the tick faded out over the state duration while the
 * pointer still rested on the box, and a hovered box that had just been
 * unticked looked ticked. The empty box now drops its fill and tick at once
 * (ticking still fades in), and a hovered empty box keeps the neutral ink.
 */

const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const FILE = 'apps/frontend/src/components/content-intelligence/intake/selection-rows.tsx';
const { SelectionRows } = loadTypeScriptModule(FILE);

afterEach(cleanup);

const rows = [
  { id: 'kept', label: 'Оставленный факт', selected: true },
  { id: 'dropped', label: 'Снятый факт', selected: false },
];

const draw = async () => {
  let view;
  await act(async () => {
    view = render(
      React.createElement(SelectionRows, {
        rows,
        includeLabel: 'Взять',
        editable: true,
        onToggle: () => {},
      })
    );
  });
  return view.container;
};

describe('compiled CSS of the selection box', () => {
  let rules = [];
  beforeAll(async () => {
    const fs = require('node:fs');
    const postcss = require('postcss');
    const tailwind = require('tailwindcss');
    const config = require(path.join(root, 'apps/frontend/tailwind.config.cjs'));
    const raw = fs.readFileSync(path.join(root, FILE), 'utf8');
    const result = await postcss([tailwind({ ...config, content: [{ raw }] })]).process(
      '@tailwind utilities;',
      { from: undefined }
    );
    result.root.walkRules((rule) => {
      rules.push({ selector: rule.selector, css: rule.nodes.map(String).join('; ') });
    });
  }, 60_000);

  const ruleFor = (tail) => rules.find((rule) => rule.selector.endsWith(tail));

  test('a hovered empty box takes the neutral ink, never the green of «kept»', () => {
    expect(ruleFor(':hover input:not(:checked):not(:disabled)')?.css).toBe(
      'border-color: var(--cf-ink-muted)'
    );
  });

  test('an empty box drops its fill and its tick at once', () => {
    expect(ruleFor(' input:not(:checked)')?.css).toBe('transition-property: none');
    expect(ruleFor(' input:not(:checked)~span svg')?.css).toBe('transition-property: none');
  });

  test('the rules reach the drawn box and its tick, and only the empty one', async () => {
    const container = await draw();
    const box = (id) =>
      container.querySelector(`[data-selection-row="${id}"] label`);
    for (const id of ['kept', 'dropped']) expect(box(id)).not.toBeNull();
    // The selectors above, scoped to each row's label.
    const empty = (id) => box(id).querySelectorAll('input:not(:checked)');
    const emptyTick = (id) => box(id).querySelectorAll('input:not(:checked) ~ span svg');
    expect(empty('dropped')).toHaveLength(1);
    expect(emptyTick('dropped')).toHaveLength(1);
    expect(empty('kept')).toHaveLength(0);
    expect(emptyTick('kept')).toHaveLength(0);
  });

  test('cf tokens only: no hex, no raw palette on the box', () => {
    const fs = require('node:fs');
    const raw = fs.readFileSync(path.join(root, FILE), 'utf8');
    const box = raw.slice(raw.indexOf('const SELECTION_BOX'), raw.indexOf("].join(' ');"));
    expect(box).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(box).not.toMatch(/-(?:red|green|gray|white|black|lime|emerald)-?\d*/);
  });
});
