/** Video credentials are separate from text and search provider slots. */
export const VIDEO_PROVIDERS_V1 = ['higgsfield', 'heygen'] as const;
export type VideoProviderSettingId = (typeof VIDEO_PROVIDERS_V1)[number];
export type VideoSpendPolicyV1 = Partial<Record<VideoProviderSettingId, {
  enabled: boolean;
  maxCostUsd: number;
  monthlyBudgetUsd: number;
}>>;
export interface VideoSettingsInputV1 {
  /** Null removes exactly this provider key; omitted entries are retained. */
  videoApiKeys?: Partial<Record<VideoProviderSettingId, string | null>>;
  videoSpendPolicy?: VideoSpendPolicyV1;
}
const videoObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const isVideoApiKeysV1 = (value: unknown): boolean =>
  videoObject(value) && Object.entries(value).every(([provider, key]) =>
    VIDEO_PROVIDERS_V1.includes(provider as VideoProviderSettingId) &&
    (key === null || (typeof key === 'string' && key.length > 0 &&
      key.length <= 2000 && key.trim() === key && !/[\r\n]/.test(key))));
export const isVideoSpendPolicyV1 = (value: unknown): value is VideoSpendPolicyV1 =>
  videoObject(value) && Object.entries(value).every(([provider, policy]) =>
    VIDEO_PROVIDERS_V1.includes(provider as VideoProviderSettingId) &&
    videoObject(policy) && Object.keys(policy).every((key) =>
      ['enabled', 'maxCostUsd', 'monthlyBudgetUsd'].includes(key)) &&
    typeof policy.enabled === 'boolean' &&
    typeof policy.maxCostUsd === 'number' && Number.isFinite(policy.maxCostUsd) && policy.maxCostUsd > 0 &&
    typeof policy.monthlyBudgetUsd === 'number' && Number.isFinite(policy.monthlyBudgetUsd) && policy.monthlyBudgetUsd > 0 &&
    policy.maxCostUsd <= policy.monthlyBudgetUsd);
export const parseVideoApiKeysV1 = (value: unknown): Partial<Record<VideoProviderSettingId, string>> =>
  !videoObject(value) ? {} : Object.fromEntries(VIDEO_PROVIDERS_V1
    .filter((provider) => typeof value[provider] === 'string' && !!value[provider])
    .map((provider) => [provider, value[provider] as string]));
export const parseVideoSpendPolicyV1 = (value: unknown): VideoSpendPolicyV1 =>
  !videoObject(value) ? {} : Object.fromEntries(VIDEO_PROVIDERS_V1
    .filter((provider) => isVideoSpendPolicyV1({ [provider]: value[provider] }))
    .map((provider) => [provider, value[provider]]));
