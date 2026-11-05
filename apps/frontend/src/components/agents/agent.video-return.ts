import { artifactsOf, refToArtifact, type AgentArtifact, type AgentThreadHistory } from './agent.contract';

/** Only a known video artifact from the authorized history may be reopened. */
export function videoReturnFromHistory(threadId: string, pathname: string, search: string, history: AgentThreadHistory): AgentArtifact | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(threadId) || pathname !== `/agents/${threadId}` || history.thread?.id !== threadId) return null;
  const match = /^\?videoDraftId=([A-Za-z0-9_-]{1,128})(?:&pieceId=([A-Za-z0-9_-]{1,128}))?(?:&videoJobId=([A-Za-z0-9_-]{1,128}))?(?:&connectionError=(?:VIDEO_OAUTH_REFUSED|VIDEO_CONNECTION_UNAVAILABLE))?$/.exec(search);
  if (!match) return null;
  const [, draftId, pieceId, jobId] = match;
  const artifacts = [...(history.workspace?.artifacts.map(refToArtifact) ?? []), ...artifactsOf(history.messages)];
  return artifacts.find(artifact => {
    if (artifact.kind !== 'media') return false;
    const savedDraft = artifact.data.videoDraftId, savedJob = artifact.data.videoJobId, savedPiece = artifact.data.pieceId;
    if (savedDraft !== draftId && !(jobId && savedJob === jobId && !savedDraft)) return false;
    if (jobId && savedJob !== jobId) return false;
    if (pieceId && savedPiece && savedPiece !== pieceId) return false;
    return true;
  }) ?? null;
}
