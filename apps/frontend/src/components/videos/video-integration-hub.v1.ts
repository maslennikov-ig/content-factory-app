/** Navigation carries only the exact saved artifact route. The server rechecks ownership at OAuth start/callback. */
export function videoHubReturnPathV1(value: unknown): string | null {
  if (value === '/third-party') return value;
  if (typeof value !== 'string' || value.length > 1024 || !(
    /^\/agents\/[A-Za-z0-9_-]{1,128}\?videoDraftId=[A-Za-z0-9_-]{1,128}(?:&pieceId=[A-Za-z0-9_-]{1,128})?(?:&videoJobId=[A-Za-z0-9_-]{1,128})?$/.test(value) ||
    /^\/media\?video=1(?:&(?:draftId|pieceId|jobId)=[A-Za-z0-9_-]{1,128})*$/.test(value))) return null;
  const keys = [...new URLSearchParams(value.slice(value.indexOf('?') + 1)).keys()];
  return new Set(keys).size === keys.length ? value : null;
}
export function videoIntegrationHubHrefV1(returnPath: string): string | null {
  const safe = videoHubReturnPathV1(returnPath);
  return !safe ? null : safe === '/third-party' ? safe : `/third-party?videoReturn=${encodeURIComponent(safe)}`;
}
export function openVideoIntegrationHubV1(returnPath: string): void {
  const href = videoIntegrationHubHrefV1(returnPath);
  if (!href) throw new Error('VIDEO_RETURN_URL_INVALID');
  window.location.assign(href);
}
