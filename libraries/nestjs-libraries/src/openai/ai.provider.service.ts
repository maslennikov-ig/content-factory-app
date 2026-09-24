import { Injectable } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  AiProvider,
  INSTANCE_AI_DEFAULTS_ID,
  OPENROUTER_BASE_URL,
  SearchProvider,
  loadAiConfig,
  resetAiConfigCache,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import {
  aiBillingPeriodStart,
  includedMonthlyOperations,
  isUnlimitedOperations,
  includedUsageFilter,
} from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import {
  AiRoleModels,
  parseRoleModels,
} from '@contentfactory/nestjs-libraries/openai/ai.roles';
import {
  SEARCH_PROVIDERS,
  SearchProviderKeys,
  SearchTaskProviders,
  parseSearchKeys,
  parseSearchTaskProviders,
  readSearchProvider,
} from '@contentfactory/nestjs-libraries/openai/ai.search-tasks';

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
          select: { id: true, email: true, name: true, lastName: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    // The screen names a member by name and falls back to the email: a list
    // of addresses is a list of logins, not of people.
    const nameOf = (user?: { name: string | null; lastName: string | null }) =>
      [user?.name, user?.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ') || null;

    return grouped
      .map((row) => ({
        userId: row.userId,
        email: row.userId ? byId.get(row.userId)?.email ?? null : null,
        name: row.userId ? nameOf(byId.get(row.userId)) : null,
        operations: row._count._all,
      }))
      .sort((a, b) => b.operations - a.operations);
  }

  /**
   * What each call role has spent this period.
   *
   * The companion to `usageByMember`, and needed for the same reason: routing
   * is configured per role, so it can only be judged per role. Without it
   * «classification now runs on a small model» is a claim nobody in the
   * product can check. Rows written before the role column carry a null and
   * come back under it, rather than being dropped and making the parts stop
   * adding up to the whole.
   *
   * The organisation is the caller's own and is named in the `where`.
   */
  private async usageByRole(organizationId: string, since: Date) {
    const grouped = await this._prisma.aiUsageRecord.groupBy({
      by: ['role'],
      where: { organizationId, createdAt: { gte: since } },
      _count: { _all: true },
    });

    return grouped
      .map((row) => ({ role: row.role, operations: row._count._all }))
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
    const instanceDefaults = await this._prisma.instanceAiDefaults?.findUnique({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
      select: { monthlyOperations: true },
    });
    const monthlyOperations = includedMonthlyOperations(
      subscription,
      instanceDefaults
    );
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
    // «Без предела» (`97dq.27`): a state, so the screen gets words, not an
    // infinite number that JSON would turn into `null` anyway.
    const includedUnlimited = isUnlimitedOperations(monthlyOperations);
    const includedUsedOperations =
      monthlyOperations > 0
        ? (await this._prisma.aiUsageRecord?.count({
            where: includedUsageFilter(organizationId, periodStart),
          })) ?? 0
        : 0;
    const includedRemainingOperations = includedUnlimited
      ? null
      : Math.max(0, monthlyOperations - includedUsedOperations);
    const includedRestrictionReason = !config.includedAvailable
      ? 'managed_unavailable'
      : includedUnlimited
      ? null
      : monthlyOperations <= 0
      ? 'quota_unavailable'
      : (includedRemainingOperations ?? 0) <= 0
      ? 'quota_exhausted'
      : null;

    return {
      usageMode: config.usageMode,
      provider: config.provider,
      textModel: config.textModel,
      imageModel: config.imageModel,
      roleModels: config.roleModels,
      hasKey: config.workspaceKeyConfigured ?? !!config.apiKey,
      workspaceKeyConfigured: config.workspaceKeyConfigured,
      includedAvailable: config.includedAvailable,
      includedMonthlyOperations: includedUnlimited ? null : monthlyOperations,
      includedUnlimited,
      includedUsedOperations,
      includedRemainingOperations,
      includedRestrictionReason,
      usageByMember: await this.usageByMember(organizationId, periodStart),
      usageByRole: await this.usageByRole(organizationId, periodStart),
      searchEnabled: config.search.enabled,
      searchProvider: config.search.provider,
      searchTaskProviders: config.search.taskProviders,
      searchTopic: config.search.topic,
      searchDepth: config.search.depth,
      hasSearchKey:
        config.workspaceSearchKeyConfigured ?? !!config.search.apiKey,
      /**
       * Which engines can search right now, and nothing about what the keys
       * are.
       *
       * A map rather than the old single flag because the screen draws a field
       * per engine and each of them has to say «saved» or «empty» on its own;
       * `hasSearchKey` stays beside it for the callers that only ask whether
       * search is configured at all. On «Ключи системы» this is the operator's
       * set alone — the workspace's own keys are dormant there and answer
       * through `workspaceSearchKeys` below.
       */
      searchKeys: Object.fromEntries(
        SEARCH_PROVIDERS.map((engine) => [
          engine,
          !!config.search.apiKeys?.[engine],
        ])
      ),
      /**
       * Which engines this workspace has saved a key for, in either mode.
       *
       * In `workspace_key` it repeats `searchKeys` for the engines the
       * workspace pays for itself; in `included` it is the only thing that can
       * say «у этой области сохранён свой ключ Exa» about a key that is
       * dormant rather than spent. Without it, switching back to «Свой ключ»
       * would look like the key had been lost — and a screen that cannot name
       * the key cannot offer to remove it either.
       */
      workspaceSearchKeys: Object.fromEntries(
        SEARCH_PROVIDERS.map((engine) => [
          engine,
          config.workspaceSearchKeys?.[engine] === true,
        ])
      ),
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
      roleModels?: Record<string, string>;
      searchEnabled?: boolean;
      searchProvider?: SearchProvider;
      searchApiKey?: string;
      searchApiKeys?: Record<string, string>;
      searchTaskProviders?: Record<string, string>;
      searchTopic?: 'general' | 'news';
      searchDepth?: 'basic' | 'advanced';
    }
  ) {
    const workspaceSettings = body.usageMode !== 'included';
    const current = await this._prisma.aiProviderSetting?.findUnique?.({
      where: { organizationId },
      select: { searchProvider: true, searchApiKeys: true, searchApiKey: true },
    });
    /**
     * Which engine a key sent in this request belongs to.
     *
     * The request names it when the same save changes the engine, and the
     * stored row names it otherwise. A key is never filed under a guess: this
     * is the whole of what replaced «changing the engine wipes the key»
     * (`content-factory-next-75xn.1`), and it is a stronger promise, because a
     * key saved under `tavily` is not reachable from `exa` at all rather than
     * merely being deleted before it could be.
     */
    const keyBelongsTo = readSearchProvider(
      body.searchProvider ?? current?.searchProvider
    );

    /**
     * Every stored key, plus the ones typed in this request.
     *
     * Merged rather than replaced: the screen sends only the fields a person
     * filled in, and a save that touched the depth selector must not delete
     * the key of an engine it never showed as typed.
     */
    const encryptedKeys: SearchProviderKeys = parseSearchKeys(
      current?.searchApiKeys
    );
    for (const engine of SEARCH_PROVIDERS) {
      const typed = body.searchApiKeys?.[engine];
      if (typed) encryptedKeys[engine] = AuthService.fixedEncryption(typed);
    }
    if (body.searchApiKey) {
      encryptedKeys[keyBelongsTo] = AuthService.fixedEncryption(
        body.searchApiKey
      );
    }
    // Every field below the provider is optional in the request, and the screen
    // saves sections independently. An absent field means "leave it"; an
    // explicitly emptied one means "clear it".
    const data = {
      ...(body.usageMode ? { usageMode: body.usageMode } : {}),
      ...(workspaceSettings ? { provider: body.provider } : {}),
      ...(workspaceSettings && body.textModel !== undefined
        ? { textModel: body.textModel || null }
        : {}),
      ...(workspaceSettings && body.imageModel !== undefined
        ? { imageModel: body.imageModel || null }
        : {}),
      /**
       * Stored as `{}` rather than NULL when the screen clears every row: both
       * read as «nothing routed», and one shape means the column never needs a
       * null check anywhere above it. Parsed on the way in as well as on the
       * way out, so a role this build does not know cannot be written at all.
       */
      ...(workspaceSettings && body.roleModels !== undefined
        ? { roleModels: parseRoleModels(body.roleModels) as AiRoleModels }
        : {}),
      ...(workspaceSettings && body.apiKey
        ? { apiKey: AuthService.fixedEncryption(body.apiKey) }
        : {}),
      ...(typeof body.searchEnabled === 'boolean'
        ? { searchEnabled: body.searchEnabled }
        : {}),
      /** Hidden routing remains generation-mode scoped; per-engine keys and
       * visible search tuning belong to the workspace in either mode. */
      ...(workspaceSettings && body.searchProvider
        ? { searchProvider: body.searchProvider }
        : {}),
      ...(body.searchApiKey || body.searchApiKeys
        ? { searchApiKeys: encryptedKeys }
        : {}),
      ...(workspaceSettings && body.searchTaskProviders !== undefined
        ? {
            searchTaskProviders: parseSearchTaskProviders(
              body.searchTaskProviders
            ) as SearchTaskProviders,
          }
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

  /**
   * Remove one engine's key, or every one of them.
   *
   * Search is only switched off when nothing is left to search with: a person
   * removing the Exa key from a workspace that still holds a Tavily one asked
   * to stop using Exa, not to stop searching, and turning the lane off there
   * would silently break the fact checking they never mentioned.
   */
  async clearSearchKey(organizationId: string, provider?: SearchProvider) {
    const current = await this._prisma.aiProviderSetting?.findUnique?.({
      where: { organizationId },
      select: { searchProvider: true, searchApiKeys: true },
    });
    const remaining: SearchProviderKeys = parseSearchKeys(
      current?.searchApiKeys
    );
    if (provider) delete remaining[provider];
    else for (const engine of SEARCH_PROVIDERS) delete remaining[engine];

    // The single-key column is read only for the engine it was saved under, so
    // clearing that engine has to clear it too; clearing another must not.
    const legacyBelongsTo = readSearchProvider(current?.searchProvider);
    const clearsLegacy = !provider || provider === legacyBelongsTo;

    await this._prisma.aiProviderSetting.updateMany({
      where: { organizationId },
      data: {
        searchApiKeys: remaining as SearchProviderKeys,
        ...(clearsLegacy ? { searchApiKey: null } : {}),
        ...(Object.keys(remaining).length === 0 && clearsLegacy
          ? { searchEnabled: false }
          : {}),
      },
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
