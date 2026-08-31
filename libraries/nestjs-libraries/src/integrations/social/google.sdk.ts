/**
 * The one place `googleapis` is loaded.
 *
 * The package builds every API surface it ships while its module evaluates,
 * and three modules here need it — Google login, YouTube, Google My Business.
 * Importing it statically charged that cost to every process start, including
 * deployments that never connect a Google account at all. Loading it on first
 * use moves the cost to the first Google request instead.
 *
 * The promise is memoized so two parallel first calls share one load. It is
 * dropped again when the load fails: a cached rejection would leave all three
 * providers dead until the container restarts, whereas the static import this
 * replaced failed loudly at start-up and got a restart for free.
 */
type GoogleApis = typeof import('googleapis');

let googleApisPromise: Promise<GoogleApis> | undefined;

export const loadGoogleApis = (): Promise<GoogleApis> =>
  (googleApisPromise ??= import('googleapis').catch((error) => {
    googleApisPromise = undefined;
    throw error;
  }));
