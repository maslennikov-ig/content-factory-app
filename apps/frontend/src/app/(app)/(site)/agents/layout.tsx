import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { Agent } from '@contentfactory/frontend/components/agents/agent';
export const generateMetadata = pageTitle('agent', 'Agent');
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Agent>{children}</Agent>;
}
