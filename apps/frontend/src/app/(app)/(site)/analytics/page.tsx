export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AnalyticsScreen } from '@contentfactory/frontend/components/platform-analytics/analytics.screen';
export const metadata: Metadata = {
  title: 'Analytics',
  description: '',
};
export default async function Index() {
  return <AnalyticsScreen />;
}
