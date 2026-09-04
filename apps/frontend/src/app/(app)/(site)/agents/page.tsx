import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { redirect } from 'next/navigation';

export const generateMetadata = pageTitle('agent', 'Agent');

export default async function Page() {
  return redirect('/agents/new');
}
