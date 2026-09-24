'use strict';

/**
 * Эмодзи — точный потолок «до N» (`content-factory-next-97dq.61`, вариант A).
 *
 * Владелец выбрал бегунок с делениями нет · 1 · 3 · 6 · 10 · без предела и
 * точным «не больше N» в промпте. Здесь держится то, что переживёт правку
 * разметки: шкала читается в обе стороны, старые значения читаются и стоят на
 * ближайшем делении, новое значение живёт в той же строке `emojiLevel` (без
 * миграции) и проходит обе двери, а промпт получает ровно тот потолок, что
 * выбран, — старые значения при этом говорят прежними словами.
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
const { channelInstructionLines, EMOJI_LINE } = loadTypeScriptModule(
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

const STOPS = ['none', 'max1', 'max3', 'max6', 'max10', 'unlimited'];

describe('the scale reads both ways', () => {
  test('six stops in the order of the slider, with their exact ceilings', () => {
    expect(scale.EMOJI_STOPS).toEqual(STOPS);
    expect(STOPS.map((stop) => scale.EMOJI_STOP_CEILING[stop])).toEqual([
      0, 1, 3, 6, 10, null,
    ]);
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
    expect(scale.emojiStopAt(99)).toBe('unlimited');
    expect(scale.emojiStopAt(2.4)).toBe('max3');
  });
});

describe('old values still read, at the nearest stop', () => {
  test.each([
    ['none', 'none', 0],
    ['few', 'max3', 2],
    ['many', 'max6', 3],
    ['auto', 'unlimited', 5],
  ])('%s stands at %s', (legacy, stop, index) => {
    expect(scale.emojiStopOf(legacy)).toBe(stop);
    expect(scale.emojiStopIndex(legacy)).toBe(index);
  });

  test('`free` is still the oldest spelling of «много», and junk falls back', () => {
    expect(scale.readEmojiLevel('free', 'few')).toBe('many');
    expect(scale.readEmojiLevel('ALL OF THEM', 'few')).toBe('few');
    expect(scale.readEmojiLevel(undefined, 'none')).toBe('none');
    for (const value of [...STOPS, 'few', 'many', 'auto'])
      expect(scale.readEmojiLevel(value, 'few')).toBe(value);
  });

  test('the server keeps a stored stop and keeps reading the old words', () => {
    for (const value of ['max1', 'max10', 'unlimited', 'few', 'many', 'auto'])
      expect(parseWritingProfile({ emojiLevel: value }, 'telegram', 'ru').emojiLevel).toBe(value);
    expect(parseWritingProfile({ emojiLevel: 'free' }, 'telegram', 'ru').emojiLevel).toBe('many');
  });

  test('the screen reads what the server stored, old or new', () => {
    expect(readWritingProfile({ emojiLevel: 'max6' }).emojiLevel).toBe('max6');
    expect(readWritingProfile({ emojiLevel: 'many' }).emojiLevel).toBe('many');
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

  test('the card door still takes the old words and refuses a made-up one', () => {
    const body = (emojiLevel) =>
      buildWritingProfilePayload({ ...DEFAULT_WRITING_PROFILE, emojiLevel });
    for (const old of ['few', 'many', 'auto', 'none'])
      expect(refusals(IntegrationWritingProfileDto, body(old))).toEqual([]);
    expect(
      refusals(IntegrationWritingProfileDto, { ...body('few'), emojiLevel: 'max7' })
    ).toContain('emojiLevel');
  });

  test('«Для этого поста» sends a stop through the adapt door', () => {
    for (const stop of STOPS)
      expect(refusals(PieceAdaptOverridesDto, { emojiLevel: stop })).toEqual([]);
    expect(refusals(PieceAdaptOverridesDto, { emojiLevel: 'max7' })).toContain(
      'emojiLevel'
    );
  });
});

describe('the prompt gets the exact ceiling', () => {
  const TELEGRAM = {
    identifier: 'telegram',
    name: 'Telegram',
    maxLength: 4096,
    maxCaptionLength: 1024,
    editor: 'html',
    contentLanguage: 'ru',
  };
  const channel = (emojiLevel) =>
    channelInstructionLines(
      { ...parseWritingProfile({}, 'telegram', 'ru'), emojiLevel },
      TELEGRAM
    ).find((line) => line.includes('emoji')) ?? null;
  const channelLine = (rule) =>
    `For emoji, this channel setting overrides the voice and neutral core: ${rule}`;

  test.each([
    ['max1', 'Use one emoji where it fits the meaning, never more than 1 in the whole post, and never as a list bullet.'],
    ['max3', 'Use emoji where they fit the meaning, up to 3 in the whole post (never more than 3; fewer is fine), and never as list bullets.'],
    ['max6', 'Use emoji where they fit the meaning, up to 6 in the whole post (never more than 6; fewer is fine), and never as list bullets.'],
    ['max10', 'Use emoji where they fit the meaning, up to 10 in the whole post (never more than 10; fewer is fine), and never as list bullets.'],
  ])('%s → «up to N where they fit, never more than N» (97dq.83, review P3-7)', (stop, rule) => {
    expect(EMOJI_LINE[stop]).toBe(rule);
    expect(channel(stop)).toBe(channelLine(rule));
  });

  test('«нет» is no emoji and «без предела» lifts the ceiling', () => {
    expect(channel('none')).toBe(channelLine('No emoji.'));
    expect(channel('unlimited')).toBe(
      channelLine('There is no limit on emoji: use them freely wherever they fit the meaning.')
    );
  });

  test('old values keep today’s wording', () => {
    expect(channel('few')).toBe(
      channelLine('Use one to three emoji, of no more than two kinds, and never as list bullets.')
    );
    expect(channel('many')).toBe(
      channelLine('Emoji are welcome when they fit the meaning; use 3–6 emoji freely in a post.')
    );
    // `auto` never said anything, and still does not.
    expect(channel('auto')).toBeNull();
  });

  test('a stop set for one post overrides the channel, marked as one-off', () => {
    const lines = channelInstructionLines(
      { ...parseWritingProfile({}, 'telegram', 'ru'), emojiLevel: 'few' },
      TELEGRAM,
      { post: { emojiLevel: 'max10' } }
    );
    expect(lines).toContain(
      'For this post only: for emoji, this setting overrides the channel, the voice and neutral core: Use emoji where they fit the meaning, up to 10 in the whole post (never more than 10; fewer is fine), and never as list bullets.'
    );
    expect(lines.join('\n')).not.toContain('one to three');
  });
});

describe('«до N» is a count the whole chain honours (97dq.83)', () => {
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
  const { slopCheck } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-check.ts'
  );
  const lines = (emojiLevel, post) =>
    directives.channelInstructionLines(
      { ...parseWritingProfile({}, 'telegram', 'ru'), emojiLevel },
      TELEGRAM,
      post ? { post } : undefined
    );

  test('a setting that asks for emoji says the core’s «no emoji» is not this post’s rule', () => {
    for (const level of ['max1', 'max3', 'max6', 'max10', 'few', 'many'])
      expect(lines(level)).toContain(directives.EMOJI_CORE_LINE);
    expect(lines('few', { emojiLevel: 'max3' })).toContain(directives.EMOJI_CORE_LINE);
    // «нет» and `auto` add nothing about the core.
    for (const level of ['none', 'auto']) {
      expect(lines(level)).not.toContain(directives.EMOJI_CORE_LINE);
      expect(lines(level)).not.toContain(directives.EMOJI_CORE_OPTIONAL_LINE);
    }
    // A post set to «нет» on a «до 3» channel drops the line.
    expect(lines('few', { emojiLevel: 'none' })).not.toContain(directives.EMOJI_CORE_LINE);
    expect(directives.EMOJI_CORE_LINE).toContain("that is not this post's rule");
  });

  test('«без предела» lifts the ceiling without asking for emoji (review P3-7)', () => {
    expect(lines('unlimited')).toContain(directives.EMOJI_CORE_OPTIONAL_LINE);
    expect(lines('unlimited')).not.toContain(directives.EMOJI_CORE_LINE);
    expect(directives.EMOJI_CORE_OPTIONAL_LINE).toContain('none are required');
  });

  test('the untouched Telegram channel («до 3» as legacy `few`) gets the core line (review P2-1)', () => {
    const { TELEGRAM_WRITING_DEFAULTS } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
    );
    expect(TELEGRAM_WRITING_DEFAULTS.emojiLevel).toBe('few');
    const untouched = directives.channelInstructionLines(
      parseWritingProfile({}, 'telegram', 'ru'),
      TELEGRAM
    );
    expect(parseWritingProfile({}, 'telegram', 'ru').emojiLevel).toBe('few');
    expect(untouched).toContain(directives.EMOJI_CORE_LINE);
  });

  test('the ceiling of a stored value', () => {
    expect(scale.emojiCeilingOf('max1')).toBe(1);
    expect(scale.emojiCeilingOf('max3')).toBe(3);
    expect(scale.emojiCeilingOf('max10')).toBe(10);
    expect(scale.emojiCeilingOf('few')).toBe(3);
    expect(scale.emojiCeilingOf('many')).toBe(6);
    expect(scale.emojiCeilingOf('free')).toBe(6);
    expect(scale.emojiCeilingOf('unlimited')).toBeNull();
    // «Нет» is a chosen zero (review P3-7).
    expect(scale.emojiCeilingOf('none')).toBe(0);
    expect(scale.emojiCeilingOf('auto')).toBeUndefined();
    expect(scale.emojiCeilingOf('junk')).toBeUndefined();
  });

  const ruleIds = (text, options) =>
    slopCheck(text, { platform: 'telegram', locale: 'ru', ...options }).findings.map(
      (finding) => finding.ruleId
    );
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
    expect(scale.emojiCeilingOf(effectiveEmojiLevel(undefined, channelTags, 'ch', 'max6'))).toBe(6);
  });
});
