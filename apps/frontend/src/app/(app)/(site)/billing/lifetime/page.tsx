import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { LifetimeDeal } from '@contentfactory/frontend/components/billing/lifetime.deal';
export const dynamic = 'force-dynamic';
export const generateMetadata = pageTitle('lifetime_deal', 'Lifetime deal');
export default async function Page() {
  return <LifetimeDeal />;
}
