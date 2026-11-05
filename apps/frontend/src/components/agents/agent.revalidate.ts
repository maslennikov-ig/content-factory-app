import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { PIECES_API_BASE, VOICE_API_BASE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { AgentArtifact } from './agent.contract';

/** Authenticated profile reads recheck the current workspace; missing or connected channels are never pruned. */
export const useVerifiedDraftDestinations = (candidates: readonly string[], scope: {organizationId?: string; actorId?: string; threadId?: string | null}, request: (url: string) => Promise<Response>) => {
  const key = scope.organizationId && scope.actorId && scope.threadId && candidates.length
    ? ['assistant-draft-destinations', scope.organizationId, scope.actorId, scope.threadId, candidates.join(',')] : null;
  const enabled = key !== null;
  const {data, error} = useSWR<string[]>(key, async () => (await Promise.all(candidates.map(async id => {
    try {
      const response = await request(`/social-factory/channels/${encodeURIComponent(id)}/profile`);
      if (!response.ok) return null;
      const value = await response.json();
      const destination = value?.destination;
      return value?.profile?.channelId === id && destination?.id === id && destination.kind === 'draft' && destination.publishable === false &&
        (destination.actorId === undefined || destination.actorId === scope.actorId) &&
        (destination.organizationId === undefined || destination.organizationId === scope.organizationId) ? id : null;
    } catch { return null; }
  }))).filter((id): id is string => id !== null), {revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false, keepPreviousData: false});
  return useMemo(() => ({ids: new Set(data ?? []), pending: enabled && data === undefined && !error}), [data, error, enabled]);
};

/** Existing readers of this object only; neighbouring ids and other avatars stay untouched. */
export const artifactReadMatches = (artifact: AgentArtifact, key: unknown): boolean => {
  if (artifact.kind === 'media' && (artifact.data.videoDraftId || artifact.data.videoJobId)) {
    const path = Array.isArray(key) ? key[0] : key;
    return typeof path === 'string' && (
      !!artifact.data.videoDraftId && path === `/media/video-prompts/${encodeURIComponent(String(artifact.data.videoDraftId))}` ||
      !!artifact.data.videoJobId && (path === `/media/video-jobs/${encodeURIComponent(String(artifact.data.videoJobId))}` || path === `/media/video-v2/jobs/${encodeURIComponent(String(artifact.data.videoJobId))}` || Array.isArray(key) && (key[0] === 'video-job-v1' && key[2] === artifact.data.videoJobId || key[0] === 'video-job-v2' && key[3] === artifact.data.videoJobId))
    );
  }
  if (typeof key !== 'string') return false;
  const [path, query = ''] = key.split('?');
  if (artifact.kind === 'campaign') return path === `/social-factory/campaigns/${encodeURIComponent(artifact.id)}`;
  const under = (root: string) => path === root || path.startsWith(`${root}/`);
  if (artifact.kind === 'avatar') {
    return path === `${VOICE_API_BASE}/avatars` || path === `${VOICE_API_BASE}/overview` ||
      under(VOICE_API_BASE) && new URLSearchParams(query).get('avatar') === artifact.id;
  }
  if (artifact.kind === 'channel') {
    return path === '/integrations/list' || under(`/integrations/${encodeURIComponent(artifact.id)}`);
  }
  const pieceId = artifact.kind === 'piece' ? artifact.id :
    artifact.kind === 'adaptation' || artifact.kind === 'plan' ? artifact.data.pieceId : null;
  return typeof pieceId === 'string' && !!pieceId && under(`${PIECES_API_BASE}/${pieceId}`);
};

/** Selection is a read, using the same non-clearing mutation as completed chat actions. */
export const useRevalidateArtifact = () => {
  const { mutate } = useSWRConfig();
  return useCallback((artifact: AgentArtifact) =>
    void mutate((key) => artifactReadMatches(artifact, key)), [mutate]);
};

/** Refresh retained readers on tab return and when the persistent assistant is shown again. */
export const useRefreshOnReturn = (refresh: () => void, visible: boolean, busy: boolean) => {
  const latest = useRef({ refresh, visible, busy });
  latest.current = { refresh, visible, busy };
  const wasVisible = useRef(visible);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = useCallback(() => {
    if (!latest.current.visible || document.visibilityState !== 'visible') return;
    pending.current = true;
    if (latest.current.busy || timer.current !== null) return;
    // A browser may emit both visibilitychange and focus for the same return.
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!latest.current.visible || latest.current.busy || document.visibilityState !== 'visible') return;
      pending.current = false;
      latest.current.refresh();
    }, 0);
  }, []);
  useEffect(() => {
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [schedule]);
  useEffect(() => {
    const shown = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (shown || visible && !busy && pending.current) schedule();
  }, [visible, busy, schedule]);
};

/**
 * Reads every SWR route under a prefix again, keeping what the screens show
 * until the answer comes (correctness review of the W3 walk fixes, F2).
 *
 * The chat uses it after an action that changed avatars, channels or samples,
 * for the screen beside it. The two-argument `mutate(filter)` of `swr` 2.x
 * only revalidates; the three-argument form with `undefined` data cleared each
 * matching key first, which unmounted the avatar panel's wizard mid-edit and —
 * while the panel paused its refetch during an analysis — left it on «аватар
 * не найден» until a reload.
 */
export const useRevalidateUnder = () => {
  const { mutate } = useSWRConfig();
  return useCallback(
    (prefix: string) =>
      void mutate((key) => typeof key === 'string' && key.startsWith(prefix)),
    [mutate]
  );
};

/**
 * Reads the routes under `prefix` again each time `count` grows — the
 * finished actions of one group in the conversation (`channelCallsOf`,
 * `avatarCallsOf`, `ideaCallsOf`, `factCallsOf`). What the thread loaded with
 * is already current, so the first count is only remembered. One hook for
 * every group (`kcxz.24`): four hand copies of this effect had begun to grow
 * in `agent.conversation.tsx`.
 */
export const useRevalidateWhenCountGrows = (count: number, prefix: string) => {
  const revalidateUnder = useRevalidateUnder();
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (seen.current === null || count === seen.current) {
      seen.current = count;
      return;
    }
    seen.current = count;
    revalidateUnder(prefix);
  }, [count, prefix, revalidateUnder]);
};
