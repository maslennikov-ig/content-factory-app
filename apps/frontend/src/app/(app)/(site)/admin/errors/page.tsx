export const dynamic = 'force-dynamic';
import { AdminErrorsComponent } from '@contentfactory/frontend/components/admin/admin-errors.component';
import { PageShell } from '@contentfactory/react/layout';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin errors',
  description: '',
};

export default async function Page() {
  return (
    <PageShell>
      <AdminErrorsComponent />
    </PageShell>
  );
}
