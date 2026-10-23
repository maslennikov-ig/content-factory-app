'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { MediaBox } from '@contentfactory/frontend/components/media/media.component';
import { VideoMediaEntry } from '../videos/video.entry';
import { SkeletonRows } from '../ui/surface';

const VideoWorkspace = dynamic(() => import('../videos/video.workspace').then(module => module.VideoWorkspace), { ssr: false, loading: () => <SkeletonRows rows={4} /> });
export const MediaLayoutComponent = () => {
  return <Suspense fallback={<SkeletonRows rows={4} />}><MediaContent /></Suspense>;
};
function MediaContent() {
  const query = useSearchParams();
  const video = query?.get('video') === '1' ? { pieceId: query.get('pieceId') ?? undefined, draftId: query.get('draftId') ?? undefined, jobId: query.get('jobId') ?? undefined } : null;
  return (
    <div className="bg-cf-surface p-[20px] flex flex-1 flex-col gap-[16px]">
      {video ? <VideoWorkspace key={`${video.pieceId ?? ''}:${video.draftId ?? ''}:${video.jobId ?? ''}`} {...video} /> : <><div className="flex justify-end"><VideoMediaEntry /></div><MediaBox setMedia={() => {}} closeModal={() => {}} standalone={true} /></>}
    </div>
  );
}
