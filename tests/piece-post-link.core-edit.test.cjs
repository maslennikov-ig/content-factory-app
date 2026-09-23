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
    () => NOW,
    null,
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

  test('the writer’s hints carry the author link under hints v2 (v1 kept for old receipts)', () => {
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
    expect(fromPiece.version).toBe('intake-hints/v2');
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

  test('an address: the one line, verbatim, with «never invent»', () => {
    const lines = directives.channelInstructionLines(profile('end'), TELEGRAM, {
      authorLink: { url: 'https://example.com/offer' },
    });
    expect(lines).toContain(directives.AUTHOR_LINK_LINE('https://example.com/offer'));
    expect(directives.AUTHOR_LINK_LINE('https://x.com')).toBe(
      "The author chose this link for the post: <https://x.com>. It is the only link you may add: put it in exactly as written, character for character, once, where it fits by meaning. Links already in the author's material or sources may stay; never invent any other URL."
    );
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
      `For this post only: ${directives.AUTHOR_LINK_LINE('https://example.com')} This overrides the link rule above.`
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
      { text: CORE_TEXT, writtenBy: 'model', replacedAt: NOW.toISOString() },
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
    expect(modelCalls[0].prompt).toContain('PROMPT VERSION: core-write/v11');
    expect(piece.body).toBe('Суть по всему материалу.');
    expect(piece.brief.materialPending).toBeUndefined();
    expect(piece.brief.revisions).toEqual([
      { text: CORE_TEXT, writtenBy: 'model', replacedAt: NOW.toISOString() },
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
