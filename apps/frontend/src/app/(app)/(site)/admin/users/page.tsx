export const dynamic = 'force-dynamic';
import { AdminUsersComponent } from '@contentfactory/frontend/components/admin/admin-users.component';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { PageShell } from '@contentfactory/react/layout';

export const generateMetadata = pageTitle('accounts', 'Accounts');

export default async function Page() {
  return (
    <PageShell>
      <AdminUsersComponent />
    </PageShell>
  );
}
