import { useCallback, useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';

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
