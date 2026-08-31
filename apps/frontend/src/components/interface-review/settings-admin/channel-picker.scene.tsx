'use client';

import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../fixture-contract';
import {
  PicksSocialsView,
  type ChannelPickerIntegration,
} from '../../new-launch/picks.socials.component';

export const channelPickerScene = defineInterfaceReviewScene({
  id: 'settings-admin/channel-picker',
  fixture: {
    channels: [
      {
        id: 'synthetic-mastodon',
        name: 'Mastodon editorial',
        identifier: 'mastodon',
        picture: '',
        disabled: false,
        inBetweenSteps: false,
      },
      {
        id: 'synthetic-devto',
        name: 'Dev.to engineering',
        identifier: 'devto',
        picture: '',
        disabled: false,
        inBetweenSteps: false,
      },
      {
        id: 'synthetic-listmonk',
        name: 'Listmonk newsletter',
        identifier: 'listmonk',
        picture: '',
        disabled: false,
        inBetweenSteps: false,
      },
      {
        id: 'synthetic-youtube',
        name: 'YouTube studio',
        identifier: 'youtube',
        picture: '',
        disabled: false,
        inBetweenSteps: false,
      },
    ],
    longName:
      'A very long localized channel name that must remain available at narrow widths',
    longRussianName:
      'Очень длинное локализованное название редакционного канала для узкого экрана',
  },
  states: [
    'empty',
    'default',
    'selected',
    'restricted',
    'disabled',
    'long-content',
  ] as const satisfies readonly InterfaceReviewState[],
});

export const channelPickerExclusions = Object.freeze({
  loading:
    'The parent launch manager owns integration loading before this synchronous picker renders.',
  success:
    'Selecting a channel only changes the local draft; the parent publishing flow owns success.',
  error:
    'The parent launch manager owns recoverable integration-load errors and retry behavior.',
});

export function ChannelPickerReviewScene({
  context,
}: {
  context: InterfaceReviewContext;
}) {
  const channels = (
    context.state === 'empty' ? [] : channelPickerScene.fixture.channels
  ).map((channel, index) => ({
    ...channel,
    name:
      context.state === 'long-content' && index === 0
        ? context.locale === 'ru'
          ? channelPickerScene.fixture.longRussianName
          : channelPickerScene.fixture.longName
        : channel.name,
  })) as ChannelPickerIntegration[];

  return (
    <InterfaceReviewFrame scene={channelPickerScene} context={context}>
      <PicksSocialsView
        integrations={channels}
        selectedIds={context.state === 'selected' ? ['synthetic-mastodon'] : []}
        locked={context.state === 'restricted'}
        fixedIntegrationId={
          context.state === 'disabled' ? 'synthetic-mastodon' : undefined
        }
        restrictionMessage="Channel selection is locked in this synthetic editing state."
        liveProviderConnection={false}
        onToggle={() => undefined}
      />
    </InterfaceReviewFrame>
  );
}
