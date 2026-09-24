'use strict';

/**
 * The emoji slider's one-row layout is a container query written as a
 * Tailwind arbitrary variant (`[@container(min-width:520px)]:`), and JSDOM
 * lays nothing out. So the class strings alone prove nothing: this suite
 * compiles the slider's source with the frontend Tailwind config (the same
 * route as `button.mobile-hit-area.test.cjs`) and reads the emitted rules
 * (review of the fifteenth walk, F5: «nothing proves Tailwind 3.4.17 emits
 * the `[@container(min-width:400px)]:` rules»).
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SLIDER = 'apps/frontend/src/components/content-intelligence/intake/emoji-ceiling.slider.tsx';

let rules = [];

beforeAll(async () => {
  const postcss = require('postcss');
  const tailwind = require('tailwindcss');
  const config = require(path.join(root, 'apps/frontend/tailwind.config.cjs'));
  const raw = fs.readFileSync(path.join(root, SLIDER), 'utf8');
  const result = await postcss([tailwind({ ...config, content: [{ raw }] })]).process(
    '@tailwind utilities;',
    { from: undefined }
  );
  result.root.walkRules((rule) => {
    const at = [];
    for (let parent = rule.parent; parent && parent.type === 'atrule'; parent = parent.parent)
      // PostCSS reads `@container(min-width:520px)` as one name with no params.
      at.unshift(`@${parent.name} ${parent.params}`.trim());
    rules.push({ at, selector: rule.selector, css: rule.nodes.map(String).join('; ') });
  });
}, 60_000);

const inContainer = (fragment) =>
  rules.filter(
    (rule) =>
      rule.at.some((at) => /^@container\s*\(min-width:\s*520px\)$/.test(at)) &&
      rule.selector.includes(fragment)
  );

test('the one-row layout rules are emitted as a 520px container query', () => {
  const columns = inContainer('grid-cols-');
  expect(columns.map((rule) => rule.css)).toEqual(
    expect.arrayContaining([
      'grid-template-columns: fit-content(40%) minmax(0,1fr) fit-content(30%)',
      'grid-template-columns: minmax(0,1fr) fit-content(30%)',
    ])
  );
  for (const fragment of ['col-start-2', 'col-start-3', 'row-start-1', 'col-span-1'])
    expect(inContainer(fragment).length).toBeGreaterThan(0);
  expect(inContainer('min-h-').map((rule) => rule.css)).toEqual(
    expect.arrayContaining(['min-height: 44px'])
  );
  // The stacked `sm:` variant keeps the 40px track height inside the query.
  const stacked = rules.filter(
    (rule) =>
      rule.at.some((at) => at.startsWith('@media')) &&
      rule.at.some((at) => /^@container\s*\(min-width:\s*520px\)$/.test(at)) &&
      rule.css === 'min-height: 40px'
  );
  expect(stacked.length).toBeGreaterThan(0);
});

test('no rule is left on the old 400px threshold', () => {
  expect(rules.some((rule) => rule.at.some((at) => at.includes('400px')))).toBe(false);
});

test('the captions may wrap inside a word rather than spill into the next cell', () => {
  expect(rules.find((rule) => rule.selector.includes('overflow-wrap\\:anywhere'))?.css).toBe(
    'overflow-wrap: anywhere'
  );
});

describe('without a label there is no label cell to make the row taller', () => {
  const React = require('react');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator'])
    Object.defineProperty(global, key, {
      configurable: true,
      value: key === 'window' ? dom.window : dom.window[key],
    });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const { cleanup, render } = require('@testing-library/react');
  const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
  const { EmojiCeilingSlider } = loadTypeScriptModule(SLIDER);
  afterEach(cleanup);

  const draw = (props) =>
    render(
      React.createElement(EmojiCeilingSlider, {
        locale: 'ru',
        value: 'max3',
        onChange: () => {},
        ...props,
      })
    );

  test('unlabelled: readout and track only; the readout sets no height in the narrow layout', () => {
    draw({});
    expect(document.querySelector('[data-emoji-label-cell]')).toBeNull();
    const readout = document.querySelector('[data-emoji-readout-cell]');
    expect(readout.className.split(/\s+/)).not.toContain('min-h-[44px]');
    const track = document.querySelector('[data-emoji-track-cell]');
    expect(track.className).toContain('[@container(min-width:520px)]:col-start-1');
  });

  test('labelled: the label cell stands first and the track sits between', () => {
    draw({ label: React.createElement('span', null, 'Эмодзи') });
    expect(document.querySelector('[data-emoji-label-cell]').textContent).toBe('Эмодзи');
    expect(document.querySelector('[data-emoji-track-cell]').className).toContain(
      '[@container(min-width:520px)]:col-start-2'
    );
  });
});
