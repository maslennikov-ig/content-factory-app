'use strict';

/**
 * `kcxz.16`: the piece screen opens both as the page `/content/pieces/[id]`
 * and inside the agent's ~672px artifact panel. Its two columns used to
 * follow the window (`lg:`), so on a wide screen the panel split into two
 * cramped columns. They now need the window at `lg` AND the piece section
 * (`split-container`) at least 640px wide — the `split:` variant of the
 * frontend Tailwind config. JSDOM lays nothing out, so this suite compiles
 * the sources with that config (the route of
 * `emoji-ceiling.container-css.test.cjs`) and reads the emitted rules.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const PIECES = 'apps/frontend/src/components/content-intelligence/pieces';
const SOURCES = [
  `${PIECES}/piece.screen.tsx`,
  `${PIECES}/piece-core-tab.tsx`,
  `${PIECES}/piece-channel-tab.tsx`,
  'apps/frontend/src/components/ui/side-panel.tsx',
];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

let rules = [];

beforeAll(async () => {
  const postcss = require('postcss');
  const tailwind = require('tailwindcss');
  const config = require(path.join(root, 'apps/frontend/tailwind.config.cjs'));
  const raw = SOURCES.map(read).join('\n');
  const result = await postcss([tailwind({ ...config, content: [{ raw }] })]).process(
    '@tailwind utilities;',
    { from: undefined }
  );
  result.root.walkRules((rule) => {
    const at = [];
    for (let parent = rule.parent; parent && parent.type === 'atrule'; parent = parent.parent)
      at.unshift(`@${parent.name} ${parent.params}`.trim());
    rules.push({ at, selector: rule.selector, css: rule.nodes.map(String).join('; ') });
  });
}, 60_000);

const split = (rule) =>
  rule.at.includes('@media (min-width: 1024px)') &&
  rule.at.includes('@container split (min-width: 640px)');

test('the piece section is the container that decides', () => {
  expect(read(`${PIECES}/piece.screen.tsx`)).toMatch(
    /data-content-panel="piece"[\s\S]{0,200}className="split-container /
  );
  const marker = rules.find((rule) => rule.selector === '.split-container');
  expect(marker?.css).toBe('container-type: inline-size; container-name: split');
});

test('both tabs split into columns only at lg inside a 640px container', () => {
  const css = rules.filter(split).map((rule) => rule.css);
  expect(css).toEqual(
    expect.arrayContaining([
      'grid-template-columns: minmax(0,1fr) 360px',
      'flex-direction: row',
      'align-items: flex-start',
      'width: var(--cf-side-panel-width)',
      'display: flex',
      'display: none',
    ])
  );
});

test('no window-only column switch is left in the piece tabs', () => {
  for (const file of [`${PIECES}/piece-core-tab.tsx`, `${PIECES}/piece-channel-tab.tsx`])
    expect(read(file)).not.toMatch(/\blg:(grid-cols-|flex-row|items-start)/);
  expect(read(`${PIECES}/piece-channel-tab.tsx`)).toMatch(
    /<SidePanel[\s\S]{0,400}breakpoint="split"/
  );
});
