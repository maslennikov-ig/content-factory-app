'use strict';

/**
 * The rail's footer stays on screen under a banner (review of 97dq.81-85,
 * P2-3).
 *
 * `97dq.84` made the navigation rail sticky and one viewport tall. Under the
 * announcement banner or the impersonation bar that made every page a banner
 * taller than the screen, and at the top of the page the rail's footer
 * (profile, logout, collapse) sat below the fold. The shell is now one
 * viewport tall from `md` up: the bars take their height, the rail and the
 * working column share the rest, and the column scrolls.
 *
 * jsdom has no layout, so this test lays the shell out in a real browser.
 * The class strings are read from the two source files, compiled by the
 * repo's Tailwind, and measured in headless Chromium at 1280×800 — with and
 * without a banner, on a short page and on a long page scrolled down. When
 * no Chromium is installed for Playwright the browser cases are skipped and
 * say so; the class wiring below them still runs.
 */

const fs = require('node:fs');
const path = require('node:path');

const read = (file) =>
  fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const LAYOUT = read('apps/frontend/src/components/new-layout/layout.component.tsx');
const SIDEBAR = read('apps/frontend/src/components/new-layout/sidebar.tsx');

const classAfter = (source, marker) => {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  const match = source.slice(at).match(/className="([^"]+)"/);
  if (!match) throw new Error(`no className after ${marker}`);
  return match[1];
};
const quotedAfter = (source, marker) => {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  return [...source.slice(at, at + 600).matchAll(/'([^']*)'/g)].map((m) => m[1]);
};

const shellParts = quotedAfter(LAYOUT, 'data-app-shell=');
const SHELL = {
  base: shellParts[2],
  viewport: shellParts[3],
};
const ROW = classAfter(LAYOUT, 'data-app-row="true"');
const COLUMN = classAfter(LAYOUT, 'data-app-scroll="true"');
const MAIN = classAfter(LAYOUT, 'id="cf-main"');
const FRAME = classAfter(SIDEBAR, 'data-sidebar-frame="true"');
const NAV = classAfter(SIDEBAR, "aria-label={t('primary_navigation'");
const FOOTER = classAfter(SIDEBAR, 'data-sidebar-footer="true"');

test('the shell is one viewport tall from md up, and the column scrolls (class wiring)', () => {
  expect(SHELL.base.split(' ')).toEqual(
    expect.arrayContaining(['flex', 'flex-col', 'min-h-screen'])
  );
  expect(SHELL.viewport.split(' ')).toEqual(
    expect.arrayContaining(['md:h-[100dvh]', 'md:min-h-0', 'md:overflow-hidden'])
  );
  expect(ROW.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']));
  expect(COLUMN.split(' ')).toEqual(
    expect.arrayContaining(['md:min-h-0', 'md:overflow-y-auto'])
  );
  expect(MAIN.split(' ')).toContain('md:flex-[1_0_auto]');
  // The rail no longer sizes itself to the viewport: the shell does.
  expect(FRAME.split(' ')).not.toContain('h-[100dvh]');
  expect(FRAME.split(' ')).not.toContain('sticky');
  expect(FRAME.split(' ')).toContain('self-stretch');
});

const html = ({ banner, pageHeight }) => `<!doctype html><html><head><style>__CSS__</style></head>
<body style="margin:0">
  <div id="shell" class="${SHELL.base} ${SHELL.viewport}">
    ${banner ? `<div id="banner" style="height:${banner}px">banner</div>` : ''}
    <div class="${ROW}">
      <div id="frame" class="${FRAME}">
        <div class="relative min-w-0 h-full" style="width:248px">
          <div class="flex min-w-0 flex-col h-full min-h-0">
            <nav class="${NAV}"><div style="height:1200px">links</div></nav>
            <div id="footer" class="${FOOTER}" style="height:120px">footer</div>
          </div>
        </div>
      </div>
      <div id="column" class="${COLUMN}">
        <header class="h-[56px] shrink-0">header</header>
        <main id="main" class="${MAIN}">
          <div style="height:${pageHeight}px;width:600px">page</div>
          <aside id="aside" style="width:200px">rail</aside>
        </main>
      </div>
    </div>
  </div>
</body></html>`;

const compileCss = async () => {
  const postcss = require('postcss');
  const tailwind = require('tailwindcss');
  const content = html({ banner: 48, pageHeight: 10 });
  const result = await postcss([
    tailwind({ content: [{ raw: content, extension: 'html' }], corePlugins: { preflight: true } }),
  ]).process('@tailwind base; @tailwind components; @tailwind utilities;', {
    from: undefined,
  });
  return result.css;
};

let browser = null;
let css = '';
let skipped = null;
beforeAll(async () => {
  css = await compileCss();
  const { chromium } = require('playwright');
  try {
    browser = await chromium.launch();
  } catch (error) {
    skipped = error instanceof Error ? error.message.split('\n')[0] : String(error);
    // A Chromium from another Playwright revision lays out the same CSS.
    const cache = path.join(require('node:os').homedir(), '.cache', 'ms-playwright');
    const found = (fs.existsSync(cache) ? fs.readdirSync(cache) : [])
      .filter((dir) => /^chromium-\d+$/.test(dir))
      .sort()
      .reverse()
      .map((dir) => path.join(cache, dir, 'chrome-linux64', 'chrome'))
      .find((file) => fs.existsSync(file));
    if (found) {
      browser = await chromium.launch({ executablePath: found }).catch(() => null);
      if (browser) skipped = null;
    }
  }
}, 30_000);
afterAll(async () => {
  await browser?.close();
});

const measure = async (options, scroll = 0) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(html(options).replace('__CSS__', css));
  if (scroll)
    await page.evaluate((top) => {
      document.getElementById('column').scrollTop = top;
    }, scroll);
  const box = await page.evaluate(() => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect();
    return {
      documentHeight: document.documentElement.scrollHeight,
      footerBottom: rect('footer').bottom,
      frameTop: rect('frame').top,
      mainHeight: rect('main').height,
      asideHeight: rect('aside').height,
      columnScroll: document.getElementById('column').scrollTop,
    };
  });
  await page.close();
  return box;
};

const browserTest = (name, body) =>
  test(name, async () => {
    if (!browser) {
      console.warn(`app-shell layout: browser case skipped — ${skipped}`);
      return;
    }
    await body();
  }, 30_000);

browserTest('under a banner a short page has no forced scroll and the footer is on screen', async () => {
  const box = await measure({ banner: 48, pageHeight: 200 });
  expect(box.documentHeight).toBe(800);
  expect(box.footerBottom).toBeLessThanOrEqual(800);
  expect(box.footerBottom).toBeGreaterThan(800 - 2);
  expect(box.frameTop).toBe(48);
});

browserTest('under a banner a long page scrolls in the column; the rail and its footer stay', async () => {
  const box = await measure({ banner: 48, pageHeight: 3000 }, 1500);
  expect(box.documentHeight).toBe(800);
  expect(box.columnScroll).toBe(1500);
  expect(box.frameTop).toBe(48);
  expect(box.footerBottom).toBeLessThanOrEqual(800);
  // The page keeps its content height, and its side rail grows with it.
  expect(box.mainHeight).toBeGreaterThanOrEqual(3000);
  expect(box.asideHeight).toBe(box.mainHeight);
});

browserTest('without a banner the rail is exactly the viewport', async () => {
  const box = await measure({ banner: 0, pageHeight: 3000 }, 400);
  expect(box.documentHeight).toBe(800);
  expect(box.frameTop).toBe(0);
  expect(box.footerBottom).toBe(800);
});
