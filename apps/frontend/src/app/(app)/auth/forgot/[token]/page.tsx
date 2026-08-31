export const dynamic = 'force-dynamic';
import { ForgotReturn } from '@contentfactory/frontend/components/auth/forgot-return';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Reset password',
  description: '',
};
export default async function Auth(params: {
  params: Promise<{
    token: string;
  }>;
}) {
  return <ForgotReturn token={(await params.params).token} />;
}
