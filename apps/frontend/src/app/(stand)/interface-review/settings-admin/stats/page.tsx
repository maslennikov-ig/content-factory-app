import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '@contentfactory/frontend/components/interface-review/fixture-contract';
import {
  AdminStatsReviewScene,
  adminStatsScene,
} from '@contentfactory/frontend/components/interface-review/settings-admin/admin-stats.scene';

export default async function AdminStatsReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const context = resolveInterfaceReviewContext(
      await searchParams,
      adminStatsScene.states
    );
    return <AdminStatsReviewScene context={context} />;
  } catch {
    return notFound();
  }
}
