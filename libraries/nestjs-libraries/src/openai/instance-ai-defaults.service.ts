import { Injectable } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  AiProvider,
  INSTANCE_AI_DEFAULTS_ID,
  resetAiConfigCache,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import { includedQuotaFallback } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import {
  AiRoleModels,
  parseRoleModels,
} from '@contentfactory/nestjs-libraries/openai/ai.roles';
import {
  SEARCH_PROVIDERS,
  SearchProvider,
  SearchProviderKeys,
  SearchTaskProviders,
  parseSearchKeys,
  parseSearchTaskProviders,
} from '@contentfactory/nestjs-libraries/openai/ai.search-tasks';

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
      monthlyOperations:
        row?.monthlyOperations ??
        (process.env.AI_INCLUDED_MONTHLY_OPERATIONS
          ? includedQuotaFallback()
          : null),
    };

    return {
      provider: (row?.provider as AiProvider) ?? null,
      textModel: row?.textModel ?? null,
      imageModel: row?.imageModel ?? null,
      roleModels: parseRoleModels(row?.roleModels),
      searchTaskProviders: parseSearchTaskProviders(row?.searchTaskProviders),
      monthlyOperations: row?.monthlyOperations ?? null,
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
    body: {
      provider?: AiProvider;
      apiKey?: string;
      textModel?: string;
      imageModel?: string;
      roleModels?: Record<string, string>;
      searchApiKeys?: Record<string, string>;
      searchTaskProviders?: Record<string, string>;
      monthlyOperations?: number;
    }
  ) {
    const current = await this._prisma.instanceAiDefaults?.findUnique({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
      select: { searchApiKeys: true },
    });

    const searchApiKeys: SearchProviderKeys = parseSearchKeys(
      current?.searchApiKeys
    );
    for (const engine of SEARCH_PROVIDERS) {
      const typed = body.searchApiKeys?.[engine];
      if (typed) searchApiKeys[engine] = AuthService.fixedEncryption(typed);
    }

    const data = {
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
      ...(body.roleModels !== undefined
        ? { roleModels: parseRoleModels(body.roleModels) as AiRoleModels }
        : {}),
      ...(body.searchApiKeys ? { searchApiKeys } : {}),
      ...(body.searchTaskProviders !== undefined
        ? {
            searchTaskProviders: parseSearchTaskProviders(
              body.searchTaskProviders
            ) as SearchTaskProviders,
          }
        : {}),
      ...(body.monthlyOperations !== undefined
        ? { monthlyOperations: Math.max(0, Math.floor(body.monthlyOperations)) }
        : {}),
      updatedByUserId: userId,
    };

    await this._prisma.instanceAiDefaults.upsert({
      where: { id: INSTANCE_AI_DEFAULTS_ID },
      create: { id: INSTANCE_AI_DEFAULTS_ID, ...data },
      update: data,
    });
    resetAiConfigCache();
    return this.read();
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
