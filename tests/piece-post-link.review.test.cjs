'use strict';

/**
 * Correctness review of 97dq.52 / 97dq.75 (`review-97dq75.md`, 2026-09-24).
 *
 * The reviewer's probe strings stand here as written: a bare address at the
 * end of a marked phrase (P1-1), quotes and guillemets in a link address
 * (P3-8), a literal U+E000 (P3-10). Then the races the review named: the
 * answer flow's model call while the author answers the link question or
 * adds material (P1-2), and after a hand edit (P2-3); «Без ссылки» where
 * links are off (P2-5); foreign HTML into Telegram (P2-6); revision
 * coalescing (P2-4) and the one-rebuild guard (P2-7).
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const marks = loadTypeScriptModule('libraries/helpers/src/utils/inline-marks.ts');
const { editorHtml } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts'
);
const { reviewTextOf } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/review-input.ts'
);
const postLink = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/post-link.ts'
);
const coreEdit = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/core-edit.ts'
);
const directives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/channel-directives.ts'
);
const { storedToDoc, docToStored } = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/pieces/adaptation-rich-text.doc.ts'
);
const frontAdapter = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts'
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

/* ---- P1-1, P3-8, P3-10: the grammar ---------------------------------------- */

describe('a bare address at the end of a marked phrase closes the mark (P1-1)', () => {
  test.each([
    ['**see https://a.com**', '<p><strong>see https://a.com</strong></p>', '**see https://a.com**'],
    ['_see https://a.com_', '<p><em>see https://a.com</em></p>', '_see https://a.com_'],
    ['++see https://a.com++', '<p><u>see https://a.com</u></p>', 'see https://a.com'],
  ])('%s', (body, html, markdown) => {
    expect(editorHtml(body, 'html')).toBe(html);
    expect(editorHtml(body, 'markdown')).toBe(markdown);
    expect(editorHtml(body, 'none')).toBe('see https://a.com');
    expect(docToStored(storedToDoc(body))).toBe(body);
  });

  test('the editor writes the phrase back so it reads back the same', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'see ', marks: [{ type: 'italic' }] },
            {
              type: 'text',
              text: 'https://a.com',
              marks: [{ type: 'italic' }, { type: 'link', attrs: { href: 'https://a.com' } }],
            },
          ],
        },
      ],
    };
    const stored = docToStored(doc);
    expect(stored).toBe('_see https://a.com_');
    expect(docToStored(storedToDoc(stored))).toBe(stored);
  });

  test('an address that would swallow what follows is written as a token', () => {
    expect(
      marks.serializeInline([
        { text: 'https://a.com', href: 'https://a.com' },
        { text: 'x' },
      ])
    ).toBe('[https://a.com](https://a.com)x');
    expect(
      marks.serializeInline([{ text: 'https://a.com/x_', href: 'https://a.com/x_' }])
    ).toBe('[https://a.com/x_](https://a.com/x_)');
    // Old bodies keep their bytes: punctuation after an address still reads.
    for (const body of [
      'Подробнее: https://example.com/path?a=1&b=2.',
      'Статья (https://en.wikipedia.org/wiki/A_(b)) тут',
    ])
      expect(docToStored(storedToDoc(body))).toBe(body);
  });
});

test('quotes, angle quotes and guillemets never reach a token raw (P3-8)', () => {
  const stored = marks.serializeInline([{ text: 'x', href: 'https://a.com/"<>«»' }]);
  expect(stored).toBe('[x](https://a.com/%22%3C%3E%C2%AB%C2%BB)');
  expect(marks.parseInline(stored)).toEqual([
    { kind: 'link', href: 'https://a.com/%22%3C%3E%C2%AB%C2%BB', children: [{ kind: 'text', text: 'x' }] },
  ]);
  expect(editorHtml(stored, 'html')).toBe(
    '<p><a href="https://a.com/%22%3C%3E%C2%AB%C2%BB">x</a></p>'
  );
});

test('a literal U+E000 stays text and does not steal an address (P3-10)', () => {
  const body = 'a \uE000 b https://x.com **c**';
  expect(docToStored(storedToDoc(body))).toBe(body);
  expect(editorHtml(body, 'html')).toBe('<p>a \uE000 b https://x.com <strong>c</strong></p>');
});

