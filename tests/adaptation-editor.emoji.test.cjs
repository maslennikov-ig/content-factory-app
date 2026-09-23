'use strict';

/**
 * Эмодзи в редакторе адаптации и панель по формату канала
 * (`content-factory-next-97dq.61`, вариант A).
 *
 * Холст: «Кнопки панели зависят от формата канала: у Telegram — жирный,
 * ссылка, эмодзи… Эмодзи вставляются туда, где стоит курсор; поиск…;
 * библиотека уже есть в проекте». Здесь держится таблица форматов (новый
 * формат — одна строка), порядок кнопок из неё, выбор с поиском из
 * `emoji-picker-react` на системном шрифте и вставка в позицию курсора.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
/*
  jsdom lays nothing out, and the picker draws a category only once an
  IntersectionObserver says it is on screen and the list has a width. The stub
  reports every observed category as visible and gives elements a size, which
  is what a browser would do for the first rows of an open picker.
*/
class IntersectionObserverStub {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    setTimeout(
      () => this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this),
      0
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
global.IntersectionObserver = IntersectionObserverStub;
dom.window.IntersectionObserver = IntersectionObserverStub;
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get: () => 320,
});
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get: () => 40,
});
require('./helpers/tiptap-jsdom.cjs').prepareTipTap(dom);

const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/pieces';
const toolbar = loadTypeScriptModule(`${base}/adaptation-toolbar.ts`);
const { AdaptationEditor } = loadTypeScriptModule(`${base}/adaptation-editor.tsx`);

afterEach(cleanup);

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const drawEditor = (props = {}) =>
  render(
    React.createElement(AdaptationEditor, {
      locale: 'ru',
      platformLabel: 'Telegram',
      value: 'Когда задачи на доске',
      onChange: () => {},
      maxLength: 4096,
      draftId: 'a1',
      format: 'telegram',
      ...props,
    })
  );

const openEditor = async (props) => {
  const view = drawEditor(props);
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
  await flush();
  return view;
};

const tools = () =>
  Array.from(document.querySelectorAll('[data-editor-tool]')).map((node) =>
    node.getAttribute('data-editor-tool')
  );

describe('the toolbar comes from one table of formats', () => {
  test('Telegram: bold, link, emoji — and an unknown format gets the default', () => {
    expect(toolbar.editorToolsFor('telegram')).toEqual(['bold', 'link', 'emoji']);
    expect(toolbar.editorToolsFor('TELEGRAM')).toEqual(['bold', 'link', 'emoji']);
    expect(toolbar.editorToolsFor('some-new-format')).toBe(
      toolbar.EDITOR_TOOLS_BY_FORMAT.default
    );
    expect(toolbar.editorToolsFor(null)).toBe(toolbar.EDITOR_TOOLS_BY_FORMAT.default);
    // Каждый инструмент таблицы — известный редактору.
    for (const set of Object.values(toolbar.EDITOR_TOOLS_BY_FORMAT))
      for (const tool of set) expect(toolbar.EDITOR_TOOLS).toContain(tool);
  });

  test('the editor draws exactly the set of its format, in order', async () => {
    await openEditor();
    expect(tools()).toEqual(['bold', 'link', 'emoji']);
  });

  test('a format with its own entry changes the toolbar and nothing else', async () => {
    toolbar.EDITOR_TOOLS_BY_FORMAT['plain-test'] = ['emoji'];
    try {
      await openEditor({ format: 'plain-test' });
      expect(tools()).toEqual(['emoji']);
    } finally {
      delete toolbar.EDITOR_TOOLS_BY_FORMAT['plain-test'];
    }
  });

  test('the image button stays with whoever can attach a picture', async () => {
    await openEditor({ onPickImage: () => undefined });
    expect(tools()).toEqual(['bold', 'link', 'emoji', 'image']);
  });

  test('the channel tab hands the editor its format', () => {
    const tab = fs.readFileSync(
      path.resolve(__dirname, '..', `${base}/piece-channel-tab.tsx`),
      'utf8'
    );
    expect(tab).toMatch(/format=\{channel\.providerIdentifier \|\| channel\.platform\}/);
  });
});

describe('the emoji button', () => {
  test('is only there while editing, named and closed', async () => {
    drawEditor();
    expect(screen.queryByRole('button', { name: 'Эмодзи' })).toBeNull();
    cleanup();
    await openEditor();
    const button = screen.getByRole('button', { name: 'Эмодзи' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-editor-emoji-picker]')).toBeNull();
  });

  test('opens the shared picker with search, on the system font', async () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', `${base}/adaptation-editor.tsx`),
      'utf8'
    );
    // Та же библиотека, что в окне поста, и без картинок с CDN.
    expect(source).toMatch(/from 'emoji-picker-react'/);
    expect(source).toMatch(/emojiStyle=\{EmojiStyle\.NATIVE\}/);
    expect(source).toMatch(/searchPlaceholder=\{t\.emojiSearch\}/);

    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Эмодзи' }));
    await flush();
    const picker = document.querySelector('[data-editor-emoji-picker]');
    expect(picker).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Эмодзи' }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(picker.querySelector('input[placeholder="Найти эмодзи"]')).not.toBeNull();
  });

  test('inserts at the cursor, not at the end, and closes', async () => {
    const onChange = jest.fn();
    await openEditor({ onChange });
    const field = document.querySelector('[data-editor-field="true"]');
    // Курсор после «Когда» (позиция 6 в документе TipTap).
    await act(async () => {
      field.editor.chain().setTextSelection(6).run();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Эмодзи' }));
    await flush();
    await flush();
    const picker = document.querySelector('[data-editor-emoji-picker]');
    const emoji = picker.querySelector('button[data-unified]');
    expect(emoji).not.toBeNull();
    await act(async () => {
      fireEvent.click(emoji);
    });
    await flush();
    const text = field.editor.getText();
    expect(text.startsWith('Когда')).toBe(true);
    expect(text.endsWith(' задачи на доске')).toBe(true);
    // Между «Когда» и пробелом встал ровно один новый знак-эмодзи.
    const inserted = text.slice('Когда'.length, text.length - ' задачи на доске'.length);
    expect(inserted.length).toBeGreaterThan(0);
    expect(/\p{Extended_Pictographic}/u.test(inserted)).toBe(true);
    expect(onChange).toHaveBeenCalled();
    expect(document.querySelector('[data-editor-emoji-picker]')).toBeNull();
  });

  test('Escape closes the picker', async () => {
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Эмодзи' }));
    await flush();
    expect(document.querySelector('[data-editor-emoji-picker]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(document.querySelector('[data-editor-emoji-picker]')).toBeNull();
  });
});
