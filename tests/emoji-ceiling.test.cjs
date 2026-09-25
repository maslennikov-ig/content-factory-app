'use strict';

/**
 * Эмодзи — плотность словами (`content-factory-next-97dq.96`, решение
 * владельца 25.09.2026; заменяет точное «до N» из `97dq.61`).
 *
 * Пять делений — Без эмодзи · Мало · Средне · Много · Как можно больше. Число
 * эмодзи считается от длины поста (`emojiRangeFor`): промпт получает его от
 * той длины, которую сам же задаёт, проверка — от длины готового текста.
 * Старые значения читаются как ближайшая плотность, без миграции; «мало» и
 * «много» до `97dq.61` — те же `few` и `many`. «Слишком мало» находкой не
 * бывает.
 */

require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const scale = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/channels/emoji-ceiling.ts'
);
const { parseWritingProfile } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
);
const { channelInstructionLines, emojiLine } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/channel-directives.ts'
);
const { IntegrationWritingProfileDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/integrations/integration.writing.profile.dto.ts'
);
const { PieceAdaptOverridesDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content-intelligence/content-piece.dto.ts'
);
const {
  DEFAULT_WRITING_PROFILE,
  buildWritingProfilePayload,
  readWritingProfile,
} = loadWithMocks(
  'apps/frontend/src/components/content-intelligence/intake/writing-profile.adapter.ts'
);

const STOPS = ['none', 'few', 'medium', 'many', 'max'];

describe('the scale reads both ways', () => {
  test('five stops in the order of the slider', () => {
    expect(scale.EMOJI_STOPS).toEqual(STOPS);
  });

  test('position → value → position is the identity for every stop', () => {
    STOPS.forEach((stop, index) => {
      expect(scale.emojiStopAt(index)).toBe(stop);
      expect(scale.emojiStopIndex(stop)).toBe(index);
      expect(scale.emojiStopOf(stop)).toBe(stop);
    });
  });

  test('a position out of range clamps to the ends instead of inventing a value', () => {
    expect(scale.emojiStopAt(-3)).toBe('none');
    expect(scale.emojiStopAt(99)).toBe('max');
    expect(scale.emojiStopAt(2.4)).toBe('medium');
  });
});

describe('the count depends on the length (97dq.96, owner table 25.09.2026)', () => {
  test.each([
    ['none', 600, 0, 0],
    ['few', 600, 1, 1],
    // The table says 4–7; the sparse end rounded up gives 5 (3000 / 700 = 4.3).
    ['few', 3000, 5, 7],
    ['medium', 600, 2, 3],
    ['medium', 3000, 9, 15],
    ['many', 600, 4, 6],
    ['many', 3000, 17, 30],
    ['max', 600, 7, 12],
    ['max', 3000, 34, 60],
  ])('%s at %i characters → %i to %i', (level, chars, min, max) => {
    expect(scale.emojiRangeFor(level, chars)).toEqual({ min, max });
  });

  test('every stop but «Без эмодзи» asks for at least one, and the most never falls below the fewest', () => {
    for (const level of ['few', 'medium', 'many', 'max']) {
      const tiny = scale.emojiRangeFor(level, 40);
      expect(tiny.min).toBe(1);
      expect(tiny.max).toBeGreaterThanOrEqual(tiny.min);
    }
    expect(scale.emojiRangeFor('few', 300)).toEqual({ min: 1, max: 1 });
    expect(scale.emojiRangeFor('none', 5000)).toEqual({ min: 0, max: 0 });
  });

  test('a range of lengths counts the fewest at the short end and the most at the long end', () => {
    expect(scale.emojiRangeFor('medium', 500, 1000)).toEqual({ min: 2, max: 5 });
  });

  test('`auto` and junk have no count', () => {
    expect(scale.emojiRangeFor('auto', 800)).toBeNull();
    expect(scale.emojiRangeFor('lots', 800)).toBeNull();
  });
});

