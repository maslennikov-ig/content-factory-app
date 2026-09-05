import { Prisma } from '@prisma/client';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  AiProviderNotConfigured,
  AiConfig,
  getActiveAiConfig,
  getActiveAiOrganizationId,
  loadAiConfig,
  setAiProviderSettingReader,
  withActiveAiConfig,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import {
  AiRole,
  modelFor,
  roleForOperation,
} from '@contentfactory/nestjs-libraries/openai/ai.roles';
import { getActingUserId } from '@contentfactory/nestjs-libraries/user/acting.user';

export type AiOperation =
  | 'text_generation'
  | 'image_generation'
  | 'web_research'
  | 'copilot_chat'
  | 'agent'
  | 'autopost'
  | 'content_classification'
  /**
   * Turning a measurement into a proposed voice profile. A separate operation
   * for observability only: it spends the same admission as any other call and
   * introduces no billing semantics of its own — agreed in
   * `content-intelligence-brand-profile-spec.md` §9.2.
   */
  | 'brand_profile_assist';

/**
 * Admission is a count-then-insert against one organization's ledger, both
 * sides covered by `@@index([organizationId, usageMode, createdAt])`. On a
 * healthy database it commits in milliseconds, so these bounds exist to fail a
 * degraded one fast rather than to leave room for slow work: an admission that
 * has not committed within them is queueing behind something, and the caller is
 * better served by a retryable answer than by a connection held open in front
 * of a model call.
 *
 * Unset, these inherit Prisma's defaults of `maxWait` 2 s and `timeout` 5 s
 * (`@prisma/client/runtime/library.d.ts`, `transactionOptions`), which the
 * whole retry budget would then multiply. Stating them keeps that worst case
 * where this file can see it.
 */
const ADMISSION_MAX_WAIT_MS = 1_000;
const ADMISSION_TIMEOUT_MS = 2_000;

/**
 * Serializable admissions for the same organization collide by design, and the
 * loser is told to retry. Retrying immediately puts every loser back into the
 * same microtask window they just collided in, so each wait is drawn uniformly
 * from a doubling window — full jitter — which spreads the retries instead of
 * re-synchronising them.
 *
 * Three attempts add at most 75 ms of waiting to two collisions, and bound the
 * whole admission by `3 * (maxWait + timeout)`, about nine seconds against a
 * database that has stopped answering.
 */
const MAX_ADMISSION_ATTEMPTS = 3;
const ADMISSION_RETRY_BASE_MS = 25;

/**
 * A provider operation still marked as admitted after a full day is no longer
 * credible evidence of work in progress. Terminal attempts continue to count,
 * while an orphaned admission returns allowance without guessing whether the
 * provider call succeeded or failed.
 */
const ACTIVE_ADMISSION_WINDOW_MS = 24 * 60 * 60 * 1_000;

export class AiIncludedQuotaExceeded extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'AI_INCLUDED_QUOTA_EXHAUSTED',
        message:
          'Included AI has no configured allowance or its current allowance is exhausted. Connect a workspace API key.',
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
    this.name = 'AiIncludedQuotaExceeded';
  }
}

/**
 * Contention is not the client's fault and not a quota answer, so it is not a
 * 429: an exhausted allowance already owns that status, and a caller that reads
 * only the status would show a workspace an upsell for a database that was
 * simply busy. 503 is the honest reading — the server could not take the
 * request now and the same request may be taken later. The message says what
 * did not happen and stops there; nothing here can promise the retry succeeds.
 */
export class AiAdmissionContended extends HttpException {
  constructor(cause?: unknown) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'AI_ADMISSION_CONTENDED',
        message:
          'The AI allowance ledger could not admit this operation. No included allowance was used and no model was called. The same request can be sent again.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
      { cause }
    );
    this.name = 'AiAdmissionContended';
  }
}

/**
 * The role an operation runs under when the caller names none.
 *
 * An operation is a billing unit; a role is what the model is being asked to
 * do. They are one-to-one for most doors and deliberately not for
 * `text_generation`, which covers drafting a post, reading a voice off samples
 * and repairing a sentence against it. Those name their own role at the call.
 */
const roleOf = (operation: AiOperation, role?: AiRole): AiRole =>
  role ?? roleForOperation(operation);

