'use strict';

/**
 * Italic, underline and a link with its own words in the adaptation editor
 * (`content-factory-next-97dq.52`, thirteenth walk, E1).
 *
 * Owner: «в редакторах важно, чтобы была возможность добавлять ссылки потом».
 * The stored body is plain text, so every new mark needs a sign in the body,
 * a way back into the editor and a translation into each channel's markup.
 * The suite asks all three about the same text: the editor must not lose a
 * mark, the page must show what the post will carry, and Telegram must get
 * the tags it accepts — and nothing it would refuse.
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
const Italic = require('@tiptap/extension-italic').default;
const Underline = require('@tiptap/extension-underline').default;
const Link = require('@tiptap/extension-link').default;
const { act, cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/pieces';
const marks = loadTypeScriptModule('libraries/helpers/src/utils/inline-marks.ts');
const { storedToDoc, docToStored } = loadTypeScriptModule(
  `${base}/adaptation-rich-text.doc.ts`
);
const { formatStoredMarkup } = loadTypeScriptModule(`${base}/adaptation-markup.tsx`);
const { AdaptationEditor } = loadTypeScriptModule(`${base}/adaptation-editor.tsx`);
const { visibleLength, readLinkAddress } = loadTypeScriptModule(
  `${base}/pieces.adapter.ts`
);
const { editorHtml } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts'
);

class TelegramBot {}
const { telegramHtml } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/social/telegram.provider.ts',
  {
    '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface':
      {},
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
    '@contentfactory/nestjs-libraries/services/redact.sensitive': {
      redactSensitive: (value) => value,
    },
    '@contentfactory/nestjs-libraries/integrations/social.abstract': {
      SocialAbstract: class {},
    },
    'node-telegram-bot-api': { __esModule: true, default: TelegramBot },
  }
);

afterEach(cleanup);

const makeEditor = (content) =>
  new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Underline,
      Link.configure({ autolink: true, protocols: ['http', 'https'] }),
    ],
    content,
  });

const BODIES = [
  ['italic', 'Вышло _вчера_ вечером.'],
  ['underline', 'Главное ++сегодня++, не завтра.'],
  ['a link with words', 'Подробности [на сайте](https://example.com/a_b?x=1&y=2).'],
  ['bold italic', '**_жирный курсив_** рядом'],
  ['underlined italic', '++_оба сразу_++ и хвост'],
  ['a bold link with words', 'См. **[отчёт](https://example.com/r)** тут'],
  ['snake_case stays text', 'Файл some_file_name и @some_user.'],
  ['C++ stays text', 'Пишем на C++ и C++ ещё.'],
  ['underscores in an address', 'Адрес https://example.com/_x_/y тут'],
];

describe('the grammar is lossless both ways', () => {
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

  test('bold written inside a link token means the same and is written outside', () => {
    expect(docToStored(storedToDoc('См. [**отчёт**](https://example.com/r) тут'))).toBe(
      'См. **[отчёт](https://example.com/r)** тут'
    );
  });

  test('an address inside a link token never becomes a mark', () => {
    const nodes = marks.parseInline('[x](https://a.com/_y_)');
    expect(nodes).toEqual([
      { kind: 'link', href: 'https://a.com/_y_', children: [{ kind: 'text', text: 'x' }] },
    ]);
  });
});

describe('what the editor writes back', () => {
  test('italic and underline made in the editor become their signs', () => {
    const editor = makeEditor(storedToDoc('один два три'));
    try {
      editor.chain().setTextSelection({ from: 1, to: 5 }).toggleItalic().run();
      editor.chain().setTextSelection({ from: 10, to: 13 }).toggleUnderline().run();
      expect(docToStored(editor.getJSON())).toBe('_один_ два ++три++');
    } finally {
      editor.destroy();
    }
  });

  test('a link set over words is stored as words and address, and removed cleanly', () => {
    const editor = makeEditor(storedToDoc('читайте отчёт здесь'));
    try {
      editor
        .chain()
        .setTextSelection({ from: 9, to: 14 })
        .setLink({ href: 'https://example.com/report' })
        .run();
      expect(docToStored(editor.getJSON())).toBe(
        'читайте [отчёт](https://example.com/report) здесь'
      );
      // Правка адреса: курсор в ссылке, та же команда с новым адресом.
      editor
        .chain()
        .setTextSelection(11)
        .extendMarkRange('link')
        .setLink({ href: 'https://example.com/v2' })
        .run();
      expect(docToStored(editor.getJSON())).toBe(
        'читайте [отчёт](https://example.com/v2) здесь'
      );
      editor.chain().setTextSelection(11).extendMarkRange('link').unsetLink().run();
      expect(docToStored(editor.getJSON())).toBe('читайте отчёт здесь');
    } finally {
      editor.destroy();
    }
  });

  test('a link to anything but http(s) is not written', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'нажми',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };
    expect(docToStored(doc)).toBe('нажми');
    expect(readLinkAddress('javascript:alert(1)')).toBeNull();
    expect(readLinkAddress('mailto:a@b.co')).toBeNull();
    expect(readLinkAddress('example.com/x')).toBe('https://example.com/x');
  });

  test('a mark glued to a letter is dropped rather than published as signs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'пол' },
            { type: 'text', text: 'слова', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };
    expect(docToStored(doc)).toBe('полслова');
  });
});

describe('each channel gets the marks it can show', () => {
  const body =
    'Итог: **27,5%**, _вчера_, ++важно++ и [отчёт](https://example.com/r?a=1&b=2).';

  test('html channels get <strong>, <em>, <u> and <a href>, text escaped', () => {
    expect(editorHtml(body, 'html')).toBe(
      '<p>Итог: <strong>27,5%</strong>, <em>вчера</em>, <u>важно</u> и <a href="https://example.com/r?a=1&amp;b=2">отчёт</a>.</p>'
    );
    expect(editorHtml('_<b>a & b</b>_', 'html')).toBe(
      '<p><em>&lt;b&gt;a &amp; b&lt;/b&gt;</em></p>'
    );
  });

  test('markdown keeps bold, italic and the link; underline loses its signs', () => {
    expect(editorHtml(body, 'markdown')).toBe(
      'Итог: **27,5%**, _вчера_, важно и [отчёт](https://example.com/r?a=1&b=2).'
    );
  });

  test('channels without formatting get the words, and a link keeps its address', () => {
    expect(editorHtml(body, 'none')).toBe(
      'Итог: 27,5%, вчера, важно и отчёт (https://example.com/r?a=1&b=2).'
    );
    expect(editorHtml(body, 'normal')).toBe(
      '<p>Итог: 27,5%, вчера, важно и отчёт (https://example.com/r?a=1&amp;b=2).</p>'
    );
  });

  test('Telegram gets <b>, <i>, <u> and a bare <a href>', () => {
    expect(telegramHtml(editorHtml(body, 'html'))).toBe(
      'Итог: <b>27,5%</b>, <i>вчера</i>, <u>важно</u> и <a href="https://example.com/r?a=1&amp;b=2">отчёт</a>.\n'
    );
  });

  test('Telegram drops what it would refuse: extra link attributes, other schemes, other tags', () => {
    expect(
      telegramHtml(
        '<p><a href="https://x.com" target="_blank" rel="noopener">x</a> <a href="javascript:alert(1)">y</a> <span>z</span></p>'
      )
    ).toBe('<a href="https://x.com">x</a> y z\n');
  });

  test('the counter and the page read the same marks as the post', () => {
    expect(visibleLength('_ab_ ++cd++ [ef](https://x.com)')).toBe('ab cd ef'.length);
    const nodes = formatStoredMarkup('_a_ и ++b++ и [c](https://x.com)');
    const tags = nodes.filter((node) => node && typeof node === 'object').map((node) => node.type);
    expect(tags).toEqual(['em', 'u', 'a']);
  });
});

describe('the toolbar', () => {
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  test('carries italic and underline next to bold, and the link panel has a hint', async () => {
    render(
      React.createElement(AdaptationEditor, {
        locale: 'ru',
        platformLabel: 'Telegram',
        value: 'Текст',
        onChange: () => {},
        maxLength: 4096,
        format: 'telegram',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Курсив' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подчёркнутый' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ссылка' }));
    const panel = document.querySelector('[data-editor-link-panel]');
    expect(panel.getAttribute('data-editor-link-panel')).toBe('add');
    expect(screen.getByRole('button', { name: 'Как вставить ссылку' })).toBeTruthy();
  });
});