describe('old values still read, as the density they mean', () => {
  test.each([
    ['max1', 'few', 1],
    ['max3', 'medium', 2],
    ['max6', 'many', 3],
    ['max10', 'max', 4],
    ['unlimited', 'many', 3],
    ['free', 'many', 3],
  ])('%s reads as %s', (legacy, stop, index) => {
    expect(scale.readEmojiLevel(legacy, 'auto')).toBe(stop);
    expect(scale.emojiStopOf(legacy)).toBe(stop);
    expect(scale.emojiStopIndex(legacy)).toBe(index);
  });

  test('`auto` stays nothing chosen and is drawn in the middle; junk falls back', () => {
    expect(scale.readEmojiLevel('auto', 'few')).toBe('auto');
    expect(scale.emojiStopOf('auto')).toBe('medium');
    expect(scale.readEmojiLevel('ALL OF THEM', 'few')).toBe('few');
    expect(scale.readEmojiLevel(undefined, 'none')).toBe('none');
    for (const value of [...STOPS, 'auto'])
      expect(scale.readEmojiLevel(value, 'few')).toBe(value);
  });

  test('the server reads a stored old stop as a density', () => {
    const read = (value) =>
      parseWritingProfile({ emojiLevel: value }, 'telegram', 'ru').emojiLevel;
    expect(read('max1')).toBe('few');
    expect(read('max10')).toBe('max');
    expect(read('unlimited')).toBe('many');
    expect(read('free')).toBe('many');
    for (const value of [...STOPS, 'auto']) expect(read(value)).toBe(value);
  });

  test('the screen reads what the server stored, old or new', () => {
    expect(readWritingProfile({ emojiLevel: 'max6' }).emojiLevel).toBe('many');
    expect(readWritingProfile({ emojiLevel: 'medium' }).emojiLevel).toBe('medium');
    expect(readWritingProfile({ emojiLevel: 'free' }).emojiLevel).toBe('many');
    expect(readWritingProfile({ emojiLevel: 'lots' }).emojiLevel).toBe('few');
  });
});

describe('the new value lives in the same field and passes both doors', () => {
  const refusals = (Dto, body) =>
    validateSync(plainToInstance(Dto, body, { enableImplicitConversion: false }), {
      whitelist: true,
    }).map((failure) => failure.property);

  test.each(STOPS)('the channel card saves %s', (stop) => {
    const body = buildWritingProfilePayload({
      ...DEFAULT_WRITING_PROFILE,
      emojiLevel: stop,
    });
    expect(body.emojiLevel).toBe(stop);
    expect(refusals(IntegrationWritingProfileDto, body)).toEqual([]);
  });

  test('the card door still takes the old stops and refuses a made-up one', () => {
    const body = (emojiLevel) =>
      buildWritingProfilePayload({ ...DEFAULT_WRITING_PROFILE, emojiLevel });
    for (const old of ['auto', 'max1', 'max3', 'max6', 'max10', 'unlimited', 'free'])
      expect(refusals(IntegrationWritingProfileDto, body(old))).toEqual([]);
    expect(
      refusals(IntegrationWritingProfileDto, { ...body('few'), emojiLevel: 'max7' })
    ).toContain('emojiLevel');
  });

  test('«Для этого поста» sends a stop through the adapt door, an old one too', () => {
    for (const stop of [...STOPS, 'max3', 'unlimited'])
      expect(refusals(PieceAdaptOverridesDto, { emojiLevel: stop })).toEqual([]);
    expect(refusals(PieceAdaptOverridesDto, { emojiLevel: 'max7' })).toContain(
      'emojiLevel'
    );
  });
});