export const aiBillingPeriodStart = (createdAt: Date, now = new Date()) => {
  if (now < createdAt) return new Date(createdAt);

  const anchorYear = createdAt.getUTCFullYear();
  const anchorMonth = createdAt.getUTCMonth();
  const monthOffset =
    (now.getUTCFullYear() - anchorYear) * 12 + now.getUTCMonth() - anchorMonth;
  const startForOffset = (offset: number) => {
    const firstOfMonth = new Date(
      Date.UTC(anchorYear, anchorMonth + offset, 1)
    );
    const lastDay = new Date(
      Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)
    ).getUTCDate();
    return new Date(
      Date.UTC(
        firstOfMonth.getUTCFullYear(),
        firstOfMonth.getUTCMonth(),
        Math.min(createdAt.getUTCDate(), lastDay),
        createdAt.getUTCHours(),
        createdAt.getUTCMinutes(),
        createdAt.getUTCSeconds(),
        createdAt.getUTCMilliseconds()
      )
    );
  };

  const candidate = startForOffset(monthOffset);
  return candidate > now ? startForOffset(monthOffset - 1) : candidate;
};

/**
 * When the current period ends, which is when the included allowance is whole
 * again. Thirty-two days after the period start lands inside the next period
 * and never past it: two consecutive periods are at least 59 days long, and a
 * single one is at most 31.
 */
export const aiBillingPeriodEnd = (createdAt: Date, now = new Date()) =>
  aiBillingPeriodStart(
    createdAt,
    new Date(
      aiBillingPeriodStart(createdAt, now).getTime() + 32 * 24 * 60 * 60 * 1_000
    )
  );

/**
 * The rows that count against the included allowance this period, written once
 * so the number a person is shown and the number that decides admission cannot
 * drift apart. Admission owns this predicate; reading it changes nothing.
 *
 * Exported since `content-factory-next-fn33.28.6`. The administrator's settings
 * screen counted every row of the period instead, so the two screens of one
 * workspace printed different «left» numbers and nothing in the product
 * explained the difference. There is one allowance, so there is one predicate:
 * `ai.provider.service.ts` reads this same function rather than repeating its
 * `where` by hand.
 */
export const includedUsageFilter = (
  organizationId: string,
  periodStart: Date
) => ({
  organizationId,
  usageMode: 'included' as const,
  createdAt: { gte: periodStart },
  OR: [
    { status: { not: 'admitted' as const } },
    {
      createdAt: {
        gte: new Date(Date.now() - ACTIVE_ADMISSION_WINDOW_MS),
      },
    },
  ],
});

/**
 * What a person may be told before they press a paid button. Counts only: no
 * key, no member, nothing another workspace could read from it.
 *
 * A workspace key carries no counted ceiling, so it says so in words instead
 * of inventing a number.
 */
export type AiAllowanceView =
  /**
   * Ни включённого лимита, ни ключа: пространству нечем позвать модель вовсе.
   *
   * `content-factory-next-fn33.28.9`. Свежее пространство отвечало
   * `{mode:'included', limit:0, remaining:0}`, и экран читал это как
   * «исчерпано»: `remaining <= 0` истинно и тогда, когда потратили всё, и
   * тогда, когда выдавать было нечего. Человеку, который ничего не тратил,
   * говорили, что лимит кончился.
   *
   * Это ровно то условие, при котором `/copilot/chat` и любая платная дверь
   * отвечают 503 `AI_SELECTED_CREDENTIAL_UNAVAILABLE`: у выбранного режима нет
   * ключа. Счётчиков здесь нет, потому что считать нечего.
   */
  | { mode: 'unavailable' }
  | { mode: 'workspace_key' }
  | {
      mode: 'included';
      used: number;
      limit: number;
      remaining: number;
      resetsAt: string;
    };

/**
 * `P2034` is a serializable write conflict; `P2028` covers the transaction API
 * giving up, which is what both bound above surface as. Neither says anything
 * about whether the operation is allowed, only that the ledger could not settle
 * the question right now.
 */
const RETRYABLE_ADMISSION_CODES = new Set(['P2034', 'P2028']);

const isRetryableAdmissionFailure = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'string' &&
  RETRYABLE_ADMISSION_CODES.has((error as { code: string }).code);

type ExecutableAiModel = object & {
  doGenerate: (...args: any[]) => PromiseLike<any>;
  doStream: (...args: any[]) => PromiseLike<{
    stream: ReadableStream<any>;
    [key: string]: unknown;
  }>;
};

