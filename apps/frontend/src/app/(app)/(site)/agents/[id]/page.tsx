import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { Agent } from '@contentfactory/frontend/components/agents/agent';
import { AgentChat } from '@contentfactory/frontend/components/agents/agent.chat';
export const generateMetadata = pageTitle('agent', 'Agent');
export default async function Page() {
  return (
    <AgentChat />
  );
}
