'use strict';

const path = require('node:path');
const { runProbeProcess } = require('./helpers/native-probe-process.cjs');

const runProbe = (file, args = [], env = {}) => {
  const output = runProbeProcess(path.join(__dirname, 'helpers', file), args, { timeout: 200_000, env });
  return JSON.parse(output.trim().split('\n').at(-1));
};

describe('MastraService native PostgreSQL/Redis integration', () => {
  jest.setTimeout(210_000);

  test('actual Session uses one durable agent, shared transports, selected model and native skill tool', () => {
    const report = runProbe('mastra-service-native-integration.probe.cjs', [], {
      CF_SERVICE_DEBUG_SKILL: '1',
    });
    expect(report.baseline).toEqual(
      expect.objectContaining({
        sameDurableControllerInstance: true,
        redisCache: true,
        redisPubsub: true,
        selectedModel: 'selected-primary',
        membershipRechecked: true,
      })
    );
    // Safe built-in reads use the effective native policy. An unconditional
    // per-tool allow would overwrite a restored explicit ask/deny choice.
    expect(report.baseline.builtinPermissions.tools).not.toHaveProperty('skill');
    expect(report.attemptCount).toBe(2);
  });

  test('queued runtime refreshes persisted selected context with current membership', () => {
    const report = runProbe('mastra-service-native-recovery.probe.cjs', [
      'queued-context',
    ]).results[0];
    expect(report).toEqual(
      expect.objectContaining({
        freshMembership: true,
        selectedContextRefreshed: true,
        providerCalls: 0,
      })
    );
  });

  test('positive native observer-only recovery voids the unused admission without settling the owner lifecycle', () => {
    const report = runProbe('mastra-service-native-recovery.probe.cjs', [
      'queued-observe-only',
    ]).results[0];
    expect(report).toEqual(
      expect.objectContaining({
        observerAdmissionVoided: true,
        lifecycleUnsettled: true,
        providerCalls: 0,
      })
    );
  });

  test('cold queued continuation retains its original selected target across the native checkpoint gap', () => {
    const report = runProbe('mastra-service-native-recovery.probe.cjs', [
      'queued-gap',
    ]).results[0];
    expect(report).toEqual(
      expect.objectContaining({
        originalSelectedContextPreserved: true,
        resumedCalls: 1,
        toolCalls: 1,
        savedToolResult: true,
        outcome: 'completed',
      })
    );
  });

  test.each([false, true])('cold queued continuation honors immutable Stop before a successor checkpoint (prior failed observation: %s)', settledBeforeStop => {
    const report = runProbe('mastra-service-native-recovery.probe.cjs', [
      'queued-gap-stop',
      ...(settledBeforeStop ? ['--settled-before-stop'] : []),
    ]).results[0];
    expect(report).toEqual(
      expect.objectContaining({
        originalQueuedChildStopRespected: true,
        additionalModelCalls: 0,
        state: 'settled',
        stopRequested: false,
      })
    );
  });

  test.each(['approval', 'question'])(
    'cold native Stop cancels a persisted %s without another provider call',
    (mode) => {
      const report = runProbe('mastra-service-native-recovery.probe.cjs', [
        `cold-stop-${mode}`,
      ]).results[0];
      expect(report).toEqual(
        expect.objectContaining({
          coldNativeStop: true,
          persistedGates: 0,
          additionalModelCalls: 0,
          toolCalls: 0,
          outcome: 'interrupted',
        })
      );
    }
  );

  test('cold native Stop rejects an SDK-swallowed cancellation persistence failure', () => {
    const report = runProbe('mastra-service-native-recovery.probe.cjs', [
      'cold-stop-store-failure',
    ]).results[0];
    expect(report).toEqual(
      expect.objectContaining({
        cancellationAcknowledged: false,
        persistedGates: 1,
        additionalModelCalls: 0,
      })
    );
  });

  test('Stop settles the accepted availability checkpoint gap immediately without waiting for FINISH', () => {
    const report = runProbe('mastra-service-native-recovery.probe.cjs', [
      'stop-gap-final',
    ]).results[0];
    expect(report).toEqual(
      expect.objectContaining({
        settledAtStop: true,
        outcome: 'interrupted',
        additionalModelCalls: 0,
        stopRequested: true,
      })
    );
  });

  describe('fresh-process recovery and task metadata', () => {
    // Each independent recovery case keeps its own existing 200s child budget.
    // A single nine-case beforeAll budget fails under hosted parallel load.
    const reports = new Map();
    const result = (kind) => {
      if (!reports.has(kind)) reports.set(kind,
        runProbe('mastra-service-native-recovery.probe.cjs', [kind]).results[0]);
      return reports.get(kind);
    };

    test('bootstrap returns promptly, respects the live lease and natively rechecks after SIGKILL', () => {
      expect(result('lease')).toEqual(
        expect.objectContaining({
          liveOwnerPreserved: true,
          sameNativeRun: true,
          modelCalls: 2,
          outcome: 'completed',
        })
      );
      expect(result('lease').bootMs).toBeLessThan(3000);
      expect(result('lease').killedPid).not.toBe(result('lease').recoveredPid);
    });

    test('two fresh bootstraps repair the actual queue/checkpoint crash gap exactly once', () => {
      expect(result('gap')).toEqual(
        expect.objectContaining({
          actualQueueCheckpointGap: true,
          resumedCalls: 1,
          toolCalls: 1,
          savedToolResult: true,
          outcome: 'completed',
        })
      );
      expect(new Set(result('gap').twoFreshProcesses).size).toBe(2);
    });

    test('membership revocation blocks continuation before another provider call', () => {
      expect(result('revoked')).toEqual(
        expect.objectContaining({ state: 'blocked', additionalModelCalls: 0 })
      );
    });

    test('Stop survives a delayed queue receipt and restart', () => {
      expect(result('stop')).toEqual(
        expect.objectContaining({
          stopRequested: true,
          additionalModelCalls: 0,
        })
      );
    });

    test('cross-process Stop cancels a native wait promptly without another provider call', () => {
      expect(result('wait-stop')).toEqual(
        expect.objectContaining({
          crossProcessStop: true,
          modelCalls: 3,
          waitStatus: 'canceled',
        })
      );
      expect(result('wait-stop').stopMs).toBeLessThan(5000);
    });

    test('permanent failure is failed and a native suspension remains resumable', () => {
      expect(result('force-error')).toEqual(
        expect.objectContaining({
          result: { succeeded: 0, failed: 1 },
          outcome: 'failed',
        })
      );
      expect(result('force-suspended')).toEqual(
        expect.objectContaining({ result: { succeeded: 0, failed: 0 } })
      );
    });

    test('explicit queued input uses native durable acceptance and one finished service admission', () => {
      expect(result('queued-service')).toEqual(
        expect.objectContaining({
          durableAcceptance: true,
          duplicateAccepted: true,
          providerCalls: 2,
          toolCalls: 1,
          admissions: 1,
          admissionFinishes: 1,
          outcome: 'completed',
        })
      );
    });
    test.each(['queued-availability', 'queued-availability-slow'])('%s retains the same single admission and completed tool', kind => {
      expect(result(kind)).toEqual(
        expect.objectContaining({
          durableAcceptance: true,
          duplicateAccepted: true,
          providerCalls: 5,
          toolCalls: 1,
          admissions: 1,
          admissionFinishes: 1,
          outcome: 'completed',
        })
      );
    });
  });
});
