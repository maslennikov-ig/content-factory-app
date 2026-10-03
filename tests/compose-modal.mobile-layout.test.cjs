'use strict';

/** Geometry guard for the post editor's viewport-sized mobile layout. */
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const options = fs.readFileSync(
  path.join(root, 'apps/frontend/src/components/new-launch/compose.modal.options.ts'),
  'utf8'
);
const manage = fs.readFileSync(
  path.join(root, 'apps/frontend/src/components/new-launch/manage.modal.tsx'),
  'utf8'
);

const classFrom = (pattern, name) => {
  const match = manage.match(pattern);
  if (!match) throw new Error(`Could not find ${name} class in ManageModal`);
  return match[1];
};

const layout = {
  root: classFrom(/<div className="([^"]*p-4[^\"]*)">/, 'responsive inset'),
  card: classFrom(/<div className="([^"]*min-h-0 min-w-0 flex-1 bg-cf-surface[^"]*)">/, 'dialog card'),
  columns: classFrom(/<div className="([^"]*flex-col overflow-y-auto xl:flex-row xl:overflow-hidden[^"]*)">/, 'editor and preview columns'),
  editor: classFrom(/<div className="([^"]*min-h-\[280px\] min-w-0 flex-1 flex-col border-b[^"]*)">/, 'editor column'),
  editorHeader: classFrom(/<div className="([^"]*min-h-\[64px\] shrink-0 rounded-t-\[12px\][^"]*)">/, 'editor header'),
  preview: classFrom(/<div className="([^"]*w-full min-w-0 shrink-0 flex-col xl:h-auto[^"]*)">/, 'preview column'),
  previewHeader: classFrom(/<div className="([^"]*rounded-none xl:rounded-e[^"]*)">/, 'preview header'),
  footer: classFrom(/<div className="([^"]*min-h-\[84px\] shrink-0 flex-col gap-\[12px\][^"]*)">/, 'responsive footer'),
  footerMeta: classFrom(/<div className="([^"]*w-full min-w-0 flex-wrap items-center gap-\[8px\] ps-\[12px\][^"]*)">/, 'metadata controls'),
  footerActions: classFrom(/<div className="([^"]*w-full min-w-0 flex-wrap items-center justify-end gap-\[8px\] pe-\[12px\][^"]*)">/, 'post actions'),
};

const size = options.match(/size: '([^']+)'/)?.[1];
if (size !== '100%') {
  throw new Error('Compose modal wrapper must fill the viewport before its content applies responsive width');
}

const fixture = `
  <div id="screen" class="fixed inset-0 flex h-screen w-screen overflow-y-auto">
    <div id="modal" class="relative flex flex-1" style="width:${size}">
      <div class="flex flex-1">
        <div id="manage" class="${layout.root}">
          <div id="card" class="${layout.card}">
            <div id="columns" class="${layout.columns}">
              <section id="editor" class="${layout.editor}">
                <header id="editor-header" class="${layout.editorHeader}">
                  <span>Create Post</span>
                  <button id="close" class="shrink-0" style="width:44px;height:44px">Close</button>
                </header>
                <div id="editor-body" class="flex-1 min-h-0 overflow-y-auto">
                  <div style="height:360px">Editor text</div>
                </div>
              </section>
              <section id="preview" class="${layout.preview}">
                <header id="preview-header" class="${layout.previewHeader}">Post Preview</header>
                <div class="relative min-h-0 flex-1 overflow-y-auto">Preview content</div>
              </section>
            </div>
            <footer id="footer" class="${layout.footer}">
              <div id="metadata" class="${layout.footerMeta}">
                <button style="width:96px;height:40px">Tags</button>
                <button style="width:112px;height:40px">Repeat</button>
                <button style="width:160px;height:40px">Stage</button>
                <button style="width:140px;height:40px">Ask agent</button>
              </div>
              <div id="actions" class="${layout.footerActions}">
                <button style="width:100px;height:40px">Delete</button>
                <button style="width:120px;height:40px">Date</button>
                <button style="width:160px;height:40px">Save draft</button>
                <button style="width:180px;height:40px">Publish</button>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  </div>`;

const compileCss = async () => {
  const config = require(path.join(root, 'apps/frontend/tailwind.config.cjs'));
  config.content = [{ raw: fixture, extension: 'html' }];
  const result = await postcss([tailwind(config)]).process(
    '@tailwind base; @tailwind components; @tailwind utilities;',
    { from: undefined }
  );
  return result.css;
};