test('a body the editor just wrote is still read as the canonical body (P3-15)', () => {
  const body = docToStored(storedToDoc('_Вчера_ ++важно++ и [отчёт](https://example.com/r).'));
  const content = editorHtml(body, 'html');
  expect(reviewTextOf({ body, post: { content } }, 'html')).toBe(body);
  // An old body without marks renders byte for byte as before.
  expect(editorHtml('Простой текст **жирный**', 'html')).toBe(
    '<p>Простой текст <strong>жирный</strong></p>'
  );
});

/* ---- P2-6: Telegram ------------------------------------------------------- */

describe('foreign HTML into telegramHtml (P2-6)', () => {
  test.each([
    ['an orphan closing link', '<p>x</a> y</p>', 'x y\n'],
    // The inner link loses its tags; its closing tag closes only itself.
    ['nested anchors', '<a href="https://a.com">a <a href="https://b.com">b</a> c</a>', '<a href="https://a.com">a b c</a>'],
    ['attributes on b/i/u', '<b class="x" style="y">b</b> <i id="z">i</i> <u data-q="1">u</u>', '<b>b</b> <i>i</i> <u>u</u>'],
    ['strong and em renamed', '<strong>s</strong><em>e</em>', '<b>s</b><i>e</i>'],
    ['an unclosed tag is closed', '<b>open <i>more', '<b>open <i>more</i></b>'],
    ['a stray close is dropped', 'a</b> b</i>', 'a b'],
    ['a link to another scheme', '<a href="javascript:alert(1)">x</a>', 'x'],
    ['a link with extra attributes', '<a target="_blank" href="https://x.com" rel="noopener">x</a>', '<a href="https://x.com">x</a>'],
    ['misnested tags', '<b>a <i>b</b> c</i>', '<b>a <i>b</i></b> c'],
  ])('%s', (_name, html, expected) => {
    expect(telegramHtml(html)).toBe(expected);
  });
});

/* ---- P2-5, P3-11, P3-12: link rules --------------------------------------- */

describe('link rules', () => {
  const TELEGRAM = { identifier: 'telegram', name: 'Telegram', maxLength: 4096, maxCaptionLength: 1024, editor: 'html' };
  const profile = (linkPolicy) => ({
    version: 'channel-writing-profile/v1',
    lengthPolicy: 'provider_max',
    emojiLevel: 'auto',
    linkPolicy,
    hashtagPolicy: 'none',
    ctaKind: 'auto',
    formatPreference: 'auto',
    notes: null,
  });

  test('«Без ссылки» (url null) where links are off adds nothing; set on the post it is said', () => {
    const off = directives.channelInstructionLines(profile('none'), TELEGRAM, { authorLink: { url: null } });
    expect(off).not.toContain(directives.AUTHOR_NO_LINK_LINE);
    const onPost = directives.channelInstructionLines(profile('none'), TELEGRAM, {
      authorLink: { url: null, forPost: true },
    });
    expect(onPost).toContain(directives.AUTHOR_NO_LINK_LINE);
    const on = directives.channelInstructionLines(profile('end'), TELEGRAM, { authorLink: { url: null } });
    expect(on).toContain(directives.AUTHOR_NO_LINK_LINE);
  });

  test('`none` in any case is «Без ссылки», with url null (P3-11)', () => {
    expect(postLink.readPostLinkOverride('None')).toBe('none');
    expect(postLink.readPostLinkOverride(' NONE ')).toBe('none');
    expect(postLink.effectivePostLink({}, 'None')).toEqual({ url: null, from: 'post' });
    expect(frontAdapter.postLinkOverride('None')).toBe('none');
  });

  test('the post’s own «no links» outranks the post’s link (P3-12)', () => {
    const lines = directives.channelInstructionLines(profile('end'), TELEGRAM, {
      post: { linkPolicy: 'none' },
      authorLink: { url: 'https://x.com/', forPost: true },
    });
    expect(lines.join('\n')).not.toContain('https://x.com/');
  });

  test('addresses are stored parsed, the same on both sides (P3-9)', () => {
    expect(postLink.normalizePostLink('example.com/a b'.replace(' ', ''))).toBe('https://example.com/ab');
    expect(postLink.normalizePostLink('https://example.com/ü')).toBe('https://example.com/%C3%BC');
    expect(frontAdapter.readLinkAddress('https://example.com/ü')).toBe('https://example.com/%C3%BC');
    expect(frontAdapter.readLinkAddress('ftp://example.com')).toBeNull();
  });
});

/* ---- The service: races, hand edits, coalescing, guards ------------------- */

