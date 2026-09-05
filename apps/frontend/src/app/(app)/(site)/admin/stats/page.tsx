export const dynamic = 'force-dynamic';
import { AdminStatsComponent } from '@contentfactory/frontend/components/admin/admin-stats.component';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { PageShell } from '@contentfactory/react/layout';

export const generateMetadata = pageTitle('statistics', 'Statistics');

export default async function Page() {
  return (
    <PageShell>
      <AdminStatsComponent />
    </PageShell>
  );
}
