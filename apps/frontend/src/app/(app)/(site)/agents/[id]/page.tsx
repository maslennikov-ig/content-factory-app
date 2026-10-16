import { pageTitle } from '@contentfactory/frontend/app/page-title';

export const generateMetadata = pageTitle('agent', 'AI assistant');

/** Drawn by the shared authenticated host; this page only names the conversation. */
export default async function Page(): Promise<null> {
  return null;
}
