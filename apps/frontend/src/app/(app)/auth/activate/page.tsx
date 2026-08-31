export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { Activate } from '@contentfactory/frontend/components/auth/activate';
export const metadata: Metadata = {
  title: 'Activate your account',
  description: '',
};
export default async function Auth() {
  return <Activate />;
}
