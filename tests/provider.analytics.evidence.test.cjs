const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const BASE = 'libraries/nestjs-libraries/src/integrations/social/';
const decorator = () => () => {};
function provider(file, name, overrides = {}) {
  return new (loadTypeScriptModule(
    `${BASE}${file}.provider.ts`,
    {},
    {
      resolve(request) {
        if (request in overrides) return overrides[request];
        if (request.endsWith('/social.abstract'))
          return { SocialAbstract: class {}, BadBody: Error };
        if (request.endsWith('/linkedin.provider'))
          return { LinkedinProvider: class {} };
        if (request === 'sharp') return () => {};
        if (
          request.startsWith('@contentfactory/') &&
          !request.endsWith('/analytics.data')
        ) {
          return new Proxy(
            {},
            {
              get: (_, key) =>
                ['Rules', 'Plug', 'PostPlug', 'Tool'].includes(key)
                  ? decorator
                  : () => {},
            }
          );
        }
        return undefined;
      },
    }
  )[name])();
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
function responses(...bodies) {
  global.fetch = jest.fn();
  for (const body of bodies)
    global.fetch.mockResolvedValueOnce({ json: async () => body });
}

test('Instagram preserves available account metrics when another insights request is unavailable', async () => {
  responses(
    {
      data: [{ name: 'reach', values: [{ value: 0, end_time: '2026-10-01' }] }],
    },
    { error: { message: 'Unavailable metric' } }
  );
  const result = await provider('instagram', 'InstagramProvider').analytics(
    'inert',
    'inert',
    7
  );
  expect(result).toEqual([
    {
      label: 'Reach',
      percentageChange: null,
      data: [{ total: '0', date: '2026-10-01' }],
    },
  ]);
});

test('Facebook does not turn missing values or partial breakdowns into measured zeroes', async () => {
  responses({
    data: [
      {
        name: 'page_media_view',
        values: [
          { value: { organic: '2', paid: '3' }, end_time: '2026-10-01' },
          { value: null, end_time: '2026-10-02' },
          { value: { organic: 2, paid: null }, end_time: '2026-10-03' },
        ],
      },
    ],
  });
  const result = await provider('facebook', 'FacebookProvider').analytics(
    'inert',
    'inert',
    7
  );
  expect(result[0].data).toEqual([{ total: '5', date: '2026-10-01' }]);
  expect(result[0].percentageChange).toBeNull();
});

test('LinkedIn post statistics omit unavailable fields and preserve observed zero', async () => {
  responses(
    {
      elements: [
        {
          timeRange: { start: Date.UTC(2026, 9, 1) },
          totalShareStatistics: { impressionCount: 0, likeCount: 2 },
        },
      ],
    },
    {}
  );
  const result = await provider(
    'linkedin.page',
    'LinkedinPageProvider'
  ).postAnalytics('inert', 'inert', 'inert', 7);
  expect(
    result.map(({ label, data, percentageChange }) => ({
      label,
      data,
      percentageChange,
    }))
  ).toEqual([
    {
      label: 'Impressions',
      data: [{ total: '0', date: '2026-10-01' }],
      percentageChange: null,
    },
    {
      label: 'Likes',
      data: [{ total: '2', date: '2026-10-01' }],
      percentageChange: null,
    },
  ]);
});

test('LinkedIn social-actions error payload is not zero likes/comments', async () => {
  responses({ elements: [] }, { status: 403 });
  expect(
    await provider('linkedin.page', 'LinkedinPageProvider').postAnalytics(
      'inert',
      'inert',
      'inert',
      7
    )
  ).toEqual([]);
});

test('LinkedIn uses available social actions when returned statistics contain no measurements', async () => {
  responses(
    {
      elements: [
        {
          timeRange: { start: Date.UTC(2026, 9, 1) },
          totalShareStatistics: {},
        },
      ],
    },
    { likesSummary: { totalLikes: 3 } }
  );
  const result = await provider(
    'linkedin.page',
    'LinkedinPageProvider'
  ).postAnalytics('inert', 'inert', 'inert', 7);
  expect(result.map((metric) => metric.label)).toEqual(['Likes']);
  expect(result[0].data[0].total).toBe('3');
});

test('Pinterest does not require a click rate to return other available metrics', async () => {
  responses({
    all: {
      daily_metrics: [
        { date: '2026-10-01', metrics: { IMPRESSION: 5, SAVE: 0 } },
      ],
    },
  });
  const result = await provider('pinterest', 'PinterestProvider').analytics(
    'inert',
    'inert',
    7
  );
  expect(result).toEqual([
    {
      label: 'Impressions',
      percentageChange: null,
      data: [{ total: '5', date: '2026-10-01' }],
    },
    {
      label: 'Saves',
      percentageChange: null,
      data: [{ total: '0', date: '2026-10-01' }],
    },
  ]);
});

test('Threads returns supplied totals without invented growth or missing measurements', async () => {
  responses({
    data: [
      { name: 'likes', total_value: { value: 0 } },
      { name: 'replies', total_value: { value: null } },
    ],
  });
  const result = await provider('threads', 'ThreadsProvider').analytics(
    'inert',
    'inert',
    7
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ label: 'Likes', percentageChange: null });
  expect(result[0].data[0].total).toBe('0');
});

