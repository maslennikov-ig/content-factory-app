import { LayoutComponent } from '@contentfactory/frontend/components/new-layout/layout.component';
import { AssistantWorkspaceHost } from '@contentfactory/frontend/components/agents/assistant.workspace-context';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LayoutComponent><AssistantWorkspaceHost>{children}</AssistantWorkspaceHost></LayoutComponent>;
}
