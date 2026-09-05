export const dynamic = 'force-dynamic';
import { Login } from '@contentfactory/frontend/components/auth/login';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
export const generateMetadata = pageTitle('sign_in', 'Sign In');
export default async function Auth() {
  return <Login />;
}
