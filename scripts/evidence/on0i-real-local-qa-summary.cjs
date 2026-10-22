#!/usr/bin/env node
'use strict';

// Consolidate existing evidence and local readback; no generation or search.
const qa = require('./on0i-real-local-qa.cjs');
const fs = require('node:fs');
const path = require('node:path');
const read = name => JSON.parse(fs.readFileSync(path.join(qa.stage, name), 'utf8'));
const exists = name => fs.existsSync(path.join(qa.stage, name));

async function main() {
  const stand = qa.loadStand();
  qa.installEnv(stand);
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const actor = stand.actors.find(value => value.label === 'http-runner');
  if (!actor) throw new Error('Synthetic HTTP actor missing.');
  try {
    const boot = read('real-local-qa-backend-start.json');
    const reviews = exists('root-semantic-review.json') ? read('root-semantic-review.json') : { scenarios: [] };
    const names = [
      'scenario-direct-no-search', 'scenario-reference', 'scenario-fresh-research',
      'research-reuse-resume', 'scenario-private-question', 'private-question-resume',
      'scenario-unknown-sources', 'scenario-real-fallback-scripted-primary', 'fallback-readonly-wrapup',
    ].filter(name => exists(`real-local-qa-${name}.json`));
    const scenarios = names.map(name => {
      const basename = `real-local-qa-${name}.json`;
      const evidence = path.join(qa.stage, basename);
      const doc = read(basename);
      const loaded = doc.backendLaunch || doc.bootstrap;
      const historicalDiagnostic = name === 'fallback-readonly-wrapup';
      const review = reviews.scenarios.find(row => row.evidence === basename);
      return { artifact: basename, sha256: qa.sha(evidence), at: doc.at, kind: doc.kind || doc.result,
        acceptanceRole: historicalDiagnostic ? 'HISTORICAL_FAILURE_DIAGNOSTIC' : 'SCENARIO',
        lifecycleVerdict: doc.lifecycleVerdict || 'SEE_ORIGINAL_RECEIPT', semanticVerdict: doc.semanticVerdict,
        threadId: doc.threadId, execution: doc.execution, usageTotals: doc.usageTotals,
        rootReview: review ? { verdict: review.verdict, evidenceHashMatches: review.sha256 === qa.sha(evidence), scope: review.scope }
          : { verdict: historicalDiagnostic ? 'NOT_APPLICABLE_HISTORICAL_DIAGNOSTIC' : 'PENDING_ROOT_REVIEW' },
        bootstrap: loaded ? { pid: loaded.pid, at: loaded.at,
          sourceChangedDuringBootstrap: loaded.sourceChangedDuringBootstrap, sourceSha256: loaded.sourceSha256 }
          : { binding: 'UNKNOWN_NO_EMBEDDED_BOOT_MANIFEST', note: 'The mutable latest boot receipt cannot prove the source loaded during this earlier scenario.' },
        actualSearchRequests: (doc.providerReceipts || []).filter(row => row.phase === 'started' && row.scripted === false && ['exa', 'tavily'].includes(row.provider)).length,
        actualModelRequests: (doc.providerReceipts || []).filter(row => row.phase === 'started' && row.scripted === false && ['openrouter', 'openai'].includes(row.provider)).length,
        scriptedRequests: (doc.providerReceipts || []).filter(row => row.phase === 'started' && row.scripted === true).length };
    });
    const setting = await prisma.aiProviderSetting.findUnique({ where: { organizationId: actor.organizationId }, select: { roleModels: true } });
    const beforeFile = path.join(stand.privateDir, 'fallback-settings-before.json');
    const saved = fs.existsSync(beforeFile) ? JSON.parse(fs.readFileSync(beforeFile, 'utf8')) : null;
    const faultFile = path.join(stand.privateDir, 'provider-fault-control.json');
    const fault = fs.existsSync(faultFile) ? JSON.parse(fs.readFileSync(faultFile, 'utf8')) : null;
    const usage = await prisma.aiUsageRecord.findMany({ where: { organizationId: actor.organizationId, userId: actor.userId }, orderBy: { createdAt: 'asc' },
      select: { id: true, operation: true, role: true, provider: true, model: true, status: true, costUsd: true, possiblyBilled: true } });
    const sourceDifferencesSinceBoot = Object.entries(boot.sourceSha256).flatMap(([file, loaded]) => {
      const current = qa.sha(path.join(qa.root, file));
      return current === loaded ? [] : [{ file, loaded, current }];
    });
    const pid = JSON.parse(fs.readFileSync(path.join(stand.privateDir, 'backend-pid.json'), 'utf8')).pid;
    const backendProcessMatches = fs.existsSync(`/proc/${pid}/cmdline`)
      && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('on0i-real-local-qa-backend.cjs');
    const health = await fetch(stand.env.NEXT_PUBLIC_BACKEND_URL + '/user/self', {
      headers: { auth: actor.auth, showorg: actor.organizationId }, signal: AbortSignal.timeout(10000),
    });
    const privateFiles = [stand.file, '/home/me/.config/content-factory/local-ai.json'];
    const receipt = { schema: 'on0i-real-local-summary/1', at: new Date().toISOString(), localOnly: true,
      result: 'OBSERVED_SCENARIOS_WITH_EXPLICIT_GAPS', scenarios,
      coldStop: exists('real-local-qa-old-cold-stop-current.json') ? {
        artifact: 'real-local-qa-old-cold-stop-current.json',
        sha256: qa.sha(path.join(qa.stage, 'real-local-qa-old-cold-stop-current.json')),
        ...read('real-local-qa-old-cold-stop-current.json'),
      } : null,
      finalScopeBootstrap: exists('real-local-qa-final-scope-bootstrap.json') ? (() => {
        const proof = read('real-local-qa-final-scope-bootstrap.json');
        return { artifact: 'real-local-qa-final-scope-bootstrap.json',
          sha256: qa.sha(path.join(qa.stage, 'real-local-qa-final-scope-bootstrap.json')),
          result: proof.result, pid: proof.pid, serviceSha: proof.availabilityFinalFreezeServiceSha,
          noResurrection: proof.noResurrection, unknownCostPreserved: proof.unknownCostPreserved,
          providerRequestsDuringRestartAndReadback: proof.providerRequestsDuringRestartAndReadback.length };
      })() : null,
      browserObserve: exists('real-local-qa-root-browser-observe.json') ? (() => {
        const proof = read('real-local-qa-root-browser-observe.json');
        return { artifact: 'real-local-qa-root-browser-observe.json',
          sha256: qa.sha(path.join(qa.stage, 'real-local-qa-root-browser-observe.json')),
          backendHistoryVerdict: proof.backendHistoryVerdict, actualModelRequests: proof.actualModelRequests,
          actualSearchRequests: proof.actualSearchRequests, ledgerProviderTupleMatches: proof.ledgerProviderTupleMatches,
          scope: 'Backend persistence and existing provider/ledger readback. The historical root-reported UI gap and its frontend fix are root-owned.' };
      })() : null,
      runtime: { pid, backendProcessMatches, authenticatedHealthHttp: health.status, backendUrl: stand.env.NEXT_PUBLIC_BACKEND_URL,
        frontendUrl: stand.env.FRONTEND_URL, loadedBootstrap: boot, sourceDifferencesSinceBoot,
        scope: 'These results prove the loaded local runtime only. Source edits after its boot need an explicitly bound restart/retest.' },
      safety: { qaFallbackSettingsRestored: saved ? JSON.stringify(setting) === JSON.stringify(saved) : null,
        qaProviderFaultDisabled: fault ? fault.enabled === false : true, socialIntegrationRows: await prisma.integration.count(),
        durablePrivateConfigModes: privateFiles.map(file => ({ file, mode: (fs.statSync(file).mode & 0o777).toString(8) })),
        productionMutations: 0, deployment: false, push: false },
      allHttpActorLedger: { note: 'Includes earlier failed attempts and unresolved ledger states; these are not hidden by successful selected cases.',
        rows: usage.map(row => ({ ...row, costUsd: row.costUsd === null ? null : String(row.costUsd) })),
        knownCostUsd: usage.reduce((sum, row) => sum + Number(row.costUsd || 0), 0),
        unknownCostOperations: usage.filter(row => row.costUsd === null).length,
        pendingOperations: usage.filter(row => row.status === 'admitted').length,
        pendingOperationsMeaning: 'Rows still admitted in the ledger; not proof that their native tasks remain running. The preserved crashed unknown-cost row is reported separately from the Stop outcome.',
        possiblyBilledOperations: usage.filter(row => row.possiblyBilled).length },
      paidCallsByThisSummary: 0, fullSuiteRunByChild: false,
      remainingAcceptance: ['Root owns semantic acceptance and final browser checks.',
        'No cheap-classifier savings claim: configured classify and agent model IDs are equal.',
        'Search evidence proves the configured Exa research route; no Tavily request has been observed.',
        'Provider invoices and production/Temporal/social publication are outside this local evidence.'] };
    qa.writeEvidence('summary', receipt);
    process.stdout.write(JSON.stringify({ result: receipt.result, scenarios: scenarios.map(row => ({ artifact: row.artifact, lifecycle: row.lifecycleVerdict, rootReview: row.rootReview })),
      runtime: { pid, backendProcessMatches, health: health.status, changedSourceFiles: sourceDifferencesSinceBoot.map(row => row.file) },
      safety: receipt.safety, ledger: { rows: usage.length, knownCostUsd: receipt.allHttpActorLedger.knownCostUsd,
        unknownCostOperations: receipt.allHttpActorLedger.unknownCostOperations, pendingOperations: receipt.allHttpActorLedger.pendingOperations },
      artifact: path.join(qa.stage, 'real-local-qa-summary.json') }) + '\n');
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { process.stderr.write(qa.safe(error.message) + '\n'); process.exitCode = 1; });
