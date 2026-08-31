export const dynamic = 'force-dynamic';
import { BillingComponent } from '@contentfactory/frontend/components/billing/billing.component';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Billing',
  description: '',
};
export default async function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      <BillingComponent />
    </div>
  );
}
