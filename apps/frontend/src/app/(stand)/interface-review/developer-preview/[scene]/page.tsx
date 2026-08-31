import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '../../../../../components/interface-review/fixture-contract';
import * as developer from '../../../../../components/interface-review/developer-preview/developer.scene';
import * as publicApi from '../../../../../components/interface-review/developer-preview/public-api.scene';
import * as preview from '../../../../../components/interface-review/developer-preview/preview.scene';
import * as extension from '../../../../../components/interface-review/developer-preview/extension.scene';
import * as oauthAuthorize from '../../../../../components/interface-review/developer-preview/oauth-authorize.scene';
import * as providerPreview from '../../../../../components/interface-review/developer-preview/provider-preview.scene';
import * as providerAdd from '../../../../../components/interface-review/developer-preview/provider-add.scene';

export const dynamic = 'force-dynamic';

const scenes = {
  developer,
  'public-api': publicApi,
  preview,
  extension,
  'oauth-authorize': oauthAuthorize,
  'provider-preview': providerPreview,
  'provider-add': providerAdd,
} as const;

type SceneName = keyof typeof scenes;
type ReviewQuery = Partial<
  Record<'state' | 'theme' | 'locale' | 'viewport', string | string[]>
>;

export default async function DeveloperPreviewReviewPage({
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
