export const dynamic = 'force-dynamic';
import { AdminUsersComponent } from '@contentfactory/frontend/components/admin/admin-users.component';
import { PageShell } from '@contentfactory/react/layout';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin accounts',
  description: '',
};

export default async function Page() {
  return (
    <PageShell>
      <AdminUsersComponent />
    </PageShell>
  );
}
