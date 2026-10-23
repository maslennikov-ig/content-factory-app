import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { serializableWithRetry } from '@contentfactory/nestjs-libraries/database/prisma/serializable.transaction';
import {
  VIDEO_PROVIDERS_V1,
  isVideoApiKeysV1,
  isVideoSpendPolicyV1,
  parseVideoApiKeysV1,
  parseVideoSpendPolicyV1,
  VideoSettingsInputV1,
} from './video-settings.v1';
import { INSTANCE_AI_DEFAULTS_ID } from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import type { VideoAiAdmissionConfig } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import type { VideoCredentialV1, VideoPayerV1, VideoProviderIdV1 } from './video-provider.v1';

const refuse = (code: string): never => {
  throw new HttpException({ code, message: code }, HttpStatus.CONFLICT);
};

/** Shared by workspace and superadmin writes, with no key returned to a caller. */
export const videoSettingsUpdateV1 = (
  current: { videoApiKeys?: unknown; videoSpendPolicy?: unknown } | null | undefined,
  input: VideoSettingsInputV1
) => {
  if ((input.videoApiKeys !== undefined && !isVideoApiKeysV1(input.videoApiKeys)) ||
      (input.videoSpendPolicy !== undefined && !isVideoSpendPolicyV1(input.videoSpendPolicy))) {
    throw new HttpException({ code: 'VIDEO_SETTINGS_INVALID', message: 'Invalid video credentials or monetary limits.' }, HttpStatus.BAD_REQUEST);
  }
  const keys = parseVideoApiKeysV1(current?.videoApiKeys);
  for (const provider of VIDEO_PROVIDERS_V1) {
    const key = input.videoApiKeys?.[provider];
    if (key === null) delete keys[provider];
    else if (key !== undefined) keys[provider] = AuthService.fixedEncryption(key);
  }
  return {
    ...(input.videoApiKeys !== undefined ? { videoApiKeys: keys } : {}),
    ...(input.videoSpendPolicy !== undefined ? {
      videoSpendPolicy: { ...parseVideoSpendPolicyV1(current?.videoSpendPolicy), ...input.videoSpendPolicy },
    } : {}),
  };
};

export const sanitizedVideoSettingsV1 = (
  row: { videoApiKeys?: unknown; videoSpendPolicy?: unknown } | null | undefined
) => {
  const keys = parseVideoApiKeysV1(row?.videoApiKeys);
  const policy = parseVideoSpendPolicyV1(row?.videoSpendPolicy);
  return Object.fromEntries(VIDEO_PROVIDERS_V1.map((provider) => [provider, {
    hasKey: !!keys[provider],
    enabled: policy[provider]?.enabled === true,
    maxCostUsd: policy[provider]?.maxCostUsd ?? null,
    monthlyBudgetUsd: policy[provider]?.monthlyBudgetUsd ?? null,
    available: !!keys[provider] && policy[provider]?.enabled === true,
  }]));
};

