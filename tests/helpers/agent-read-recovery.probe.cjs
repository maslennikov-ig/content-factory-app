'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { z } = require('zod');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { until } = require('./agent-native-session-http.probe.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const usage = { inputTokens: { total: 2, noCache: 2 }, outputTokens: { total: 1, text: 1 } };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function scenario(mode) {
  const registry = loadCapabilityModule('capability.registry.ts');
  let readCalls = 0, writeCalls = 0, emptyReturned = false;
  const attempts = [];
  const capabilities = [
    { ...registry.CAPABILITY_CATALOGUE.find(c => c.risk === 'read' && (!c.entrances || c.entrances.includes('chat'))), id: 'fixture.read', group: 'content', risk: 'read',
      input: z.object({ source: z.string() }), untrusted: [], beforeApproval: undefined, approvalContent: undefined,
      run: async () => { if (++readCalls === 1) throw Object.assign(Error('Source unavailable'), { code: 'MATERIAL_NOT_AVAILABLE' }); return { sourceAvailable: true }; },
      summarize: result => result },
    { ...registry.CAPABILITY_CATALOGUE.find(c => c.risk === 'write' && (!c.entrances || c.entrances.includes('chat'))), id: 'fixture.write', group: 'content', risk: 'write',
      input: z.object({}), untrusted: [], beforeApproval: undefined, approvalContent: undefined,
      run: async () => { writeCalls++; throw Object.assign(Error('Write outcome unknown'), { code: 'CAPABILITY_FAILED' }); },
      summarize: result => result },
  ];
  const runtime = await createRuntime({ capabilities, modelFactory: modelId => new MockLanguageModelV3({ modelId,
    doStream: async () => {
      attempts.push(modelId);
      let parts = [], reason = 'stop';
      if (mode === 'write') {
        if (!writeCalls) { parts = [{ type: 'tool-call', toolCallId: 'controlled-write', toolName: 'fixture_write', input: '{}' }]; reason = 'tool-calls'; }
      } else if (readCalls < 2) {
        parts = [{ type: 'tool-call', toolCallId: `controlled-read-${readCalls}`, toolName: 'fixture_read', input: JSON.stringify({ source: readCalls ? 'alternative' : 'unavailable' }) }]; reason = 'tool-calls';
      } else if (mode === 'terminal' || !emptyReturned) {
        emptyReturned = true; reason = 'other';
      } else parts = [{ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta: 'The saved drafts remain available; the source gap is disclosed.' }, { type: 'text-end', id: 'answer' }];
      return { stream: convertArrayToReadableStream([{ type: 'stream-start', warnings: [] }, ...parts,
        { type: 'finish', finishReason: { unified: reason, raw: reason === 'other' ? null : reason }, usage }]) };
    } }) });
  const resourceId = `${IDENTITY.organizationId}:${IDENTITY.userId}`;
  const threadId = runtime.schemaName + '-' + mode;
  try {
    await runtime.memory.createThread({ threadId, resourceId, title: 'Isolated saved-draft recovery' });
    const incident = process.env.CF_READ_INCIDENT_FILE ? JSON.parse(fs.readFileSync(process.env.CF_READ_INCIDENT_FILE)) : null;
    const messages = incident ? incident.messages.messages.map(m => ({ ...m, threadId, resourceId, createdAt: new Date(m.createdAt) })) : [{
      id: 'prior-assistant', role: 'assistant', threadId, resourceId, createdAt: new Date('2026-01-01T00:00:00Z'),
      content: { format: 2, parts: [{ type: 'text', text: 'Previously saved drafts.' }, ...Array.from({ length: 12 }, (_, index) => ({ type: 'data-adaptation', data: { id: `saved-${index}`, pieceId: 'saved-piece', draft: true } }))] },
    }];
    const memory = await runtime.storage.getStore('memory');
    await memory.saveMessages({ messages });
    const preserved = messages.filter(m => m.role === 'assistant').flatMap(m => m.content.parts.filter(p => p.type === 'data-adaptation'));
    assert.equal(preserved.length, 12);
    const originalHash = hash(preserved);
    const accepted = await runtime.service.queueNativeInput({ identity: IDENTITY, threadId,
      requestId: 'read-recovery-' + mode, signal: { id: 'controlled-request-' + mode,
        contents: 'Read the remaining source and summarize saved progress; do not regenerate drafts.', author: { id: IDENTITY.userId }, createdAt: new Date().toISOString() } });
    const workflow = runtime.mastra.getWorkflowById('content-factory-queued-input-v1');
    let saved;
    try {
      await until(async () => {
        saved = await workflow.getWorkflowRunById(accepted.workflowRunId);
        const receipt = await runtime.memory.getThreadById({ threadId });
        return receipt?.metadata?.assistantExecution?.state === 'settled' && runtime.admissions[0]?.finishes.length === 1;
      }, 'native read-recovery settlement');
    } catch (error) {
      console.error('PENDING=' + JSON.stringify({ mode, status: saved?.status, attempts, finishes: runtime.admissions[0]?.finishes, metadata: (await runtime.memory.getThreadById({ threadId })).metadata }));
      throw error;
    }
    const thread = await runtime.memory.getThreadById({ threadId });
    const history = await runtime.memory.recall({ threadId, resourceId, perPage: false });
    const retained = history.messages.filter(m => messages.some(old => old.id === m.id)).flatMap(m => m.content.parts.filter(p => p.type === 'data-adaptation'));
    assert.equal(hash(retained), originalHash, 'Prior draft outputs must not change or be regenerated');
    assert.equal(runtime.admissions.length, 1);
    const execution = thread.metadata.assistantExecution;
    const expected = mode === 'recovered' ? 'completed' : 'failed';
    const report = { mode, outcome: execution.outcome, admissionCompleted: runtime.admissions[0].finishes[0],
      readCalls, writeCalls, attempts, preservedDrafts: retained.length, externalCalls };
    console.log('CASE=' + JSON.stringify(report));
    assert.equal(execution.outcome, expected, 'The logical outcome must match native completion, not a handled read refusal');
    assert.equal(report.admissionCompleted, expected === 'completed');
    assert.equal(writeCalls, mode === 'write' ? 1 : 0);
    return report;
  } finally { await runtime.close({ drop: true }); }
}
let externalCalls = 0;
const realFetch = global.fetch;
global.fetch = async () => { externalCalls++; throw Error('No external/model HTTP in this native probe'); };
(async () => {
  const reports = [];
  for (const mode of process.argv[2] ? process.argv[2].split(',') : ['recovered', 'terminal', 'write']) reports.push(await scenario(mode));
  console.log('RESULT=' + JSON.stringify(reports));
  assert.equal(externalCalls, 0);
  global.fetch = realFetch;
  process.exit(0);
})().catch(error => { console.error(error); process.exitCode = 1; });
