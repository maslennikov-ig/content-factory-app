'use strict';

/**
 * «Редактировать» на TipTap не меняет хранимое тело (`content-factory-next-97dq.46`).
 *
 * Одиннадцатый заход 23.09.2026: «Показать разметку» заменена полем TipTap.
 * Тело по-прежнему хранится текстом с `**жирным**` — его читают сервер и
 * черновик поста, — и поле обязано возвращать ровно то, что получило. Здесь
 * это проверяется дважды: чистым переводом и через настоящий редактор с теми
 * же расширениями, что стоят в поле, — схема могла бы молча выбросить отметку.
 */

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
require('./helpers/tiptap-jsdom.cjs').prepareTipTap(dom);

const { Editor } = require('@tiptap/core');
const Document = require('@tiptap/extension-document').default;
const Paragraph = require('@tiptap/extension-paragraph').default;
const Text = require('@tiptap/extension-text').default;
const Bold = require('@tiptap/extension-bold').default;
const Link = require('@tiptap/extension-link').default;
const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/pieces';
const { storedToDoc, docToStored } = loadTypeScriptModule(
  `${base}/adaptation-rich-text.doc.ts`
);
const { AdaptationEditor } = loadTypeScriptModule(
  `${base}/adaptation-editor.tsx`
);
const { AdaptationBody } = loadTypeScriptModule(`${base}/adaptation-body.tsx`);

afterEach(cleanup);

const BODIES = [
  ['plain text', 'Просто текст без выделений.'],
  ['one bold pair', 'Комиссия выросла до **27,5%** с июля.'],
  ['two pairs and a tail', '**Первое** и **второе**, потом хвост'],
  ['paragraphs and a single line break', 'Абзац\n\nВторой **абзац**\nстрока'],
  ['trailing and leading newlines', '\nНачало\n\n'],
  ['a link address', 'Подробнее: https://example.com/path?a=1&b=2.'],
  ['a bold link', 'Смотрите **https://example.com/x** сейчас'],
  ['a bracketed address', 'Статья (https://en.wikipedia.org/wiki/A_(b)) тут'],
  ['stray markers stay text', 'Осталась **одна звёздочка и 2 ** 3 = 8'],
  ['triple stars', '***жирный***'],
  ['markers across a line break', 'Начало **здесь\nи конец** там.'],
  ['double spaces', 'Два  пробела и **жирное**  рядом'],
  ['empty', ''],
];

const makeEditor = (content) =>
  new Editor({
    extensions: [Document, Paragraph, Text, Bold, Link.configure({ autolink: true })],
    content,
  });

describe('stored body → editor → stored body is lossless', () => {
  test.each(BODIES)('%s, through the pure translation', (_name, body) => {
    expect(docToStored(storedToDoc(body))).toBe(body);
  });

  test.each(BODIES)('%s, through a real TipTap editor', (_name, body) => {
    const editor = makeEditor(storedToDoc(body));
    try {
      expect(docToStored(editor.getJSON())).toBe(body);
    } finally {
      editor.destroy();
    }
  });

  test('bold reaches the editor as a bold mark and links as a link mark', () => {
    const editor = makeEditor(
      storedToDoc('До **важного** и https://example.com/a после')
    );
    try {
      const html = editor.getHTML();
      expect(html).toContain('<strong>важного</strong>');
      expect(html).toContain('href="https://example.com/a"');
      expect(html).not.toContain('**');
    } finally {
      editor.destroy();
    }
  });
});

describe('what the editor writes back', () => {
  test('bold made in the editor becomes the stored pair', () => {
    const editor = makeEditor(storedToDoc('один два три'));
    try {
      // «два» — позиции 6..9 в документе (абзац открывается на 1).
      editor.chain().setTextSelection({ from: 6, to: 9 }).toggleBold().run();
      expect(docToStored(editor.getJSON())).toBe('один **два** три');
      editor.chain().setTextSelection({ from: 6, to: 9 }).toggleBold().run();
      expect(docToStored(editor.getJSON())).toBe('один два три');
    } finally {
      editor.destroy();
    }
  });

  test('a bold selection that swallowed spaces keeps the spaces outside the pair', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'один' },
            { type: 'text', text: ' два ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'три' },
          ],
        },
      ],
    };
    expect(docToStored(doc)).toBe('один **два** три');
  });

  test('bold with a star inside is written as text, not as a broken pair', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '2*3', marks: [{ type: 'bold' }] }],
        },
      ],
    };
    expect(docToStored(doc)).toBe('2*3');
  });

  /*
    Until `97dq.52` the body had no way to hold a link with its own words, and
    the words were kept alone. The owner asked for real links in the editor:
    such a link is now stored as `[words](address)` and reaches the post.
  */
  test('a link whose words differ from its address is stored with both', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'сайт',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ],
    };
    expect(docToStored(doc)).toBe('[сайт](https://example.com)');
  });
});

