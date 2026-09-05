export const dynamic = 'force-dynamic';
import { AdminErrorsComponent } from '@contentfactory/frontend/components/admin/admin-errors.component';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { PageShell } from '@contentfactory/react/layout';

export const generateMetadata = pageTitle('admin_errors', 'Admin errors');

export default async function Page() {
  return (
    <PageShell>
      <AdminErrorsComponent />
    </PageShell>
  );
}
