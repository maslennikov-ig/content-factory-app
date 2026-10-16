const fs = require('fs');
const path = require('path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { OpeningBand } = loadTypeScriptModule('libraries/react-shared-libraries/src/layout/opening.band.tsx');

const repositoryRoot = path.resolve(__dirname, '..');
// Reached through the layout barrel, like `PageShell`, `PageHeader` and
// `Panel`. It was the one primitive in the directory that call sites had to
// know the file name of.
const openingBandImport =
  "import { OpeningBand } from '@contentfactory/react/layout';";

const source = (file) => {
  const filePath = path.join(repositoryRoot, file);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
};

const openingBandUsage = (file, expectedCount) => {
  const contents = source(file);

  return {
    importsOpeningBand: contents.includes(openingBandImport),
    renderCount: (contents.match(/<OpeningBand\b/g) ?? []).length,
    namesLegacyHeight: /(?:h|min-h|max-h)-\[64px\]|\b64px\b/.test(contents),
    expectedCount,
  };
};

describe('agent opening band', () => {
  test('wrapping controls can grow beyond one row while ordinary callers keep their fixed height', () => {
    const controls = ['Object title', 'Artifacts', 'Open in section', 'Hide'].map((label) => React.createElement('button', { key: label }, label));
    const classes = (props) => renderToStaticMarkup(React.createElement(OpeningBand, props, controls)).match(/class="([^"]+)"/)[1].split(/\s+/);
    const fixed = classes({});
    const wrapped = classes({ wrap: true, className: 'mb-0 gap-[8px]' });
    expect(fixed).toContain('h-16');
    expect(fixed).not.toContain('flex-wrap');
    expect(wrapped).toEqual(expect.arrayContaining(['min-h-16', 'flex-wrap', 'py-2', 'items-center']));
    expect(wrapped).not.toContain('h-16');
    expect(wrapped).not.toContain('mb-4');
    expect(classes({ wrap: true })).toContain('mb-4');
  });

  test('only the two assistant headers opt into wrapping at the shared component boundary', () => {
    for (const file of ['apps/frontend/src/components/agents/agent.workspace-shell.tsx', 'apps/frontend/src/components/agents/agent.threads.tsx']) {
      const band = source(file).match(/<OpeningBand\b[^>]*>/)?.[0];
      expect(band).toMatch(/\bwrap\s*>$/);
      expect(band).not.toMatch(/\b(?:h-auto|flex-wrap)\b/);
    }
    expect(source('apps/frontend/src/components/agents/agent.panel.tsx')).not.toMatch(/<OpeningBand\b[^>]*\bwrap\b/);
  });

  test('keeps the shared height, vertical centring, and following gap in one primitive', () => {
    const primitive = source(
      'libraries/react-shared-libraries/src/layout/opening.band.tsx'
    );

    expect(primitive).toContain('h-16');
    expect(primitive).toContain('items-center');
    expect(primitive).toContain('mb-4');
    expect(primitive).not.toContain('mb-[15px]');
    expect(primitive).toContain('ownsBottomMargin');
  });

  test('lets a column that ends in a divider keep its own bottom margin', () => {
    // The default gap belongs to columns that had `mb-[15px]` before the band
    // was shared. The chat column's head carries `border-b`, so inheriting the
    // default would put 16px of empty surface between the divider and the
    // conversation. Tailwind prints `.mb-4` after `.mb-0`, so the call site
    // cannot win by writing `mb-0` beside the default — the primitive has to
    // stand down, and this proves it does.
    const head = source('apps/frontend/src/components/agents/agent.threads.tsx');
    const band = head.match(/<OpeningBand className="([^"]*)"/)?.[1] ?? '';

    expect(band).toContain('border-b');
    expect(band.split(/\s+/)).toContain('mb-0');
  });

  test('uses the same opening-band primitive for every agents-page column', () => {
    // Since `content-factory-next-kcxz.10` the columns are the chat (its head
    // is the conversation switcher) and the work panel beside it.
    const usage = [
      openingBandUsage('apps/frontend/src/components/agents/agent.threads.tsx', 1),
      openingBandUsage('apps/frontend/src/components/agents/agent.panel.tsx', 1),
    ];

    expect(usage).toEqual(
      usage.map(({ expectedCount }) => ({
        importsOpeningBand: true,
        renderCount: expectedCount,
        namesLegacyHeight: false,
        expectedCount,
      }))
    );
  });
});