test('TikTok does not report complete recent totals from missing video statistics', async () => {
  responses(
    { data: { user: { follower_count: 0 } } },
    { data: { videos: [{ id: 'a' }, { id: 'b' }] } },
    {
      data: {
        videos: [
          { id: 'a', view_count: 8, like_count: 0 },
          { id: 'b', like_count: 2 },
        ],
      },
    }
  );
  const result = await provider('tiktok', 'TiktokProvider').analytics(
    'inert',
    'inert',
    7
  );
  expect(result.map((metric) => metric.label)).toEqual([
    'Followers',
    'Recent Likes',
  ]);
  expect(result[1].data[0].total).toBe('2');
  expect(result.every((metric) => metric.percentageChange === null)).toBe(true);
});

test('X returns one observed aggregate, with no synthetic zero baseline or partial metric totals', async () => {
  class TwitterApi {
    v2 = {
      tweets: async () => ({
        data: [
          { id: 'a', public_metrics: { impression_count: 8, like_count: 0 } },
          { id: 'b', public_metrics: { like_count: 2 } },
        ],
      }),
    };
  }
  const instance = provider('x', 'XProvider', {
    'twitter-api-v2': { TwitterApi },
  });
  instance.loadAllTweets = async () => [{ id: 'a' }, { id: 'b' }];
  const disabled = process.env.DISABLE_X_ANALYTICS;
  delete process.env.DISABLE_X_ANALYTICS;
  try {
    const result = await instance.analytics('inert', 'inert:inert', 7);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: 'LIKE', percentageChange: null });
    expect(result[0].data).toHaveLength(1);
    expect(result[0].data[0].total).toBe('2');
  } finally {
    if (disabled !== undefined) process.env.DISABLE_X_ANALYTICS = disabled;
  }
});

test('YouTube omits the deprecated favoriteCount placeholder', async () => {
  const google = {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    youtube: () => ({
      videos: {
        list: async () => ({
          data: {
            items: [{ statistics: { viewCount: '0', favoriteCount: '0' } }],
          },
        }),
      },
    }),
  };
  const result = await provider('youtube', 'YoutubeProvider', {
    '@contentfactory/nestjs-libraries/integrations/social/google.sdk': {
      loadGoogleApis: async () => ({ google }),
    },
  }).postAnalytics('inert', 'inert', 'inert', 7);
  expect(result.map((metric) => metric.label)).toEqual(['Views']);
  expect(result[0].data[0].total).toBe('0');
  expect(result[0].percentageChange).toBeNull();
});

test('YouTube preserves observed report rows and omits unavailable columns', async () => {
  const google = {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    youtubeAnalytics: () => ({
      reports: {
        query: async () => ({
          data: {
            columnHeaders: [{ name: 'day' }, { name: 'likes' }],
            rows: [
              ['2026-10-01', 0],
              ['2026-10-02', null],
            ],
          },
        }),
      },
    }),
  };
  const result = await provider('youtube', 'YoutubeProvider', {
    '@contentfactory/nestjs-libraries/integrations/social/google.sdk': {
      loadGoogleApis: async () => ({ google }),
    },
  }).analytics('inert', 'inert', 7);
  expect(result).toEqual([
    {
      label: 'Likes',
      percentageChange: null,
      data: [{ total: '0', date: '2026-10-01' }],
    },
  ]);
});

test('Google Business preserves the documented omitted-value-means-zero response', async () => {
  responses({
    multiDailyMetricTimeSeries: [
      {
        dailyMetricTimeSeries: [
          {
            dailyMetric: 'WEBSITE_CLICKS',
            timeSeries: {
              datedValues: [{ date: { year: 2026, month: 10, day: 1 } }],
            },
          },
        ],
      },
    ],
  });
  const result = await provider('gmb', 'GmbProvider').analytics(
    'accounts/inert/locations/inert',
    'inert',
    7
  );
  expect(Number(result[0].data[0].total)).toBe(0);
  expect(result[0].percentageChange).toBeNull();
});

test('null, blank and nonfinite measurements are excluded, but genuine zero remains', () => {
  const { normalizeAnalytics } = loadTypeScriptModule(
    `${BASE}analytics.data.ts`
  );
  const result = normalizeAnalytics([
    {
      label: 'Views',
      data: [null, '', undefined, NaN, Infinity, false, 0].map((total) => ({
        total,
        date: '2026-10-01',
      })),
    },
  ]);
  expect(result).toEqual([
    {
      label: 'Views',
      data: [{ total: '0', date: '2026-10-01' }],
      percentageChange: null,
    },
  ]);
});

test('YouTube owns mapping a prepared cover to its native thumbnail metadata',()=>{
 const youtube=provider('youtube','YoutubeProvider');
 expect(youtube.nativeEditorialSettings([{mediaId:'video',kind:'video',role:'final',url:'/final.mp4'},{mediaId:'cover',kind:'image',role:'cover',url:'/cover.png'}])).toEqual({thumbnail:{id:'cover',path:'/cover.png'}});
 expect(youtube.nativeEditorialSettings([{mediaId:'image',kind:'image',role:'slide',url:'/slide.png'}])).toEqual({});
});
