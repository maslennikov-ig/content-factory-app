'use client';

import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../fixture-contract';
import {
  AdminStatsView,
  type AdminStatsResponse,
} from '../../admin/admin-stats.component';

export const adminStatsScene = defineInterfaceReviewScene({
  id: 'settings-admin/stats',
  fixture: {
    from: '2026-08-01',
    to: '2026-08-20',
    provider: 'mastodon.synthetic',
    longProvider:
      'independently-operated-federated-publishing-destination.synthetic',
    longRussianProvider:
      'Независимая федеративная редакционная площадка синтетического пространства',
  },
  states: [
    'loading',
    'empty',
    'default',
    'selected',
    'error',
    'restricted',
    'disabled',
    'long-content',
  ] as const satisfies readonly InterfaceReviewState[],
});

export const adminStatsExclusions = Object.freeze({
  success:
    'Admin statistics are read-only; applying a range performs no successful mutation.',
});

export function AdminStatsReviewScene({
  context,
}: {
  context: InterfaceReviewContext;
}) {
  const empty = context.state === 'empty';
  const provider =
    context.state === 'long-content'
      ? context.locale === 'ru'
        ? adminStatsScene.fixture.longRussianProvider
        : adminStatsScene.fixture.longProvider
      : adminStatsScene.fixture.provider;
  const data: AdminStatsResponse = {
    from: adminStatsScene.fixture.from,
    to: adminStatsScene.fixture.to,
    posts: {
      total: empty ? 0 : 18,
      perSocial: empty ? [] : [{ provider, count: 18 }],
    },
    connected: {
      total: empty ? 0 : 4,
      perSocial: empty ? [] : [{ provider, count: 4 }],
    },
    errors: {
      total: empty ? 0 : 2,
      perSocial: empty ? [] : [{ provider, count: 2 }],
    },
  };
  const disabled = context.state === 'disabled';

  return (
    <InterfaceReviewFrame scene={adminStatsScene} context={context}>
      <AdminStatsView
        allowed={context.state !== 'restricted'}
        fromInput={disabled ? '2026-08-21' : adminStatsScene.fixture.from}
        toInput={adminStatsScene.fixture.to}
        today={adminStatsScene.fixture.to}
        presets={[
          {
            label: 'Selected period',
            from: adminStatsScene.fixture.from,
            to: adminStatsScene.fixture.to,
          },
        ]}
        activePreset={context.state === 'selected' ? 'Selected period' : null}
        unknownOnly={false}
        data={
          context.state === 'loading' || context.state === 'error'
            ? undefined
            : data
        }
        loading={context.state === 'loading'}
        error={
          context.state === 'error' ? 'Failed to load statistics.' : undefined
        }
        onFromChange={() => undefined}
        onToChange={() => undefined}
        onApply={() => undefined}
        onPresetChange={() => undefined}
        onUnknownOnlyChange={() => undefined}
        onRetry={() => undefined}
      />
    </InterfaceReviewFrame>
  );
}
