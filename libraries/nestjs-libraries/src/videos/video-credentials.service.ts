import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { PrismaRepository, PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { ThirdPartyService } from '@contentfactory/nestjs-libraries/database/prisma/third-party/third-party.service';
import { ThirdPartyRepository } from '@contentfactory/nestjs-libraries/database/prisma/third-party/third-party.repository';
import { serializableWithRetry } from '@contentfactory/nestjs-libraries/database/prisma/serializable.transaction';
import {
  VIDEO_PROVIDERS_V1,
  isVideoApiKeysV1,
  isVideoSpendPolicyV1,
  isVideoCredentialSourceV1,
  VideoCredentialSourceV1,
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
  input: VideoSettingsInputV1,
  workspaceSourceBinding = false
) => {
  if ((input.videoApiKeys !== undefined && !isVideoApiKeysV1(input.videoApiKeys)) ||
      (input.videoSpendPolicy !== undefined && !isVideoSpendPolicyV1(input.videoSpendPolicy))) {
    throw new HttpException({ code: 'VIDEO_SETTINGS_INVALID', message: 'Invalid video credentials or monetary limits.' }, HttpStatus.BAD_REQUEST);
  }
  if (!workspaceSourceBinding && Object.values(input.videoSpendPolicy ?? {}).some(policy => policy?.credentialSource)) {
    return refuse('VIDEO_SETTINGS_INVALID');
  }
  const keys = parseVideoApiKeysV1(current?.videoApiKeys);
  for (const provider of VIDEO_PROVIDERS_V1) {
    const key = input.videoApiKeys?.[provider];
    if (key === null) delete keys[provider];
    else if (key !== undefined) keys[provider] = AuthService.fixedEncryption(key);
  }
  const previous = parseVideoSpendPolicyV1(current?.videoSpendPolicy);
  const policies = Object.fromEntries(Object.entries(input.videoSpendPolicy ?? {}).map(([provider, policy]) =>
    [provider, {...previous[provider as VideoProviderIdV1], ...policy}]));
  return {
    ...(input.videoApiKeys !== undefined ? { videoApiKeys: keys } : {}),
    ...(input.videoSpendPolicy !== undefined ? {
      videoSpendPolicy: { ...previous, ...policies },
    } : {}),
  };
};

export const sanitizedVideoSettingsV1 = (
  row: { videoApiKeys?: unknown; videoSpendPolicy?: unknown } | null | undefined
) => {
  const keys = parseVideoApiKeysV1(row?.videoApiKeys);
  const policy = parseVideoSpendPolicyV1(row?.videoSpendPolicy);
  return Object.fromEntries(VIDEO_PROVIDERS_V1.map((provider) => [provider, {
    hasKey: !rawCredentialSourceV1(row, provider) && !!keys[provider],
    enabled: policy[provider]?.enabled === true,
    maxCostUsd: policy[provider]?.maxCostUsd ?? null,
    monthlyBudgetUsd: policy[provider]?.monthlyBudgetUsd ?? null,
    available: !rawCredentialSourceV1(row, provider) && !!keys[provider] && policy[provider]?.enabled === true,
    ...(rawCredentialSourceV1(row, provider) ? {credentialSource: {
      ...(credentialSourceV1(row, provider)!), status: 'unavailable' as 'configured' | 'unavailable' | 'inactive',
    }} : {}),
  }]));
};

const rawCredentialSourceV1 = (row: {videoSpendPolicy?: unknown} | null | undefined, provider: VideoProviderIdV1): unknown => {
  const policy = (row?.videoSpendPolicy as Record<string, {credentialSource?: unknown}> | undefined)?.[provider];
  return policy?.credentialSource;
};
const credentialSourceV1 = (row: {videoSpendPolicy?: unknown} | null | undefined, provider: VideoProviderIdV1): VideoCredentialSourceV1 | null => {
  const source = rawCredentialSourceV1(row, provider);
  if (source === undefined || source === null) return null;
  if (provider !== 'heygen' || !isVideoCredentialSourceV1(source)) return refuse('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE');
  return source;
};

@Injectable()
export class VideoCredentialsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly thirdParties?: ThirdPartyService) {}

  private async sourceRow(organizationId: string, provider: VideoProviderIdV1, source: VideoCredentialSourceV1) {
    // AI settings also constructs this service directly; reuse the same existing data layer there.
    const service = this.thirdParties ?? new ThirdPartyService(new ThirdPartyRepository(new PrismaRepository<'thirdParty'>(this.prisma)));
    const row = await service.getIntegrationById(organizationId, source.integrationId);
    if (!row || row.organizationId !== organizationId || row.identifier !== provider || row.deletedAt || typeof row.apiKey !== 'string' || !row.apiKey) {
      return refuse('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE');
    }
    return row;
  }

  private async encryptedCredential(organizationId: string, provider: VideoProviderIdV1, payer: VideoPayerV1,
    row: {videoApiKeys?: unknown; videoSpendPolicy?: unknown} | null | undefined) {
    const source = credentialSourceV1(row, provider);
    if (source && payer !== 'workspace_key') return refuse('VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE');
    const encrypted = source ? (await this.sourceRow(organizationId, provider, source)).apiKey : parseVideoApiKeysV1(row?.videoApiKeys)[provider];
    if (!encrypted) return refuse('VIDEO_KEY_NOT_CONFIGURED');
    // Legacy inline references are unchanged. The alternative source is explicitly pinned.
    const identity = source ? [organizationId, payer, provider, source.kind, source.integrationId, encrypted] : [organizationId, payer, provider, encrypted];
    return {encrypted, reference: createHash('sha256').update(JSON.stringify(identity)).digest('hex')};
  }

  private async rows(organizationId: string) {
    return Promise.all([
      this.prisma.aiProviderSetting?.findUnique?.({ where: { organizationId } }),
      this.prisma.instanceAiDefaults?.findUnique?.({ where: { id: INSTANCE_AI_DEFAULTS_ID } }),
    ]);
  }

  async getSettings(organizationId: string) {
    const [workspace, instance] = await this.rows(organizationId);
    const usageMode = workspace?.usageMode === 'workspace_key' ? 'workspace_key' : 'included';
    const workspaceView = sanitizedVideoSettingsV1(workspace);
    const source = credentialSourceV1(workspace, 'heygen');
    if (source) {
      let status: 'configured' | 'unavailable' | 'inactive' = usageMode === 'workspace_key' ? 'unavailable' : 'inactive';
      let name: string | undefined;
      if (usageMode === 'workspace_key') {
        try { const row = await this.sourceRow(organizationId, 'heygen', source); name = row.name; status = 'configured'; }
        catch (error) {
          const response = error instanceof HttpException ? error.getResponse() : null;
          if (!response || typeof response !== 'object' || !('code' in response) || response.code !== 'VIDEO_CREDENTIAL_SOURCE_UNAVAILABLE') throw error;
        }
      }
      workspaceView.heygen = {...workspaceView.heygen, hasKey: status === 'configured',
        available: status === 'configured' && workspaceView.heygen.enabled,
        credentialSource: {...source, ...(name ? {name} : {}), status}};
    }
    return {
      usageMode,
      workspace: workspaceView,
      included: sanitizedVideoSettingsV1(instance),
      effective: usageMode === 'workspace_key' ? workspaceView : sanitizedVideoSettingsV1(instance),
    };
  }

  async saveWorkspace(organizationId: string, input: VideoSettingsInputV1) {
    await serializableWithRetry(this.prisma, async tx => {
      const current = await tx.aiProviderSetting.findUnique({ where: { organizationId } });
      const data = videoSettingsUpdateV1(current, input, true);
      const source = input.videoSpendPolicy?.heygen?.credentialSource;
      if (source) await this.sourceRow(organizationId, 'heygen', source);
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
    const {encrypted, reference} = await this.encryptedCredential(organizationId, provider, mode, row);
    const policy = parseVideoSpendPolicyV1(row?.videoSpendPolicy)[provider];
    if (!policy?.enabled) return refuse('VIDEO_SPEND_POLICY_UNAVAILABLE');
    let apiKey: string;
    try { apiKey = AuthService.fixedDecryption(encrypted); }
    catch { return refuse('VIDEO_KEY_UNREADABLE'); }
    if (!apiKey) return refuse('VIDEO_KEY_NOT_CONFIGURED');
    return {
      provider, apiKey, payer: mode,
      reference,
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
    const {encrypted, reference: currentReference} = await this.encryptedCredential(organizationId, provider, payer, row);
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