describe('the prompt gets a count worked out from the length (97dq.96)', () => {
  const TELEGRAM = {
    identifier: 'telegram',
    name: 'Telegram',
    maxLength: 4096,
    maxCaptionLength: 1024,
    editor: 'html',
    contentLanguage: 'ru',
  };
  const directives = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/agent/channel-directives.ts'
  );
  // The Telegram card asks for 500 to 1000 characters.
  const lines = (emojiLevel, post, profile = {}) =>
    channelInstructionLines(
      { ...parseWritingProfile({}, 'telegram', 'ru'), ...profile, emojiLevel },
      TELEGRAM,
      post ? { post } : undefined
    );
  const channel = (emojiLevel, profile) =>
    lines(emojiLevel, null, profile).find((line) => line.includes('emoji')) ?? null;
  const channelLine = (rule) =>
    `For emoji, this channel setting overrides the voice and neutral core: ${rule}`;

  test.each([
    ['few', 'Use 1 to 2 emoji in the whole post (about one per 400–700 characters) where they fit the meaning, never as list bullets.'],
    ['medium', 'Use 2 to 5 emoji in the whole post (about one per 200–350 characters) where they fit the meaning, never as list bullets.'],
    ['many', 'Use 3 to 10 emoji in the whole post (about one per 100–180 characters) where they fit the meaning, never as list bullets.'],
    ['max', 'Use 6 to 20 emoji in the whole post (about one per 50–90 characters) where they fit the meaning, never as list bullets.'],
  ])('%s at 500–1000 characters', (level, rule) => {
    expect(emojiLine(level, { min: 500, max: 1000 })).toBe(rule);
    expect(channel(level)).toBe(channelLine(rule));
  });

  test('an old stop gets the line of the density it means', () => {
    expect(channel('max3')).toBe(channel('medium'));
    expect(channel('max10')).toBe(channel('max'));
    expect(channel('unlimited')).toBe(channel('many'));
  });

  test('one emoji reads in the singular', () => {
    expect(emojiLine('few', { min: 300, max: 600 })).toBe(
      'Use 1 emoji in the whole post (about one per 400–700 characters) where it fits the meaning, never as a list bullet.'
    );
  });

  test('without a length the density is said in words, counted against 800 characters', () => {
    expect(channel('medium', { lengthPolicy: 'auto' })).toBe(
      channelLine(
        'Use a moderate number of emoji: about one per 200–350 characters, which is 3 to 4 in a post of 800 characters; scale that to the length you write, use at least 1, place them where they fit the meaning, never as list bullets.'
      )
    );
    expect(channel('max', { lengthPolicy: 'provider_max' })).toContain(
      'Use as many emoji as fit: about one per 50–90 characters, which is 9 to 16'
    );
  });

  test('«Без эмодзи» is no emoji and `auto` says nothing', () => {
    expect(channel('none')).toBe(channelLine('No emoji.'));
    expect(channel('auto')).toBeNull();
  });

  test('a stop set for one post overrides the channel, marked as one-off', () => {
    const post = lines('few', { emojiLevel: 'max' });
    expect(post).toContain(
      'For this post only: for emoji, this setting overrides the channel, the voice and neutral core: Use 6 to 20 emoji in the whole post (about one per 50–90 characters) where they fit the meaning, never as list bullets.'
    );
    expect(post.join('\n')).not.toContain('400–700');
    // An old stop on the post reads as its density.
    expect(lines('few', { emojiLevel: 'max10' })).toEqual(post);
  });

  test('the count follows the post’s own length', () => {
    // «Короче» scales 500–1000 to 300–600.
    expect(
      lines('medium', { length: 'shorter' }).find((line) => line.includes('emoji'))
    ).toBe(
      channelLine(
        'Use 1 to 3 emoji in the whole post (about one per 200–350 characters) where they fit the meaning, never as list bullets.'
      )
    );
    // A range set on the post is the length counted against.
    expect(
      lines('medium', {
        lengthPolicy: { idealMin: 1500, idealMax: 2500, hardMax: null },
        emojiLevel: 'many',
      })
    ).toContain(
      'For this post only: for emoji, this setting overrides the channel, the voice and neutral core: Use 9 to 25 emoji in the whole post (about one per 100–180 characters) where they fit the meaning, never as list bullets.'
    );
  });

  test('every density says the core’s «no emoji» is not this post’s rule', () => {
    for (const level of ['few', 'medium', 'many', 'max', 'max1', 'unlimited'])
      expect(lines(level)).toContain(directives.EMOJI_CORE_LINE);
    expect(lines('few', { emojiLevel: 'max3' })).toContain(directives.EMOJI_CORE_LINE);
    for (const level of ['none', 'auto'])
      expect(lines(level)).not.toContain(directives.EMOJI_CORE_LINE);
    // A post set to «Без эмодзи» on a «Мало» channel drops the line.
    expect(lines('few', { emojiLevel: 'none' })).not.toContain(directives.EMOJI_CORE_LINE);
    expect(directives.EMOJI_CORE_LINE).toContain("that is not this post's rule");
  });

  test('the untouched Telegram channel is «Мало» and gets the core line (review P2-1)', () => {
    const { TELEGRAM_WRITING_DEFAULTS } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
    );
    expect(TELEGRAM_WRITING_DEFAULTS.emojiLevel).toBe('few');
    const untouched = channelInstructionLines(
      parseWritingProfile({}, 'telegram', 'ru'),
      TELEGRAM
    );
    expect(untouched).toContain(directives.EMOJI_CORE_LINE);
  });
});

