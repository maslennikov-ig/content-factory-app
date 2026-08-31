const fs = require('fs');
const path = require('path');

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
    // The default gap belongs to the two agent columns that had `mb-[15px]`
    // before the band was shared. The chat column had no margin at all and a
    // `border-b`, so inheriting the default put 16px of empty surface between
    // the divider and the chat. Tailwind prints `.mb-4` after `.mb-0`, so the
    // call site cannot win by writing `mb-0` beside the default — the primitive
    // has to stand down, and this proves it does.
    const chat = source('apps/frontend/src/components/agents/agent.chat.tsx');
    const band = chat.match(/<OpeningBand className="([^"]*)"/)?.[1] ?? '';

    expect(band).toContain('border-b');
    expect(band.split(/\s+/)).toContain('mb-0');
  });

  test('uses the same opening-band primitive for every agents-page column', () => {
    const usage = [
      openingBandUsage('apps/frontend/src/components/agents/agent.tsx', 2),
      openingBandUsage('apps/frontend/src/components/agents/agent.chat.tsx', 1),
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
