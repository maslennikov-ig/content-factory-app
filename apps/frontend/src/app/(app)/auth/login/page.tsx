export const dynamic = 'force-dynamic';
import { Login } from '@contentfactory/frontend/components/auth/login';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Log in',
  description: '',
};
export default async function Auth() {
  return <Login />;
}
