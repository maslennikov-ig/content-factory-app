import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '@contentfactory/frontend/components/interface-review/fixture-contract';
import {
  SettingsReviewScene,
  settingsScene,
} from '@contentfactory/frontend/components/interface-review/settings-admin/settings.scene';

export default async function SettingsReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const context = resolveInterfaceReviewContext(
      await searchParams,
      settingsScene.states
    );
    return <SettingsReviewScene context={context} />;
  } catch {
    return notFound();
  }
}
