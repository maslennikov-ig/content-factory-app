import {
  defineInterfaceReviewScene,
  InterfaceReviewFrame,
  type InterfaceReviewContext,
} from '../fixture-contract';
import { ProductionAnalyticsView } from '../../platform-analytics/production.analytics.view';

export const scene = defineInterfaceReviewScene({
  id: 'analytics-billing/production',
  states: ['loading', 'empty', 'default', 'selected', 'error', 'long-content'],
  fixture: {
    filters: { days: 30, channelName: 'Synthetic editorial channel' },
    summary: {
      publishedVolume: 12,
      failureCount: 2,
      failureRate: 14.3,
      averageLeadTimeHours: 6.5,
    },
    originMix: [
      { origin: 'Editor', count: 8, percentage: 57.1 },
      { origin: 'Autopost', count: 4, percentage: 28.6 },
      { origin: 'API', count: 2, percentage: 14.3 },
    ],
    failureReasons: [{ reason: 'Synthetic provider timeout', count: 2 }],
    exclusions: {
      success: 'Read-only local computation has no success transition.',
      restricted:
        'The endpoint has organization context but no surface-specific access gate.',
      disabled: 'The read-only report has no action that can be disabled.',
    },
  },
});

export function Scene({ context }: { context: InterfaceReviewContext }) {
  const empty = context.state === 'empty';
  return (
    <InterfaceReviewFrame scene={scene} context={context}>
      <ProductionAnalyticsView
        state={
          context.state as
            | 'loading'
            | 'empty'
            | 'default'
            | 'selected'
            | 'error'
            | 'long-content'
        }
        locale={context.locale}
        model={{
          days: scene.fixture.filters.days,
          channelName: scene.fixture.filters.channelName,
          summary: empty
            ? {
                publishedVolume: 0,
                failureCount: 0,
                failureRate: 0,
                averageLeadTimeHours: 0,
              }
            : scene.fixture.summary,
          originMix: empty ? [] : scene.fixture.originMix,
          failureReasons: empty ? [] : scene.fixture.failureReasons,
        }}
      />
    </InterfaceReviewFrame>
  );
}
