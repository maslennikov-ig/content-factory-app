import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { Plugs } from '@contentfactory/frontend/components/plugs/plugs';
export const dynamic = 'force-dynamic';
export const generateMetadata = pageTitle('plugs', 'Plugs');
export default async function Index() {
  return <Plugs />;
}
