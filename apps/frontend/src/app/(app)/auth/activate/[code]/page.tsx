export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AfterActivate } from '@contentfactory/frontend/components/auth/after.activate';
export const metadata: Metadata = {
  title: 'Activate your account',
  description: '',
};
export default async function Auth() {
  return <AfterActivate />;
}
