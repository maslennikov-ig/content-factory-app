import { notFound } from 'next/navigation';
import { resolveInterfaceReviewContext } from '../../../../../components/interface-review/fixture-contract';
import {
  ImageEditorReviewScene,
  scene,
} from '../../../../../components/media/image-editor/image-editor.review-scene';

export const dynamic = 'force-dynamic';

export default async function ImageEditorReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ scene: string }>;
  searchParams: Promise<
    Partial<
      Record<'state' | 'theme' | 'locale' | 'viewport', string | string[]>
    >
  >;
}) {
  const { scene: requested } = await params;
  if (requested !== 'editor') notFound();
  let context;
  try {
    context = resolveInterfaceReviewContext(await searchParams, scene.states);
  } catch {
    notFound();
  }
  return <ImageEditorReviewScene context={context} />;
}
