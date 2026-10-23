'use client';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { useVideoWords } from './video.copy';
import { videoWorkspacePath } from './video-ui.v1';
export function VideoPieceEntry({ pieceId, canWrite }: { pieceId: string; canWrite: boolean }) {
  const words = useVideoWords();
  return canWrite ? <ButtonLink href={videoWorkspacePath({ pieceId })} variant="secondary" density="dense" data-piece-video="true">{words.entry}</ButtonLink> : null;
}
export function VideoMediaEntry() {
  const words = useVideoWords();
  return <ButtonLink href={videoWorkspacePath()} variant="secondary">{words.entry}</ButtonLink>;
}
