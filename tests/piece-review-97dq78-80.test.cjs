'use strict';

/**
 * Review of commit 91b147e0 (97dq.78 / .79 / .80,
 * `review-97dq78-80.md`, 2026-09-24): the link and length findings that
 * live in pure functions. The queued-edit findings (P2-1, P2-2, P2-4, P3-2,
 * P3-3, P3-5) are pinned next to their doors in
 * `piece-adaptation-workspace.test.cjs`, `content-pieces.container.test.cjs`
 * and `piece.screen.test.cjs`; the «Текст ссылки» length (P3-8) in
 * `content-piece.routes.test.cjs`.
 */

require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const { editorHtml } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts'
);
const postLink = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/post-link.ts'
);
const directives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/channel-directives.ts'
);
const profiles = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
);
const { protectedFragments } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/post-length.ts'
);

class TelegramBot {}
const { telegramHtml } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/social/telegram.provider.ts',
  {
    '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface': {},
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

const WIKI = 'https://en.wikipedia.org/wiki/Foo_(bar)';
const WIKI_STORED = 'https://en.wikipedia.org/wiki/Foo_%28bar%29';

describe('a link with parentheses stays one clickable link everywhere (P2-3)', () => {
  test('the product stores it with %28/%29 — the same page, no bare parentheses', () => {
    expect(postLink.normalizePostLink(WIKI)).toBe(WIKI_STORED);
    expect(postLink.normalizePostLink('en.wikipedia.org/wiki/Foo_(bar)')).toBe(WIKI_STORED);
    // Old answers stored with parentheses read in the new form.
    expect(
      postLink.readPostLink({ url: WIKI, origin: 'author', answeredAt: '2026-09-24T00:00:00.000Z' }).url
    ).toBe(WIKI_STORED);
    expect(postLink.readPostLinkOverride(WIKI)).toBe(WIKI_STORED);
    expect(postLink.normalizePostLink(WIKI_STORED)).toBe(WIKI_STORED);
  });

  test('[words](url) from the directive becomes a link on html, markdown and Telegram', () => {
    const line = directives.AUTHOR_LINK_WORDS_LINE(WIKI_STORED, 'статья о Foo');
    expect(line).toContain(`[статья о Foo](${WIKI_STORED})`);
    const body = `Подробности — [статья о Foo](${WIKI_STORED}).`;
    const html = editorHtml(body, 'html');
    expect(html).toBe(`<p>Подробности — <a href="${WIKI_STORED}">статья о Foo</a>.</p>`);
    expect(editorHtml(body, 'markdown')).toContain(`[статья о Foo](${WIKI_STORED})`);
    expect(telegramHtml(html)).toContain(`<a href="${WIKI_STORED}">статья о Foo</a>`);
    expect(telegramHtml(html)).not.toContain('[');
  });

  test('a bare address keeps its whole path, not a stray «)»', () => {
    // The channel links a bare address itself; the whole path reaches it.
    expect(editorHtml(`Читайте ${WIKI_STORED}.`, 'html')).toBe(`<p>Читайте ${WIKI_STORED}.</p>`);
  });
});

describe('the author link on words and the end-of-post rules (P3-7)', () => {
  const telegram = profiles.defaultWritingProfileFor('telegram', 'ru');
  const HTML = { identifier: 'telegram', name: 'Telegram', maxLength: 4096, editor: 'html' };
  const PLAIN = { identifier: 'x', name: 'X', maxLength: 280, editor: 'normal' };
  const author = { authorLink: { url: 'https://a.example/x' } };

  test.each([
    ['link at the end', { linkPolicy: 'end', ctaKind: 'none' }],
    ['a call to follow a link', { linkPolicy: 'inline', ctaKind: 'link' }],
  ])('%s: the link on words wins and no second bare address follows', (_name, card) => {
    const lines = directives.channelInstructionLines({ ...telegram, ...card }, HTML, author);
    const precedence = lines.indexOf(directives.AUTHOR_LINK_WORDS_AT_END_LINE);
    expect(precedence).toBeGreaterThan(-1);
    // It stands after both rules it overrides.
    expect(precedence).toBeGreaterThan(
      lines.findIndex((line) => line.includes('The author chose this link'))
    );
    if (card.ctaKind === 'link')
      expect(precedence).toBeGreaterThan(lines.findIndex((line) => line.includes('End with exactly one link')));
    expect(directives.AUTHOR_LINK_WORDS_AT_END_LINE).toContain('last sentence');
    expect(directives.AUTHOR_LINK_WORDS_AT_END_LINE).toContain('Never add the address again as a bare URL');
  });

  test('no conflict, no extra line: inline links, a plain editor, no author link', () => {
    const inline = directives.channelInstructionLines(
      { ...telegram, linkPolicy: 'inline', ctaKind: 'none' }, HTML, author
    );
    expect(inline).not.toContain(directives.AUTHOR_LINK_WORDS_AT_END_LINE);
    const plain = directives.channelInstructionLines(
      { ...telegram, linkPolicy: 'end', ctaKind: 'link' }, PLAIN, author
    );
    expect(plain).not.toContain(directives.AUTHOR_LINK_WORDS_AT_END_LINE);
    const none = directives.channelInstructionLines(
      { ...telegram, linkPolicy: 'end', ctaKind: 'link' }, HTML, {}
    );
    expect(none).not.toContain(directives.AUTHOR_LINK_WORDS_AT_END_LINE);
  });
});

describe('length and shortening edge cases (P3-8)', () => {
  test('the shortening pass keeps the address of [words](url), not its «)» or full stop', () => {
    const text = 'Смотрите [отчёт](https://a.example/r?x=1). И https://b.example/p, и всё.';
    const kept = protectedFragments(text);
    expect(kept).toEqual(
      expect.arrayContaining(['https://a.example/r?x=1', 'https://b.example/p'])
    );
    expect(kept.some((value) => /[).,]$/.test(value) && value.startsWith('http'))).toBe(false);
  });
});
