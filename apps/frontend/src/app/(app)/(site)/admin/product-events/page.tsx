export const dynamic = 'force-dynamic';

import { AdminProductEventsComponent } from '@contentfactory/frontend/components/admin/admin-product-events.component';
import { PageShell } from '@contentfactory/react/layout';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Product events',
  description: '',
};

export default function Page() {
  return (
    <PageShell>
      <AdminProductEventsComponent />
    </PageShell>
  );
}
