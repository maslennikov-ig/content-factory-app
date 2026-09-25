'use strict';

/**
 * Links and editing (`content-factory-next-97dq.75`, thirteenth walk, E1 and
 * «overall»).
 *
 * E1: «если человек выбирает не больше одной ссылки… на этапе вопроса
 * спрашивать, какие ссылки вы хотели бы вставить… детерминированный вопрос…
 * там же он может и передумать». Overall: «возможность редактировать
 * заготовку, чтобы туда можно было что-то добавить, дописать».
 *
 * Asked here, in order: when the fixed link question is asked; where the
 * answer is stored and with what origin; that the post's own «Ссылка для
 * поста» outranks it and reaches the writer; the exact prompt lines; and the
 * three edits of a written piece — none of which calls a model except the
 * explicit rebuild, which here meets a fake chat, never a paid one.
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const postLink = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/post-link.ts'
);
const coreEdit = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/core-edit.ts'
);
const settings = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/post-settings.ts'
);
const directives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/channel-directives.ts'
);
const hintsModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/generator-run-input.ts'
);

const modelCalls = [];
let modelAnswers = [];
const chatModel = {
  getChatModel: async (organizationId, temperature, tokens, role) => ({
    withStructuredOutput: () => ({
      invoke: async (prompt) => {
        modelCalls.push({ organizationId, role, prompt });
        if (!modelAnswers.length) throw new Error('one model call too many');
        return modelAnswers.shift();
      },
    }),
  }),
};

const { PieceService } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts',
  {
    '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
      AgentGraphService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      ...chatModel,
    },
    './piece.repository': { PieceRepository: class {} },
    '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  }
);

const NOW = new Date('2026-09-24T08:00:00.000Z');
const CORE_TEXT = 'Срок держится, когда о нём знает кто-то ещё.';

const CORE_BRIEF = {
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
};

const channel = (id, providerIdentifier, writingProfile = null) => ({
  id,
  name: id,
  providerIdentifier,
  contentLanguage: 'ru',
  disabled: false,
  deletedAt: null,
  additionalSettings: null,
  writingProfile,
});

const PROVIDERS = {
  telegram: { maxLength: () => 4_096, maxCaptionLength: () => 1_024, editor: 'html' },
  vk: { maxLength: () => 16_000, editor: 'normal' },
};

const build = (options = {}) => {
  const piece = {
    id: 'piece-1',
    title: 'Дедлайн',
    kind: 'CORE',
    body: CORE_TEXT,
    brief: JSON.parse(JSON.stringify(options.brief ?? CORE_BRIEF)),
    language: 'ru',
    tags: options.tags ?? null,
    archivedAt: null,
    createdAt: new Date('2026-09-23T09:00:00.000Z'),
    brandProfileVersion: null,
  };
  const calls = { metadata: [], accepted: [], usage: [] };
  modelCalls.length = 0;
  modelAnswers = [...(options.models ?? [])];
  const repository = {
    getPiece: async () => piece,
    listPieceIds: async () => [{ id: piece.id }],
    listIntegrations: async () =>
      options.integrations ?? [channel('int-tg', 'telegram')],
    adaptationsByPiece: async () => options.adaptations ?? [],
    acceptCoreReview: async (organizationId, pieceId, snapshot, body, title, brief) => {
      if (snapshot.body !== piece.body) throw new Error('conflict');
      calls.accepted.push({ body, title, brief });
      Object.assign(piece, { body, title, brief: JSON.parse(JSON.stringify(brief)) });
      return { body, title };
    },
  };
  const service = new PieceService(
    repository,
    { start: async function* () {} },
    { getSocialIntegration: (identifier) => PROVIDERS[identifier] },
    options.now ?? (() => NOW),
    options.slopCheck ?? null,
    {
      executeAiOperation: async (organizationId, operation, callback, role) => {
        calls.usage.push([organizationId, operation, role]);
        return callback();
      },
    },
    {
      updateCoreMetadata: async (organizationId, pieceId, input) => {
        if (input.expectedBody !== piece.body) throw new Error('moved');
        calls.metadata.push(input);
        piece.brief = JSON.parse(JSON.stringify(input.brief));
      },
      updateCore: async () => {
        throw new Error('not used here');
      },
    },
    null,
    null,
    null,
    null
  );
  return { service, piece, calls };
};

/* ---- The question --------------------------------------------------------- */