const modelCalls = [];
let onModel = null;
let modelAnswers = [];
const { PieceService } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts',
  {
    '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      getChatModel: async (organizationId, temperature, tokens, role) => ({
        withStructuredOutput: () => ({
          invoke: async (prompt) => {
            modelCalls.push({ role, prompt });
            if (onModel) await onModel();
            if (!modelAnswers.length) throw new Error('one model call too many');
            return modelAnswers.shift();
          },
        }),
      }),
    },
    './piece.repository': { PieceRepository: class {} },
    '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  }
);

const CORE_TEXT = 'Срок держится, когда о нём знает кто-то ещё.';
const BRIEF = {
  brief: {
    inputKind: 'thought',
    goal: null,
    thesis: 'Дедлайн, о котором знает другой, держится лучше',
    position: null,
    disagreement: null,
    audience: null,
    format: 'auto',
    facts: [],
    origins: { thesis: 'input' },
    ungrounded: [],
  },
  answers: [],
  slop: null,
  writtenBy: 'model',
  authorNumbers: false,
  personText: 'Из шести дедлайнов сдвинулись пять.',
  questions: {
    round: 0,
    items: [{ field: 'position', question: 'Где вы стоите в этом споре?', suggested: null, options: [] }],
    answered: [],
  },
};

const build = (options = {}) => {
  let clock = options.now ?? new Date('2026-09-24T08:00:00.000Z');
  const piece = {
    id: 'piece-1',
    title: 'Дедлайн',
    kind: 'CORE',
    body: CORE_TEXT,
    brief: JSON.parse(JSON.stringify(BRIEF)),
    language: 'ru',
    tags: null,
    archivedAt: null,
    createdAt: new Date('2026-09-23T09:00:00.000Z'),
    brandProfileVersion: null,
  };
  const calls = { updateCore: [] };
  modelCalls.length = 0;
  modelAnswers = [...(options.models ?? [])];
  onModel = null;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const service = new PieceService(
    {
      getPiece: async () => JSON.parse(JSON.stringify({ ...piece, createdAt: undefined })),
      listPieceIds: async () => [{ id: piece.id }],
      listIntegrations: async () => [],
      adaptationsByPiece: async () => [],
      acceptCoreReview: async (organizationId, pieceId, snapshot, body, title, brief) => {
        if (snapshot.body !== piece.body || !same(snapshot.brief, piece.brief)) throw new Error('conflict');
        Object.assign(piece, { body, title, brief: JSON.parse(JSON.stringify(brief)) });
        return { body, title };
      },
    },
    { start: async function* () {} },
    { getSocialIntegration: () => undefined },
    () => clock,
    null,
    { executeAiOperation: async (organizationId, operation, callback) => callback() },
    {
      updateCoreMetadata: async (organizationId, pieceId, input) => {
        if (input.expectedBody !== piece.body || !same(input.expectedBrief, piece.brief)) throw new Error('moved');
        piece.brief = JSON.parse(JSON.stringify(input.brief));
      },
      updateCore: async (organizationId, pieceId, input) => {
        calls.updateCore.push(input);
        if (input.expected && (input.expected.body !== piece.body || !same(input.expected.brief, piece.brief)))
          throw new Error('moved');
        Object.assign(piece, { body: input.body, brief: JSON.parse(JSON.stringify(input.brief)) });
      },
    },
    null,
    null,
    null,
    null
  );
  return { service, piece, calls, tick: (ms) => (clock = new Date(clock.getTime() + ms)) };
};

const drain = async (stream) => {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
};

