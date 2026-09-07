export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { HelpScreen } from '@contentfactory/frontend/components/help/help.screen';

export const generateMetadata = pageTitle('help', 'Help');

export default async function Page() {
  return <HelpScreen />;
}
