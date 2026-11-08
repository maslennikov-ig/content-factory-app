import { pageTitle } from '@contentfactory/frontend/app/page-title';
export const dynamic = 'force-dynamic';
import { getT } from '@contentfactory/react/translation/get.translation.service.backend';
import { PreviewReviewPageV1 } from '@contentfactory/frontend/components/preview/preview.review.page';

export const generateMetadata = async () => ({ ...(await pageTitle('preview', 'Preview')()), robots: { index: false, follow: false }, referrer: 'no-referrer' as const });
export default async function Auth(
  props: {
    params: Promise<{
      id: string;
    }>;
    searchParams?: Promise<{
      share?: string;
    }>;
  }
) {
  const params = await props.params;

  const {
    id
  } = params;

  const t = await getT();
  return (
    <PreviewReviewPageV1
      postId={id}
      publicationDateLabel={t('publication_date', 'Publication Date:')}
    />
  );
}
