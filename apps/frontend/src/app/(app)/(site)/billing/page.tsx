export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { BillingComponent } from '@contentfactory/frontend/components/billing/billing.component';
export const generateMetadata = pageTitle('billing', 'Billing');
export default async function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      <BillingComponent />
    </div>
  );
}
