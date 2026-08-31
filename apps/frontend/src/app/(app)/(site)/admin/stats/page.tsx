export const dynamic = 'force-dynamic';
import { AdminStatsComponent } from '@contentfactory/frontend/components/admin/admin-stats.component';
import { PageShell } from '@contentfactory/react/layout';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin stats',
  description: '',
};

export default async function Page() {
  return (
    <PageShell>
      <AdminStatsComponent />
    </PageShell>
  );
}