describe('the text checks count the ceiling against the text’s own length', () => {
  const { slopCheck } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-check.ts'
  );
  const ruleIds = (text, options) =>
    slopCheck(text, { platform: 'telegram', locale: 'ru', ...options }).findings.map(
      (finding) => finding.ruleId
    );

  test('the ceiling of a stored value', () => {
    expect(scale.emojiCeilingOf('medium')).toBe('medium');
    expect(scale.emojiCeilingOf('max1')).toBe('few');
    expect(scale.emojiCeilingOf('max3')).toBe('medium');
    expect(scale.emojiCeilingOf('free')).toBe('many');
    expect(scale.emojiCeilingOf('unlimited')).toBe('many');
    expect(scale.emojiCeilingOf('none')).toBe(0);
    expect(scale.emojiCeilingOf('auto')).toBeUndefined();
    expect(scale.emojiCeilingOf('junk')).toBeUndefined();
    expect(scale.emojiCeilingAt('medium', 600)).toBe(3);
    expect(scale.emojiCeilingAt('medium', 3000)).toBe(15);
    // Live stand 25.09.2026: a started stretch allows one more, so a post
    // shorter than asked is not flagged for what the prompt allowed.
    expect(scale.emojiCeilingAt('medium', 539)).toBe(3);
    expect(scale.emojiCeilingAt('many', 368)).toBe(4);
    expect(scale.emojiCeilingAt(0, 3000)).toBe(0);
    expect(scale.emojiCeilingAt(null, 3000)).toBeNull();
    expect(scale.emojiCeilingAt(undefined, 3000)).toBeUndefined();
  });

  test('the same emoji count is over «Мало» in a short post and within it in a long one', () => {
    const sentence = 'Мы перенесли задачи на общую доску, и вопросы о статусе отпали сами собой. ';
    const short = `${sentence}🚀 ${sentence}✅`;
    const long = `${sentence.repeat(8)}🚀 ${sentence.repeat(8)}✅`;
    expect(ruleIds(short, { emojiCeiling: 'few' })).toContain('emoji-over-ceiling');
    expect(ruleIds(long, { emojiCeiling: 'few' })).not.toContain('emoji-over-ceiling');
  });

  test('too few is never a finding', () => {
    const bare = 'Мы перенесли задачи на общую доску, и вопросы о статусе отпали. '.repeat(20);
    const ids = ruleIds(bare, { emojiCeiling: 'max' });
    expect(ids.some((id) => id.startsWith('emoji'))).toBe(false);
  });

  // A number still works: «Без эмодзи» is `0`, and a count is a count.
  const THREE_KINDS =
    'Мы перенесли задачи на общую доску 🚀 и вопросы о статусе отпали ✅. Команда пишет в чат меньше 💬.';

  test('within «до N» emoji kinds are not decoration; past it, and by default, they still are', () => {
    // Telegram's own threshold is two kinds.
    expect(ruleIds(THREE_KINDS)).toContain('emoji-decoration');
    expect(ruleIds(THREE_KINDS, { emojiCeiling: 1 })).toContain('emoji-decoration');
    expect(ruleIds(THREE_KINDS, { emojiCeiling: 3 })).not.toContain('emoji-decoration');
    expect(ruleIds(THREE_KINDS, { emojiCeiling: null })).not.toContain('emoji-decoration');
    expect(ruleIds(THREE_KINDS, { emojiCeiling: undefined })).toContain('emoji-decoration');
  });

  test('emoji as list bullets stay a finding whatever the ceiling', () => {
    const bullets = '🚀 Первое дело.\n✅ Второе дело.\n💬 Третье дело.';
    expect(ruleIds(bullets, { emojiCeiling: 10 })).toContain('emoji-decoration');
  });

  test('more emoji than «до N» in all is a finding, whatever the kinds (review P3-7)', () => {
    const oneKindEight = 'Запуск прошёл 🚀🚀🚀 и ещё раз 🚀🚀. Команда довольна 🚀🚀🚀.';
    expect(ruleIds(oneKindEight, { emojiCeiling: 3 })).toContain('emoji-over-ceiling');
    expect(ruleIds(oneKindEight, { emojiCeiling: 10 })).not.toContain('emoji-over-ceiling');
    expect(ruleIds(oneKindEight, { emojiCeiling: null })).not.toContain('emoji-over-ceiling');
    // No chosen ceiling — nothing to count against.
    expect(ruleIds(oneKindEight)).not.toContain('emoji-over-ceiling');
    const finding = slopCheck(oneKindEight, {
      platform: 'telegram',
      locale: 'ru',
      emojiCeiling: 3,
    }).findings.find((item) => item.ruleId === 'emoji-over-ceiling');
    expect(finding.count).toBe(8);
    expect(finding.excerpt).toBe('🚀');
  });

  test('«нет» means zero: one emoji is over it (review P3-7)', () => {
    const one = 'Мы перенесли задачи на общую доску 🚀 и вопросы отпали.';
    expect(ruleIds(one, { emojiCeiling: scale.emojiCeilingOf('none') })).toContain(
      'emoji-over-ceiling'
    );
    expect(
      ruleIds('Мы перенесли задачи на общую доску.', {
        emojiCeiling: scale.emojiCeilingOf('none'),
      })
    ).not.toContain('emoji-over-ceiling');
    // Zero widens no kinds: the platform threshold still judges decoration.
    expect(ruleIds(one, { emojiCeiling: 0 })).not.toContain('emoji-decoration');
  });
});

describe('one resolver for the post emoji level (review P3-6, 97dq.83)', () => {
  const { postEmojiLevelOf, effectiveEmojiLevel } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/pieces/post-settings.ts'
  );
  const tags = { postSettings: { ch: { options: { emoji: 'max3' } } } };

  test('request override, else stored post setting, else channel', () => {
    expect(effectiveEmojiLevel('max1', tags, 'ch', 'max10')).toBe('max1');
    expect(effectiveEmojiLevel(undefined, tags, 'ch', 'max10')).toBe('max3');
    expect(effectiveEmojiLevel(undefined, tags, 'other', 'max10')).toBe('max10');
    expect(effectiveEmojiLevel('', null, 'ch', 'few')).toBe('few');
    expect(postEmojiLevelOf('junk', tags, 'ch')).toBe('max3');
  });

  test('«как в канале» stored is no override', () => {
    const channelTags = { postSettings: { ch: { options: { emoji: 'channel' } } } };
    expect(postEmojiLevelOf(undefined, channelTags, 'ch')).toBeUndefined();
    expect(scale.emojiCeilingOf(effectiveEmojiLevel(undefined, channelTags, 'ch', 'max6'))).toBe('many');
  });
});
