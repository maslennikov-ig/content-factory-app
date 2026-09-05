export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { AfterActivate } from '@contentfactory/frontend/components/auth/after.activate';
export const generateMetadata = pageTitle('activate_your_account', 'Activate your account');
export default async function Auth() {
  return <AfterActivate />;
}
