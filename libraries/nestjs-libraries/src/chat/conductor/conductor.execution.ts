import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  runWithAiExecutionUsage,
  type TextCallUsage,
  type SearchCallUsage,
} from '../../openai/ai.text-chain';
import { AGENT_RUN_CLAIM_TTL_SECONDS } from './agent-run-claims';
import { stopAfterOpenProposalRefusal, stepNotes } from './conductor.steps';

/** Technical fuses, not a definition of a completed task or a financial allowance. */
export const CONDUCTOR_MAX_TASK_DURATION_MS = 24 * 60 * 60 * 1_000;

export const CONDUCTOR_EXECUTION_DEFAULTS = {
  maxDurationMs: 6 * AGENT_RUN_CLAIM_TTL_SECONDS * 1_000,
  emergencyMaxSteps: 64,
  maxIdenticalToolResults: 3,
} as const;

export type ConductorExecutionPolicy = {
  maxDurationMs: number;
  emergencyMaxSteps: number;
  maxIdenticalToolResults: number;
  /** Optional observed thresholds. No extra dollar/token allowance is assumed. */
  maxCostUsd?: number;
  maxTokens?: number;
};

const positive = (value: string | undefined, name: string, integer = true) => {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isSafeInteger(parsed))) {
    throw new Error(`Invalid ${name}.`);
  }
  return parsed;
};

export const readConductorExecutionPolicy = (
  env: Record<string, string | undefined> = process.env
): ConductorExecutionPolicy => {
  const maxDurationMs = positive(env.CF_AGENT_TASK_MAX_DURATION_MS, 'CF_AGENT_TASK_MAX_DURATION_MS')
    ?? CONDUCTOR_EXECUTION_DEFAULTS.maxDurationMs;
  // Active thread claims and durable execution leases renew while work is in
  // flight; cap the technical fuse to one day so misconfigured env values fail fast.
  if (maxDurationMs > CONDUCTOR_MAX_TASK_DURATION_MS) {
    throw new Error('CF_AGENT_TASK_MAX_DURATION_MS exceeds the maximum technical fuse window.');
  }
  return {
    maxDurationMs,
    emergencyMaxSteps: positive(env.CF_AGENT_TASK_EMERGENCY_MAX_STEPS, 'CF_AGENT_TASK_EMERGENCY_MAX_STEPS')
      ?? CONDUCTOR_EXECUTION_DEFAULTS.emergencyMaxSteps,
    maxIdenticalToolResults: positive(env.CF_AGENT_TASK_MAX_IDENTICAL_TOOL_RESULTS, 'CF_AGENT_TASK_MAX_IDENTICAL_TOOL_RESULTS')
      ?? CONDUCTOR_EXECUTION_DEFAULTS.maxIdenticalToolResults,
    ...(() => {
      const maxCostUsd = positive(env.CF_AGENT_TASK_MAX_COST_USD, 'CF_AGENT_TASK_MAX_COST_USD', false);
      const maxTokens = positive(env.CF_AGENT_TASK_MAX_TOKENS, 'CF_AGENT_TASK_MAX_TOKENS');
      return { ...(maxCostUsd !== undefined ? { maxCostUsd } : {}), ...(maxTokens !== undefined ? { maxTokens } : {}) };
    })(),
  };
};

export type ConductorExecutionStopCode =
  | 'AGENT_TASK_TIME_BUDGET'
  | 'AGENT_TASK_TOKEN_BUDGET'
  | 'AGENT_TASK_COST_BUDGET'
  | 'AGENT_TASK_COST_UNKNOWN'
  | 'AGENT_TASK_UNCERTAIN'
  | 'AGENT_TASK_OPERATION_FAILED'
  | 'AGENT_TASK_NO_PROGRESS'
  | 'AGENT_TASK_EMERGENCY_FUSE'
  | 'AGENT_TASK_STOPPED';

export class ConductorExecutionStopped extends Error {
  readonly executionBudgetStop = true;
  constructor(readonly code: ConductorExecutionStopCode) {
    super('The task stopped before another provider request. Preserve confirmed results and report remaining work; do not retry automatically.');
    this.name = 'ConductorExecutionStopped';
  }
}

const current = new AsyncLocalStorage<ConductorExecution>();
export const currentConductorExecution = () => current.getStore();

const finite = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Only a digest is kept; supplied text, arguments and provider payloads are not. */
const digest = (value: unknown): string => {
  const stable = (one: unknown): unknown => {
    if (Array.isArray(one)) return one.map(stable);
    if (!one || typeof one !== 'object') return one;
    return Object.fromEntries(Object.keys(one).sort().map((key) => [key, stable((one as Record<string, unknown>)[key])]));
  };
  return createHash('sha256').update(JSON.stringify(stable(value)) ?? 'undefined').digest('hex');
};

