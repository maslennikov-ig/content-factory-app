'use strict';
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

test('both native PostgreSQL proofs reject external endpoints, other protocols and non-test databases before connecting', () => {
  for (const probe of ['agent-native-observability.probe.cjs', 'agent-native-observability-shutdown.probe.cjs']) {
    for (const url of [
      'postgresql://fixture@192.0.2.1:5433/cf_fixture_test',
      'postgresql://fixture@127.0.0.1:5433/content_factory',
      'https://127.0.0.1:5433/cf_fixture_test',
      'postgresql://fixture@127.0.0.1:5433/cf_fixture_test?host=192.0.2.1',
      'postgresql://fixture@127.0.0.1:5433/cf_fixture_test?dbname=content_factory',
    ]) {
      const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers', probe)], {
        encoding: 'utf8', timeout: 10_000,
        env: { ...process.env, CF_TEST_PG_URL: url },
      });
      expect(child.status).toBe(1);
      expect(child.stderr).toContain('Use only');
    }
  }
}, 65_000);

test('native exporter and legacy PostgreSQL consumer preserve linked scopes while omitting secrets and request media', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-observability.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 40_000,
  });
  const report = output.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } })
    .find(value => value?.nativeObservability);
  expect(report).toMatchObject({ nativeObservability: true, postgres: true, nativeAgentAndTool: true,
    linkedTool: true, otherActorExcluded: true, otherThreadExcluded: true, requestCorrelation: true,
    secretsAndMediaNeverStored: true, inputOutputOmitted: true, realLegacyConsumer: true,
    privateInstructionsAndToolDescriptionsOmitted: true,
    nativeProviderFailureDetailsOmitted: true,
    advancedMetricsUnsupported: true, scopeLessChildrenInherited: true, conflictingBranchesExcluded: true,
    syntheticModelCalls: 2, actualProviderCalls: 0, actualExternalRequests: 0 });
  expect(report.inlineMediaReads.length).toBeGreaterThan(0);
  expect(report.inlineMediaReads.every(request => request.scheme === 'data:' &&
    request.method === 'GET' && !request.hasBody && request.headerNames.length === 0)).toBe(true);
  expect(report.blockedExternalRequests.every(request => request.method === 'GET' && !request.hasBody)).toBe(true);
}, 45_000);

test('actual service shutdown drains native work and flushes buffered PostgreSQL spans before closing its owned pool', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-observability-shutdown.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 40_000,
  });
  const report = output.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } })
    .find(value => value?.actualServiceAndStore);
  expect(report).toMatchObject({ actualServiceAndStore: true, actualNativeEventedDrain: true,
    manualFlush: false, bufferedSpanPersisted: true, spanEndedDuringDrainPersisted: true,
    repeatedShutdownIdempotent: true, ownedPoolEnds: 1, actualExternalRequests: 0, actualProviderCalls: 0 });
}, 45_000);
