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
    ['max1', 'Use no more than 1 emoji in the whole post, and never as a list bullet.'],
    ['max3', 'Use no more than 3 emoji in the whole post, and never as list bullets.'],
    ['max6', 'Use no more than 6 emoji in the whole post, and never as list bullets.'],
    ['max10', 'Use no more than 10 emoji in the whole post, and never as list bullets.'],
  ])('%s → «no more than N»', (stop, rule) => {
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
      'For this post only: for emoji, this setting overrides the channel, the voice and neutral core: Use no more than 10 emoji in the whole post, and never as list bullets.'
    );
    expect(lines.join('\n')).not.toContain('one to three');
  });
});
