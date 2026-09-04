export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { LaunchesComponent } from '@contentfactory/frontend/components/launches/launches.component';
export const generateMetadata = pageTitle('calendar', 'Calendar');
export default async function Index() {
  return <LaunchesComponent />;
}