let browser;
let css;
beforeAll(async () => {
  css = await compileCss();
  try {
    browser = await chromium.launch();
  } catch (error) {
    const cache = path.join(require('node:os').homedir(), '.cache/ms-playwright');
    const executable = (fs.existsSync(cache) ? fs.readdirSync(cache) : [])
      .filter((directory) => /^chromium-\d+$/.test(directory))
      .sort()
      .reverse()
      .map((directory) => path.join(cache, directory, 'chrome-linux64/chrome'))
      .find((candidate) => fs.existsSync(candidate));
    if (!executable) throw error;
    browser = await chromium.launch({ executablePath: executable });
  }
});
afterAll(async () => browser?.close());

const geometryAt = async ({ width, height, dark }) => {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body class="${dark ? 'dark' : ''}">${fixture}</body></html>`
  );
  const geometry = await page.evaluate(() => {
    const rect = (id) => {
      const { left, right, top, bottom, width, height } = document
        .getElementById(id)
        .getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      modal: rect('modal'),
      manage: rect('manage'),
      editor: rect('editor'),
      preview: rect('preview'),
      close: rect('close'),
      footer: rect('footer'),
      buttons: [...document.querySelectorAll('#footer button')].map((button) => {
        const { left, right, top, bottom } = button.getBoundingClientRect();
        return { left, right, top, bottom };
      }),
    };
  });
  await page.close();
  return geometry;
};

test('the open editor, close control, and every footer action stay inside 390px', async () => {
  const result = await geometryAt({ width: 390, height: 844, dark: true });
  expect(result.documentWidth).toBe(390);
  expect(result.modal.left).toBeGreaterThanOrEqual(0);
  expect(result.modal.right).toBeLessThanOrEqual(390);
  expect(result.editor.right).toBeLessThanOrEqual(390);
  expect(result.preview.right).toBeLessThanOrEqual(390);
  expect(result.preview.top).toBeGreaterThanOrEqual(result.editor.bottom);
  expect(result.close.left).toBeGreaterThanOrEqual(0);
  expect(result.close.right).toBeLessThanOrEqual(390);
  expect(result.close.bottom).toBeLessThanOrEqual(844);
  expect(result.footer.bottom).toBeLessThanOrEqual(844);
  for (const button of result.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(0);
    expect(button.right).toBeLessThanOrEqual(390);
    expect(button.bottom).toBeLessThanOrEqual(844);
  }
});

test('the close action stays in the editor header ahead of the stacked preview', () => {
  const close = manage.indexOf("aria-label={t('close_post_window'");
  const preview = manage.indexOf('xl:w-[580px] xl:shrink');
  expect(close).toBeGreaterThan(-1);
  expect(preview).toBeGreaterThan(close);
  expect(manage.match(/aria-label=\{t\('close_post_window'/g)).toHaveLength(1);
});

test.each([768, 1024])('the %i px tablet layout stacks columns and wraps footer controls', async (width) => {
  const result = await geometryAt({ width, height: 768, dark: width === 768 });
  expect(result.documentWidth).toBe(width);
  expect(result.manage.right).toBeLessThanOrEqual(width);
  expect(result.preview.top).toBeGreaterThanOrEqual(result.editor.bottom);
  expect(result.close.right).toBeLessThanOrEqual(width);
  expect(result.footer.bottom).toBeLessThanOrEqual(768);
  for (const button of result.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(0);
    expect(button.right).toBeLessThanOrEqual(width);
    expect(button.bottom).toBeLessThanOrEqual(768);
  }
});

test('the 1440px editor retains side-by-side columns and reachable actions', async () => {
  const result = await geometryAt({ width: 1440, height: 900, dark: false });
  expect(result.documentWidth).toBe(1440);
  expect(result.manage.width).toBeCloseTo(1152, 0);
  expect(result.manage.right).toBeLessThanOrEqual(1440);
  expect(result.preview.left).toBeGreaterThanOrEqual(result.editor.right);
  expect(result.preview.right).toBeLessThanOrEqual(1440);
  expect(result.close.right).toBeLessThanOrEqual(1440);
  expect(result.footer.bottom).toBeLessThanOrEqual(900);
  for (const button of result.buttons) {
    expect(button.right).toBeLessThanOrEqual(1440);
    expect(button.bottom).toBeLessThanOrEqual(900);
  }
});
