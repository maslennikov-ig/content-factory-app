'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

describe('native Mastra 1.78 model routing, retries, fallbacks, and accounting (on0i.5, A16, A17, A29-A31)', () => {
  let report;

  beforeAll(() => {
    const raw = execFileSync(
      process.execPath,
      [path.join(__dirname, 'helpers', 'agent-model-fallback-retry.probe.cjs')],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        timeout: 60_000,
      }
    );
    const lines = raw.trim().split('\n');
    report = JSON.parse(lines[lines.length - 1]);
  });

  test('A16 & A17: native ModelSelectionProcessor with MastraDecisionModel routes confident requests and abstains safely on low confidence or classifier errors', () => {
    expect(report.a16AndA17).toEqual({
      confidentStepModelId: 'openai/gpt-5.4-nano-classify',
      lowConfidenceStepOverride: null,
      errorStepOverride: null,
      decisions: [
        { choice: 'classify', abstained: null },
        { choice: 'classify', abstained: 'below-threshold' },
        { choice: null, abstained: 'error' },
        { choice: 'classify', abstained: null },
      ],
      routedText: 'Ответ от лёгкой модели classify.',
    });
  });

  test('A30 & A31: native ModelWithRetries[] and StreamErrorRetryProcessor retry each model up to maxRetries, fail over across ordered fallback models, record exact sequential attempts in TextUsageLedger, and stop immediately on abort', () => {
    expect(report.a30AndA31).toEqual({
      configuredModelEntriesCount: 3,
      configuredMaxRetries: 1,
      httpCallsCount: 5,
      httpAttemptModels: [
        'openai/gpt-5.4-primary',
        'openai/gpt-5.4-primary',
        'openai/gpt-5.4-backup-1',
        'openai/gpt-5.4-backup-1',
        'anthropic/claude-4-sonnet',
      ],
      ledgerAttempts: [
        { attempt: 1, model: 'openai/gpt-5.4-primary', failed: true },
        { attempt: 2, model: 'openai/gpt-5.4-primary', failed: true },
        { attempt: 3, model: 'openai/gpt-5.4-backup-1', failed: true },
        { attempt: 4, model: 'openai/gpt-5.4-backup-1', failed: true },
        { attempt: 5, model: 'anthropic/claude-4-sonnet', failed: false },
      ],
      streamOutputText: 'Ответ получен от третьей модели в цепочке.',
      abortedAttempts: 1,
      disabledFallbackEntriesCount: 1,
    });
  });

  test('A29: workspace AiProviderService persists ordered fallback chains, filters incompatible provider models with reasons, and honors explicit empty fallback', () => {
    expect(report.a29).toEqual({
      openRouterFallbacks: ['openai/gpt-5.4-mini', 'anthropic/claude-4-sonnet'],
      openRouterMaxRetries: 3,
      openAiCompatibleFallbacks: ['gpt-5.4-mini'],
      openAiUnavailableReasons: [
        { model: 'anthropic/claude-4-sonnet', reason: 'incompatible_provider' },
      ],
      disabledFallbacks: [],
      disabledFlag: true,
    });
  });
});
