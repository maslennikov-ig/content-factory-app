import { Injectable } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  AiProvider,
  OPENROUTER_BASE_URL,
  SearchProvider,
  loadAiConfig,
  resetAiConfigCache,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import { aiBillingPeriodStart } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  architecture?: { output_modalities?: string[] };
  supported_parameters?: string[];
  pricing?: { prompt?: string; completion?: string };
}

/**
 * Every method takes the organization from the request. Nothing here accepts an
 * organization id from a body or a query, so one tenant cannot name another and
 * read or clear its key.
 */
@Injectable()
export class AiProviderService {
  constructor(private _prisma: PrismaService) {}

  /**
   * Never returns the key. The screen only needs to know whether one is
   * stored, so a stolen response is worth nothing.
   */
  async getSettings(organizationId: string) {
    const config = await loadAiConfig(organizationId);
    const subscription = await this._prisma.subscription?.findUnique({
      where: { organizationId },
      select: { includedAiMonthlyOperations: true, createdAt: true },
    });
    const includedMonthlyOperations =
      subscription?.includedAiMonthlyOperations ?? 0;
    const includedUsedOperations =
      subscription && includedMonthlyOperations > 0
        ? ((await this._prisma.aiUsageRecord?.count({
            where: {
              organizationId,
              usageMode: 'included',
              createdAt: { gte: aiBillingPeriodStart(subscription.createdAt) },
            },
          })) ?? 0)
        : 0;
    const includedRemainingOperations = Math.max(
      0,
      includedMonthlyOperations - includedUsedOperations
    );
    const includedRestrictionReason = !config.includedAvailable
      ? 'managed_unavailable'
      : includedMonthlyOperations <= 0
      ? 'quota_unavailable'
      : includedRemainingOperations <= 0
      ? 'quota_exhausted'
      : null;

    return {
      usageMode: config.usageMode,
      provider: config.provider,
      textModel: config.textModel,
      imageModel: config.imageModel,
      hasKey: config.workspaceKeyConfigured ?? !!config.apiKey,
      workspaceKeyConfigured: config.workspaceKeyConfigured,
      includedAvailable: config.includedAvailable,
      includedMonthlyOperations,
      includedUsedOperations,
      includedRemainingOperations,
      includedRestrictionReason,
      searchEnabled: config.search.enabled,
      searchProvider: config.search.provider,
      searchTopic: config.search.topic,
      searchDepth: config.search.depth,
      hasSearchKey:
        config.workspaceSearchKeyConfigured ?? !!config.search.apiKey,
      searchFallbackAvailable:
        config.provider === 'openrouter' && !!config.apiKey,
    };
  }

  async updateSettings(
    organizationId: string,
    body: {
      usageMode?: 'included' | 'workspace_key';
      provider: AiProvider;
      apiKey?: string;
      textModel?: string;
      imageModel?: string;
      searchEnabled?: boolean;
      searchProvider?: Extract<SearchProvider, 'tavily'>;
      searchApiKey?: string;
      searchTopic?: 'general' | 'news';
      searchDepth?: 'basic' | 'advanced';
    }
  ) {
    // Every field below the provider is optional in the request, and the screen
    // saves sections independently. An absent field means "leave it"; an
    // explicitly emptied one means "clear it".
    const workspaceSettings = body.usageMode !== 'included';
    const data = {
      ...(body.usageMode ? { usageMode: body.usageMode } : {}),
      ...(workspaceSettings ? { provider: body.provider } : {}),
      ...(workspaceSettings && body.textModel !== undefined
        ? { textModel: body.textModel || null }
        : {}),
      ...(workspaceSettings && body.imageModel !== undefined
        ? { imageModel: body.imageModel || null }
        : {}),
      ...(workspaceSettings && body.apiKey
        ? { apiKey: AuthService.fixedEncryption(body.apiKey) }
        : {}),
      ...(typeof body.searchEnabled === 'boolean'
        ? { searchEnabled: body.searchEnabled }
        : {}),
      ...(body.searchProvider ? { searchProvider: body.searchProvider } : {}),
      ...(workspaceSettings && body.searchApiKey
        ? { searchApiKey: AuthService.fixedEncryption(body.searchApiKey) }
        : {}),
      ...(body.searchTopic ? { searchTopic: body.searchTopic } : {}),
      ...(body.searchDepth ? { searchDepth: body.searchDepth } : {}),
    };

    await this._prisma.aiProviderSetting.upsert({
      where: { organizationId },
      create: { organizationId, searchDepth: 'advanced', ...data },
      update: data,
    });

    // Without this the running process would keep the clients it built from
    // the previous configuration until the cache expired.
    resetAiConfigCache(organizationId);

    return this.getSettings(organizationId);
  }

  async clearKey(organizationId: string) {
    await this._prisma.aiProviderSetting.updateMany({
      where: { organizationId },
      data: { apiKey: null },
    });
    resetAiConfigCache(organizationId);
    return this.getSettings(organizationId);
  }

  async clearSearchKey(organizationId: string) {
    await this._prisma.aiProviderSetting.updateMany({
      where: { organizationId },
      data: { searchApiKey: null, searchEnabled: false },
    });
    resetAiConfigCache(organizationId);
    return this.getSettings(organizationId);
  }

  /**
   * The OpenRouter catalogue, split by what this product actually needs.
   *
   * The generator and autopost rewriting depend on structured output and tool
   * calling, so a model without them silently breaks generation rather than
   * degrading it; those are filtered out instead of being offered.
   *
   * The catalogue is public and identical for everyone, so this reaches
   * OpenRouter without a key and reveals nothing about any organization.
   */
  async listModels() {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`);
    if (!response.ok) {
      return { text: [], image: [], error: true };
    }

    const { data } = (await response.json()) as { data: OpenRouterModel[] };
    const shape = (m: OpenRouterModel) => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length ?? null,
      promptPrice: m.pricing?.prompt ?? null,
    });

    return {
      text: data
        .filter(
          (m) =>
            (m.supported_parameters || []).includes('structured_outputs') &&
            (m.supported_parameters || []).includes('tools')
        )
        .map(shape),
      image: data
        .filter((m) =>
          (m.architecture?.output_modalities || []).includes('image')
        )
        .map(shape),
      error: false,
    };
  }
}