describe('the answer flow keeps what the author did meanwhile (P1-2)', () => {
  test('a link answered and material added during the model call survive the answer', async () => {
    const { service, piece } = build({ models: [{ text: 'Суть с позицией автора.' }] });
    const plan = await service.prepareAnswer('org-a', 'piece-1', { answers: [{ field: 'position', text: 'Против' }] }, 'ru');
    onModel = async () => {
      onModel = null;
      await service.savePostLink('org-a', 'piece-1', { url: 'https://example.com/offer' }, 'ru');
      await service.appendMaterial('org-a', 'piece-1', { text: 'Клиент звонил в пятницу.' }, 'ru');
    };
    const events = await drain(service.answer('org-a', plan, 'user-1'));

    expect(events.map((event) => event.name)).toContain('piece');
    expect(piece.body).toBe('Суть с позицией автора.');
    expect(piece.brief.postLink).toMatchObject({ url: 'https://example.com/offer', origin: 'author' });
    expect(piece.brief.addedMaterial).toEqual([
      { text: 'Клиент звонил в пятницу.', addedAt: '2026-09-24T08:00:00.000Z' },
    ]);
    expect(piece.brief.personText).toContain('Клиент звонил в пятницу.');
    // The rewrite did not read it, so it still waits for a rebuild.
    expect(piece.brief.materialPending).toBe(true);
    expect(piece.brief.brief.position).toBe('Против');
  });

  test('an answer after a hand edit builds on the author’s core and keeps it as a revision (P2-3)', async () => {
    const { service, piece } = build({ models: [{ text: 'Суть на основе правки.' }] });
    await service.editCore('org-a', 'piece-1', { text: 'Моя правка сути.', expected: CORE_TEXT }, 'ru');
    const plan = await service.prepareAnswer('org-a', 'piece-1', { answers: [{ field: 'position', text: 'За' }] }, 'ru');
    await drain(service.answer('org-a', plan, 'user-1'));

    expect(modelCalls[0].prompt).toContain('Моя правка сути.');
    expect(piece.body).toBe('Суть на основе правки.');
    expect(piece.brief.editedBy).toBeUndefined();
    expect(piece.brief.revisions.map((one) => [one.text, one.writtenBy])).toEqual([
      [CORE_TEXT, 'model'],
      ['Моя правка сути.', 'person'],
    ]);
  });

  test('a hand edit made while the model wrote is recorded, not silently lost', async () => {
    const { service, piece } = build({ models: [{ text: 'Суть после ответа.' }] });
    const plan = await service.prepareAnswer('org-a', 'piece-1', { answers: [{ field: 'position', text: 'За' }] }, 'ru');
    onModel = async () => {
      onModel = null;
      await service.editCore('org-a', 'piece-1', { text: 'Правка во время записи.', expected: CORE_TEXT }, 'ru');
    };
    await drain(service.answer('org-a', plan, 'user-1'));
    expect(piece.body).toBe('Суть после ответа.');
    expect(piece.brief.revisions.map((one) => one.text)).toContain('Правка во время записи.');
  });
});

describe('revision coalescing and bounds (P2-4, P3-16)', () => {
  test('autosaves of one session are one revision; a later session starts another', async () => {
    const { service, piece, tick } = build();
    await service.editCore('org-a', 'piece-1', { text: 'Раз.', expected: CORE_TEXT }, 'ru');
    tick(2_000);
    await service.editCore('org-a', 'piece-1', { text: 'Раз, два.', expected: 'Раз.' }, 'ru');
    tick(2_000);
    await service.editCore('org-a', 'piece-1', { text: 'Раз, два, три.', expected: 'Раз, два.' }, 'ru');
    expect(piece.brief.revisions.map((one) => one.text)).toEqual([CORE_TEXT]);
    tick(coreEdit.PIECE_CORE_EDIT_SESSION_MS);
    await service.editCore('org-a', 'piece-1', { text: 'Новая сессия.', expected: 'Раз, два, три.' }, 'ru');
    expect(piece.brief.revisions.map((one) => one.text)).toEqual([CORE_TEXT, 'Раз, два, три.']);
  });

  test('the bound never evicts the text the piece was born with', () => {
    let list = [];
    for (let index = 0; index < 30; index += 1)
      list = coreEdit.withRevision(list, { text: `v${index}`, writtenBy: 'person' }, '');
    expect(list).toHaveLength(coreEdit.PIECE_CORE_REVISIONS_MAX);
    expect(list[0].text).toBe('v0');
    expect(list[list.length - 1].text).toBe('v29');
  });

  test('added material is bounded', async () => {
    const { service } = build();
    for (let index = 0; index < coreEdit.PIECE_ADDED_MATERIAL_MAX; index += 1)
      await service.appendMaterial('org-a', 'piece-1', { text: `Факт ${index}.` }, 'ru');
    await expect(
      service.appendMaterial('org-a', 'piece-1', { text: 'Ещё один.' }, 'en')
    ).rejects.toMatchObject({ code: 'PIECE_MATERIAL_FULL', status: 400 });
  });
});

test('one rebuild per piece at a time (P2-7)', async () => {
  const { service, piece } = build({ models: [{ text: 'Пересобранная суть.' }] });
  let release;
  onModel = () => new Promise((resolve) => (release = resolve));
  const first = service.rebuildCore('org-a', 'piece-1', 'ru');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await expect(service.rebuildCore('org-a', 'piece-1', 'en')).rejects.toMatchObject({
    code: 'PIECE_REBUILD_RUNNING',
    status: 409,
  });
  release();
  await first;
  expect(piece.body).toBe('Пересобранная суть.');
  expect(modelCalls).toHaveLength(1);
});
