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
import {
  aiBillingPeriodStart,
  includedUsageFilter,
} from '@contentfactory/nestjs-libraries/openai/ai.usage.service';

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
   * What each member of the organization has spent this period.
   *
   * The ledger's period anchor is the subscription's start where there is one
   * and the organization's own start where there is not — the same fallback
   * the posts-per-month limit already uses, so an instance without billing
   * still reads a real period rather than an empty one.
   *
   * Every usage mode counts. A workspace key is the organization's money just
   * as an included operation is, and a breakdown that silently dropped half of
   * it would be worse than none. Operations with no person behind them —
   * scheduled autoposting, anything through the organization's API key — come
   * back as a single unattributed row, because hiding them would make the
   * parts stop adding up to the whole.
   */
  private async usageByMember(organizationId: string, since: Date) {
    const grouped = await this._prisma.aiUsageRecord.groupBy({
      by: ['userId'],
      where: { organizationId, createdAt: { gte: since } },
      _count: { _all: true },
    });

    const userIds = grouped
      .map((row) => row.userId)
      .filter((id): id is string => !!id);
    const users = userIds.length
      ? await this._prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailOf = new Map(users.map((user) => [user.id, user.email]));

    return grouped
      .map((row) => ({
        userId: row.userId,
        email: row.userId ? emailOf.get(row.userId) ?? null : null,
        operations: row._count._all,
      }))
      .sort((a, b) => b.operations - a.operations);
  }

  /**
   * Never returns the key. The screen only needs to know whether one is
   * stored, so a stolen response is worth nothing.
   */
  async getSettings(organizationId: string) {
    const config = await loadAiConfig(organizationId);
    const organization = await this._prisma.organization?.findUnique({
      where: { id: organizationId },
      select: { createdAt: true },
    });
    const subscription = await this._prisma.subscription?.findUnique({
      where: { organizationId },
      select: { includedAiMonthlyOperations: true, createdAt: true },
    });
    const periodStart = aiBillingPeriodStart(
      subscription?.createdAt ?? organization?.createdAt ?? new Date()
    );
    const includedMonthlyOperations =
      subscription?.includedAiMonthlyOperations ?? 0;
    /**
     * The same predicate admission uses, not a second one that looks like it.
     *
     * Until `content-factory-next-fn33.28.6` this counted every `included` row
     * of the period, including admissions abandoned a day ago that admission
     * itself no longer charges. The member's line beside a paid button and the
     * administrator's settings screen therefore showed two different «left»
     * numbers for one workspace, and no words in the product told a person
     * which of the two to believe. One allowance, one count.
     */
    const includedUsedOperations =
      subscription && includedMonthlyOperations > 0
        ? ((await this._prisma.aiUsageRecord?.count({
            where: includedUsageFilter(organizationId, periodStart),
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
      usageByMember: await this.usageByMember(organizationId, periodStart),
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
