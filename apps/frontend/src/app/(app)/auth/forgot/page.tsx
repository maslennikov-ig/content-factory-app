export const dynamic = 'force-dynamic';
import { Forgot } from '@contentfactory/frontend/components/auth/forgot';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
export const generateMetadata = pageTitle('forgot_password', 'Forgot password');
export default async function Auth() {
  return <Forgot />;
}