/**
 * One invocation's measurements across native streams/approval legs. The
 * runtime is still Mastra's loop. Real allowance admission/billing remains in
 * AiUsageService; nested domain ledgers notify this request-scoped observer.
 */
export class ConductorExecution {
  readonly policy: ConductorExecutionPolicy;
  readonly signal: AbortSignal;
  private readonly startedAt: number;
  private readonly halt = new AbortController();
  private stopCode?: ConductorExecutionStopCode;
  private steps = 0;
  private paidInFlight: string | null = null;
  private knownCostUsd = 0;
  private tokens = 0;
  private unknownCostCalls = 0;
  private possiblyBilled = false;
  private providerCalls = 0;
  private readonly results = new Map<string, number>();
  private notes: readonly string[] = [];

  constructor(private readonly options: {
    requestId: string;
    policy?: ConductorExecutionPolicy;
    signal?: AbortSignal;
    now?: () => number;
  }) {
    this.policy = options.policy ?? readConductorExecutionPolicy();
    this.startedAt = this.now();
    this.signal = AbortSignal.any([
      ...(options.signal ? [options.signal] : []),
      this.halt.signal,
      ...(options.now ? [] : [AbortSignal.timeout(this.policy.maxDurationMs)]),
    ]);
  }

  private now() { return (this.options.now ?? Date.now)(); }

  private check() {
    if (!this.stopCode && this.now() - this.startedAt >= this.policy.maxDurationMs) this.stopCode = 'AGENT_TASK_TIME_BUDGET';
    if (!this.stopCode && this.signal.aborted) {
      this.stopCode = this.signal.reason?.name === 'TimeoutError' ? 'AGENT_TASK_TIME_BUDGET' : 'AGENT_TASK_STOPPED';
    }
    return this.stopCode;
  }

  /** Refuse only new work; do not cancel an already admitted artifact write. */
  assertCanSpend = () => {
    const code = this.check();
    if (code) throw new ConductorExecutionStopped(code);
  };

  /** Synchronous reservation before any policy/service await. */
  reservePaidOperation(owner = ''): { ok: boolean; code?: string } {
    const code = this.check();
    if (code) return { ok: false, code };
    if (this.paidInFlight !== null) return { ok: false, code: 'AGENT_TASK_OPERATION_IN_FLIGHT' };
    this.paidInFlight = owner;
    return { ok: true };
  }

  releasePaidOperation(owner?: string) {
    if (owner === undefined || owner === this.paidInFlight) this.paidInFlight = null;
  }

  stop(code: ConductorExecutionStopCode = 'AGENT_TASK_STOPPED') {
    this.stopCode ??= code;
    if (code === 'AGENT_TASK_STOPPED') this.halt.abort();
  }

  private observe(call: TextCallUsage | SearchCallUsage) {
    this.providerCalls += 1;
    const cost = finite(call.costUsd);
    if (cost !== undefined) this.knownCostUsd += cost;
    else if (!call.failed || call.possiblyBilled) this.unknownCostCalls += 1;
    if ('promptTokens' in call) {
      this.tokens += (finite(call.promptTokens) ?? 0) + (finite(call.completionTokens) ?? 0);
    }
    // A lost provider result is not permission to buy the same work again.
    if (call.possiblyBilled) {
      this.possiblyBilled = true;
      this.stop('AGENT_TASK_UNCERTAIN');
    }
    if (this.policy.maxCostUsd !== undefined) {
      if (this.unknownCostCalls) this.stop('AGENT_TASK_COST_UNKNOWN');
      else if (this.knownCostUsd >= this.policy.maxCostUsd) this.stop('AGENT_TASK_COST_BUDGET');
    }
    if (this.policy.maxTokens !== undefined && this.tokens >= this.policy.maxTokens) this.stop('AGENT_TASK_TOKEN_BUDGET');
  }

  run<T>(callback: () => T): T {
    return current.run(this, () => runWithAiExecutionUsage({
      researchAdmission: 'operation-allowance',
      signal: this.signal,
      maxDurationMs: this.policy.maxDurationMs,
      remainingMs: () => this.policy.maxDurationMs - (this.now() - this.startedAt),
      beforeProviderCall: this.assertCanSpend,
      text: (call) => this.observe(call),
      search: (call) => this.observe(call),
    }, callback));
  }

