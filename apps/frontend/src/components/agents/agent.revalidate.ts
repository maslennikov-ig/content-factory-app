import { useCallback, useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
import { PIECES_API_BASE, VOICE_API_BASE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { AgentArtifact } from './agent.contract';

/** Existing readers of this object only; neighbouring ids and other avatars stay untouched. */
export const artifactReadMatches = (artifact: AgentArtifact, key: unknown): boolean => {
  if (typeof key !== 'string') return false;
  const [path, query = ''] = key.split('?');
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
