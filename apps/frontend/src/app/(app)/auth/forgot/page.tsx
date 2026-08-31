export const dynamic = 'force-dynamic';
import { Forgot } from '@contentfactory/frontend/components/auth/forgot';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Forgot password',
  description: '',
};
export default async function Auth() {
  return <Forgot />;
}
