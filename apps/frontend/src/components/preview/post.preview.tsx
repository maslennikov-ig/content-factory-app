'use client';

import { sanitizePostContent } from '@contentfactory/helpers/utils/sanitize.post.content';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { PlatformSymbol } from '@contentfactory/react/platform/platform.symbol';
import { Wordmark } from '@contentfactory/frontend/components/ui/brand/wordmark';
import Link from 'next/link';
import { CommentsComponents } from '@contentfactory/frontend/components/preview/comments.components';
import { VideoOrImage } from '@contentfactory/react/helpers/video.or.image';
import { CopyClient } from '@contentfactory/frontend/components/preview/copy.client';
import { RenderPreviewDateClient } from '@contentfactory/frontend/components/preview/render.preview.date.client';
import { CreationMethodBadge } from '@contentfactory/frontend/components/launches/creation.method.badge';
import { PreviewSurface } from './preview.surface';

export type PublicPreviewPost = {
  id: string;
  publishDate: string;
  content: string;
  image?: string | null;
  creationMethod?: string | null;
  integration: {
    id: string;
    name: string;
    picture?: string | null;
    providerIdentifier: string;
    profile: string;
  };
};

export const PostPreview = ({
  postId,
  posts,
  publicationDateLabel,
  showCopy = false,
  wordmarkHref = '/',
}: {
  postId: string;
  posts: PublicPreviewPost[];
  publicationDateLabel: string;
  showCopy?: boolean;
  wordmarkHref?: string | null;
}) => {
  const integration = posts[0].integration;

  return (
    <PreviewSurface state="default">
    <div>
      <div className="mx-auto w-full max-w-[1346px] py-3 text-cf-ink">
        <div className="flex items-center justify-between gap-[20px]">
          {wordmarkHref ? (
            <Link href={wordmarkHref} className="flex items-center">
              <Wordmark size="md" />
            </Link>
          ) : (
            <span className="flex items-center">
              <Wordmark size="md" />
            </span>
          )}
          <div className="text-sm text-cf-ink-muted flex items-center gap-[20px]">
            {showCopy && <CopyClient postId={postId} />}
            <div className="flex-1">
              {publicationDateLabel}{' '}
              <RenderPreviewDateClient date={posts[0].publishDate} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row text-cf-ink w-full max-w-[1346px] mx-auto">
        <div className="flex-1">
          <div className="gap-[20px] flex flex-col">
            {posts.map((post, index) => (
              <div
                key={String(post.id)}
                className="relative px-4 py-4 bg-cf-surface border border-cf-border rounded-[10px]"
              >
                <div className="flex space-x-3">
                  <div>
                    <div className="flex shrink-0 rounded-full h-30 w-30 relative">
                      <div className="w-[50px] h-[50px] z-[20]">
                        {integration.picture ? (
                          <img
                            className="w-full h-full relative z-[20] bg-cf-surface-subtle aspect-square rounded-full border border-cf-border"
                            alt={integration.name}
                            src={integration.picture}
                          />
                        ) : (
                          <PlatformSymbol
                            identifier={integration.providerIdentifier}
                            size={48}
                          />
                        )}
                      </div>
                      <PlatformBadge
                        identifier={integration.providerIdentifier}
                        size={24}
                        className="absolute z-[20] -bottom-[4px] -end-[4px]"
                      />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-semibold">
                        {integration.name}
                      </h2>
                      <span className="text-sm text-cf-ink-muted">
                        @{integration.profile}
                      </span>
                      {index === 0 && (
                        <CreationMethodBadge
                          creationMethod={post.creationMethod}
                          size="md"
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-[20px]">
                      <div
                        className="text-sm whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{
                          __html: sanitizePostContent(post.content),
                        }}
                      />
                      <div className="flex w-full gap-[10px]">
                        {JSON.parse(post.image || '[]').map(
                          (media: { name: string; path: string }) => (
                            <div
                              key={media.name}
                              className="flex-1 rounded-[10px] max-h-[500px] overflow-hidden"
                            >
                              <VideoOrImage
                                isContain={true}
                                src={media.path}
                                autoplay={true}
                              />
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full lg:w-96 lg:flex-shrink-0">
          <div className="p-4 pt-0">
            <CommentsComponents postId={postId} />
          </div>
        </div>
      </div>
    </div>
    </PreviewSurface>
  );
};
