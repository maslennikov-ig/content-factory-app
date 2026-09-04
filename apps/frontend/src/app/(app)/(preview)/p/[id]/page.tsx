import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { internalFetch } from '@contentfactory/helpers/utils/internal.fetch';
export const dynamic = 'force-dynamic';
import { getT } from '@contentfactory/react/translation/get.translation.service.backend';
import {
  PostPreview,
  type PublicPreviewPost,
} from '@contentfactory/frontend/components/preview/post.preview';

export const generateMetadata = pageTitle('preview', 'Preview');
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
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    id
  } = params;

  const post = (await (
    await internalFetch(`/public/posts/${id}`)
  ).json()) as PublicPreviewPost[];
  const t = await getT();
  if (!post.length) {
    return (
      <div className="text-cf-ink fixed start-0 top-0 w-full h-full flex justify-center items-center text-[20px]">
        {t('post_not_found', 'Post not found')}
      </div>
    );
  }
  return (
    <PostPreview
      postId={id}
      posts={post}
      publicationDateLabel={t('publication_date', 'Publication Date:')}
      showCopy={Boolean(searchParams?.share)}
    />
  );
}
