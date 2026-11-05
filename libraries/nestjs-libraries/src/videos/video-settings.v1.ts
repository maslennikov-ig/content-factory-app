/** Video credentials are separate from text and search provider slots. */
export const VIDEO_PROVIDERS_V1 = ['higgsfield', 'heygen'] as const;
export type VideoProviderSettingId = (typeof VIDEO_PROVIDERS_V1)[number];
export type VideoCredentialSourceV1 = { kind: 'third_party'; integrationId: string };
export type VideoSpendPolicyV1 = Partial<Record<VideoProviderSettingId, {
  enabled: boolean;
  maxCostUsd: number;
  monthlyBudgetUsd: number;
  /** Omitted updates retain the source; explicit null selects the separate inline key. Workspace HeyGen only. */
  credentialSource?: VideoCredentialSourceV1 | null;
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
export const isVideoCredentialSourceV1 = (value: unknown): value is VideoCredentialSourceV1 =>
  videoObject(value) && Object.keys(value).length === 2 && value.kind === 'third_party' &&
  typeof value.integrationId === 'string' && /^[A-Za-z0-9_:.\-]{1,200}$/.test(value.integrationId);
export const isVideoSpendPolicyV1 = (value: unknown): value is VideoSpendPolicyV1 =>
  videoObject(value) && Object.entries(value).every(([provider, policy]) =>
    VIDEO_PROVIDERS_V1.includes(provider as VideoProviderSettingId) &&
    videoObject(policy) && Object.keys(policy).every((key) =>
      ['enabled', 'maxCostUsd', 'monthlyBudgetUsd', 'credentialSource'].includes(key)) &&
    (policy.credentialSource === undefined || policy.credentialSource === null ||
      provider === 'heygen' && isVideoCredentialSourceV1(policy.credentialSource)) &&
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
