import { ThirdPartyComponent } from '@contentfactory/frontend/components/third-parties/third-party.component';

export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Integrations',
  description: '',
};
export default async function Index() {
  return <ThirdPartyComponent />;
}
