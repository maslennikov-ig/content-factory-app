import { pageTitle } from '@contentfactory/frontend/app/page-title';

export const generateMetadata = pageTitle('agent', 'AI assistant');

export default async function Page(): Promise<null> {
  return null;
}