@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {
    // Credential resolution runs before every AI operation and used to open a
    // connection pool of its own to read one row. Lend it the injected client
    // instead, so the free `loadAiConfig` and `hasAiProvider` helpers reach the
    // database the application already has.
    setAiProviderSettingReader((organizationId) =>
      prisma.aiProviderSetting.findUnique({ where: { organizationId } })
    );
  }

  /**
   * The wait between admission attempts, isolated so a test can hold it open
   * and prove the next attempt really is deferred behind it.
   */
  protected pauseBeforeRetry(milliseconds: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  /** Uniform draw from a doubling window: full jitter, not a fixed head. */
  private retryDelay(attempt: number) {
    return Math.random() * ADMISSION_RETRY_BASE_MS * 2 ** (attempt - 1);
  }

  private assertTenant(organizationId: string) {
    const activeOrganizationId = getActiveAiOrganizationId();
    if (activeOrganizationId && activeOrganizationId !== organizationId) {
      const error = new Error('An AI operation cannot cross organizations.');
      error.name = 'AiTenantContextMismatch';
      throw error;
    }
  }

  private continueAdmittedOperation<T>(
    organizationId: string,
    config: AiConfig,
    callback: () => T
  ): T {
    this.assertTenant(organizationId);
    // No role argument: the operation is already admitted under one, and
    // `withActiveAiConfig` keeps whichever is in flight.
    return withActiveAiConfig(organizationId, config, callback);
  }

  private async createAdmission(
    organizationId: string,
    operation: AiOperation,
    config: AiConfig,
    role: AiRole
  ) {
    const data = {
      organizationId,
      // Null for work no person asked for: scheduled autoposting, queued
      // activities, anything reached through the organization's API key. The
      // ledger says «the organization, nobody in particular» rather than
      // attributing it to whoever happened to configure the schedule.
      userId: getActingUserId() ?? null,
      usageMode: config.usageMode,
      operation,
      /**
       * What the model was asked to do, beside what the product was doing.
       *
       * `content-factory-next-x63z`. The ledger recorded the operation and the
       * model id, and the model id was the same for every text operation, so
       * «what did classification cost us» had no answer at all — the two rows
       * that differed in price looked identical. The role is the axis the
       * routing is configured on, so it is the axis the spend has to be
       * readable on, otherwise a change to it cannot be judged afterwards.
       */
      role,
      provider: config.provider,
      model: modelFor(role, config),
      status: 'admitted' as const,
    };

    if (config.usageMode === 'workspace_key') {
      return this.prisma.aiUsageRecord.create({ data });
    }

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const subscription = await tx.subscription.findUnique({
              where: { organizationId },
              select: { includedAiMonthlyOperations: true, createdAt: true },
            });
            const quota = subscription?.includedAiMonthlyOperations ?? 0;
            if (quota <= 0) throw new AiIncludedQuotaExceeded();

            const used = await tx.aiUsageRecord.count({
              where: includedUsageFilter(
                organizationId,
                aiBillingPeriodStart(subscription.createdAt)
              ),
            });
            if (used >= quota) throw new AiIncludedQuotaExceeded();
            return tx.aiUsageRecord.create({ data });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: ADMISSION_MAX_WAIT_MS,
            timeout: ADMISSION_TIMEOUT_MS,
          }
        );
      } catch (error) {
        // A quota answer, a tenant error or a broken database is settled: it
        // means the same thing on the next attempt.
        if (!isRetryableAdmissionFailure(error)) throw error;
        if (attempt >= MAX_ADMISSION_ATTEMPTS) {
          throw new AiAdmissionContended(error);
        }
        await this.pauseBeforeRetry(this.retryDelay(attempt));
      }
    }
  }

  private async finishAdmission(id: string, succeeded: boolean) {
    try {
      await this.prisma.aiUsageRecord.update({
        where: { id },
        data: { status: succeeded ? 'succeeded' : 'failed' },
      });
    } catch {
      // Admission already counted the operation before the provider call. A
      // transient final-status write must not turn a completed provider request
      // into a client-visible failure and invite a second paid call.
      console.error('Failed to finalize AI usage record status');
    }
  }

  /**
   * The allowance, read and never written.
   *
   * The screen asks this before a paid button is pressed, so it answers with
   * the same counting rule admission uses. The admin settings screen counts
   * every row in the period instead, including admissions abandoned a day ago;
   * that number is the ledger's, this one is the next click's.
   *
   * The organisation comes from the caller's request and is named in the
   * `where`, so this cannot read another workspace's ledger.
   */
  async readAllowance(organizationId: string): Promise<AiAllowanceView> {
    this.assertTenant(organizationId);
    const config = await loadAiConfig(organizationId);
    /**
     * Сначала «а есть ли чем», и только потом «сколько осталось».
     *
     * `config.apiKey` пуст ровно тогда, когда у выбранного режима нет ключа:
     * у `workspace_key` его не задал администратор, у `included` его нет у
     * оператора. Это то же условие, по которому `hasAiProvider` отвечает
     * «нет», а платные двери — 503. Пустой ключ наружу не уезжает: наружу
     * уезжает одно слово о том, что позвать модель нечем.
     */
    if (!config.apiKey) return { mode: 'unavailable' };
    if (config.usageMode !== 'included') return { mode: 'workspace_key' };

    const subscription = await this.prisma.subscription?.findUnique({
      where: { organizationId },
      select: { includedAiMonthlyOperations: true, createdAt: true },
    });
    const organization = await this.prisma.organization?.findUnique({
      where: { id: organizationId },
      select: { createdAt: true },
    });
    // The subscription anchors the period when there is one; without it the
    // workspace's own birthday does, exactly as the settings screen reads it.
    const anchor =
      subscription?.createdAt ?? organization?.createdAt ?? new Date();
    const limit = subscription?.includedAiMonthlyOperations ?? 0;
    const periodStart = aiBillingPeriodStart(anchor);
    const used =
      limit > 0
        ? (await this.prisma.aiUsageRecord?.count({
            where: includedUsageFilter(organizationId, periodStart),
          })) ?? 0
        : 0;

    return {
      mode: 'included',
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetsAt: aiBillingPeriodEnd(anchor).toISOString(),
    };
  }

  /**
   * @param role what the model is being asked to do, when that is finer than
   * the operation. Omitted, the operation's own role applies and the call
   * keeps exactly the model it had before roles existed.
   */
  async executeAiOperation<T>(
    organizationId: string,
    operation: AiOperation,
    callback: () => Promise<T>,
    role?: AiRole
  ): Promise<T> {
    return this.executeOperationWithConfig(
      organizationId,
      operation,
      callback,
      undefined,
      role
    );
  }

  private async executeOperationWithConfig<T>(
    organizationId: string,
    operation: AiOperation,
    callback: () => Promise<T>,
    preparedConfig?: AiConfig,
    role?: AiRole
  ): Promise<T> {
    this.assertTenant(organizationId);
    if (getActiveAiConfig(organizationId)) {
      return callback();
    }
    const config = preparedConfig || (await loadAiConfig(organizationId));
    if (!config.apiKey) {
      throw new AiProviderNotConfigured();
    }
    const chosen = roleOf(operation, role);
    const admission = await this.createAdmission(
      organizationId,
      operation,
      config,
      chosen
    );
    try {
      const result = await withActiveAiConfig(
        organizationId,
        config,
        callback,
        chosen
      );
      await this.finishAdmission(admission.id, true);
      return result;
    } catch (error) {
      await this.finishAdmission(admission.id, false);
      throw error;
    }
  }

  async *executeAiStreamOperation<T>(
    organizationId: string,
    operation: AiOperation,
    factory: () => Promise<AsyncIterable<T>> | AsyncIterable<T>,
    role?: AiRole
  ): AsyncGenerator<T> {
    this.assertTenant(organizationId);
    if (getActiveAiConfig(organizationId)) {
      for await (const item of await factory()) yield item;
      return;
    }
    const config = await loadAiConfig(organizationId);
    if (!config.apiKey) {
      throw new AiProviderNotConfigured();
    }
    const chosen = roleOf(operation, role);
    const admission = await this.createAdmission(
      organizationId,
      operation,
      config,
      chosen
    );
    let succeeded = false;
    let iterator: AsyncIterator<T> | undefined;
    try {
      const iterable = await withActiveAiConfig(
        organizationId,
        config,
        factory,
        chosen
      );
      iterator = iterable[Symbol.asyncIterator]();
      while (true) {
        const item = await withActiveAiConfig(organizationId, config, () =>
          iterator!.next()
        );
        if (item.done) break;
        yield item.value;
      }
      succeeded = true;
    } finally {
      try {
        const close = iterator?.return?.bind(iterator);
        if (!succeeded && close) {
          await withActiveAiConfig(organizationId, config, () => close());
        }
      } finally {
        await this.finishAdmission(admission.id, succeeded);
      }
    }
  }

  /**
   * Mastra resolves a model object before it calls the provider. Wrap the
   * public LanguageModelV2 execution methods so the ledger follows the real
   * generate call and the complete stream lifetime, not object construction.
   */
  wrapModelExecution<T extends ExecutableAiModel>(
    organizationId: string,
    operation: AiOperation,
    model: T,
    preparedConfig?: AiConfig,
    admittedConfig?: AiConfig
  ): T {
    const doGenerate = model.doGenerate.bind(model);
    const doStream = model.doStream.bind(model);
    return new Proxy(model, {
      get: (target, property) => {
        if (property === 'doGenerate') {
          return (...args: any[]) => {
            const execute = () => Promise.resolve(doGenerate(...args));
            return admittedConfig
              ? this.continueAdmittedOperation(
                  organizationId,
                  admittedConfig,
                  execute
                )
              : this.executeOperationWithConfig(
                  organizationId,
                  operation,
                  execute,
                  preparedConfig
                );
          };
        }
        if (property === 'doStream') {
          return (...args: any[]) => {
            const execute = () => Promise.resolve(doStream(...args));
            return admittedConfig
              ? this.continueAdmittedOperation(
                  organizationId,
                  admittedConfig,
                  execute
                )
              : this.executeModelStream(
                  organizationId,
                  operation,
                  execute,
                  preparedConfig
                );
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  /**
   * Resolve a dynamic Mastra model with the selected tenant configuration, but
   * defer admission until Mastra invokes the returned model's execution API.
   */
  async prepareModelExecution<T extends ExecutableAiModel>(
    organizationId: string,
    operation: AiOperation,
    factory: () => Promise<T>
  ): Promise<T> {
    this.assertTenant(organizationId);
    const activeConfig = getActiveAiConfig(organizationId);
    if (activeConfig) {
      return this.wrapModelExecution(
        organizationId,
        operation,
        await factory(),
        undefined,
        activeConfig
      );
    }
    const config = await loadAiConfig(organizationId);
    if (!config.apiKey) {
      throw new AiProviderNotConfigured();
    }
    const model = await withActiveAiConfig(
      organizationId,
      config,
      factory,
      roleOf(operation)
    );
    return this.wrapModelExecution(organizationId, operation, model, config);
  }

  private async executeModelStream<T extends { stream: ReadableStream<any> }>(
    organizationId: string,
    operation: AiOperation,
    factory: () => Promise<T>,
    preparedConfig?: AiConfig,
    role?: AiRole
  ): Promise<T> {
    this.assertTenant(organizationId);
    if (getActiveAiConfig(organizationId)) {
      return factory();
    }
    const config = preparedConfig || (await loadAiConfig(organizationId));
    if (!config.apiKey) {
      throw new AiProviderNotConfigured();
    }
    const chosen = roleOf(operation, role);
    const admission = await this.createAdmission(
      organizationId,
      operation,
      config,
      chosen
    );
    let result: T;
    try {
      result = await withActiveAiConfig(
        organizationId,
        config,
        factory,
        chosen
      );
    } catch (error) {
      await this.finishAdmission(admission.id, false);
      throw error;
    }

    const reader = result.stream.getReader();
    /**
     * A consumer that has taken every chunk usually releases the stream instead
     * of issuing the one further read that would observe `done`, so the wrapper
     * would otherwise learn of the end only after the cancellation had already
     * stamped the ledger. The reader's own `closed` promise says the provider
     * stream ended whether or not anyone asked for the final read.
     */
    let providerStreamEnded = false;
    reader.closed.then(
      () => {
        providerStreamEnded = true;
      },
      () => undefined
    );
    let finished = false;
    const finish = async (succeeded: boolean) => {
      if (finished) return;
      finished = true;
      await this.finishAdmission(admission.id, succeeded);
    };
    const stream = new ReadableStream({
      pull: async (controller) => {
        try {
          const item = await withActiveAiConfig(organizationId, config, () =>
            reader.read()
          );
          if (item.done) {
            await finish(true);
            controller.close();
            return;
          }
          controller.enqueue(item.value);
        } catch (error) {
          await finish(false);
          controller.error(error);
        }
      },
      cancel: async (reason) => {
        // Recorded before the source is cancelled: cancelling a source resolves
        // its pending read as `done`, which would read as a success that never
        // happened.
        const finalization = finish(providerStreamEnded);
        try {
          await withActiveAiConfig(organizationId, config, () =>
            reader.cancel(reason)
          );
        } finally {
          await finalization;
        }
      },
    });

    return { ...result, stream };
  }
}
