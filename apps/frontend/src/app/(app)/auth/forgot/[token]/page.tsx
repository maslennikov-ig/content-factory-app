export const dynamic = 'force-dynamic';
import { ForgotReturn } from '@contentfactory/frontend/components/auth/forgot-return';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
export const generateMetadata = pageTitle('forgot_password', 'Forgot password');
export default async function Auth(params: {
  params: Promise<{
    token: string;
  }>;
}) {
  return <ForgotReturn token={(await params.params).token} />;
}