  recordToolResult(toolName: string, input: unknown, output: unknown) {
    if (output === undefined) return; // Native suspension is an effective human boundary.
    const key = digest([toolName, input, output]);
    const repeated = (this.results.get(key) ?? 0) + 1;
    this.results.set(key, repeated);
    if (repeated >= this.policy.maxIdenticalToolResults) this.stop('AGENT_TASK_NO_PROGRESS');
  }

  /** Native Mastra options; the model keeps all tools until a real fuse stops. */
  streamOptions(notes: readonly string[] = []) {
    this.notes = [...notes];
    const remaining = Math.max(1, this.policy.maxDurationMs - (this.now() - this.startedAt));
    const prepareNotes = stepNotes(notes);
    return {
      maxSteps: this.policy.emergencyMaxSteps,
      toolCallConcurrency: 1,
      modelSettings: {
        timeout: { totalMs: remaining },
        ...(this.policy.maxTokens !== undefined ? { maxOutputTokens: Math.max(1, this.policy.maxTokens - this.tokens) } : {}),
      },
      prepareStep: (args: Parameters<typeof prepareNotes>[0]) => {
        const active = current.getStore() ?? this;
        active.assertCanSpend();
        const effectiveNotes = notes.length ? notes : active.notes;
        return stepNotes(effectiveNotes)(args);
      },
      onStepFinish: (step: { toolCalls?: readonly unknown[]; finishReason?: string }) => {
        const active = current.getStore() ?? this;
        active.steps += 1;
        // The transport already owns its one bounded length retry. A still
        // truncated native result cannot establish completed work.
        if (step.finishReason === 'length') active.stop('AGENT_TASK_OPERATION_FAILED');
        if (active.steps >= active.policy.emergencyMaxSteps && (step.toolCalls?.length || step.finishReason === 'tool-calls')) {
          active.stop('AGENT_TASK_EMERGENCY_FUSE');
        }
      },
      stopWhen: ({ steps }: { steps: readonly any[] }) => {
        const active = current.getStore() ?? this;
        return !!active.check() || stopAfterOpenProposalRefusal({ steps });
      },
    };
  }

  snapshot() {
    return {
      requestId: this.options.requestId,
      stopCode: this.check(),
      elapsedMs: Math.max(0, this.now() - this.startedAt),
      steps: this.steps,
      knownCostUsd: this.knownCostUsd,
      tokens: this.tokens,
      unknownCostCalls: this.unknownCostCalls,
      possiblyBilled: this.possiblyBilled,
      providerCalls: this.providerCalls,
    };
  }

  closing(language: 'ru' | 'en'): string {
    const code = this.check();
    if (!code) return '';
    const reason = {
      AGENT_TASK_TIME_BUDGET: ['Достигнут технический предел времени.', 'The technical time limit was reached.'],
      AGENT_TASK_TOKEN_BUDGET: ['Достигнут настроенный предел токенов.', 'The configured token threshold was reached.'],
      AGENT_TASK_COST_BUDGET: ['Достигнут настроенный порог известных расходов.', 'The configured known-cost threshold was reached.'],
      AGENT_TASK_COST_UNKNOWN: ['Стоимость последнего вызова не подтверждена; настроенный порог нельзя проверить.', 'The last call’s cost is unknown, so the configured threshold cannot be checked.'],
      AGENT_TASK_UNCERTAIN: ['Результат последнего обращения к провайдеру не подтверждён; автоматически повторять его нельзя.', 'The last provider result is uncertain and cannot be retried automatically.'],
      AGENT_TASK_OPERATION_FAILED: ['Один из шагов завершился ошибкой или неполным ответом; автоматически повторять его нельзя.', 'A step failed or returned an incomplete answer and cannot be retried automatically.'],
      AGENT_TASK_NO_PROGRESS: ['Одинаковые действия перестали давать новые результаты.', 'Repeated actions stopped producing new results.'],
      AGENT_TASK_EMERGENCY_FUSE: ['Сработал технический предохранитель от зацикливания.', 'The technical loop fuse stopped this run.'],
      AGENT_TASK_STOPPED: ['Работа остановлена.', 'The work was stopped.'],
    }[code][language === 'ru' ? 0 : 1];
    return language === 'ru'
      ? `${reason} Задача не завершена; подтверждённые результаты сохранены. Оставшиеся шаги нужно продолжить с учётом уже выполненного.`
      : `${reason} The task is incomplete; confirmed results are preserved. Continue remaining work from the existing results.`;
  }
}

export const createConductorExecution = (options: ConstructorParameters<typeof ConductorExecution>[0]) =>
  new ConductorExecution(options);
