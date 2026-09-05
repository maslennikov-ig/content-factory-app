export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { PendingApproval } from '@contentfactory/frontend/components/auth/pending.approval';

export const generateMetadata = pageTitle('registration_received', 'Registration received');

export default async function Auth() {
  return <PendingApproval />;
}