describe('the link question is deterministic and asked only where links fit', () => {
  test('addresses: http(s) only; a bare host gets https; other schemes never', () => {
    expect(postLink.normalizePostLink('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(postLink.normalizePostLink('example.com/x')).toBe('https://example.com/x');
    expect(postLink.normalizePostLink('javascript:alert(1)')).toBeNull();
    expect(postLink.normalizePostLink('mailto:a@b.co')).toBeNull();
    expect(postLink.normalizePostLink('ftp://example.com')).toBeNull();
    expect(postLink.normalizePostLink('https://user:pw@example.com')).toBeNull();
    expect(postLink.normalizePostLink('not an address')).toBeNull();
  });

  test('asked while no answer exists and a channel allows links; never after an answer', () => {
    expect(postLink.linkQuestionOpen({}, ['end'])).toBe(true);
    expect(postLink.linkQuestionOpen({}, ['none', 'auto'])).toBe(true);
    expect(postLink.linkQuestionOpen({}, ['none'])).toBe(false);
    expect(postLink.linkQuestionOpen({}, [])).toBe(false);
    expect(
      postLink.linkQuestionOpen(
        { postLink: { url: null, origin: 'author', answeredAt: NOW.toISOString() } },
        ['end']
      )
    ).toBe(false);
  });

  test('the page asks when any connected channel allows links and the piece has none yet', async () => {
    const none = { version: 'channel-writing-profile/v1', linkPolicy: 'none' };
    const { service } = build({
      integrations: [channel('int-tg', 'telegram', none), channel('int-vk', 'vk')],
    });
    const page = await service.detail('org-a', 'piece-1', 'ru');
    expect(page.linkQuestion).toBe(true);
  });

  test('with adaptations, only the piece’s own channels count — and a post override counts first', async () => {
    const none = { version: 'channel-writing-profile/v1', linkPolicy: 'none' };
    const adaptations = [
      {
        id: 'a-1',
        contentPieceId: 'piece-1',
        integrationId: 'int-tg',
        platform: 'telegram',
        kind: 'post',
        body: 'Текст',
        createdAt: new Date('2026-09-23T10:00:00.000Z'),
        post: null,
      },
    ];
    const closed = build({
      integrations: [channel('int-tg', 'telegram', none), channel('int-vk', 'vk')],
      adaptations,
    });
    expect((await closed.service.detail('org-a', 'piece-1', 'ru')).linkQuestion).toBe(false);

    const opened = build({
      integrations: [channel('int-tg', 'telegram', none), channel('int-vk', 'vk')],
      adaptations,
      tags: {
        postSettings: {
          'int-tg': { options: { links: 'end' }, planMode: null, savedAt: null, textChangedAt: null },
        },
      },
    });
    expect((await opened.service.detail('org-a', 'piece-1', 'ru')).linkQuestion).toBe(true);
  });

  test('the answer is stored in the brief with origin author, and the question closes', async () => {
    const { service, piece, calls } = build();
    await expect(
      service.savePostLink('org-a', 'piece-1', { url: 'example.com/offer' }, 'ru')
    ).resolves.toEqual({
      postLink: { url: 'https://example.com/offer', origin: 'author', answeredAt: NOW.toISOString() },
    });
    expect(calls.metadata).toHaveLength(1);
    expect(piece.brief.postLink).toEqual({
      url: 'https://example.com/offer',
      origin: 'author',
      answeredAt: NOW.toISOString(),
    });
    // Everything else in the brief is kept.
    expect(piece.brief.personText).toBe(CORE_BRIEF.personText);
    expect((await service.detail('org-a', 'piece-1', 'ru')).linkQuestion).toBe(false);
    expect(modelCalls).toEqual([]);
  });

  test('«Без ссылки» is an answer too, and answering again replaces it', async () => {
    const { service, piece } = build();
    await service.savePostLink('org-a', 'piece-1', { url: null }, 'ru');
    expect(piece.brief.postLink.url).toBeNull();
    await service.savePostLink('org-a', 'piece-1', { url: 'https://example.com' }, 'en');
    // Stored in its parsed form (review P3-9).
    expect(piece.brief.postLink.url).toBe('https://example.com/');
  });

  test('a non-http address is refused in the reader’s language, and nothing is written', async () => {
    const { service, calls } = build();
    await expect(
      service.savePostLink('org-a', 'piece-1', { url: 'javascript:alert(1)' }, 'en')
    ).rejects.toMatchObject({ code: 'PIECE_POST_LINK_INVALID', status: 400, message: expect.stringMatching(/http or https/) });
    expect(calls.metadata).toEqual([]);
  });
});

/* ---- The post's own link -------------------------------------------------- */

describe('«Ссылка для поста» is a post override on the existing settings path', () => {
  test('stored as `link`: empty — as in the piece, `none`, or an address; junk reads empty', () => {
    expect(settings.readPostSettingsOptions({}).link).toBe('');
    expect(settings.readPostSettingsOptions({ link: 'none' }).link).toBe('none');
    expect(settings.readPostSettingsOptions({ link: 'https://x.com/a' }).link).toBe('https://x.com/a');
    expect(settings.readPostSettingsOptions({ link: 'javascript:1' }).link).toBe('');
  });

  test('a link change merges field by field, keeps the plan mode and says the text is older', () => {
    const stored = {
      options: { ...settings.DEFAULT_POST_SETTINGS_OPTIONS, wish: 'коротко' },
      planMode: 'autopilot',
      savedAt: null,
      textChangedAt: null,
    };
    const next = settings.mergePostSettings(stored, { options: { link: 'https://x.com' } }, NOW.toISOString());
    expect(next.options).toEqual({ ...stored.options, link: 'https://x.com/' });
    expect(next.planMode).toBe('autopilot');
    expect(next.textChangedAt).toBe(NOW.toISOString());
    // An entry that only holds a link is kept, not dropped as noise.
    const tags = settings.withPostSettings({ archive: 'x' }, 'int-tg', {
      options: { ...settings.DEFAULT_POST_SETTINGS_OPTIONS, link: 'none' },
      planMode: null,
      savedAt: NOW.toISOString(),
      textChangedAt: NOW.toISOString(),
    });
    expect(tags.archive).toBe('x');
    expect(tags.postSettings['int-tg'].options.link).toBe('none');
  });

  test('the post’s own link outranks the piece’s answer; nobody answered — no line', () => {
    const answered = { postLink: { url: 'https://piece.example', origin: 'author', answeredAt: '' } };
    expect(postLink.effectivePostLink(answered, undefined)).toEqual({ url: 'https://piece.example', from: 'piece' });
    expect(postLink.effectivePostLink(answered, 'https://post.example')).toEqual({ url: 'https://post.example/', from: 'post' });
    expect(postLink.effectivePostLink(answered, 'none')).toEqual({ url: null, from: 'post' });
    expect(postLink.effectivePostLink({}, undefined)).toBeUndefined();
  });

  test('the writer’s hints carry the author link under hints v3 (v2 and v1 kept for old receipts)', () => {
    const { service } = build();
    const plan = {
      core: {
        ...CORE_BRIEF,
        text: CORE_TEXT,
        version: 'piece-core/v1',
        postLink: { url: 'https://piece.example', origin: 'author', answeredAt: '' },
      },
      request: { integrationId: 'int-tg' },
      foreignShingles: [],
      channel: {
        id: 'int-tg',
        providerIdentifier: 'telegram',
        maxLength: 4096,
        maxCaptionLength: 1024,
        editor: 'html',
        profile: null,
      },
    };
    const fromPiece = service.hintsOf(plan, [], []);
    expect(fromPiece.version).toBe('intake-hints/v3');
    expect(hintsModule.INTAKE_HINTS_VERSION_V2).toBe('intake-hints/v2');
    expect(hintsModule.INTAKE_HINTS_VERSION_V1).toBe('intake-hints/v1');
    expect(fromPiece.authorLink).toEqual({ url: 'https://piece.example' });

    const fromPost = service.hintsOf(
      { ...plan, request: { integrationId: 'int-tg', overrides: { postLink: 'none' } } },
      [],
      []
    );
    expect(fromPost.authorLink).toEqual({ url: null, forPost: true });

    const silent = service.hintsOf({ ...plan, core: { ...plan.core, postLink: undefined } }, [], []);
    expect(silent.authorLink).toBeUndefined();

    // «Текст ссылки» (`97dq.79`): the piece's words, the post's words first.
    const worded = { ...plan.core, postLink: { ...plan.core.postLink, text: 'наш прайс' } };
    expect(service.hintsOf({ ...plan, core: worded }, [], []).authorLink).toEqual({
      url: 'https://piece.example',
      text: 'наш прайс',
    });
    expect(
      service.hintsOf(
        {
          ...plan,
          core: worded,
          request: { integrationId: 'int-tg', overrides: { postLinkText: 'цены [тут]' } },
        },
        [],
        []
      ).authorLink
    ).toEqual({ url: 'https://piece.example', text: 'цены тут' });
    // The piece's words never ride on an address the post chose itself.
    expect(
      service.hintsOf(
        {
          ...plan,
          core: worded,
          request: { integrationId: 'int-tg', overrides: { postLink: 'https://post.example' } },
        },
        [],
        []
      ).authorLink
    ).toEqual({ url: 'https://post.example/', forPost: true });
  });

  test('the anchor words are one clean line, kept with an address only (97dq.79)', () => {
    expect(postLink.normalizePostLinkText('  наш\n [прайс](x) «тут» ')).toBe('наш прайс x тут');
    expect(postLink.normalizePostLinkText('a'.repeat(200))).toHaveLength(postLink.POST_LINK_TEXT_MAX);
    expect(postLink.postLinkAnswer('https://a.example/', 'T', ' наш прайс ')).toEqual({
      url: 'https://a.example/',
      origin: 'author',
      answeredAt: 'T',
      text: 'наш прайс',
    });
    expect(postLink.postLinkAnswer(null, 'T', 'слова')).toEqual({
      url: null,
      origin: 'author',
      answeredAt: 'T',
    });
    // Answers before the field read as before.
    expect(
      postLink.readPostLink({ url: 'https://a.example/', origin: 'author', answeredAt: 'T' })
    ).toEqual({ url: 'https://a.example/', origin: 'author', answeredAt: 'T' });
  });
});

/* ---- The prompt lines ----------------------------------------------------- */

describe('the channel directive: only the author’s link, or links from the material', () => {
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

  test('an address on a plain channel: the one line, verbatim, with «never invent»', () => {
    const lines = directives.channelInstructionLines(
      profile('end'),
      { ...TELEGRAM, identifier: 'linkedin', name: 'LinkedIn', editor: 'normal' },
      { authorLink: { url: 'https://example.com/offer' } }
    );
    expect(lines).toContain(directives.AUTHOR_LINK_LINE('https://example.com/offer'));
    expect(lines.join('\n')).not.toContain('](');
    expect(directives.AUTHOR_LINK_LINE('https://x.com')).toBe(
      "The author chose this link for the post: <https://x.com>. It is the only link you may add: put it in exactly as written, character for character, once, where it fits by meaning. Links already in the author's material or sources may stay; never invent any other URL."
    );
  });

  test('Telegram puts the link on words, never a bare address (97dq.79)', () => {
    const lines = directives.channelInstructionLines(profile('end'), TELEGRAM, {
      authorLink: { url: 'https://example.com/offer' },
    });
    const line = directives.AUTHOR_LINK_WORDS_LINE('https://example.com/offer');
    expect(lines).toContain(line);
    expect(lines).not.toContain(directives.AUTHOR_LINK_LINE('https://example.com/offer'));
    expect(line).toContain('2 to 5 meaningful words');
    expect(line).toContain('[those words](https://example.com/offer)');
    expect(line).toContain('never as a bare address');
    expect(line).toContain('never invent any other URL');

    // «Текст ссылки»: exactly those words carry it.
    const worded = directives.channelInstructionLines(profile('end'), TELEGRAM, {
      authorLink: { url: 'https://example.com/offer', text: 'наш прайс' },
    });
    const exact = directives.AUTHOR_LINK_WORDS_LINE('https://example.com/offer', 'наш прайс');
    expect(worded).toContain(exact);
    expect(exact).toContain('exactly these words, once: «наш прайс»');
    expect(exact).toContain('[наш прайс](https://example.com/offer)');
  });

  test('«Без ссылки»: no URL of the writer’s own', () => {
    const lines = directives.channelInstructionLines(profile('end'), TELEGRAM, {
      authorLink: { url: null },
    });
    expect(lines).toContain(directives.AUTHOR_NO_LINK_LINE);
    expect(directives.AUTHOR_NO_LINK_LINE).toBe(
      "The author chose no link for this post: add no URL of your own. Only a link already in the author's material or sources may appear; never invent one."
    );
  });

  test('a channel with no links drops the piece’s link; the post’s own link overrides it', () => {
    const fromPiece = directives.channelInstructionLines(profile('none'), TELEGRAM, {
      authorLink: { url: 'https://example.com' },
    });
    expect(fromPiece.join('\n')).not.toContain('https://example.com');
    const forPost = directives.channelInstructionLines(profile('none'), TELEGRAM, {
      authorLink: { url: 'https://example.com', forPost: true },
    });
    expect(forPost).toContain(
      `For this post only: ${directives.AUTHOR_LINK_WORDS_LINE('https://example.com')} This overrides the link rule above.`
    );
  });

  test('nobody answered: the prompt is exactly what it was', () => {
    const before = directives.channelInstructionLines(profile('end'), TELEGRAM, {});
    const after = directives.channelInstructionLines(profile('end'), TELEGRAM, { authorLink: null });
    expect(after).toEqual(before);
  });
});

/* ---- Editing the written piece -------------------------------------------- */

describe('the core is editable after creation, and nothing regenerates silently', () => {
  test('revisions are bounded and newest last; added material follows a blank line', () => {
    let list = [];
    for (let index = 0; index < coreEdit.PIECE_CORE_REVISIONS_MAX + 3; index += 1)
      list = coreEdit.withRevision(list, { text: `v${index}`, writtenBy: 'model' }, NOW.toISOString());
    expect(list).toHaveLength(coreEdit.PIECE_CORE_REVISIONS_MAX);
    expect(list[list.length - 1].text).toBe(`v${coreEdit.PIECE_CORE_REVISIONS_MAX + 2}`);
    expect(coreEdit.appendedPersonText('Было.', '  Стало.  ')).toBe('Было.\n\nСтало.');
    expect(coreEdit.appendedPersonText('', 'Первое.')).toBe('Первое.');
  });

  test('an edit saves as the new core, keeps the old text, and calls no model', async () => {
    const { service, piece } = build();
    const saved = await service.editCore(
      'org-a',
      'piece-1',
      { text: 'Мой текст сути.\r\n', expected: CORE_TEXT },
      'ru'
    );
    expect(saved).toEqual({ text: 'Мой текст сути.', savedAt: NOW.toISOString(), revisions: 1 });
    expect(piece.body).toBe('Мой текст сути.');
    expect(piece.brief.editedBy).toBe('person');
    expect(piece.brief.editedAt).toBe(NOW.toISOString());
    expect(piece.brief.revisions).toEqual([
      { text: CORE_TEXT, writtenBy: 'model', replacedAt: NOW.toISOString(), materialPending: false },
    ]);
    expect(piece.brief.personText).toBe(CORE_BRIEF.personText);
    expect(modelCalls).toEqual([]);
  });

  test('an edit from a stale text is refused, not written over', async () => {
    const { service, piece } = build();
    await expect(
      service.editCore('org-a', 'piece-1', { text: 'Новое', expected: 'Другой текст' }, 'en')
    ).rejects.toMatchObject({ code: 'PIECE_CORE_CHANGED', status: 409 });
    expect(piece.body).toBe(CORE_TEXT);
    await expect(
      service.editCore('org-a', 'piece-1', { text: '   ', expected: CORE_TEXT }, 'ru')
    ).rejects.toMatchObject({ code: 'PIECE_CORE_EMPTY', status: 400 });
  });

  test('«Дописать материал» appends to the material and marks the core as waiting', async () => {
    const { service, piece, calls } = build();
    const added = await service.appendMaterial('org-a', 'piece-1', { text: 'Клиент звонил в пятницу.' }, 'ru');
    expect(added).toEqual({
      addedMaterial: [{ text: 'Клиент звонил в пятницу.', addedAt: NOW.toISOString() }],
      materialPending: true,
    });
    expect(piece.body).toBe(CORE_TEXT);
    expect(piece.brief.personText).toBe(`${CORE_BRIEF.personText}\n\nКлиент звонил в пятницу.`);
    expect(piece.brief.materialPending).toBe(true);
    expect(calls.usage).toEqual([]);
    expect(modelCalls).toEqual([]);
  });

  test('«Пересобрать суть» writes the core once through core-write, from the enlarged material', async () => {
    const { service, piece, calls } = build({ models: [{ text: 'Суть по всему материалу.' }] });
    await service.appendMaterial('org-a', 'piece-1', { text: 'Клиент звонил в пятницу.' }, 'ru');
    await service.savePostLink('org-a', 'piece-1', { url: 'https://example.com' }, 'ru');
    const rebuilt = await service.rebuildCore('org-a', 'piece-1', 'ru');

    expect(rebuilt).toEqual({ text: 'Суть по всему материалу.', revisions: 1 });
    expect(modelCalls).toHaveLength(1);
    expect(calls.usage).toEqual([['org-a', 'intake', 'draft']]);
    expect(modelCalls[0].prompt).toContain('Клиент звонил в пятницу.');
    expect(modelCalls[0].prompt).toContain('PROMPT VERSION: core-write/v14');
    expect(piece.body).toBe('Суть по всему материалу.');
    expect(piece.brief.materialPending).toBeUndefined();
    // The replaced text had not read the added words: that wait is recorded with it.
    expect(piece.brief.revisions).toEqual([
      { text: CORE_TEXT, writtenBy: 'model', replacedAt: NOW.toISOString(), materialPending: true },
    ]);
    // What the author gave stays: the link and the record of the material.
    expect(piece.brief.postLink.url).toBe('https://example.com/');
    expect(piece.brief.addedMaterial).toHaveLength(1);
  });

  test('a rebuild the model could not write changes nothing', async () => {
    const { service, piece } = build({ models: [{ text: '' }] });
    await expect(service.rebuildCore('org-a', 'piece-1', 'en')).rejects.toMatchObject({
      code: 'PIECE_REBUILD_FAILED',
      status: 503,
      message: expect.stringMatching(/could not be rebuilt/),
    });
    expect(piece.body).toBe(CORE_TEXT);
  });

  test('a hand-edited core is enriched by the rebuild, not thrown away', async () => {
    const { service } = build({ models: [{ text: 'Обогащённая правка.' }] });
    await service.editCore('org-a', 'piece-1', { text: 'Моя правка сути.', expected: CORE_TEXT }, 'ru');
    await service.rebuildCore('org-a', 'piece-1', 'ru');
    expect(modelCalls[0].prompt).toContain('Моя правка сути.');
  });
});

/* ---- 97dq.85: the rebuild keeps what the core carried; versions ----------- */

describe('«Пересобрать суть» keeps the decisions and the author’s words (97dq.85)', () => {
  const DECIDED = {
    ...CORE_BRIEF,
    personText: 'Я заметил, что команда пишет в чат меньше.',
    answers: [
      {
        key: 'ask-1',
        question: 'Для кого этот текст?',
        text: 'Для руководителей небольших команд.',
        origin: 'model',
        step: 'core',
        answeredAt: NOW.toISOString(),
      },
      {
        key: 'ask-2',
        question: 'Что изменилось?',
        text: 'Задачи на общей доске.',
        origin: 'person',
        step: 'core',
        answeredAt: NOW.toISOString(),
      },
    ],
  };
  const PREVIOUS = 'Я заметил, что команда пишет в чат меньше.\n\nРуководителю небольшой команды это экономит час.';

  test('the prompt carries the previous core, every answer with its origin, and the added material on its own', async () => {
    const { service, piece } = build({
      brief: DECIDED,
      models: [{ text: 'Новая суть.' }],
    });
    piece.body = PREVIOUS;
    await service.appendMaterial('org-a', 'piece-1', { text: 'Клиент звонил в пятницу.' }, 'ru');
    await service.rebuildCore('org-a', 'piece-1', 'ru');
    const prompt = modelCalls[0].prompt;

    expect(prompt).toContain('PROMPT VERSION: core-write/v14');
    // The rule and the block of the previous core, paragraph by paragraph.
    expect(prompt).toContain('A separate rule about the rebuild');
    expect(prompt).toContain('THE PREVIOUS CORE (the text on the page now');
    expect(prompt).toContain('Руководителю небольшой команды это экономит час.');
    // Decisions are labelled as the model's, the person's answer as theirs.
    expect(prompt).toContain('THE MODEL’S DECISIONS');
    expect(prompt).toContain('Для кого этот текст? → Для руководителей небольших команд.');
    expect(prompt).toContain('Что изменилось? → Задачи на общей доске.');
    // Added material has its own block and is not doubled in the person's words.
    expect(prompt).toContain('ADDED MATERIAL');
    expect(prompt.split('Клиент звонил в пятницу.')).toHaveLength(2);
    expect(prompt).toContain('Я заметил, что команда пишет в чат меньше.');
    // Decisions may build the text; facts may not be invented.
    expect(prompt).toContain('never become facts');
    // The enrichment mode is not the rebuild mode.
    expect(prompt).not.toContain('A separate rule about enrichment');
  });

  test('a hand-edited core is labelled as the person’s words', async () => {
    const { service } = build({ models: [{ text: 'Обогащённая правка.' }] });
    await service.editCore('org-a', 'piece-1', { text: 'Моя правка сути.', expected: CORE_TEXT }, 'en');
    await service.rebuildCore('org-a', 'piece-1', 'en');
    expect(modelCalls[0].prompt).toContain('THE PREVIOUS CORE, EDITED BY THE PERSON');
    expect(modelCalls[0].prompt).toContain('A separate rule about the rebuild');
  });

  test('the author’s own words are peeled from the added tail, newest first', () => {
    expect(
      coreEdit.personTextWithoutAdded('Начало.\n\nПервое.\n\nВторое.', ['Первое.', 'Второе.'])
    ).toBe('Начало.');
    // A tail that does not match stays where it is.
    expect(coreEdit.personTextWithoutAdded('Начало.', ['Другое.'])).toBe('Начало.');
  });

  test('peeling stops at the first mismatch and needs the blank-line boundary (review P3-5)', () => {
    // Mismatch: the newest entry is not the tail, so nothing older is peeled either.
    expect(
      coreEdit.personTextWithoutAdded('Начало.\n\nПервое.\n\nЧужое.', ['Первое.', 'Второе.'])
    ).toBe('Начало.\n\nПервое.\n\nЧужое.');
    // The same words added twice are peeled twice, each on its own boundary.
    expect(
      coreEdit.personTextWithoutAdded('Начало.\n\nДа.\n\nДа.', ['Да.', 'Да.'])
    ).toBe('Начало.');
    // A tail that ends the same way mid-word is the author's text, not the addition.
    expect(coreEdit.personTextWithoutAdded('Ну и еда', ['да'])).toBe('Ну и еда');
    expect(coreEdit.personTextWithoutAdded('Ну и\nда', ['да'])).toBe('Ну и\nда');
    // Words that were only the addition leave nothing behind.
    expect(coreEdit.personTextWithoutAdded('Первое.', ['Первое.'])).toBe('');
  });

  test('the rebuild grounds its check on the author’s hand-edited core (review P3-1)', async () => {
    const grounds = [];
    const { service, piece } = build({
      brief: { ...CORE_BRIEF, personText: 'Сроки сдвигались.' },
      models: [{ text: 'Около 37 клиентов перешли на доску.' }],
      slopCheck: (text, platform, language, grounded) => {
        grounds.push(grounded);
        return null;
      },
    });
    await service.editCore(
      'org-a',
      'piece-1',
      { text: 'На доску перешли 37 клиентов.', expected: CORE_TEXT },
      'ru'
    );
    await service.rebuildCore('org-a', 'piece-1', 'ru');
    const rebuildGrounds = grounds[grounds.length - 1];
    expect(rebuildGrounds).toContain('На доску перешли 37 клиентов.');
    // The person's number in their edit is theirs.
    expect(piece.brief.authorNumbers).toBe(true);
  });

  test('a model-written previous core grounds nothing', () => {
    const base = {
      organizationId: 'org',
      language: 'ru',
      personText: 'Слова.',
      answers: [],
      questionTextByKey: {},
      brief: { facts: [] },
      borrowed: null,
      foreignShingles: [],
    };
    const { coreGrounded } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/content-intelligence/pieces/core-write.ts'
    );
    expect(
      coreGrounded({ ...base, rebuildFrom: { text: 'Модель: 99 раз.', byPerson: false } })
    ).toEqual(['Слова.']);
    expect(
      coreGrounded({ ...base, rebuildFrom: { text: 'Я: 12 раз.', byPerson: true } })
    ).toEqual(['Слова.', 'Я: 12 раз.']);
  });
});

describe('«Вернуть эту версию» (97dq.85)', () => {
  test('a stored version becomes the core and the replaced one joins the versions; no model call', async () => {
    const { service, piece } = build();
    await service.editCore('org-a', 'piece-1', { text: 'Моя правка.', expected: CORE_TEXT }, 'ru');
    const restored = await service.restoreCore(
      'org-a',
      'piece-1',
      { index: 0, replacedAt: NOW.toISOString(), expected: 'Моя правка.' },
      'ru'
    );
    expect(restored).toEqual({ text: CORE_TEXT, revisions: 2 });
    expect(piece.body).toBe(CORE_TEXT);
    expect(piece.brief.editedBy).toBeUndefined();
    expect(piece.brief.writtenBy).toBe('model');
    expect(piece.brief.revisions).toEqual([
      { text: CORE_TEXT, writtenBy: 'model', replacedAt: NOW.toISOString(), materialPending: false },
      { text: 'Моя правка.', writtenBy: 'person', replacedAt: NOW.toISOString(), materialPending: false },
    ]);
    expect(modelCalls).toEqual([]);

    // The person's own version comes back as theirs.
    await service.restoreCore(
      'org-a',
      'piece-1',
      { index: 1, replacedAt: NOW.toISOString(), expected: CORE_TEXT },
      'ru'
    );
    expect(piece.body).toBe('Моя правка.');
    expect(piece.brief.editedBy).toBe('person');
    expect(piece.brief.editedAt).toBeUndefined();
  });

  test('a moved core or a missing version is refused, nothing written', async () => {
    const { service, piece } = build();
    await service.editCore('org-a', 'piece-1', { text: 'Моя правка.', expected: CORE_TEXT }, 'ru');
    await expect(
      service.restoreCore('org-a', 'piece-1', { index: 0, replacedAt: NOW.toISOString(), expected: 'Другое' }, 'en')
    ).rejects.toMatchObject({ code: 'PIECE_CORE_CHANGED', status: 409 });
    await expect(
      service.restoreCore('org-a', 'piece-1', { index: 0, replacedAt: '2020-01-01T00:00:00.000Z', expected: 'Моя правка.' }, 'ru')
    ).rejects.toMatchObject({ code: 'PIECE_CORE_CHANGED', status: 409, message: expect.stringMatching(/версии больше нет/) });
    await expect(
      service.restoreCore('org-a', 'piece-1', { index: 5, replacedAt: NOW.toISOString(), expected: 'Моя правка.' }, 'ru')
    ).rejects.toMatchObject({ code: 'PIECE_CORE_CHANGED' });
    expect(piece.body).toBe('Моя правка.');
  });
});

describe('«Вернуть эту версию»: the wait, the cap and the running rebuild (review of 97dq.81-85)', () => {
  const clock = () => {
    let at = new Date('2026-09-24T08:00:00.000Z').getTime();
    return {
      now: () => new Date(at),
      tick: () => {
        at += 60_000;
      },
    };
  };

  test('restoring the text from before the rebuild brings «суть ещё не учитывает дописанное» back (P2-2)', async () => {
    const time = clock();
    const { service, piece } = build({ now: time.now, models: [{ text: 'Суть с материалом.' }] });
    time.tick();
    await service.appendMaterial('org-a', 'piece-1', { text: 'Клиент звонил в пятницу.' }, 'ru');
    time.tick();
    await service.rebuildCore('org-a', 'piece-1', 'ru');
    expect(piece.brief.materialPending).toBeUndefined();

    time.tick();
    await service.restoreCore(
      'org-a',
      'piece-1',
      { index: 0, replacedAt: piece.brief.revisions[0].replacedAt, expected: 'Суть с материалом.' },
      'ru'
    );
    expect(piece.body).toBe(CORE_TEXT);
    expect(piece.brief.materialPending).toBe(true);

    // Back to the rebuilt text: it read the material, the wait clears.
    time.tick();
    await service.restoreCore(
      'org-a',
      'piece-1',
      { index: 1, replacedAt: piece.brief.revisions[1].replacedAt, expected: CORE_TEXT },
      'ru'
    );
    expect(piece.body).toBe('Суть с материалом.');
    expect(piece.brief.materialPending).toBeUndefined();
  });

  test('material added after a text was replaced is not in it either', async () => {
    const time = clock();
    const { service, piece } = build({ now: time.now });
    time.tick();
    await service.editCore('org-a', 'piece-1', { text: 'Моя правка.', expected: CORE_TEXT }, 'ru');
    time.tick();
    await service.appendMaterial('org-a', 'piece-1', { text: 'Новое.' }, 'ru');
    expect(piece.brief.revisions[0].materialPending).toBe(false);
    time.tick();
    await service.restoreCore(
      'org-a',
      'piece-1',
      { index: 0, replacedAt: piece.brief.revisions[0].replacedAt, expected: 'Моя правка.' },
      'ru'
    );
    expect(piece.brief.materialPending).toBe(true);
  });

  test('a revision stored before the field is judged by when it became the core', () => {
    const added = [{ text: 'М', addedAt: '2026-09-24T08:05:00.000Z' }];
    const legacy = [
      { text: 'A', writtenBy: 'model', replacedAt: '2026-09-24T08:10:00.000Z' },
      { text: 'B', writtenBy: 'model', replacedAt: '2026-09-24T08:20:00.000Z' },
    ];
    // A is the first text: older than any material.
    expect(coreEdit.restoredMaterialPending(legacy, 0, added)).toBe(true);
    // B became the core at 08:10, after the material: it read it.
    expect(coreEdit.restoredMaterialPending(legacy, 1, added)).toBe(false);
    expect(coreEdit.restoredMaterialPending(legacy, 0, [])).toBe(false);
    // The field round-trips through the defensive reader; junk is dropped.
    expect(
      coreEdit.readCoreRevisions([
        { text: 'A', writtenBy: 'model', replacedAt: legacy[0].replacedAt, materialPending: true },
        { text: 'B', writtenBy: 'model', replacedAt: legacy[1].replacedAt, materialPending: 'yes' },
      ])
    ).toEqual([
      { text: 'A', writtenBy: 'model', replacedAt: legacy[0].replacedAt, materialPending: true },
      { text: 'B', writtenBy: 'model', replacedAt: legacy[1].replacedAt },
    ]);
  });

  test('after a restore the cap still keeps the first text and the latest 19 (P3-3)', async () => {
    const time = clock();
    const { service, piece } = build({ now: time.now });
    let current = CORE_TEXT;
    for (let index = 0; index < coreEdit.PIECE_CORE_REVISIONS_MAX + 2; index += 1) {
      // Past the editing session, so every save is its own revision.
      time.tick();
      for (let minute = 0; minute < 10; minute += 1) time.tick();
      const next = `Правка ${index}.`;
      await service.editCore('org-a', 'piece-1', { text: next, expected: current }, 'ru');
      current = next;
    }
    expect(piece.brief.revisions).toHaveLength(coreEdit.PIECE_CORE_REVISIONS_MAX);
    time.tick();
    const last = piece.brief.revisions.length - 1;
    await service.restoreCore(
      'org-a',
      'piece-1',
      { index: 0, replacedAt: piece.brief.revisions[0].replacedAt, expected: current },
      'ru'
    );
    expect(piece.body).toBe(CORE_TEXT);
    expect(piece.brief.revisions).toHaveLength(coreEdit.PIECE_CORE_REVISIONS_MAX);
    // The first text is never evicted; the text the restore replaced is the newest.
    expect(piece.brief.revisions[0].text).toBe(CORE_TEXT);
    expect(piece.brief.revisions[last].text).toBe(current);
    expect(piece.brief.revisions.slice(1).map((revision) => revision.text)).not.toContain(
      'Правка 0.'
    );
  });

  test('a restore while a rebuild runs is refused, and the rebuild lands', async () => {
    let release;
    const answer = new Promise((resolve) => {
      release = resolve;
    });
    const { service, piece } = build({ models: [answer] });
    await service.editCore('org-a', 'piece-1', { text: 'Моя правка.', expected: CORE_TEXT }, 'ru');
    const running = service.rebuildCore('org-a', 'piece-1', 'ru');
    await expect(
      service.restoreCore(
        'org-a',
        'piece-1',
        { index: 0, replacedAt: NOW.toISOString(), expected: 'Моя правка.' },
        'ru'
      )
    ).rejects.toMatchObject({ code: 'PIECE_REBUILD_RUNNING', status: 409 });
    release({ text: 'Пересобранная суть.' });
    await running;
    expect(piece.body).toBe('Пересобранная суть.');
  });
});
