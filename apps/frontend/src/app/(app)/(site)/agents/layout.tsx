import { pageTitle } from '@contentfactory/frontend/app/page-title';

export const generateMetadata = pageTitle('agent', 'AI assistant');

/**
 * The authenticated workspace host owns the screen (`content-factory-next-jvrq`):
 * `/agents/new` → `/agents/<id>` must not remount the conversation whose
 * first answer is still streaming. The pages only give the address a shape.
 *
 * Any member may chat (`content-factory-next-kcxz.29`, D3; owner 27.09.2026):
 * the door offers a role only the actions it may take, so a Пользователь talks
 * to the agent and hears who can do the rest. The screen used to be replaced
 * by a refusal for everyone below Редактор (`fn33.90.6`), from before the chat
 * door filtered actions by role.
 */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
