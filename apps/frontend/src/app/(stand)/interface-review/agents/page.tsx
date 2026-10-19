import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '../../../../components/interface-review/fixture-contract';
import { Scene, scene } from '../../../../components/agents/agent.chats.review-scene';
export const dynamic = 'force-dynamic';
export default async function AgentChatsReview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let context;
  try { context = resolveInterfaceReviewContext(await searchParams, scene.states); } catch { notFound(); }
  return <Scene context={context} />;
}
