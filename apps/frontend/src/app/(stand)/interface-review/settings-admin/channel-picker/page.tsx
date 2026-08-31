import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '@contentfactory/frontend/components/interface-review/fixture-contract';
import {
  ChannelPickerReviewScene,
  channelPickerScene,
} from '@contentfactory/frontend/components/interface-review/settings-admin/channel-picker.scene';

export default async function ChannelPickerReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const context = resolveInterfaceReviewContext(
      await searchParams,
      channelPickerScene.states
    );
    return <ChannelPickerReviewScene context={context} />;
  } catch {
    return notFound();
  }
}
