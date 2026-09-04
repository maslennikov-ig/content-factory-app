export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { AnalyticsScreen } from '@contentfactory/frontend/components/platform-analytics/analytics.screen';
export const generateMetadata = pageTitle('analytics', 'Analytics');
export default async function Index() {
  return <AnalyticsScreen />;
}
