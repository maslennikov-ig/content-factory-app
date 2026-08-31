import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '@contentfactory/frontend/components/interface-review/fixture-contract';
import {
  AdminUsersReviewScene,
  adminUsersScene,
} from '@contentfactory/frontend/components/interface-review/settings-admin/admin-users.scene';

export default async function AdminUsersReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const context = resolveInterfaceReviewContext(
      await searchParams,
      adminUsersScene.states
    );
    return <AdminUsersReviewScene context={context} />;
  } catch {
    return notFound();
  }
}
