import { LifetimeDeal } from '@contentfactory/frontend/components/billing/lifetime.deal';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Lifetime deal',
  description: '',
};
export default async function Page() {
  return <LifetimeDeal />;
}
