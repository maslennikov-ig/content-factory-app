import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '../../../../../components/interface-review/fixture-contract';
import * as production from '../../../../../components/interface-review/analytics-billing/production-analytics.scene';
import * as audience from '../../../../../components/interface-review/analytics-billing/audience-analytics.scene';
import * as billingFirstUse from '../../../../../components/interface-review/analytics-billing/billing-first-use.scene';
import * as billingManage from '../../../../../components/interface-review/analytics-billing/billing-manage.scene';

export const dynamic = 'force-dynamic';

const scenes = {
  production,
  audience,
  'billing-first-use': billingFirstUse,
  'billing-manage': billingManage,
} as const;

type SceneName = keyof typeof scenes;
type ReviewQuery = Partial<
  Record<'state' | 'theme' | 'locale' | 'viewport', string | string[]>
>;

export default async function AnalyticsBillingReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ scene: string }>;
  searchParams: Promise<ReviewQuery>;
}) {
  const { scene: requestedScene } = await params;
  const selected = scenes[requestedScene as SceneName];
  if (!selected) notFound();

  let context;
  try {
    context = resolveInterfaceReviewContext(
      await searchParams,
      selected.scene.states
    );
  } catch {
    notFound();
  }

  const Scene = selected.Scene;
  return <Scene context={context} />;
}
