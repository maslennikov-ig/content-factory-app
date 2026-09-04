import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { ThirdPartyComponent } from '@contentfactory/frontend/components/third-parties/third-party.component';

export const dynamic = 'force-dynamic';
export const generateMetadata = pageTitle('integrations', 'Integrations');
export default async function Index() {
  return <ThirdPartyComponent />;
}
