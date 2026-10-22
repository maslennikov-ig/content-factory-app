'use strict';

const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { AgentThreadsService } = loadCapabilityModule('../conductor/agent-threads.service.ts', {
  mocks: { '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} } },
});

/** Real Stop/owner methods; only native storage and cancellation are controlled. */
const createNativeStopIdentityFixture = (options = {}) => {
  const identity = { organizationId: 'stop-identity-org', userId: 'stop-identity-user',
    role: 'ADMIN', language: 'ru', timeZone: 'Europe/Moscow' };
  const threadId = options.threadId ?? 'stop-identity-thread';
  const requestId = options.requestId ?? 'actual-stopped-request';
  const pointer = options.pointer === undefined
    ? { runId: 'native-stopped-run', logicalRequestId: requestId, state: 'running' }
    : options.pointer;
  const row = { id: threadId, resourceId: options.resourceId ?? `${identity.organizationId}:${identity.userId}`,
    metadata: pointer ? { assistantNativeRun: pointer } : {} };
  const trace = [];
  let handle;
  let service;
  const retire = phase => {
    if (options.retireAt !== phase) return;
    handle?.finishStream();
    trace.push('http-owner-finished');
    options.afterRetire?.({ service, identity, threadId, row, trace });
  };
  const agent = {
    getMemory: async () => ({ getThreadById: async () => row }),
    abortThreadStream: args => { trace.push(['native-abort-thread', args]); return options.nativeAborted ?? true; },
    abortRunStream: runId => trace.push(['native-abort-run', runId]),
  };
  service = new AgentThreadsService({ conductor: async () => agent,
    cancelNativeQueuedInputs: async () => { trace.push('queued-cancel'); retire('queued'); },
    cancelModelAvailability: async (runId, ownedThreadId) => {
      trace.push(['availability-cancel', runId, ownedThreadId]);
      if (options.cancelError) throw options.cancelError;
      await Promise.resolve();
      retire('availability');
    },
  });
  if (options.active !== false) handle = service.registerActiveTurn({ identity, threadId, requestId,
    onStop: async () => trace.push('http-owner-stop'),
  });
  return { service, identity, threadId, requestId, row, trace,
    stop: () => service.stopTurn(identity, threadId),
  };
};

module.exports = { createNativeStopIdentityFixture };
