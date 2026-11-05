const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

function renderTrend(percentageChange) {
  const { RenderAnalytics } = loadTypeScriptModule(
    'apps/frontend/src/components/platform-analytics/render.analytics.tsx',
    {
      react: {
        ...React,
        useState: () => [false, () => {}],
        useMemo: (fn) => fn(),
        useCallback: (fn) => fn,
      },
      swr: {
        __esModule: true,
        default: () => ({
          data: [
            {
              label: 'Views',
              percentageChange,
              data: [{ total: 10, date: '2026-10-01' }],
            },
          ],
        }),
      },
      '@contentfactory/helpers/utils/custom.fetch': {
        useFetch: () => () => {},
      },
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
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => ({ role: 'USER' }),
      },
      '@contentfactory/nestjs-libraries/user/organization.roles': {
        isOrganizationAdmin: () => false,
      },
    }
  );
  return renderToStaticMarkup(
    React.createElement(RenderAnalytics, {
      integration: { id: 'inert' },
      date: 7,
    })
  );
}

test.each([null, undefined, NaN, Infinity])(
  'unavailable trend %p does not render a numeric indicator',
  (value) => {
    const html = renderTrend(value);
    expect(html).toContain('Views');
    expect(html).not.toContain('%');
    expect(html).not.toContain('NaN');
  }
);

test('an observed finite trend is still displayed', () => {
  expect(renderTrend(20)).toContain('20.0%');
});
