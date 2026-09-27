import { pageTitle } from '@contentfactory/frontend/app/page-title';

export const generateMetadata = pageTitle('agent', 'Agent');

/** Drawn by `agents/layout.tsx`; the page only names the conversation. */
export default async function Page(): Promise<null> {
  return null;
}
