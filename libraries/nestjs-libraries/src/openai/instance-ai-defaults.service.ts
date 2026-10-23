import { sanitizedVideoSettingsV1, videoSettingsUpdateV1 } from '@contentfactory/nestjs-libraries/videos/video-credentials.service';
import type { VideoSettingsInputV1 } from '@contentfactory/nestjs-libraries/videos/video-settings.v1';
import { Injectable } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { serializableWithRetry } from '@contentfactory/nestjs-libraries/database/prisma/serializable.transaction';
import {
  AiProvider,
  INSTANCE_AI_DEFAULTS_ID,
  resetAiConfigCache,
  defaultAdvancedModelForProvider,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import {
  includedQuotaFallback,
  isUnlimitedOperations,
  UNLIMITED_MONTHLY_OPERATIONS,
} from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import {
  AiRoleModels,
  parseRoleModels,
  type AiModelRoutingSettings,
  readStoredModelRouting,
  resolveModelRoutingSettings,
  AI_MODEL_ROUTING_METADATA_KEY,
} from '@contentfactory/nestjs-libraries/openai/ai.roles';
import {
  SEARCH_PROVIDERS,
  SearchProvider,
  SearchProviderKeys,
  SearchTaskProviders,
  parseSearchKeys,
  parseSearchTaskProviders,
} from '@contentfactory/nestjs-libraries/openai/ai.search-tasks';
import {
  DEFAULT_TEXT_FALLBACK_MODEL,
  parseStoredTextFallback,
  resolveOrderedTextChainPolicy,
  resolveTextChainSettings,
  serializeTextFallbackColumn,
  withModelRoutingTextChain,
} from '@contentfactory/nestjs-libraries/openai/ai.text-chain';

/**
 * The keys every workspace that has not brought its own spends, and the one
 * person allowed to change them.
 *
 * `content-factory-next-75xn.16`. Owner's rule, 13.09.2026: «настройка ключей
 * по умолчанию доступна только суперадминам, а для других можно выбрать
 * использовать ключ по умолчанию или использовать свой ключ». The second half
 * was already on the workspace screen; this is the first, and it exists because
 * until now those keys lived only in environment variables — changing the key
 * the whole instance pays with needed a shell on the server.
 *
 * Nothing here is per-organization, so nothing here takes an organization. The
 * caller is the instance's superadmin, checked in the controller the same way
 * every other `/admin` door checks it.
 *
 * Environment variables are not replaced, they are the floor: a column left
 * empty reads as «ask the operator», which is how an instance comes up before
 * anybody has opened this screen, and where it returns if the row is deleted.
 */
@Injectable()
export class InstanceAiDefaultsService {
  constructor(private readonly _prisma: PrismaService) {}

  /**
   * Never returns a key. The screen needs to know whether one is stored and
   * where it came from — this row or the server's variables — and nothing else;
   * a stolen response is worth nothing.
   */
  async read() {
    const row = await this._prisma.instanceAiDefaults?.findUnique({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
    });
    const storedSearchKeys = parseSearchKeys(row?.searchApiKeys);

    /**
     * «Задано на сервере» is a third state, and leaving it out would be a lie
     * in the one direction that matters: a superadmin looking at an empty field
     * on an instance that is quietly working would conclude the key is missing
     * and paste a second one.
     */
    const fromEnvironment = {
      apiKey: !!process.env.AI_INCLUDED_API_KEY,
      provider: !!process.env.AI_PROVIDER,
      textModel: !!process.env.AI_TEXT_MODEL,
      imageModel: !!process.env.AI_IMAGE_MODEL,
      monthlyOperations: !!process.env.AI_INCLUDED_MONTHLY_OPERATIONS,
      searchKeys: Object.fromEntries(
        SEARCH_PROVIDERS.map((engine) => [
          engine,
          !!(
            process.env[`AI_INCLUDED_SEARCH_API_KEY_${engine.toUpperCase()}`] ||
            (process.env.AI_INCLUDED_SEARCH_API_KEY &&
              (process.env.AI_INCLUDED_SEARCH_PROVIDER || 'tavily') === engine)
          ),
        ])
      ),
    };

    /**
     * What the instance is actually running on, field by field.
     *
     * The three-state line below says where a value came from; this says what
     * the value *is*, and without it the screen had to guess. It guessed
     * «openai» — the form's own initial value — on an instance started with
     * `AI_PROVIDER=openrouter`, so the owner's walk of 13.09.2026 showed a
     * superadmin a provider his instance had never used
     * (`content-factory-next-75xn.25`). A field that shows the effective value
     * cannot lie that way: saving it unchanged writes back the same thing.
     *
     * The rules are `operatorDefaults`' rules, not new ones: the row first, the
     * variable as its floor, and a model from the variable only while the
     * provider is still the variable's provider — a model id belongs to its
     * provider, and carrying `gpt-4.1` into an OpenRouter field would offer a
     * value that provider refuses.
     */
    const envProvider =
      process.env.AI_PROVIDER === 'openai' ||
      process.env.AI_PROVIDER === 'openrouter'
        ? (process.env.AI_PROVIDER as AiProvider)
        : null;
    const storedProvider =
      row?.provider === 'openai' || row?.provider === 'openrouter'
        ? (row.provider as AiProvider)
        : null;
    const provider = storedProvider ?? envProvider ?? 'openai';
    const envModel = (value: string | undefined) =>
      provider === (envProvider ?? 'openai') ? value || null : null;
    /**
     * Empty stays empty: a model field left blank means «whatever the provider
     * offers», and printing the built-in default into it would turn a
     * deliberate silence into a saved model id on the next save.
     */
    // «Без предела» is a state of the row (`97dq.27`), never a number shown
    // in the field: the sentinel stays inside the service.
    const unlimited = isUnlimitedOperations(row?.monthlyOperations);
    const effective = {
      provider,
      textModel: row?.textModel ?? envModel(process.env.AI_TEXT_MODEL),
      imageModel: row?.imageModel ?? envModel(process.env.AI_IMAGE_MODEL),
      /**
       * `null` rather than zero when nothing is set anywhere: zero is a real
       * answer here — «included mode is closed» — and it must not appear in a
       * field nobody filled in. When the variable is set, the number shown is
       * the one billing counts by, read through billing's own function so the
       * two cannot drift apart.
       */
      monthlyOperations: unlimited
        ? null
        : row?.monthlyOperations ??
          (process.env.AI_INCLUDED_MONTHLY_OPERATIONS
            ? includedQuotaFallback()
            : null),
      monthlyOperationsUnlimited: unlimited,
    };

    const parsedFallback = parseStoredTextFallback(row?.textFallbackModel);
    const defaultPrimaryModel =
      effective.textModel ??
      (provider === 'openrouter' ? 'openai/gpt-6-luna' : 'gpt-4.1');
    const modelRouting = resolveModelRoutingSettings(
      readStoredModelRouting(row?.roleModels), defaultAdvancedModelForProvider(provider)
    );
    const orderedPolicy = resolveOrderedTextChainPolicy(withModelRoutingTextChain({
      provider, modelRouting, textChain: resolveTextChainSettings(row),
    }), {
      provider,
      usageMode: 'included',
      primaryModel: defaultPrimaryModel,
      hasKey: !!(row?.apiKey || fromEnvironment.apiKey),
    });

    return {
      video: sanitizedVideoSettingsV1(row),
      provider: (row?.provider as AiProvider) ?? null,
      textModel: row?.textModel ?? null,
      imageModel: row?.imageModel ?? null,
      roleModels: parseRoleModels(row?.roleModels),
      modelRouting,
      searchTaskProviders: parseSearchTaskProviders(row?.searchTaskProviders),
      monthlyOperations: unlimited ? null : row?.monthlyOperations ?? null,
      monthlyOperationsUnlimited: unlimited,
      /**
       * The text chain (`content-factory-next-97dq.55`, `on0i.5`). The stored
       * values, NULL where nothing was saved, and beside them what the chain
       * actually uses, so the screen can print the default instead of an empty
       * field and show the effective ordered chain + unavailable reasons.
       */
      textFlexEnabled: row?.textFlexEnabled ?? null,
      textFallbackModel: parsedFallback.structured
        ? parsedFallback.disabled
          ? ''
          : parsedFallback.models[0] ?? null
        : row?.textFallbackModel ?? null,
      textFallbackModels: parsedFallback.inheritedDefault
        ? null
        : parsedFallback.models,
      textFallbackDisabled: parsedFallback.disabled,
      textMaxRetries: parsedFallback.maxRetries ?? null,
      textChain: {
        ...resolveTextChainSettings(row),
        defaultFallbackModel: defaultAdvancedModelForProvider(provider),
        fallbackModels: orderedPolicy.fallbackModels,
        configuredFallbackModels: orderedPolicy.configuredFallbackModels,
        fallbackDisabled: orderedPolicy.fallbackDisabled,
        inheritedDefault: orderedPolicy.inheritedDefault,
        maxRetries: orderedPolicy.maxRetries,
        effectiveChain: orderedPolicy.effectiveChain,
        unavailableModels: orderedPolicy.unavailableModels,
      },
      hasKey: !!row?.apiKey,
      searchKeys: Object.fromEntries(
        SEARCH_PROVIDERS.map((engine) => [engine, !!storedSearchKeys[engine]])
      ),
      fromEnvironment,
      effective,
      updatedAt: row?.updatedAt ?? null,
      updatedByUserId: row?.updatedByUserId ?? null,
    };
  }

  /**
   * Merged, never replaced, field by field.
   *
   * The screen sends only what a person filled in, and a save that changed the
   * monthly allowance must not delete a key it never showed as typed — the same
   * rule the workspace's own settings follow, and for the same reason.
   *
   * An explicitly emptied non-secret field clears; an absent one is left alone.
   * A key is the exception in both directions: empty means «leave it», and
   * removing one is its own door, so a truncated form can never cost an
   * instance the credential it runs on.
   */
  async update(
    userId: string,
    body: VideoSettingsInputV1 & {
      provider?: AiProvider;
      apiKey?: string;
      textModel?: string;
      imageModel?: string;
      roleModels?: Record<string, string>;
      modelRouting?: Partial<AiModelRoutingSettings>;
      searchApiKeys?: Record<string, string>;
      searchTaskProviders?: Record<string, string>;
      monthlyOperations?: number;
      monthlyOperationsUnlimited?: boolean;
      textFlexEnabled?: boolean;
      textFallbackModel?: string;
      textFallbackModels?: string[];
      textFallbackDisabled?: boolean;
      textMaxRetries?: number;
    }
  ) {
    const save = (prisma: Pick<PrismaService, 'instanceAiDefaults'>) =>
      this.writeSettings(userId, body, prisma);
    if (body.videoApiKeys !== undefined || body.videoSpendPolicy !== undefined) {
      await serializableWithRetry(this._prisma, save, 'Video settings are busy; retry the same update.');
    } else {
      await save(this._prisma);
    }
    resetAiConfigCache();
    return this.read();
  }

  private async writeSettings(
    userId: string,
    body: Parameters<InstanceAiDefaultsService['update']>[1],
    prisma: Pick<PrismaService, 'instanceAiDefaults'>
  ) {
    const current = await prisma.instanceAiDefaults?.findUnique({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
      select: {
        searchApiKeys: true,
        videoApiKeys: true,
        videoSpendPolicy: true,
        monthlyOperations: true,
        textFallbackModel: true,
        roleModels: true,
      },
    });

    const searchApiKeys: SearchProviderKeys = parseSearchKeys(
      current?.searchApiKeys
    );
    for (const engine of SEARCH_PROVIDERS) {
      const typed = body.searchApiKeys?.[engine];
      if (typed) searchApiKeys[engine] = AuthService.fixedEncryption(typed);
    }

    const serializedFallback = serializeTextFallbackColumn({
      textFallbackModel: body.textFallbackModel,
      textFallbackModels: body.textFallbackModels,
      textFallbackDisabled: body.textFallbackDisabled,
      textMaxRetries: body.textMaxRetries,
      currentColumn: current?.textFallbackModel,
    });

    const data = {
      ...videoSettingsUpdateV1(current, body),
      ...(body.provider ? { provider: body.provider } : {}),
      ...(body.apiKey
        ? { apiKey: AuthService.fixedEncryption(body.apiKey) }
        : {}),
      ...(body.textModel !== undefined
        ? { textModel: body.textModel || null }
        : {}),
      ...(body.imageModel !== undefined
        ? { imageModel: body.imageModel || null }
        : {}),
      ...(body.roleModels !== undefined || body.modelRouting !== undefined
        ? { roleModels: {
            ...parseRoleModels(body.roleModels ?? current?.roleModels),
            ...(body.modelRouting !== undefined || readStoredModelRouting(current?.roleModels)
              ? { [AI_MODEL_ROUTING_METADATA_KEY]: {
                  ...readStoredModelRouting(current?.roleModels), ...body.modelRouting,
                } } : {}),
          } as AiRoleModels }
        : {}),
      ...(body.searchApiKeys ? { searchApiKeys } : {}),
      ...(body.searchTaskProviders !== undefined
        ? {
            searchTaskProviders: parseSearchTaskProviders(
              body.searchTaskProviders
            ) as SearchTaskProviders,
          }
        : {}),
      // The switch wins over the field: «без предела» on stores the state,
      // off with a number stores the number (`97dq.27`).
      ...(body.monthlyOperationsUnlimited === true
        ? { monthlyOperations: UNLIMITED_MONTHLY_OPERATIONS }
        : body.monthlyOperations !== undefined
        ? { monthlyOperations: Math.max(0, Math.floor(body.monthlyOperations)) }
        : body.monthlyOperationsUnlimited === false &&
          isUnlimitedOperations(current?.monthlyOperations)
        ? { monthlyOperations: null }
        : {}),
      ...(typeof body.textFlexEnabled === 'boolean'
        ? { textFlexEnabled: body.textFlexEnabled }
        : {}),
      // Emptied means «back to the default», on the same terms as the models;
      // ordered fallback arrays and retry counts serialize into the same column.
      ...(serializedFallback !== undefined
        ? { textFallbackModel: serializedFallback }
        : {}),
      updatedByUserId: userId,
    };

    await prisma.instanceAiDefaults.upsert({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
      create: { id: INSTANCE_AI_DEFAULTS_ID, ...data },
      update: data,
    });
  }

  /** Remove the generation key, dropping the instance back to its variables. */
  async clearKey(userId: string) {
    await this._prisma.instanceAiDefaults?.updateMany({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
      data: { apiKey: null, updatedByUserId: userId },
    });
    resetAiConfigCache();
    return this.read();
  }

  /**
   * Remove one engine's search key, or every one of them. Per engine because a
   * superadmin removing Exa asked to stop using Exa, not to stop searching.
   */
  async clearSearchKey(userId: string, provider?: SearchProvider) {
    const current = await this._prisma.instanceAiDefaults?.findUnique({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
      select: { searchApiKeys: true },
    });
    const remaining: SearchProviderKeys = parseSearchKeys(
      current?.searchApiKeys
    );
    if (provider) delete remaining[provider];
    else for (const engine of SEARCH_PROVIDERS) delete remaining[engine];

    await this._prisma.instanceAiDefaults?.updateMany({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
      data: {
        searchApiKeys: remaining as SearchProviderKeys,
        updatedByUserId: userId,
      },
    });
    resetAiConfigCache();
    return this.read();
  }
}
