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

/*
  `content-factory-next-97dq.77` (review-97dq75 P3-13/14): bold inside a link
  came back outside it and cut the link in two; square brackets in link words
  became round ones; a person's own `**x**`, `_x_`, `++x++` or `[a](https://…)`
  typed as text came back as a mark or a link. Escapes are written only where
  the plain text would not read back as itself.
*/
describe('link words and a person’s own signs survive the editor (97dq.77)', () => {
  const para = (...content) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
  const text = (value, ...kinds) =>
    kinds.length
      ? {
          type: 'text',
          text: value,
          marks: kinds.map((kind) =>
            typeof kind === 'string' ? { type: kind } : { type: 'link', attrs: { href: kind.href } }
          ),
        }
      : { type: 'text', text: value };

  test('bold over part of the link words stays inside one link', () => {
    const body = 'См. [отчёт **за май**](https://example.com/r) тут';
    expect(docToStored(storedToDoc(body))).toBe(body);
    const editor = makeEditor(storedToDoc(body));
    try {
      expect(docToStored(editor.getJSON())).toBe(body);
    } finally {
      editor.destroy();
    }
    expect(editorHtml(body, 'html')).toContain(
      '<a href="https://example.com/r">отчёт <strong>за май</strong></a>'
    );
  });

  test('square brackets in link words stay square', () => {
    const doc = para(text('отчёт [PDF]', { href: 'https://example.com/r.pdf' }));
    const stored = docToStored(doc);
    expect(stored).toBe('[отчёт \\[PDF\\]](https://example.com/r.pdf)');
    expect(marks.inlineRuns(marks.parseInline(stored))).toEqual([
      { text: 'отчёт [PDF]', href: 'https://example.com/r.pdf' },
    ]);
    expect(docToStored(storedToDoc(stored))).toBe(stored);
  });

  test.each([
    ['bold signs', 'пишем **так** руками'],
    ['italic signs', 'пишем _так_ руками'],
    ['underline signs', 'пишем ++так++ руками'],
    ['a link typed as text', 'пишем [a](https://example.com) руками'],
  ])('%s typed as text stay text', (_name, typed) => {
    const stored = docToStored(para(text(typed)));
    expect(stored).not.toBe(typed);
    expect(stored).toContain('\\');
    const runs = marks.inlineRuns(marks.parseInline(stored));
    expect(runs.map((run) => run.text).join('')).toBe(typed);
    // No mark, and no link on words: an address typed inside stays a bare link, as any address does.
    expect(runs.every((run) => !run.bold && !run.italic && !run.underline)).toBe(true);
    expect(runs.every((run) => !run.href || run.href === run.text)).toBe(true);
    expect(docToStored(storedToDoc(stored))).toBe(stored);
    expect(marks.inlinePlain(marks.parseInline(stored))).toBe(typed);
    if (!typed.includes('https://'))
      expect(editorHtml(stored, 'html')).toBe(`<p>${typed}</p>`);
  });

  test('each channel shows the person’s signs as text', () => {
    const stored = docToStored(para(text('итог: **так**, '), text('ссылка', { href: 'https://example.com' })));
    expect(editorHtml(stored, 'html')).toBe(
      '<p>итог: **так**, <a href="https://example.com">ссылка</a></p>'
    );
    expect(editorHtml(stored, 'markdown')).toBe(
      'итог: \\*\\*так\\*\\*, [ссылка](https://example.com)'
    );
    expect(editorHtml(stored, 'none')).toBe('итог: **так**, ссылка (https://example.com)');
  });

  test('a line that reads back as itself gets no escapes', () => {
    for (const plain of ['snake_case и C++', '2 ** 3 = 8', 'путь C:\\temp', 'a_b https://example.com/_x_'])
      expect(docToStored(para(text(plain)))).toBe(plain);
  });

  test('a backslash before a sign is text too, both ways', () => {
    const typed = 'экранирование \\* и **жирное** буквально';
    const stored = docToStored(para(text(typed)));
    expect(marks.inlineRuns(marks.parseInline(stored))).toEqual([{ text: typed }]);
  });

  test('escaped signs inside a mark and a mark next to escaped text', () => {
    const doc = para(text('звёзды ', 'bold'), text('**x**'));
    const stored = docToStored(doc);
    expect(marks.inlineRuns(marks.parseInline(stored))).toEqual([
      { text: 'звёзды', bold: true },
      { text: ' **x**' },
    ]);
  });
});

/*
  Review F4 of the fourteenth walk: bodies stored before `97dq.77` hold a
  person's own backslashes — arithmetic, identifiers, UNC paths, brackets.
  They read the same with or without them, so they are text, render as they
  did and survive a no-op trip through the editor byte for byte.
*/
const LEGACY = [
  ['arithmetic', '2\\*3 = 6'],
  ['an identifier', 'поле snake\\_case в конфиге'],
  ['a UNC path', 'путь \\\\server\\share\\docs'],
  ['square brackets', 'a \\[b\\] c'],
  ['a trailing double backslash', 'и в конце \\\\'],
  ['a plus', 'версия 1\\+1'],
  ['next to real bold', '**итог** и 2\\*3'],
];

describe('legacy backslashes stay text (97dq.77, review F4)', () => {
  test.each(LEGACY)('%s: read as written', (_name, body) => {
    expect(marks.hasInlineEscape(body)).toBe(false);
    const plain = marks.inlineRuns(marks.parseInline(body)).map((run) => run.text).join('');
    expect(plain).toBe(body.replace(/\*\*итог\*\*/u, 'итог'));
    expect(marks.stripInlineMarks(body)).toBe(plain);
  });

  test.each(LEGACY)('%s: a no-op trip through the editor changes nothing', (_name, body) => {
    expect(docToStored(storedToDoc(body))).toBe(body);
    const editor = makeEditor(storedToDoc(body));
    try {
      expect(docToStored(editor.getJSON())).toBe(body);
    } finally {
      editor.destroy();
    }
  });

  test('channels get the backslashes the body holds', () => {
    expect(editorHtml('2\\*3 и \\\\server\\share', 'html')).toBe('<p>2\\*3 и \\\\server\\share</p>');
    expect(editorHtml('snake\\_case', 'none')).toBe('snake\\_case');
    expect(editorHtml('**итог** и 2\\*3', 'html')).toBe('<p><strong>итог</strong> и 2\\*3</p>');
  });

  test('the editor’s own escapes are still read as escapes', () => {
    const stored = docToStored({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '**x** и 2*3' }] }],
    });
    expect(stored).toBe('\\*\\*x\\*\\* и 2\\*3');
    expect(marks.hasInlineEscape(stored)).toBe(true);
    expect(marks.inlineRuns(marks.parseInline(stored))).toEqual([{ text: '**x** и 2*3' }]);
    expect(marks.parseInline('[a\\[b\\]](https://example.com)')).toEqual([
      {
        kind: 'link',
        href: 'https://example.com',
        children: [{ kind: 'text', text: 'a' }, { kind: 'text', text: '[', literal: true }, { kind: 'text', text: 'b' }, { kind: 'text', text: ']', literal: true }],
      },
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
