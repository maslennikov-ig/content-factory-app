export const TIKTOK_DECLARATION_VERSION = 'tiktok-direct-post-declarations/v1' as const;
export interface TikTokPolicyDeclaration {
  id: 'music_usage' | 'branded_content';
  version: typeof TIKTOK_DECLARATION_VERSION;
  url: string;
}
export const TIKTOK_MUSIC_USAGE_DECLARATION: Readonly<TikTokPolicyDeclaration> = Object.freeze({
  id: 'music_usage', version: TIKTOK_DECLARATION_VERSION,
  url: 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en',
});
export const TIKTOK_BRANDED_CONTENT_DECLARATION: Readonly<TikTokPolicyDeclaration> = Object.freeze({
  id: 'branded_content', version: TIKTOK_DECLARATION_VERSION,
  url: 'https://www.tiktok.com/legal/page/global/bc-policy/en',
});

/** Required declarations only. Authority must be verified separately against the exact item/revision/settings. */
export function tikTokRequiredDeclarations(settings: Record<string, unknown>): readonly Readonly<TikTokPolicyDeclaration>[] {
  if (settings?.content_posting_method === 'UPLOAD') return Object.freeze([]);
  if (settings?.content_posting_method !== 'DIRECT_POST' || typeof settings.brand_content_toggle !== 'boolean') {
    throw new Error('TIKTOK_POLICY_SETTINGS_UNAVAILABLE');
  }
  return Object.freeze([TIKTOK_MUSIC_USAGE_DECLARATION,
    ...(settings.brand_content_toggle ? [TIKTOK_BRANDED_CONTENT_DECLARATION] : [])]);
}
