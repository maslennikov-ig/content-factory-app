'use strict';

/**
 * Карточка канала «Как пишем сюда»: умолчания и защитное чтение колонки.
 *
 * `content-factory-next-tu3k.2`, решение владельца 06.09.2026 (пункт 5).
 * Колонка `Integration.writingProfile` — JSON, поэтому о её содержимом не
 * гарантировано ничего: строка старой сборки, строка новой, правка руками.
 * Негодное поле здесь обязано отброситься, а не починиться, — иначе молча
 * изменится то, чего человек не просил, и обнаружится это уже в тексте поста.
 *
 * Второй набор проверок — про дверь: карточка не может обещать больше, чем
 * площадка примет. Провайдер здесь настоящий (`TelegramProvider` знает свои
 * 4096 и 1024), потому что вся проверка и состоит в сверке с ним.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const PROFILE =
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts';

const {
  FORMAT_LENGTHS_TELEGRAM,
  GENERIC_WRITING_DEFAULTS,
  TELEGRAM_WRITING_DEFAULTS,
  defaultWritingProfileFor,
  parseWritingProfile,
  resolveChannelWritingProfile,
} = loadTypeScriptModule(PROFILE);

describe('what the product knows about a channel before anybody says anything', () => {
  test('Telegram in Russian: the measured corridor, emoji allowed sparingly', () => {
    expect(defaultWritingProfileFor('telegram', 'ru')).toEqual({
      version: 'channel-writing-profile/v1',
      lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
      emojiLevel: 'few',
      linkPolicy: 'end',
      hashtagPolicy: 'none',
      ctaKind: 'question',
      formatPreference: 'auto',
      notes: null,
      output: 'text',
    });
  });

  test('Telegram in English carries no emoji at all', () => {
    expect(defaultWritingProfileFor('telegram', 'en').emojiLevel).toBe('none');
    // Всё остальное — то же самое: язык решает только про эмодзи.
    expect(defaultWritingProfileFor('telegram', 'en').lengthPolicy).toEqual(
      TELEGRAM_WRITING_DEFAULTS.lengthPolicy
    );
  });

  test('a channel nobody measured lets the provider hold the length', () => {
    expect(defaultWritingProfileFor('vk', 'ru')).toEqual(
      GENERIC_WRITING_DEFAULTS
    );
    expect(defaultWritingProfileFor('vk', 'ru').lengthPolicy).toBe(
      'provider_max'
    );
  });

  test('the format corridors are the ones the research measured', () => {
    expect(FORMAT_LENGTHS_TELEGRAM).toEqual({
      opinion: { min: 200, max: 500 },
      announcement: { min: 300, max: 800 },
      list: { min: 1000, max: 2500 },
      expert: { min: 1200, max: 2500 },
      case: { min: 1500, max: 3000 },
      story: { min: 1000, max: 2500 },
    });
  });
});

describe('a JSON column is read defensively, never repaired', () => {
  test('NULL means the defaults, and says so separately', () => {
    expect(parseWritingProfile(null, 'telegram', 'ru')).toEqual(
      defaultWritingProfileFor('telegram', 'ru')
    );
    expect(resolveChannelWritingProfile(null, 'telegram', 'ru')).toEqual({
      profile: defaultWritingProfileFor('telegram', 'ru'),
      stored: false,
    });
    expect(
      resolveChannelWritingProfile({ emojiLevel: 'none' }, 'telegram', 'ru')
        .stored
    ).toBe(true);
  });

  test('a key this build never heard of is dropped', () => {
    const parsed = parseWritingProfile(
      { emojiLevel: 'none', videoPrompt: 'сделай ролик', output: 'video' },
      'telegram',
      'ru'
    );

    expect(parsed.videoPrompt).toBeUndefined();
    expect(parsed.output).toBe('text');
    expect(parsed.emojiLevel).toBe('none');
  });

  test('a value outside the enumeration falls back to the default', () => {
    const parsed = parseWritingProfile(
      {
        emojiLevel: 'ALL OF THEM',
        linkPolicy: 7,
        hashtagPolicy: null,
        ctaKind: 'beg',
        formatPreference: 'poem',
      },
      'telegram',
      'ru'
    );

    expect({
      emojiLevel: parsed.emojiLevel,
      linkPolicy: parsed.linkPolicy,
      hashtagPolicy: parsed.hashtagPolicy,
      ctaKind: parsed.ctaKind,
      formatPreference: parsed.formatPreference,
    }).toEqual({
      emojiLevel: 'few',
      linkPolicy: 'end',
      hashtagPolicy: 'none',
      ctaKind: 'question',
      formatPreference: 'auto',
    });
  });

  test('half a range is not a range', () => {
    expect(
      parseWritingProfile({ lengthPolicy: { idealMin: 400 } }, 'telegram', 'ru')
        .lengthPolicy
    ).toEqual(TELEGRAM_WRITING_DEFAULTS.lengthPolicy);
    expect(
      parseWritingProfile(
        { lengthPolicy: { idealMin: 900, idealMax: 400 } },
        'telegram',
        'ru'
      ).lengthPolicy
    ).toEqual(TELEGRAM_WRITING_DEFAULTS.lengthPolicy);
    expect(
      parseWritingProfile({ lengthPolicy: 'provider_max' }, 'telegram', 'ru')
        .lengthPolicy
    ).toBe('provider_max');
  });

  test('a ceiling below the corridor it caps is dropped, the corridor stays', () => {
    expect(
      parseWritingProfile(
        { lengthPolicy: { idealMin: 300, idealMax: 900, hardMax: 500 } },
        'telegram',
        'ru'
      ).lengthPolicy
    ).toEqual({ idealMin: 300, idealMax: 900, hardMax: null });
  });

  test('a note longer than the limit is clipped, not refused', () => {
    const parsed = parseWritingProfile(
      { notes: 'я'.repeat(600) },
      'telegram',
      'ru'
    );

    expect(parsed.notes).toHaveLength(501);
    expect(parsed.notes.endsWith('…')).toBe(true);
    expect(parseWritingProfile({ notes: 42 }, 'telegram', 'ru').notes).toBeNull();
    expect(parseWritingProfile({ notes: '   ' }, 'telegram', 'ru').notes).toBeNull();
  });

  test('a list where an object belongs is not a card', () => {
    expect(parseWritingProfile([1, 2, 3], 'telegram', 'ru')).toEqual(
      defaultWritingProfileFor('telegram', 'ru')
    );
    expect(resolveChannelWritingProfile([], 'telegram', 'ru').stored).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

const { TelegramProvider } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/social/telegram.provider.ts'
);

const { IntegrationService } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Inject: () => () => {},
      forwardRef: (fn) => fn,
      HttpException: class HttpException extends Error {
        constructor(response, status) {
          super(JSON.stringify(response));
          this.response = response;
          this.status = status;
        }
        getStatus() {
          return this.status;
        }
      },
      HttpStatus: { NOT_FOUND: 404, BAD_REQUEST: 400, UNPROCESSABLE_ENTITY: 422 },
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({}) },
    },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
    'nestjs-temporal-core': { TemporalService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository':
      { AutopostRepository: class {} },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
      { RefreshIntegrationService: class {} },
    '@contentfactory/nestjs-libraries/integrations/analytics.snapshot.service':
      { AnalyticsSnapshotService: class {} },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
  }
);

const telegram = new TelegramProvider();

const serviceFor = (row, saved = []) =>
  new IntegrationService(
    {
      getWritingProfile: async () => row,
      updateWritingProfile: async (org, id, profile) => {
        saved.push({ org, id, profile });
        return { ...row, writingProfile: profile };
      },
    },
    {},
    { getSocialIntegration: (identifier) => (identifier === 'telegram' ? telegram : null) },
    {},
    {},
    {},
    {}
  );

const channelRow = (writingProfile = null) => ({
  id: 'channel-1',
  name: 'Канал',
  providerIdentifier: 'telegram',
  contentLanguage: 'ru',
  writingProfile,
});

const cardBody = (overrides = {}) => ({
  lengthPolicy: 'range',
  length: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
  emojiLevel: 'none',
  linkPolicy: 'end',
  hashtagPolicy: 'none',
  ctaKind: 'question',
  formatPreference: 'auto',
  ...overrides,
});

describe('the card cannot promise more than the platform accepts', () => {
  test('the limits in the answer come from the provider, not from a column', async () => {
    const answer = await serviceFor(channelRow()).getWritingProfile(
      'org-1',
      'channel-1'
    );

    expect(answer.provider).toEqual({
      name: 'Telegram',
      maxLength: 4096,
      maxCaptionLength: 1024,
      editor: 'html',
    });
    expect(answer.stored).toBe(false);
    expect(answer.profile.lengthPolicy).toEqual({
      idealMin: 500,
      idealMax: 1000,
      hardMax: 1500,
    });
  });

  test('an ideal maximum above the provider limit is refused', async () => {
    await expect(
      serviceFor(channelRow()).updateWritingProfile(
        'org-1',
        'channel-1',
        cardBody({ length: { idealMin: 500, idealMax: 9000 } })
      )
    ).rejects.toMatchObject({
      response: { code: 'CHANNEL_WRITING_PROFILE_INVALID', reason: 'IDEAL_MAX_ABOVE_PROVIDER' },
      status: 422,
    });
  });

  test('a ceiling above the provider limit is refused too', async () => {
    await expect(
      serviceFor(channelRow()).updateWritingProfile(
        'org-1',
        'channel-1',
        cardBody({ length: { idealMin: 500, idealMax: 1000, hardMax: 5000 } })
      )
    ).rejects.toMatchObject({
      response: { reason: 'HARD_MAX_ABOVE_PROVIDER' },
    });
  });

  test('a post shorter than fifty characters is not a post', async () => {
    await expect(
      serviceFor(channelRow()).updateWritingProfile(
        'org-1',
        'channel-1',
        cardBody({ length: { idealMin: 10, idealMax: 400 } })
      )
    ).rejects.toMatchObject({
      response: { reason: 'IDEAL_MIN_TOO_SMALL' },
    });
  });

  test('a saved card is stored as the contract shape and reads back as stored', async () => {
    const saved = [];
    const answer = await serviceFor(channelRow(), saved).updateWritingProfile(
      'org-1',
      'channel-1',
      cardBody({ notes: '  Пиши без воды.  ' })
    );

    expect(saved[0].profile).toEqual({
      version: 'channel-writing-profile/v1',
      lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
      emojiLevel: 'none',
      linkPolicy: 'end',
      hashtagPolicy: 'none',
      ctaKind: 'question',
      formatPreference: 'auto',
      notes: 'Пиши без воды.',
      output: 'text',
    });
    expect(answer.stored).toBe(true);
  });

  test('deleting the card writes null, which is not an empty card', async () => {
    const saved = [];
    const answer = await serviceFor(channelRow(), saved).updateWritingProfile(
      'org-1',
      'channel-1',
      null
    );

    expect(saved[0].profile).toBeNull();
    expect(answer.stored).toBe(false);
    expect(answer.profile).toEqual(defaultWritingProfileFor('telegram', 'ru'));
  });

  test('a channel of another organization is not found', async () => {
    await expect(
      serviceFor(null).getWritingProfile('org-2', 'channel-1')
    ).rejects.toMatchObject({
      response: { code: 'INTEGRATION_NOT_FOUND' },
      status: 404,
    });
  });
});
