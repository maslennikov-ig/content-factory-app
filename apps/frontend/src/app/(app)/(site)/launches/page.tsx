export const dynamic = 'force-dynamic';
import { LaunchesComponent } from '@contentfactory/frontend/components/launches/launches.component';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Calendar',
  description: '',
};
export default async function Index() {
  return <LaunchesComponent />;
}