const drawEditor = (props = {}) =>
  render(
    React.createElement(AdaptationEditor, {
      locale: 'ru',
      platformLabel: 'Telegram',
      value: 'Сначала **жирное**, потом текст.',
      onChange: () => {},
      maxLength: 4096,
      draftId: 'a1',
      ...props,
    })
  );

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('«Редактировать» replaces «Показать разметку»', () => {
  test('the text reads formatted, and nothing offers the raw markup', () => {
    drawEditor();
    const article = document.querySelector('[data-intake-draft="true"]');
    expect(article.querySelector('strong').textContent).toBe('жирное');
    expect(screen.queryByRole('button', { name: /разметк/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Редактировать' })).toBeTruthy();
    // Инструменты правки появляются только в режиме правки.
    expect(screen.queryByRole('button', { name: 'Жирный' })).toBeNull();
  });

  test('edit mode opens TipTap with bold still bold, edits go up in the stored form, «Готово» leaves', async () => {
    const onChange = jest.fn();
    drawEditor({ onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await flush();
    const field = document.querySelector('[data-editor-field="true"]');
    expect(field).not.toBeNull();
    expect(field.getAttribute('contenteditable')).toBe('true');
    expect(field.getAttribute('aria-label')).toBe('Текст поста для Telegram');
    expect(field.querySelector('strong').textContent).toBe('жирное');
    expect(field.textContent).not.toContain('**');
    expect(
      document.querySelector('[data-adaptation-mode="edit"]')
    ).not.toBeNull();

    await act(async () => {
      field.editor
        .chain()
        .setTextSelection({ from: 1, to: 8 })
        .toggleBold()
        .run();
    });
    expect(onChange).toHaveBeenLastCalledWith(
      '**Сначала** **жирное**, потом текст.'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    await flush();
    expect(document.querySelector('[data-editor-field="true"]')).toBeNull();
    expect(
      document.querySelector('[data-adaptation-mode="read"]')
    ).not.toBeNull();
  });

  test('the counter still counts what the reader sees', () => {
    drawEditor({ value: 'Раз **два**' });
    expect(
      document.querySelector('[data-editor-counter]').textContent
    ).toBe('7 из 4096 знаков');
  });

  test('a text changed outside reaches the open editor without an echo', async () => {
    const onChange = jest.fn();
    const view = drawEditor({ onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await flush();
    view.rerender(
      React.createElement(AdaptationEditor, {
        locale: 'ru',
        platformLabel: 'Telegram',
        value: 'Новый **вариант**',
        onChange,
        maxLength: 4096,
        draftId: 'a1',
      })
    );
    await flush();
    const field = document.querySelector('[data-editor-field="true"]');
    expect(field.textContent).toBe('Новый вариант');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('a scheduled post shows «Редактировать» switched off with the way to open it', () => {
    render(
      React.createElement(AdaptationBody, {
        locale: 'ru',
        text: 'Текст **в очереди**',
        lockedReason: 'Пост стоит в расписании.',
      })
    );
    const button = screen.getByRole('button', { name: 'Редактировать' });
    expect(button.disabled).toBe(true);
    const reason = document.getElementById(
      button.getAttribute('aria-describedby')
    );
    expect(reason.textContent).toBe('Пост стоит в расписании.');
  });

  test('without a reason the read-only body offers no button at all', () => {
    render(
      React.createElement(AdaptationBody, { locale: 'ru', text: '**Вышло**' })
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('strong').textContent).toBe('Вышло');
  });
});
