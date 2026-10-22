#!/usr/bin/env node
'use strict';

// Exercise the real question-card door for one owned synthetic saved rewrite.
const qa = require('./on0i-real-local-qa.cjs');
const fs = require('node:fs');
const path = require('node:path');

async function answerPrivateQuestion(stand) {
  qa.installEnv(stand);
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const actor = stand.actors.find(value => value.label === 'http-runner');
  const initial = JSON.parse(fs.readFileSync(path.join(qa.stage, 'real-local-qa-scenario-private-question.json'), 'utf8'));
  const threadId = initial.threadId;
  if (!actor || !/^[a-f0-9-]{36}$/i.test(threadId)) throw new Error('Owned private-question thread binding missing.');
  const headers = { auth: actor.auth, showorg: actor.organizationId, 'content-type': 'application/json', origin: stand.env.FRONTEND_URL };
  const request = (route, init = {}) => fetch(stand.env.NEXT_PUBLIC_BACKEND_URL + route, { ...init, headers, signal: AbortSignal.timeout(300000) });
  try {
    const beforeResponse = await request(`/agent/threads/${threadId}`);
    if (!beforeResponse.ok) throw new Error(`Owned question history HTTP ${beforeResponse.status}`);
    const before = await beforeResponse.json();
    const call = before.pending?.find(value => value.toolName === 'ask_user' && value.kind === 'question');
    if (before.pending.length !== 1 || call?.suspendPayload?.canDecideForPerson !== true
        || !call.suspendPayload.options?.some(option => option.label === 'Решите за меня')
        || !call.suspendPayload.cardId) throw new Error('The exact displayed decide-for-person question is not pending.');
    const providerFile = path.join(stand.privateDir, 'provider-receipts.jsonl');
    const providerBefore = fs.readFileSync(providerFile, 'utf8').split('\n').filter(Boolean).length;
    const idsBefore = await prisma.aiUsageRecord.findMany({ where: { organizationId: actor.organizationId, userId: actor.userId }, select: { id: true } });
    const piecesBefore = await prisma.contentPiece.findMany({ where: { organizationId: actor.organizationId, createdByUserId: actor.userId }, select: { id: true } });
    const started = Date.now();
    const response = await request('/agent/chat', { method: 'POST', body: JSON.stringify({ threadId, runId: call.runId,
      toolCallId: call.toolCallId, cardId: call.suspendPayload.cardId, resumeData: { decideForPerson: true } }) });
    let raw = ''; let transportError = null;
    try { raw = await response.text(); } catch (error) { transportError = { name: error.name, message: qa.safe(error.message) }; }
    const parts = raw.split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
      .flatMap(line => { try { return [JSON.parse(line.slice(6))]; } catch { return []; } });
    const after = await (await request(`/agent/threads/${threadId}`)).json();
    const usage = await prisma.aiUsageRecord.findMany({ where: { organizationId: actor.organizationId, userId: actor.userId,
      OR: [{ id: { in: initial.usage.map(row => row.id) } }, { id: { notIn: idsBefore.map(row => row.id) } }] }, orderBy: { createdAt: 'asc' } });
    const providers = fs.readFileSync(providerFile, 'utf8').split('\n').filter(Boolean).slice(providerBefore).map(line => JSON.parse(line));
    const savedTemplateRows = await prisma.contentPiece.findMany({ where: { organizationId: actor.organizationId, createdByUserId: actor.userId,
      id: { notIn: piecesBefore.map(row => row.id) } }, select: { id: true, title: true, kind: true, body: true, createdAt: true } });
    const privateFile = path.join(stand.privateDir, `private-question-resume-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    qa.writePrivate(privateFile, { before, after, raw, parts, usage, providers, transportError, savedTemplateRows });
    const receipt = { at: new Date().toISOString(), result: 'SYNTHETIC_DECIDE_FOR_PERSON_TEMPLATE', threadId, runId: call.runId,
      action: 'EXACT_DISPLAYED_DECIDE_FOR_PERSON_OPTION', exactCardBinding: true, promptResent: false,
      httpStatus: response.status, elapsedMs: Date.now() - started, streamDone: raw.includes('data: [DONE]'), transportError,
      streamErrors: parts.filter(part => part.type === 'error').map(part => part.errorText),
      assistantText: (after.messages || []).filter(message => message.role === 'assistant')
        .map(message => (message.parts || []).filter(part => part.type === 'text').map(part => part.text || '').join('')).filter(Boolean),
      pending: after.pending, execution: after.execution,
      usage: usage.map(({ id, operation, role, model, status, costUsd, possiblyBilled }) => ({ id, operation, role, model, status, costUsd: costUsd === null ? null : String(costUsd), possiblyBilled })),
      usageTotals: { operations: usage.length, knownCostUsd: usage.reduce((sum, row) => sum + Number(row.costUsd || 0), 0),
        unknownCostOperations: usage.filter(row => row.costUsd === null).length, pendingOperations: usage.filter(row => row.status === 'admitted').length,
        possiblyBilledOperations: usage.filter(row => row.possiblyBilled).length },
      newSearchRequests: providers.filter(row => row.phase === 'started' && ['exa', 'tavily'].includes(row.provider)).length,
      savedTemplateReadback: { at: new Date().toISOString(), rows: savedTemplateRows },
      providerReceipts: providers, backendLaunch: JSON.parse(fs.readFileSync(path.join(qa.stage, 'real-local-qa-backend-start.json'), 'utf8')),
      semanticAcceptanceCriteria: ['Useful template with blanks', 'No invented private cause or autobiographical facts'],
      semanticVerdict: 'REQUIRES_HUMAN_ROOT_REVIEW', privateEvidenceFile: privateFile, scriptSha256: qa.sha(__filename), localOnly: true };
    receipt.lifecycleVerdict = response.ok && receipt.streamDone && !transportError && !receipt.streamErrors.length
      && !receipt.pending.length && receipt.execution?.state === 'settled' && receipt.execution?.outcome === 'completed'
      && receipt.assistantText.length && receipt.newSearchRequests === 0 ? 'PASS' : 'FAIL';
    qa.writeEvidence('private-question-resume', receipt);
    if (receipt.lifecycleVerdict !== 'PASS') process.exitCode = 2;
    process.stdout.write(JSON.stringify(receipt) + '\n');
  } finally { await prisma.$disconnect(); }
}

async function main() {
  const stand = qa.loadStand();
  if (process.argv.includes('--decide-private-template')) return answerPrivateQuestion(stand);
  if (!process.argv.includes('--accept-owned-rewrite')) throw new Error('Pass --accept-owned-rewrite to select the displayed synthetic rewrite.');
  qa.installEnv(stand);
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const actor = stand.actors.find(value => value.label === 'http-runner');
  const initialFile = path.join(qa.stage, 'real-local-qa-scenario-research-reuse.json');
  const initial = JSON.parse(fs.readFileSync(initialFile, 'utf8'));
  const fresh = JSON.parse(fs.readFileSync(path.join(qa.stage, 'real-local-qa-scenario-fresh-research.json'), 'utf8'));
  const threadId = initial.threadId;
  if (!actor || threadId !== fresh.threadId || fresh.changedPieces.length !== 1) throw new Error('Owned saved-research binding missing.');
  const pieceId = fresh.changedPieces[0].id;
  const headers = { auth: actor.auth, showorg: actor.organizationId, 'content-type': 'application/json', origin: stand.env.FRONTEND_URL };
  const request = (route, init = {}) => fetch(stand.env.NEXT_PUBLIC_BACKEND_URL + route, { ...init, headers, signal: AbortSignal.timeout(300000) });
  try {
    const historyBeforeResponse = await request(`/agent/threads/${threadId}`);
    if (!historyBeforeResponse.ok) throw new Error(`Owned history HTTP ${historyBeforeResponse.status}`);
    const historyBefore = await historyBeforeResponse.json();
    const call = historyBefore.pending?.find(value => value.toolName === 'piece_rewrite' && value.kind === 'question');
    const payload = call?.suspendPayload;
    if (historyBefore.pending.length !== 1 || payload?.kind !== 'selection' || payload.answerKey !== 'changeIds'
        || !payload.cardId || payload.options?.length !== 1 || payload.options[0].id !== '1') throw new Error('The exact one-option synthetic rewrite is not pending.');
    const before = await prisma.contentPiece.findFirst({ where: { id: pieceId, organizationId: actor.organizationId, createdByUserId: actor.userId } });
    if (before?.title !== 'QA ON0I: SQLite WAL') throw new Error('Refusing to mutate anything except the owned SQLite QA piece.');
    const usageBefore = await prisma.aiUsageRecord.findMany({ where: { organizationId: actor.organizationId, userId: actor.userId }, select: { id: true, status: true } });
    const providerFile = path.join(stand.privateDir, 'provider-receipts.jsonl');
    const providerBefore = fs.readFileSync(providerFile, 'utf8').split('\n').filter(Boolean).length;
    const started = Date.now();
    const response = await request('/agent/chat', { method: 'POST', body: JSON.stringify({ threadId, runId: call.runId,
      toolCallId: call.toolCallId, cardId: payload.cardId, resumeData: { changeIds: ['1'] } }) });
    let raw = ''; let transportError = null;
    try { raw = await response.text(); } catch (error) { transportError = { name: error.name, message: qa.safe(error.message) }; }
    const parts = raw.split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
      .flatMap(line => { try { return [JSON.parse(line.slice(6))]; } catch { return []; } });
    const historyAfterResponse = await request(`/agent/threads/${threadId}`);
    const historyAfter = await historyAfterResponse.json();
    const after = await prisma.contentPiece.findUnique({ where: { id: pieceId } });
    const ids = initial.usage.filter(row => row.status === 'admitted').map(row => row.id);
    const usage = await prisma.aiUsageRecord.findMany({ where: { organizationId: actor.organizationId, userId: actor.userId,
      OR: [{ id: { in: ids } }, { id: { notIn: usageBefore.map(row => row.id) } }] }, orderBy: { createdAt: 'asc' } });
    const providers = fs.readFileSync(providerFile, 'utf8').split('\n').filter(Boolean).slice(providerBefore).map(line => JSON.parse(line));
    const privateFile = path.join(stand.privateDir, `research-reuse-resume-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    qa.writePrivate(privateFile, { before, after, historyBefore, historyAfter, parts, raw, usage, providers, transportError });
    const receipt = { at: new Date().toISOString(), schema: 'on0i-real-local-resume/1', threadId, runId: call.runId, pieceId,
      action: 'SYNTHETIC_PERSON_SELECTED_DISPLAYED_CHANGE_1', exactCardBinding: true, httpStatus: response.status,
      elapsedMs: Date.now() - started, streamDone: raw.includes('data: [DONE]'), transportError,
      streamErrors: parts.filter(part => part.type === 'error').map(part => part.errorText),
      before: { title: before.title, body: before.body }, after: { title: after?.title, body: after?.body },
      samePiece: after?.id === pieceId, unchangedUntilConfirmation: before.body === fresh.changedPieces[0].body,
      acceptedPreviewMatchesSavedBody: after?.body?.includes(payload.options[0].preview?.after),
      execution: historyAfter.execution, pending: historyAfter.pending,
      assistantText: (historyAfter.messages || []).filter(message => message.role === 'assistant')
        .map(message => (message.parts || []).filter(part => part.type === 'text').map(part => part.text || '').join('')).filter(Boolean),
      usage: usage.map(({ id, operation, role, model, status, costUsd, possiblyBilled }) => ({ id, operation, role, model, status, costUsd: costUsd === null ? null : String(costUsd), possiblyBilled })),
      providerReceipts: providers, newSearchRequests: [...initial.providerReceipts, ...providers].filter(row => row.phase === 'started' && ['exa', 'tavily'].includes(row.provider)).length,
      backendLaunch: JSON.parse(fs.readFileSync(path.join(qa.stage, 'real-local-qa-backend-start.json'), 'utf8')),
      privateEvidenceFile: privateFile, scriptSha256: qa.sha(__filename), localOnly: true, productionMutations: 0 };
    receipt.combinedUsage = [...new Map([...initial.usage, ...receipt.usage].map(row => [row.id, row])).values()];
    receipt.usageTotals = { operations: receipt.combinedUsage.length,
      knownCostUsd: receipt.combinedUsage.reduce((sum, row) => sum + Number(row.costUsd || 0), 0),
      unknownCostOperations: receipt.combinedUsage.filter(row => row.costUsd === null).length,
      pendingOperations: receipt.combinedUsage.filter(row => row.status === 'admitted').length,
      possiblyBilledOperations: receipt.combinedUsage.filter(row => row.possiblyBilled).length };
    receipt.lifecycleVerdict = response.ok && receipt.streamDone && !transportError && !receipt.streamErrors.length
      && !receipt.pending.length && receipt.execution?.outcome === 'completed' && receipt.samePiece
      && receipt.acceptedPreviewMatchesSavedBody ? 'PASS' : 'FAIL';
    qa.writeEvidence('research-reuse-resume', receipt);
    if (receipt.lifecycleVerdict !== 'PASS') process.exitCode = 2;
    process.stdout.write(JSON.stringify(receipt) + '\n');
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { process.stderr.write(qa.safe(error.message) + '\n'); process.exitCode = 1; });
