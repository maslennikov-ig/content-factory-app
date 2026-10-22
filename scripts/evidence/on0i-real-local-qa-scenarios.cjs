#!/usr/bin/env node
'use strict';

const qa = require('./on0i-real-local-qa.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const cases = [
  { id: 'direct-no-search', acceptance: ['Useful concise Russian rewrite', 'Zero external search', 'No saved piece or invented private fact'],
    prompt: 'Перепиши одной естественной фразой: «В целях повышения прозрачности операционной деятельности принято решение осуществлять информирование команды о ходе работ каждую пятницу». Ничего не ищи и не создавай заготовку. Верни только новую фразу.' },
  { id: 'fresh-research', expectedSavedCore: 1, acceptance: ['Actual search and official SQLite sources', 'One useful saved CORE', 'Reader/writer limits are accurate', 'Saved result and source references read back'],
    prompt: 'По официальной документации SQLite проверь, могут ли читатели работать одновременно с писателем в режиме WAL и сколько писателей допустимо. Сохрани одну новую короткую заготовку на русском с точным названием «QA ON0I: SQLite WAL». Объясни ограничения простыми словами, добавь ссылки на первоисточники. После сохранения прочитай её и проверь заголовок и ключевые ограничения. Предыдущего поста нет. Ничего не публикуй и не подключай аккаунты.' },
  { id: 'reference', acceptance: ['Dates remain attached to the supplied reference', 'No search or fabricated results', 'Faithful concise adaptation'],
    prompt: 'Сократи мой пример до двух предложений для начинающего разработчика. Это только предоставленный мной пример, его не нужно подтверждать поиском: «В заметке за 6–8 октября мы обсуждали прототип приложения. Одни и те же данные несколько раз копировались между модулями. Мы собрали общую функцию чтения и убрали копии. Численных замеров ещё нет». Сохрани смысл и честное отсутствие замеров, не превращай даты примера в сегодняшние новости. Ничего не ищи и не сохраняй.' },
  { id: 'research-reuse', usesResearchThread: true, acceptance: ['Uses saved research', 'No repeated completed search', 'Same saved piece is refined'],
    prompt: 'Используй сохранённую в этом чате заготовку «QA ON0I: SQLite WAL». Сократи её до трёх коротких предложений для начинающего разработчика, сохрани ограничение одного писателя и ссылки. Сохрани обновлённый текст в той же заготовке. Не запускай новый поиск и ничего не публикуй.' },
  { id: 'private-question', acceptance: ['Asks for the missing private cause', 'Does not invent an autobiographical experience', 'No external research'],
    prompt: 'Помоги написать историю от моего имени о том, как я отказался от выгодного заказа из-за разногласий с заказчиком. Я ещё не рассказывал тебе, что произошло. Нужна настоящая причина отказа, но я её пока не назвал. Ничего не ищи, не публикуй и не выдумывай мой опыт.' },
  { id: 'unknown-sources', acceptance: ['Actual source check or honest inability', 'No invented release or quotation', 'Explicit evidence gap'],
    prompt: 'Проверь, есть ли у SQLite официальный стабильный релиз 9.99.99 под названием «ON0I невидимый компас». Мне могли прислать выдумку. Ищи только подтверждения от самого проекта; если подтверждения нет, прямо скажи об этом и дай доступный официальный источник. Ничего не сохраняй и не публикуй.' },
  { id: 'real-fallback-scripted-primary', faultPrimary: true, acceptance: ['Clearly scripted primary 429', 'Native fallback calls an already configured model through the real provider', 'Useful rewrite', 'Exact attempts and whole operation cost', 'QA settings restored'],
    prompt: 'Метка локальной проверки ON0I_REAL_FALLBACK_20261021; её не нужно повторять в ответе. Перепиши одной естественной фразой: «В целях повышения прозрачности операционной деятельности принято решение осуществлять информирование команды о ходе работ каждую пятницу». Ничего не ищи, не сохраняй и не публикуй. Верни только новую фразу.' },
];
function urlsIn(value, result = new Set()) {
  if (typeof value === 'string') for (const match of value.matchAll(/https?:\/\/[^\s<>"'\]\[)]+/g)) result.add(match[0]);
  else if (Array.isArray(value)) value.forEach(item => urlsIn(item, result));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => urlsIn(item, result));
  return [...result];
}
const json = value => JSON.parse(JSON.stringify(value));
const textOf = history => (history?.messages || []).filter(message => message.role === 'assistant').map(message =>
  (message.parts || []).filter(part => part.type === 'text').map(part => part.text || '').join('')).filter(Boolean);
function providerRows(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}
async function main() {
  if (process.argv[2] === 'list') { process.stdout.write(`${JSON.stringify(cases)}\n`); return; }
  const stand = qa.loadStand();
  qa.installEnv(stand); qa.loadTs();
  const { PrismaClient } = require('@prisma/client');
  const { AuthService } = require(path.join(qa.root, 'libraries/helpers/src/auth/auth.service.ts'));
  const prisma = new PrismaClient();
  // A separate synthetic caller keeps browser usage out of the HTTP run ledger.
  let actor = stand.actors.find(value => value.label === 'http-runner');
  if (!actor) {
    const user = await prisma.user.create({ data: { email: `on0i-http-${randomUUID()}@example.invalid`, providerName: 'LOCAL', name: 'ON0I QA HTTP runner', timezone: 180, language: 'ru', activated: true, sendSuccessEmails: false, sendFailureEmails: false, sendStreakEmails: false } });
    const organizationId = stand.actors[0].organizationId;
    await prisma.userOrganization.create({ data: { userId: user.id, organizationId, role: 'ADMIN' } });
    actor = { label: 'http-runner', organizationId, userId: user.id, auth: AuthService.signSessionJWT(user) };
    stand.actors.push(actor); qa.writePrivate(stand.file, stand);
  }
  qa.secrets.add(actor.auth);
  const headers = { auth: actor.auth, showorg: actor.organizationId, 'content-type': 'application/json', 'x-agent-timezone': 'Europe/Moscow', origin: stand.env.FRONTEND_URL };
  const request = async (route, init = {}) => {
    const response = await fetch(`${stand.env.NEXT_PUBLIC_BACKEND_URL}${route}`, { ...init, headers: { ...headers, ...init.headers }, signal: init.signal || AbortSignal.timeout(600000) });
    return response;
  };
  try {
    const self = await request('/user/self');
    if (self.status !== 200 || (await self.json()).id !== actor.userId) throw new Error('Actual auth middleware did not resolve the synthetic caller.');
    const threads = await request('/agent/threads');
    if (threads.status !== 200) throw new Error(`Actual thread list failed HTTP ${threads.status}.`);
    if (process.argv[2] === 'smoke') {
      qa.writeEvidence('http-smoke', { at: new Date().toISOString(), result: 'PASS', authSelf: 200, threadList: 200, providerCalls: 0, actor: 'synthetic-http-runner' });
      process.stdout.write(`${JSON.stringify({ result: 'PASS', authSelf: 200, threadList: 200, paidCalls: 0 })}\n`); return;
    }
    if (process.argv[2] !== 'run') throw new Error('Use list, smoke or run --case CASE_ID.');
    if (!stand.route.credentialsDecrypt?.model || !stand.route.credentialsDecrypt?.search) throw new Error('Real scenario execution requires validated local model/search credentials.');
    const wanted = qa.arg('--case', 'direct-no-search').split(',');
    const stateFile = path.join(stand.privateDir, 'scenario-state.json');
    const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
    for (const id of wanted) {
      const spec = cases.find(value => value.id === id); if (!spec) throw new Error(`Unknown scenario ${id}.`);
      const threadId = spec.usesResearchThread ? state['fresh-research']?.threadId : undefined;
      if (spec.usesResearchThread && !threadId) throw new Error('Run fresh-research first to create its owned native thread.');
      let restoreFault;
      let completedReceipt;
      if (spec.faultPrimary) {
        const source = JSON.parse(fs.readFileSync(path.join(stand.privateDir, 'server-effective-ai.json'), 'utf8')).config;
        const configured = source.textChain?.fallbackModels || [source.textChain?.fallbackModel].filter(Boolean);
        if (source.provider !== 'openrouter' || !configured.includes('z-ai/glm-5.3')) throw new Error('The requested fallback was not present in the authorized server configuration.');
        const saved = await prisma.aiProviderSetting.findUnique({ where: { organizationId: actor.organizationId }, select: { roleModels: true } });
        const { serializeTextFallbackColumn } = require(path.join(qa.root, 'libraries/nestjs-libraries/src/openai/ai.text-chain.ts'));
        const column = serializeTextFallbackColumn({ textFallbackModels: ['z-ai/glm-5.3'], textMaxRetries: 0 });
        const roleModels = { ...(saved.roleModels || {}), __textChain: column };
        qa.writePrivate(path.join(stand.privateDir, 'fallback-settings-before.json'), saved);
        await prisma.aiProviderSetting.update({ where: { organizationId: actor.organizationId }, data: { roleModels } });
        qa.writePrivate(path.join(stand.privateDir, 'provider-fault-control.json'), { owner: stand.owner, enabled: true, targetModel: stand.route.textModel, marker: 'ON0I_REAL_FALLBACK_20261021' });
        restoreFault = async () => {
          qa.writePrivate(path.join(stand.privateDir, 'provider-fault-control.json'), { owner: stand.owner, enabled: false });
          const current = await prisma.aiProviderSetting.findUnique({ where: { organizationId: actor.organizationId }, select: { roleModels: true } });
          if (JSON.stringify(current.roleModels) !== JSON.stringify(roleModels)) throw new Error('QA fallback settings changed concurrently; refusing to overwrite another change.');
          const { Prisma } = require('@prisma/client');
          await prisma.aiProviderSetting.update({ where: { organizationId: actor.organizationId }, data: { roleModels: saved.roleModels === null ? Prisma.DbNull : saved.roleModels } });
        };
        // Prove that the public resolver treats this as an eligible explicit
        // fallback before sending a faulted request, rather than inferring it
        // from a stored model name.
        try {
          const configApi = require(path.join(qa.root, 'libraries/nestjs-libraries/src/openai/ai.provider.config.ts'));
          const clients = require(path.join(qa.root, 'libraries/nestjs-libraries/src/openai/ai.clients.ts'));
          const config = await configApi.loadAiConfig(actor.organizationId,
            organizationId => prisma.aiProviderSetting.findUnique({ where: { organizationId } }),
            () => prisma.instanceAiDefaults.findUnique({ where: { id: 'instance' } }));
          const policy = await configApi.withActiveAiConfig(actor.organizationId, config,
            () => clients.getOrderedTextChainPolicy(actor.organizationId, 'agent'), 'agent');
          qa.writeEvidence('fallback-preflight-live', { at: new Date().toISOString(), policy, providerCalls: 0 });
          if (!policy.fallbackModels.includes('z-ai/glm-5.3') || policy.maxRetries !== 0) throw new Error('The actual effective QA policy does not include the configured fallback with zero retries.');
        } catch (error) {
          await restoreFault();
          throw error;
        }
      }
      try {
      const startedAt = new Date();
      const backendLaunch = JSON.parse(fs.readFileSync(path.join(qa.stage, 'real-local-qa-backend-start.json'), 'utf8'));
      const before = await prisma.aiUsageRecord.findMany({ where: { organizationId: actor.organizationId }, select: { id: true } });
      const beforePieces = await prisma.contentPiece.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, updatedAt: true } });
      const providerFile = path.join(stand.privateDir, 'provider-receipts.jsonl');
      const beforeProviderCount = providerRows(providerFile).length;
      const requestId = randomUUID();
      const response = await request('/agent/chat', { method: 'POST', body: JSON.stringify({ ...(threadId ? { threadId } : {}), messages: [{ id: requestId, role: 'user', parts: [{ type: 'text', text: spec.prompt }] }] }) });
      const actualThreadId = response.headers.get('x-agent-thread-id') || threadId;
      let raw = '';
      let observerDetachedForPending = false;
      let streamTransportError = null;
      const observationResponses = [];
      const consume = async streamResponse => {
      try {
      if (streamResponse.body && actualThreadId && streamResponse.ok) {
        const reader = streamResponse.body.getReader(); const decoder = new TextDecoder();
        let read = reader.read();
        let pendingSignature = ''; let pendingSince = 0;
        while (true) {
          let timer;
          const chunk = await Promise.race([read, new Promise(resolve => { timer = setTimeout(() => resolve(null), 2000); })]);
          clearTimeout(timer);
          if (!chunk) {
            const pendingResponse = await request(`/agent/threads/${encodeURIComponent(actualThreadId)}`);
            const snapshot = pendingResponse.ok ? await pendingResponse.json() : null;
            if (snapshot?.pending?.length) {
              const signature = JSON.stringify(snapshot.pending.map(({ runId, toolCallId }) => [runId, toolCallId]));
              if (signature !== pendingSignature) { pendingSignature = signature; pendingSince = Date.now(); }
              // Native permission-allow tools can briefly emit approval parts
              // before automatic continuation. A transient card is not a gate.
              if (Date.now() - pendingSince >= 30000) {
                const diagnosticResponse = await request(`/__qa/native-permissions?threadId=${encodeURIComponent(actualThreadId)}`);
                const diagnostic = diagnosticResponse.ok ? await diagnosticResponse.json() : null;
                const needsHuman = snapshot.pending.some(call => call.kind === 'question')
                  || diagnostic?.pending?.some(call => call.policy === 'ask' && call.gateArmed);
                if (needsHuman) {
                  observerDetachedForPending = true;
                  await reader.cancel('QA observer detached after recording a stable human-input gate.');
                  break;
                }
              }
            } else {
              pendingSignature = ''; pendingSince = 0;
            }
            continue;
          }
          if (chunk.done) break;
          raw += decoder.decode(chunk.value, { stream: true });
          read = reader.read();
        }
      } else raw += await streamResponse.text();
      } catch (error) {
        // Keep partial paid-call evidence and durable readback on timeout or
        // disconnect; HTTP 200 alone does not make the operation successful.
        streamTransportError = { name: error.name, message: qa.safe(error.message) };
      }
      };
      await consume(response);
      const readHistory = async () => {
        if (!actualThreadId) return null;
        const reply = await request(`/agent/threads/${encodeURIComponent(actualThreadId)}`);
        return reply.ok ? reply.json() : null;
      };
      let history = await readHistory();
      // DONE closes one HTTP observation. A native availability continuation
      // can keep the same logical operation running on a new native run.
      // Follow only the public observe door; never resend the paid prompt.
      while (!streamTransportError && !observerDetachedForPending && history?.execution?.state === 'running'
          && !history.pending?.length && Date.now() - startedAt.getTime() < 600000 && observationResponses.length < 8) {
        await new Promise(resolve => setTimeout(resolve, 200));
        history = await readHistory();
        if (history?.execution?.state !== 'running' || history.pending?.length) break;
        const observe = await request(`/agent/threads/${encodeURIComponent(actualThreadId)}/observe`);
        observationResponses.push({ status: observe.status, runId: history.execution.runId });
        if (observe.status === 204) {
          await new Promise(resolve => setTimeout(resolve, 300));
        } else await consume(observe);
        history = await readHistory();
      }
      const parts = raw.split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]').flatMap(line => { try { return [JSON.parse(line.slice(6))]; } catch { return []; } });
      const newOrganizationUsage = await prisma.aiUsageRecord.findMany({ where: { organizationId: actor.organizationId, id: { notIn: before.map(row => row.id) } }, orderBy: { createdAt: 'asc' } });
      const usage = newOrganizationUsage.filter(row => row.userId === actor.userId);
      const unattributedUsage = newOrganizationUsage.filter(row => row.userId === null);
      const pieces = await prisma.contentPiece.findMany({ where: { organizationId: actor.organizationId }, orderBy: { createdAt: 'asc' } });
      const affectedPieces = pieces.filter(row => row.createdByUserId === actor.userId
        && !beforePieces.some(beforeRow => beforeRow.id === row.id && beforeRow.updatedAt.getTime() === row.updatedAt.getTime()));
      const providers = providerRows(providerFile).slice(beforeProviderCount);
      const privateFile = path.join(stand.privateDir, `scenario-${id}-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
      qa.writePrivate(privateFile, { spec, requestId, threadId: actualThreadId, status: response.status, parts, raw, streamTransportError, observationResponses, history, usage: json(usage), unattributedUsage: json(unattributedUsage), pieces: json(affectedPieces), providerReceipts: providers });
      const receipt = { schema: 'on0i-real-local-scenario/1', id, at: startedAt.toISOString(), elapsedMs: Date.now() - startedAt.getTime(),
        head: qa.command('git', ['rev-parse', 'HEAD']), scriptSha256: qa.sha(__filename),
        backendLaunchReceipt: path.join(qa.stage, 'real-local-qa-backend-start.json'),
        backendLaunch,
        kind: spec.faultPrimary ? 'SCRIPTED_PRIMARY_429_REAL_CONFIGURED_FALLBACK' : 'REAL_LOCAL_HTTP_MODEL_SEARCH', requestId, threadId: actualThreadId, httpStatus: response.status,
        streamDone: raw.includes('data: [DONE]'), observerDetachedForPending, streamTransportError, observationResponses,
        nativeContinuations: parts.filter(part => part.type === 'data-native-run-continuation').map(part => part.data),
        streamErrors: parts.filter(part => part.type === 'error').map(part => part.errorText),
        assistantText: textOf(history), pending: (history?.pending || []).map(({ runId, toolCallId, toolName, kind, suspendPayload }) => ({ runId, toolCallId, toolName, kind, suspendPayload })), execution: history?.execution,
        changedPieces: affectedPieces.map(row => ({ id: row.id, title: row.title, kind: row.kind, body: row.body, sourceUrls: urlsIn(row.brief), archived: Boolean(row.archivedAt) })),
        usage: usage.map(({ id, operation, role, provider, model, status, promptTokens, completionTokens, reasoningTokens, cachedTokens, costUsd, possiblyBilled, attempt }) => ({ id, operation, role, provider, model, status, promptTokens, completionTokens, reasoningTokens, cachedTokens, costUsd: costUsd === null ? null : String(costUsd), possiblyBilled, attempt })),
        usageTotals: { operations: usage.length, knownCostUsd: usage.reduce((sum, row) => sum + Number(row.costUsd || 0), 0), unknownCostOperations: usage.filter(row => row.costUsd === null).length, pendingOperations: usage.filter(row => row.status === 'admitted').length, possiblyBilledOperations: usage.filter(row => row.possiblyBilled).length },
        unattributedNewOrganizationUsageRows: unattributedUsage.map(({ id, operation, role, provider, model, status, costUsd }) => ({ id, operation, role, provider, model, status, costUsd: costUsd === null ? null : String(costUsd) })),
        wholeRunCostKnown: !unattributedUsage.length && usage.every(row => row.status !== 'admitted' && row.costUsd !== null && !row.possiblyBilled),
        providerReceipts: providers, providerReceiptAttribution: 'Time-window receipts may include concurrent browser calls; the ledger is isolated by synthetic HTTP caller.',
        semanticAcceptanceCriteria: spec.acceptance, semanticVerdict: 'REQUIRES_HUMAN_ROOT_REVIEW', privateEvidenceFile: privateFile,
        localOnly: true, productionMutations: 0, noSocialIntegrationRows: (await prisma.integration.count()) === 0 };
      const expectedQuestion = spec.id === 'private-question' && receipt.pending.some(value => value.kind === 'question');
      const actualFallback = !spec.faultPrimary || providers.some(row => row.phase === 'completed' && row.provider === 'openrouter'
        && row.model === 'z-ai/glm-5.3' && row.status === 200 && row.scripted === false);
      receipt.lifecycleVerdict = response.ok && !receipt.streamErrors.length && !streamTransportError
        && (receipt.streamDone || expectedQuestion) && (!receipt.pending.length || expectedQuestion)
        && (expectedQuestion || receipt.execution?.state === 'settled' && receipt.execution?.outcome === 'completed' && receipt.assistantText.length > 0)
        && actualFallback
        ? 'PASS' : 'FAIL';
      receipt.expectedSavedCore = spec.expectedSavedCore ?? null;
      receipt.artifactVerdict = spec.expectedSavedCore === undefined ? 'NOT_REQUESTED'
        : receipt.changedPieces.filter(piece => piece.kind === 'CORE' && piece.body.trim()).length === spec.expectedSavedCore ? 'PASS' : 'FAIL';
      receipt.scenarioVerdict = receipt.lifecycleVerdict === 'PASS' && receipt.artifactVerdict !== 'FAIL' ? 'PASS' : 'FAIL';
      // A finished native stream alone does not fulfil a requested saved artifact.
      // Actual content/source quality still needs the independent semantic review.
      if (receipt.scenarioVerdict === 'FAIL') process.exitCode = 2;
      qa.writeEvidence(`scenario-${id}`, receipt);
      completedReceipt = receipt;
      state[id] = { threadId: actualThreadId, at: startedAt.toISOString(), privateEvidenceFile: privateFile }; qa.writePrivate(stateFile, state);
      process.stdout.write(`${JSON.stringify({ id, httpStatus: receipt.httpStatus, elapsedMs: receipt.elapsedMs, streamDone: receipt.streamDone, streamErrors: receipt.streamErrors, assistantText: receipt.assistantText, changedPieces: receipt.changedPieces.map(({ id, title, body }) => ({ id, title, bodyChars: body.length })), pending: receipt.pending.map(({ kind, toolName }) => ({ kind, toolName })), usageTotals: receipt.usageTotals, evidence: path.join(qa.stage, `real-local-qa-scenario-${id}.json`) })}\n`);
      } finally {
        if (restoreFault) {
          try {
            await restoreFault();
            if (completedReceipt) { completedReceipt.qaFallbackSettingsRestored = true; qa.writeEvidence(`scenario-${id}`, completedReceipt); }
          } catch (error) {
            if (completedReceipt) { completedReceipt.qaFallbackSettingsRestored = false; qa.writeEvidence(`scenario-${id}`, completedReceipt); }
            throw error;
          }
        }
      }
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { process.stderr.write(`${qa.safe(error.message)}\n`); process.exitCode = 1; });
