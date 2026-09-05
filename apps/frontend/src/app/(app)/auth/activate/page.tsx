export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { Activate } from '@contentfactory/frontend/components/auth/activate';
export const generateMetadata = pageTitle('activate_your_account', 'Activate your account');
export default async function Auth() {
  return <Activate />;
}
