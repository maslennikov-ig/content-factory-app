import { useCallback } from 'react';
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
