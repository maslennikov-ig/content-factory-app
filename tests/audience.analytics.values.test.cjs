const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadTypeScriptModule: loadView } = require('./helpers/load-tsx.cjs');

const { audienceMetricValue, audienceMetricAggregation } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/audience-analytics.rules.ts'
);
const points = (values) =>
  values.map((total, index) => ({ total, date: `2026-10-0${index + 1}` }));

test.each([
  'Subscribers',
  'Followers',
  'Following',
  'Total Likes',
  'Videos',
  'Recent Views',
  'Recent Likes',
  'Recent Comments',
  'Recent Shares',
])(
  '%s uses the latest observed count instead of summing snapshots',
  (label) => {
    expect(
      audienceMetricValue({ label, data: points(['100', '120']).reverse() })
    ).toBe(120);
  }
);

test.each([
  'Organic Followers',
  'Paid Followers',
  'Subscribers Gained',
  'Subscribers Lost',
  'Website Clicks',
  'Likes',
])('%s remains an additive daily metric', (label) => {
  expect(audienceMetricValue({ label, data: points([10, 20]) })).toBe(30);
});

test.each([
  'Subscribers',
  'Followers',
  'Subscribers Gained',
  'Average View Duration',
])('an empty %s series is unavailable, not zero', (label) => {
  expect(
    audienceMetricValue({
      label,
      data: [],
      average: label === 'Average View Duration',
    })
  ).toBeNull();
});

test('the latest valid dated stock can decrease or reach zero', () => {
  expect(
    audienceMetricValue({
      label: 'Subscribers',
      data: points([120, 0, null, '']),
    })
  ).toBe(0);
  expect(
    audienceMetricValue({
      label: 'Subscribers',
      data: [{ total: 120, date: 'Invalid Date' }],
    })
  ).toBeNull();
  expect(
    audienceMetricValue({
      label: 'Likes',
      data: points([null, '', false, Infinity]),
    })
  ).toBeNull();
});

test('average is an aggregation rule, with no inferred percentage unit', () => {
  expect(
    audienceMetricValue({
      label: 'Average View Duration',
      average: true,
      data: points([120, 180]),
    })
  ).toBe(150);
  expect(
    audienceMetricValue({
      label: 'Average View Percentage',
      average: true,
      data: points([40, 60]),
    })
  ).toBe('50.00%');
});

test('chart buckets use the same stock, flow and average aggregation as their cards', () => {
  const { mergeDataPoints } = loadTypeScriptModule(
    'apps/frontend/src/components/analytics/chart-social.tsx',
    {
      'chart.js/auto': { __esModule: true, default: class {} },
      'react-use-cookie': { __esModule: true, default: () => ['dark'] },
    }
  );
  const data = points(['100', '120', '130', '140']);
  expect(
    mergeDataPoints(
      data,
      2,
      audienceMetricAggregation({ label: 'Subscribers' })
    ).map((point) => point.total)
  ).toEqual([120, 140]);
  expect(
    mergeDataPoints(data, 2, audienceMetricAggregation({ label: 'Likes' })).map(
      (point) => point.total
    )
  ).toEqual([220, 270]);
  expect(
    mergeDataPoints(
      data,
      2,
      audienceMetricAggregation({
        label: 'Average View Duration',
        average: true,
      })
    ).map((point) => point.total)
  ).toEqual([110, 135]);
  expect(mergeDataPoints([], 7)).toEqual([]);
});

test('stock and unit cases are tied to actual Telegram, TikTok and YouTube provider labels', () => {
  const providerSource = (name) =>
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        `libraries/nestjs-libraries/src/integrations/social/${name}.provider.ts`
      ),
      'utf8'
    );
  expect(providerSource('telegram')).toContain("label: 'Subscribers'");
  expect(providerSource('tiktok')).toContain("label: 'Followers'");
  expect(providerSource('youtube')).toMatch(
    /label: 'Average View Duration',\s+average: true/
  );
  expect(providerSource('youtube')).toMatch(
    /label: 'Average View Percentage',\s+average: true/
  );
});

test('the current audience view renders the latest count and an explicit missing value', () => {
  const { AudienceAnalyticsView } = loadView(
    'apps/frontend/src/components/platform-analytics/audience.analytics.view.tsx'
  );
  const html = renderToStaticMarkup(
    React.createElement(AudienceAnalyticsView, {
      state: 'default',
      locale: 'en',
      selectedChannelId: 'inert',
      channels: [{ id: 'inert', name: 'Channel', identifier: 'telegram' }],
      metrics: [
        { label: 'Subscribers', data: points([100, 120]) },
        { label: 'Followers', data: [] },
      ],
    })
  );
  expect(html).toContain('>120</p>');
  expect(html).not.toContain('>220</p>');
  expect(html).toContain('>—</p>');
});

function renderLegacy(file, exportName, metrics) {
  const passthrough = ({ children }) =>
    React.createElement('div', null, children);
  const mod = loadTypeScriptModule(file, {
    react: {
      ...React,
      useState: (initial) => [initial === true ? false : initial, () => {}],
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
    },
    swr: {
      __esModule: true,
      default: (key) => ({
        data: key.startsWith('/posts/') ? { clicks: [] } : metrics,
        isLoading: false,
      }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
    '@contentfactory/frontend/components/analytics/chart-social': {
      ChartSocial: () => null,
    },
    '@contentfactory/frontend/components/layout/loading': {
      LoadingComponent: () => null,
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_, fallback) => fallback,
    },
    '@contentfactory/react/form/button': { Button: () => null },
    '@contentfactory/react/form/select': { Select: () => null },
    '@contentfactory/frontend/components/launches/missing-release.modal': {
      MissingReleaseModal: () => null,
    },
    '@contentfactory/frontend/components/launches/statistics.empty.state':
      loadTypeScriptModule(
        'apps/frontend/src/components/launches/statistics.empty.state.ts'
      ),
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role: 'USER' }),
    },
    '@contentfactory/nestjs-libraries/user/organization.roles': {
      isOrganizationAdmin: () => false,
    },
    '@contentfactory/frontend/components/ui/surface': {
      EmptyState: () => null,
      RestrictedState: () => null,
      SkeletonRows: () => null,
    },
    '@contentfactory/frontend/components/ui/table': Object.fromEntries(
      ['Section', 'Table', 'Td', 'Th', 'Tr'].map((name) => [name, passthrough])
    ),
  });
  return renderToStaticMarkup(
    React.createElement(mod[exportName], {
      integration: { id: 'inert' },
      date: 7,
      postId: 'inert',
    })
  );
}

test.each([
  [
    'apps/frontend/src/components/platform-analytics/render.analytics.tsx',
    'RenderAnalytics',
  ],
  ['apps/frontend/src/components/launches/statistics.tsx', 'StatisticsModal'],
])(
  'existing %s totals use shared stock and unit semantics',
  (file, exportName) => {
    const html = renderLegacy(file, exportName, [
      {
        label: 'Subscribers',
        data: points([100, 120]),
        percentageChange: null,
      },
      {
        label: 'Average View Duration',
        data: points([120, 180]),
        average: true,
        percentageChange: null,
      },
      {
        label: 'Average View Percentage',
        data: points([40, 60]),
        average: true,
        percentageChange: null,
      },
      { label: 'Followers', data: [], percentageChange: null },
    ]);
    expect(html).toContain('>120</div>');
    expect(html).not.toContain('>220</div>');
    expect(html).toContain('>150</div>');
    expect(html).not.toContain('150.00%');
    expect(html).toContain('>50.00%</div>');
    expect(html).toContain('>—</div>');
  }
);
