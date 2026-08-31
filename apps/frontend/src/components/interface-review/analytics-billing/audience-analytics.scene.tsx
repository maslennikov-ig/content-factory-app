import {
  defineInterfaceReviewScene,
  InterfaceReviewFrame,
  type InterfaceReviewContext,
} from '../fixture-contract';
import { AudienceAnalyticsView } from '../../platform-analytics/audience.analytics.view';

export const scene = defineInterfaceReviewScene({
  id: 'analytics-billing/audience',
  states: [
    'loading',
    'empty',
    'default',
    'selected',
    'error',
    'disabled',
    'long-content',
  ],
  fixture: {
    channels: [
      {
        id: 'channel-synthetic-1',
        name: 'Synthetic newsroom',
        identifier: 'linkedin-page',
        disabled: false,
      },
      {
        id: 'channel-synthetic-2',
        name: 'Synthetic archive',
        identifier: 'telegram',
        disabled: true,
      },
    ],
    metrics: [
      {
        label: 'Audience growth',
        data: [
          { total: 21, date: '2026-08-18' },
          { total: 27, date: '2026-08-19' },
        ],
        average: false,
        percentageChange: 0,
      },
    ],
    exclusions: {
      success: 'Provider metrics are read-only and have no success transition.',
      restricted:
        'The endpoint has no surface-specific permission or billing gate.',
    },
  },
});

export function Scene({ context }: { context: InterfaceReviewContext }) {
  const disabled = context.state === 'disabled';
  return (
    <InterfaceReviewFrame scene={scene} context={context}>
      <AudienceAnalyticsView
        state={
          context.state as
            | 'loading'
            | 'empty'
            | 'default'
            | 'selected'
            | 'error'
            | 'disabled'
            | 'long-content'
        }
        locale={context.locale}
        channels={scene.fixture.channels}
        selectedChannelId={
          disabled ? scene.fixture.channels[1].id : scene.fixture.channels[0].id
        }
        metrics={context.state === 'empty' ? null : scene.fixture.metrics}
      />
    </InterfaceReviewFrame>
  );
}
