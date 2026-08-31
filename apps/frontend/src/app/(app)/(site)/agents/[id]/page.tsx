import { Metadata } from 'next';
import { Agent } from '@contentfactory/frontend/components/agents/agent';
import { AgentChat } from '@contentfactory/frontend/components/agents/agent.chat';
export const metadata: Metadata = {
  title: 'Agent',
  description: '',
};
export default async function Page() {
  return (
    <AgentChat />
  );
}
