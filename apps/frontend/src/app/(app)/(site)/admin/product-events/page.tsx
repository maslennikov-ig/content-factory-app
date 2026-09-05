export const dynamic = 'force-dynamic';

import { AdminProductEventsComponent } from '@contentfactory/frontend/components/admin/admin-product-events.component';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { PageShell } from '@contentfactory/react/layout';

export const generateMetadata = pageTitle('product_events_title', 'Product events');

export default function Page() {
  return (
    <PageShell>
      <AdminProductEventsComponent />
    </PageShell>
  );
}
