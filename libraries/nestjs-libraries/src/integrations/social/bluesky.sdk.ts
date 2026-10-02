/**
 * Load Bluesky's public SDK on its first provider operation.
 * Parallel first calls share only the module, never agents or sessions.
 * A failed load is cleared for a later independent call; the operation that
 * saw the failure is not retried here.
 */
type BlueskySdk = typeof import('@atproto/api');

let blueskySdkPromise: Promise<BlueskySdk> | undefined;

export const loadBlueskySdk = (): Promise<BlueskySdk> =>
  (blueskySdkPromise ??= import('@atproto/api').catch((error) => {
    blueskySdkPromise = undefined;
    throw error;
  }));