@Injectable()
export class VideoCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  private async rows(organizationId: string) {
    return Promise.all([
      this.prisma.aiProviderSetting?.findUnique?.({ where: { organizationId } }),
      this.prisma.instanceAiDefaults?.findUnique?.({ where: { id: INSTANCE_AI_DEFAULTS_ID } }),
    ]);
  }

  async getSettings(organizationId: string) {
    const [workspace, instance] = await this.rows(organizationId);
    const usageMode = workspace?.usageMode === 'workspace_key' ? 'workspace_key' : 'included';
    return {
      usageMode,
      workspace: sanitizedVideoSettingsV1(workspace),
      included: sanitizedVideoSettingsV1(instance),
      effective: sanitizedVideoSettingsV1(usageMode === 'workspace_key' ? workspace : instance),
    };
  }

  async saveWorkspace(organizationId: string, input: VideoSettingsInputV1) {
    await serializableWithRetry(this.prisma, async tx => {
      const current = await tx.aiProviderSetting.findUnique({ where: { organizationId } });
      const data = videoSettingsUpdateV1(current, input);
      await tx.aiProviderSetting.upsert({
        where: { organizationId },
        // A workspace without a row inherits included mode. Saving a video key
        // must not let Prisma's legacy workspace_key default change the payer.
        create: { organizationId, usageMode: 'included', ...data },
        update: data,
      });
    }, 'Video settings are busy; retry the same update.');
    return this.getSettings(organizationId);
  }

  async resolve(organizationId: string, provider: VideoProviderIdV1, payer?: VideoPayerV1): Promise<VideoCredentialV1> {
    if (!VIDEO_PROVIDERS_V1.includes(provider)) return refuse('VIDEO_PROVIDER_INVALID');
    const [workspace, instance] = await this.rows(organizationId);
    const mode: VideoPayerV1 = workspace?.usageMode === 'workspace_key' ? 'workspace_key' : 'included';
    if (payer !== undefined && payer !== mode) return refuse('VIDEO_PAYER_CHANGED');
    const row = mode === 'workspace_key' ? workspace : instance;
    const encrypted = parseVideoApiKeysV1(row?.videoApiKeys)[provider];
    const policy = parseVideoSpendPolicyV1(row?.videoSpendPolicy)[provider];
    if (!encrypted) return refuse('VIDEO_KEY_NOT_CONFIGURED');
    if (!policy?.enabled) return refuse('VIDEO_SPEND_POLICY_UNAVAILABLE');
    let apiKey: string;
    try { apiKey = AuthService.fixedDecryption(encrypted); }
    catch { return refuse('VIDEO_KEY_UNREADABLE'); }
    if (!apiKey) return refuse('VIDEO_KEY_NOT_CONFIGURED');
    return {
      provider, apiKey, payer: mode,
      reference: createHash('sha256').update(JSON.stringify([organizationId, mode, provider, encrypted])).digest('hex'),
      maxCostUsd: policy.maxCostUsd,
      monthlyBudgetUsd: policy.monthlyBudgetUsd,
    };
  }

  /** Read recovery keeps the accepted payer/key even when new launches are disabled. */
  async resolvePinned(organizationId: string, provider: VideoProviderIdV1, payer: VideoPayerV1, reference: string): Promise<VideoCredentialV1> {
    if (!VIDEO_PROVIDERS_V1.includes(provider)) return refuse('VIDEO_PROVIDER_INVALID');
    if (payer !== 'workspace_key' && payer !== 'included') return refuse('VIDEO_PAYER_CHANGED');
    const [workspace, instance] = await this.rows(organizationId);
    const row = payer === 'workspace_key' ? workspace : instance;
    const encrypted = parseVideoApiKeysV1(row?.videoApiKeys)[provider];
    if (!encrypted) return refuse('VIDEO_KEY_NOT_CONFIGURED');
    const currentReference = createHash('sha256').update(JSON.stringify([organizationId, payer, provider, encrypted])).digest('hex');
    if (currentReference !== reference) return refuse('VIDEO_CREDENTIAL_CHANGED');
    let apiKey: string;
    try { apiKey = AuthService.fixedDecryption(encrypted); }
    catch { return refuse('VIDEO_KEY_UNREADABLE'); }
    if (!apiKey) return refuse('VIDEO_KEY_NOT_CONFIGURED');
    const policy = parseVideoSpendPolicyV1(row?.videoSpendPolicy)[provider];
    return { provider, payer, reference, apiKey,
      maxCostUsd: policy?.maxCostUsd ?? 0,
      monthlyBudgetUsd: policy?.monthlyBudgetUsd ?? 0,
    };
  }

  /** No dependency on a text key, provider, environment fallback or text cache. */
  async admissionConfig(organizationId: string, credential: VideoCredentialV1, model: string = credential.provider): Promise<VideoAiAdmissionConfig> {
    const current = await this.resolve(organizationId, credential.provider, credential.payer);
    if (current.reference !== credential.reference) return refuse('VIDEO_CREDENTIAL_CHANGED');
    return {
      provider: current.provider, usageMode: current.payer, apiKey: current.apiKey,
      textModel: model, imageModel: model, roleModels: {},
      workspaceKeyConfigured: current.payer === 'workspace_key',
      workspaceSearchKeyConfigured: false, workspaceSearchKeys: {},
      includedAvailable: current.payer === 'included',
      search: { enabled: false, provider: 'tavily', apiKey: '', apiKeys: {}, keySources: {}, taskProviders: {}, topic: 'general', depth: 'basic' },
    };
  }
}
