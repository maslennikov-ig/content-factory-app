export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { PendingApproval } from '@contentfactory/frontend/components/auth/pending.approval';

export const metadata: Metadata = {
  title: 'Waiting for approval',
  description: '',
};

export default async function Auth() {
  return <PendingApproval />;
}
